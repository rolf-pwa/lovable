import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface IncomingRow {
  csv_row_number: number;
  account_number?: string | null;
  client_name?: string | null;
  custodian?: string | null;
  account_type?: string | null;
  boy_value?: number | null;
  current_value?: number | null;
  as_of_date?: string | null; // YYYY-MM-DD
}

type Destination =
  | "vineyard_update"
  | "holding_tank_update"
  | "holding_tank_new"
  | "conflict"
  | "missing_account_number"
  | "missing_contact";

interface RowResult {
  csv_row_number: number;
  destination: Destination;
  account_number: string | null;
  client_name: string | null;
  matched_table?: "vineyard_accounts" | "holding_tank" | null;
  matched_id?: string | null;
  matched_contact_id?: string | null;
  matched_contact_name?: string | null;
  message?: string;
  applied?: boolean;
}

const normalize = (v?: string | null) =>
  (v || "").toString().trim().replace(/[\s\-]/g, "").toUpperCase();

const parseNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = String(v).replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } =
      await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const mode: "preview" | "commit" = body.mode === "commit"
      ? "commit"
      : "preview";
    const rows: IncomingRow[] = Array.isArray(body.rows) ? body.rows : [];

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Preload accounts for matching.
    const [vineyardRes, holdingRes, contactsRes] = await Promise.all([
      admin
        .from("vineyard_accounts")
        .select("id, contact_id, account_number, account_name, account_type"),
      admin
        .from("holding_tank")
        .select(
          "id, contact_id, household_id, account_number, account_name, account_type, custodian",
        ),
      admin
        .from("contacts")
        .select("id, first_name, last_name, full_name, household_id"),
    ]);

    if (vineyardRes.error || holdingRes.error || contactsRes.error) {
      throw new Error(
        vineyardRes.error?.message ||
          holdingRes.error?.message ||
          contactsRes.error?.message,
      );
    }

    // Build lookup maps.
    const vineyardByNum = new Map<string, typeof vineyardRes.data[number][]>();
    for (const v of vineyardRes.data || []) {
      const key = normalize(v.account_number);
      if (!key) continue;
      const list = vineyardByNum.get(key) || [];
      list.push(v);
      vineyardByNum.set(key, list);
    }
    const holdingByNum = new Map<string, typeof holdingRes.data[number][]>();
    for (const h of holdingRes.data || []) {
      const key = normalize(h.account_number);
      if (!key) continue;
      const list = holdingByNum.get(key) || [];
      list.push(h);
      holdingByNum.set(key, list);
    }

    const contacts = contactsRes.data || [];
    const findContact = (name: string | null | undefined) => {
      if (!name) return null;
      const n = name.trim().toLowerCase();
      if (!n) return null;
      // Exact full_name match first
      let hit = contacts.find(
        (c) => (c.full_name || "").trim().toLowerCase() === n,
      );
      if (hit) return hit;
      // first + last
      hit = contacts.find(
        (c) =>
          `${c.first_name || ""} ${c.last_name || ""}`.trim().toLowerCase() ===
            n,
      );
      if (hit) return hit;
      // last, first
      hit = contacts.find(
        (c) =>
          `${c.last_name || ""}, ${c.first_name || ""}`.trim().toLowerCase() ===
            n,
      );
      if (hit) return hit;
      return null;
    };

    const results: RowResult[] = [];

    for (const row of rows) {
      const acctNum = normalize(row.account_number);
      const base: RowResult = {
        csv_row_number: row.csv_row_number,
        destination: "missing_account_number",
        account_number: row.account_number || null,
        client_name: row.client_name || null,
        applied: false,
      };

      if (!acctNum) {
        results.push({
          ...base,
          destination: "missing_account_number",
          message: "Account number is required.",
        });
        continue;
      }

      const vineyardHits = vineyardByNum.get(acctNum) || [];
      const holdingHits = holdingByNum.get(acctNum) || [];

      if (vineyardHits.length + holdingHits.length > 1) {
        results.push({
          ...base,
          destination: "conflict",
          message:
            `Account number matches ${vineyardHits.length} Vineyard and ${holdingHits.length} Holding Tank rows. Resolve manually.`,
        });
        continue;
      }

      const current = parseNumber(row.current_value);
      const boy = parseNumber(row.boy_value);
      const snapshotDate = row.as_of_date && /^\d{4}-\d{2}-\d{2}$/.test(row.as_of_date)
        ? row.as_of_date
        : new Date().toISOString().slice(0, 10);

      if (vineyardHits.length === 1) {
        const match = vineyardHits[0];
        const contact = contacts.find((c) => c.id === match.contact_id);
        const result: RowResult = {
          ...base,
          destination: "vineyard_update",
          matched_table: "vineyard_accounts",
          matched_id: match.id,
          matched_contact_id: match.contact_id,
          matched_contact_name: contact
            ? contact.full_name ||
              `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
            : null,
        };

        if (mode === "commit") {
          const updates: Record<string, unknown> = {};
          if (current !== null) updates.current_value = current;
          if (
            row.account_type &&
            row.account_type !== match.account_type
          ) {
            updates.account_type = row.account_type;
          }
          if (Object.keys(updates).length > 0) {
            const { error } = await admin
              .from("vineyard_accounts")
              .update(updates)
              .eq("id", match.id);
            if (error) {
              result.message = `Update failed: ${error.message}`;
              results.push(result);
              continue;
            }
          }
          if (boy !== null || current !== null) {
            const { error } = await admin
              .from("account_harvest_snapshots")
              .upsert(
                {
                  contact_id: match.contact_id,
                  vineyard_account_id: match.id,
                  snapshot_date: snapshotDate,
                  boy_value: boy ?? 0,
                  current_value: current ?? 0,
                  created_by: userId,
                },
                { onConflict: "vineyard_account_id,snapshot_date" },
              );
            if (error) {
              result.message = `Snapshot failed: ${error.message}`;
              results.push(result);
              continue;
            }
          }
          result.applied = true;
        }
        results.push(result);
        continue;
      }

      if (holdingHits.length === 1) {
        const match = holdingHits[0];
        const contact = contacts.find((c) => c.id === match.contact_id);
        const result: RowResult = {
          ...base,
          destination: "holding_tank_update",
          matched_table: "holding_tank",
          matched_id: match.id,
          matched_contact_id: match.contact_id,
          matched_contact_name: contact
            ? contact.full_name ||
              `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
            : null,
        };

        if (mode === "commit") {
          const updates: Record<string, unknown> = {};
          if (current !== null) updates.current_value = current;
          if (row.custodian && row.custodian !== match.custodian) {
            updates.custodian = row.custodian;
          }
          if (row.account_type && row.account_type !== match.account_type) {
            updates.account_type = row.account_type;
          }
          if (Object.keys(updates).length > 0) {
            const { error } = await admin
              .from("holding_tank")
              .update(updates)
              .eq("id", match.id);
            if (error) {
              result.message = `Update failed: ${error.message}`;
              results.push(result);
              continue;
            }
          }
          if (boy !== null || current !== null) {
            const { error } = await admin
              .from("account_harvest_snapshots")
              .upsert(
                {
                  contact_id: match.contact_id,
                  holding_tank_id: match.id,
                  snapshot_date: snapshotDate,
                  boy_value: boy ?? 0,
                  current_value: current ?? 0,
                  created_by: userId,
                },
                { onConflict: "holding_tank_id,snapshot_date" },
              );
            if (error) {
              result.message = `Snapshot failed: ${error.message}`;
              results.push(result);
              continue;
            }
          }
          result.applied = true;
        }
        results.push(result);
        continue;
      }

      // Unmatched — try to attach to a contact and stage in Holding Tank
      const contact = findContact(row.client_name);
      if (!contact) {
        results.push({
          ...base,
          destination: "missing_contact",
          message:
            "No matching account or contact found. Confirm the client name spelling, or create the contact before re-running.",
        });
        continue;
      }

      const result: RowResult = {
        ...base,
        destination: "holding_tank_new",
        matched_contact_id: contact.id,
        matched_contact_name:
          contact.full_name ||
          `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
      };

      if (mode === "commit") {
        const insert = {
          contact_id: contact.id,
          household_id: contact.household_id || null,
          account_name: row.client_name
            ? `${row.client_name} — ${row.account_number}`
            : `Account ${row.account_number}`,
          account_number: row.account_number,
          account_type: row.account_type || "Portfolio",
          custodian: row.custodian || null,
          current_value: current,
          book_value: boy,
          status: "holding",
          source_file: body.source_file || "Quarterly CSV sync",
          notes: "Auto-staged via Quarterly Account Sync — needs review.",
        };
        const { data: inserted, error } = await admin
          .from("holding_tank")
          .insert(insert)
          .select("id")
          .single();
        if (error || !inserted) {
          result.message = `Insert failed: ${error?.message}`;
          results.push(result);
          continue;
        }
        result.matched_id = inserted.id;
        result.matched_table = "holding_tank";

        if (boy !== null || current !== null) {
          const { error: snapErr } = await admin
            .from("account_harvest_snapshots")
            .upsert(
              {
                contact_id: contact.id,
                holding_tank_id: inserted.id,
                snapshot_date: snapshotDate,
                boy_value: boy ?? 0,
                current_value: current ?? 0,
                created_by: userId,
              },
              { onConflict: "holding_tank_id,snapshot_date" },
            );
          if (snapErr) {
            result.message = `Snapshot failed: ${snapErr.message}`;
            results.push(result);
            continue;
          }
        }
        result.applied = true;
      }
      results.push(result);
    }

    const summary = {
      total: results.length,
      vineyard_update: results.filter((r) => r.destination === "vineyard_update").length,
      holding_tank_update: results.filter((r) => r.destination === "holding_tank_update").length,
      holding_tank_new: results.filter((r) => r.destination === "holding_tank_new").length,
      conflict: results.filter((r) => r.destination === "conflict").length,
      missing_account_number: results.filter((r) => r.destination === "missing_account_number").length,
      missing_contact: results.filter((r) => r.destination === "missing_contact").length,
      applied: results.filter((r) => r.applied).length,
    };

    return new Response(
      JSON.stringify({ mode, summary, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[quarterly-account-sync]", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
