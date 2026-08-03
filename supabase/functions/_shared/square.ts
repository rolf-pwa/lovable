// Shared Square (REST v2) helper.
// The access token never leaves the edge runtime.

const SQUARE_VERSION = "2025-06-18";

export function squareBaseUrl() {
  const env = (Deno.env.get("SQUARE_ENVIRONMENT") || "sandbox").toLowerCase();
  return env === "production"
    ? "https://connect.squareup.com/v2"
    : "https://connect.squareupsandbox.com/v2";
}

export function squareLocationId(): string {
  const id = Deno.env.get("SQUARE_LOCATION_ID");
  if (!id) throw new Error("SQUARE_LOCATION_ID is not configured");
  return id;
}

function squareToken(): string {
  const token = Deno.env.get("SQUARE_ACCESS_TOKEN");
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN is not configured");
  return token;
}

export function idempotencyKey(): string {
  return crypto.randomUUID();
}

export interface SquareResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
}

export async function square<T = any>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<SquareResult<T>> {
  const res = await fetch(`${squareBaseUrl()}${path}`, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${squareToken()}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    console.error(`Square ${init.method || "GET"} ${path} failed [${res.status}]: ${text.slice(0, 800)}`);
  }
  return { ok: res.ok, status: res.status, data };
}

export function squareErrorMessage(data: any): string {
  const errs = data?.errors;
  if (Array.isArray(errs) && errs.length) {
    return errs.map((e: any) => `${e.code || e.category}: ${e.detail || ""}`.trim()).join("; ");
  }
  return typeof data === "string" ? data : JSON.stringify(data ?? {}).slice(0, 500);
}

/** Money is stored in dollars in our DB; Square wants integer minor units. */
export function toMinor(amount: number | string | null | undefined): number {
  const n = Number(amount || 0);
  return Math.round(n * 100);
}

export function fromMinor(amount: number | null | undefined): number {
  return Math.round(Number(amount || 0)) / 100;
}

/** Find an existing Square customer by email, or create one. */
export async function ensureSquareCustomer(input: {
  email?: string | null;
  fullName?: string | null;
  phone?: string | null;
}): Promise<{ customerId?: string; error?: string }> {
  const email = (input.email || "").trim();
  if (!email) return { error: "A contact email is required to create a Square invoice." };

  const search = await square("/customers/search", {
    method: "POST",
    body: { query: { filter: { email_address: { exact: email } } }, limit: 1 },
  });
  if (search.ok && search.data?.customers?.length) {
    return { customerId: search.data.customers[0].id };
  }

  const parts = (input.fullName || "").trim().split(/\s+/);
  const given = parts.shift() || email;
  const family = parts.join(" ") || undefined;

  const created = await square("/customers", {
    method: "POST",
    body: {
      idempotency_key: idempotencyKey(),
      given_name: given,
      family_name: family,
      email_address: email,
      phone_number: input.phone || undefined,
    },
  });
  if (!created.ok) return { error: squareErrorMessage(created.data) };
  return { customerId: created.data?.customer?.id };
}
