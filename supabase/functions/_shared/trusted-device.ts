// trusted-device.ts
// Shared helpers for the "remember this device, skip OTP" flow.
//
// Tokens are random 32-byte hex strings. Only their SHA-256 hash is
// persisted in portal_trusted_devices; the raw token lives only in the
// client's localStorage. If the DB is leaked, attackers cannot replay
// device sessions.

const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface MintedDeviceToken {
  raw: string;
  hash: string;
  expiresAt: string;
}

/** Cryptographically random 32-byte hex string. */
function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex digest (Web Crypto, edge-runtime safe). */
export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Mint a fresh trusted-device token and persist its hash. Returns the
 * raw token (give it to the client once; we never see it again) and
 * expiry. Caller decides ip/UA labelling.
 */
export async function mintTrustedDevice(
  supabase: any,
  args: {
    contactId: string;
    deviceLabel?: string;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<MintedDeviceToken | null> {
  const raw = randomHex(32);
  const hash = await sha256Hex(raw);
  const expiresAt = new Date(Date.now() + DEVICE_TTL_MS).toISOString();

  const { error } = await supabase.from("portal_trusted_devices").insert({
    contact_id: args.contactId,
    token_hash: hash,
    device_label: args.deviceLabel || null,
    expires_at: expiresAt,
    last_used_ip: args.ip || null,
    user_agent: args.userAgent || null,
  });

  if (error) {
    console.error("[mintTrustedDevice] insert failed:", error);
    return null;
  }
  return { raw, hash, expiresAt };
}

/**
 * Look up a device token, returning the contact_id if it's valid,
 * not revoked, and not expired. Also bumps last_used_at/ip/UA.
 */
export async function validateTrustedDevice(
  supabase: any,
  args: {
    rawToken: string;
    expectedEmail: string;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<{ contactId: string } | null> {
  if (!args.rawToken) return null;
  const hash = await sha256Hex(args.rawToken);

  const { data: device } = await supabase
    .from("portal_trusted_devices")
    .select("id, contact_id, revoked, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!device) return null;
  if (device.revoked) return null;
  if (new Date(device.expires_at) < new Date()) return null;

  // Confirm the email still matches the contact this device was bound to —
  // protects against someone swapping their email to a different account.
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("id", device.contact_id)
    .maybeSingle();

  if (!contact?.email) return null;
  if (contact.email.trim().toLowerCase() !== args.expectedEmail.trim().toLowerCase()) {
    console.warn("[validateTrustedDevice] email mismatch, refusing");
    return null;
  }

  // Best-effort touch — don't fail the login if this update fails
  await supabase
    .from("portal_trusted_devices")
    .update({
      last_used_at: new Date().toISOString(),
      last_used_ip: args.ip || null,
      user_agent: args.userAgent || null,
    })
    .eq("id", device.id);

  return { contactId: contact.id };
}

/** Revoke all devices for a contact (used by "sign out everywhere"). */
export async function revokeAllDevices(
  supabase: any,
  contactId: string,
): Promise<void> {
  await supabase
    .from("portal_trusted_devices")
    .update({ revoked: true })
    .eq("contact_id", contactId)
    .eq("revoked", false);
}
