// square-webhook — receives Square invoice/payment events, verifies the HMAC
// signature, and syncs invoice status + payments + the business pipeline.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fromMinor } from "../_shared/square.ts";
import { enrollPaidBooking } from "../_shared/booking-enrollment.ts";
import { enrollFromPaidInvoice } from "../_shared/invoice-enrollment.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function db() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function hmacBase64(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Square signs `notificationUrl + rawBody`. The notification URL must match the
 * one registered in Square exactly, so try the configured value plus the URL
 * this request actually arrived on (with/without trailing slash).
 */
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const key = Deno.env.get("SQUARE_WEBHOOK_SIGNATURE_KEY");
  const provided = req.headers.get("x-square-hmacsha256-signature");
  if (!key || !provided) {
    console.error("square-webhook: missing signature key or signature header");
    return false;
  }

  const configured = Deno.env.get("SQUARE_WEBHOOK_URL") || "";
  const forwardedHost = req.headers.get("x-forwarded-host");
  const incoming = new URL(req.url);
  const candidates = new Set<string>();
  for (const base of [configured, incoming.toString(), forwardedHost ? `https://${forwardedHost}${incoming.pathname}` : ""]) {
    const u = base.trim();
    if (!u) continue;
    candidates.add(u);
    candidates.add(u.endsWith("/") ? u.slice(0, -1) : `${u}/`);
  }

  for (const url of candidates) {
    if ((await hmacBase64(key, url + rawBody)) === provided) {
      if (url !== configured) {
        console.warn(`square-webhook: signature matched non-configured URL "${url}" — update SQUARE_WEBHOOK_URL`);
      }
      return true;
    }
  }

  console.error(
    `square-webhook: signature verification failed. Tried URLs: ${[...candidates].join(", ")}`,
  );
  return false;
}


function mapSquareStatus(status?: string): string {
  switch ((status || "").toUpperCase()) {
    case "DRAFT":
      return "draft";
    case "UNPAID":
    case "SCHEDULED":
      return "sent";
    case "PARTIALLY_PAID":
      return "partially_paid";
    case "PAID":
      return "paid";
    case "PARTIALLY_REFUNDED":
    case "REFUNDED":
      return "refunded";
    case "CANCELED":
      return "canceled";
    case "FAILED":
      return "failed";
    default:
      return "sent";
  }
}

async function syncPipeline(invoiceId: string) {
  const client = db();
  const { data: inv } = await client.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!inv || !inv.contact_id) return;

  const payload = {
    contact_id: inv.contact_id,
    category: "pws_consulting",
    status: "completed",
    amount: Number(inv.total || 0),
    expected_close_date: (inv.paid_at || new Date().toISOString()).slice(0, 10),
    notes: `Square invoice ${inv.invoice_number || inv.square_invoice_id || inv.id}`,
  };

  if (inv.pipeline_id) {
    await client.from("business_pipeline").update(payload).eq("id", inv.pipeline_id);
    return;
  }
  const { data: created } = await client
    .from("business_pipeline")
    .insert(payload)
    .select("id")
    .maybeSingle();
  if (created?.id) await client.from("invoices").update({ pipeline_id: created.id }).eq("id", invoiceId);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  if (!(await verifySignature(req, rawBody))) {
    console.error("square-webhook: signature verification failed");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const type = String(event?.type || "");
  const client = db();

  try {
    if (type.startsWith("invoice.")) {
      const sqInvoice = event?.data?.object?.invoice;
      if (!sqInvoice?.id) return new Response("ok");

      const { data: inv } = await client
        .from("invoices")
        .select("id, paid_at")
        .eq("square_invoice_id", sqInvoice.id)
        .maybeSingle();
      if (!inv) return new Response("ok");

      const status = mapSquareStatus(sqInvoice.status);
      const paidAt = status === "paid" ? inv.paid_at || new Date().toISOString() : inv.paid_at;

      await client
        .from("invoices")
        .update({
          status,
          square_version: sqInvoice.version,
          public_payment_url: sqInvoice.public_url || undefined,
          invoice_number: sqInvoice.invoice_number || undefined,
          paid_at: paidAt,
        })
        .eq("id", inv.id);

      if (status === "paid") {
        await syncPipeline(inv.id);
        try {
          await enrollFromPaidInvoice(client, inv.id);
        } catch (e) {
          console.error("square-webhook invoice enrollment failed:", e);
        }
      }
    }

    if (type.startsWith("payment.")) {
      const payment = event?.data?.object?.payment;
      if (!payment?.id || !payment?.order_id) return new Response("ok");

      const completed = String(payment?.status || "").toUpperCase() === "COMPLETED";

      // Public book-and-pay checkout for a service booking.
      const { data: booking } = await client
        .from("service_bookings")
        .select("id, paid_at")
        .eq("square_order_id", payment.order_id)
        .maybeSingle();
      if (booking) {
        await client
          .from("service_bookings")
          .update({
            square_payment_id: payment.id,
            payment_status: completed ? "paid" : String(payment?.status || "pending").toLowerCase(),
            status: completed ? "confirmed" : "awaiting_payment",
            paid_at: completed ? booking.paid_at || payment?.created_at || new Date().toISOString() : booking.paid_at,
          })
          .eq("id", booking.id);
        if (completed) {
          try {
            await enrollPaidBooking(client, booking.id);
          } catch (e) {
            console.error("square-webhook enrollment failed:", e);
          }
        }
        return new Response("ok");
      }

      const { data: inv } = await client
        .from("invoices")
        .select("id")
        .eq("square_order_id", payment.order_id)
        .maybeSingle();
      if (!inv) return new Response("ok");

      await client.from("invoice_payments").upsert(
        {
          invoice_id: inv.id,
          square_payment_id: payment.id,
          amount: fromMinor(payment?.amount_money?.amount),
          currency: payment?.amount_money?.currency || "CAD",
          status: String(payment?.status || "COMPLETED").toLowerCase(),
          paid_at: payment?.created_at || new Date().toISOString(),
          raw_payload: payment,
        },
        { onConflict: "square_payment_id" },
      );
    }

  } catch (e) {
    console.error("square-webhook processing error:", e);
    return new Response("Processing error", { status: 500 });
  }

  return new Response("ok");
});
