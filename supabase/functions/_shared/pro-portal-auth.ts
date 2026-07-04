// Shared helpers for the Pro Portal (outside professionals).
// Mirrors portal_tokens pattern but for `pro_portal_tokens`.

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateOtp(): string {
  // Cryptographically secure 6-digit OTP. rejection-sample to avoid modulo bias.
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    const n = buf[0];
    if (n < 4_294_000_000) return String(100000 + (n % 900000));
  }
}

export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ProSession {
  professional_id: string;
  professional: {
    id: string;
    email: string;
    full_name: string;
    firm: string | null;
    professional_type: string;
  };
}

/**
 * Validate a raw pro portal session token and return the professional record.
 * Returns null when invalid/expired.
 */
export async function validateProSession(
  supabaseAdmin: any,
  rawToken: string | null | undefined,
): Promise<ProSession | null> {
  if (!rawToken) return null;
  const token_hash = await sha256Hex(rawToken);

  const { data: row } = await supabaseAdmin
    .from("pro_portal_tokens")
    .select("id, professional_id, session_expires_at")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (!row) return null;
  if (!row.session_expires_at || new Date(row.session_expires_at) <= new Date()) return null;

  const { data: pro } = await supabaseAdmin
    .from("professionals")
    .select("id, email, full_name, firm, professional_type")
    .eq("id", row.professional_id)
    .maybeSingle();
  if (!pro) return null;

  // Refresh last_used_at (best-effort)
  await supabaseAdmin
    .from("pro_portal_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return { professional_id: row.professional_id, professional: pro };
}
