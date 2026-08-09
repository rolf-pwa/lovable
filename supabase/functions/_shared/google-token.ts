// Google OAuth token helper for background/system functions that have no
// logged-in user session — resolves a valid access token for a known
// connected account by email (e.g. a shared service inbox), refreshing
// via GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET if expired.
//
// Requires a service-role Supabase client (RLS on google_tokens scopes
// reads to auth.uid() = user_id, which a per-request user JWT can't satisfy
// for an account that isn't the caller).

// admin@prosperwise.ca is a Google Group (collaborative inbox) — Groups have
// no login of their own and can't be used for "Sign in with Google", so the
// 3 connector-gateway functions resolve against a real signed-in account
// instead. Update this if a dedicated Workspace mailbox is ever provisioned.
export const ADMIN_INBOX_EMAIL = "rolf@prosperwise.ca";

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await res.json();
  if (tokens.error) throw new Error(`Google token refresh failed: ${tokens.error}`);
  return tokens;
}

/** Resolves the auth.users.id behind a known connected-account email via public.profiles. */
// deno-lint-ignore no-explicit-any
export async function resolveUserIdByEmail(admin: any, email: string): Promise<string> {
  const { data, error } = await admin.from("profiles").select("user_id").eq("email", email).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No account found for ${email} — has it signed in at least once?`);
  return data.user_id as string;
}

/** Returns a valid (refreshed if needed) Google access token for a connected google_tokens row. */
// deno-lint-ignore no-explicit-any
export async function getValidGoogleAccessToken(admin: any, userId: string): Promise<string> {
  const { data, error } = await admin.from("google_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Google not connected for this account");

  if (new Date(data.token_expiry) <= new Date()) {
    const tokens = await refreshAccessToken(data.refresh_token);
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await admin.from("google_tokens").update({ access_token: tokens.access_token, token_expiry: newExpiry }).eq("user_id", userId);
    return tokens.access_token;
  }
  return data.access_token as string;
}

/** Convenience: resolve + get a valid token for a known service-account email in one call. */
// deno-lint-ignore no-explicit-any
export async function getServiceGoogleAccessToken(admin: any, email: string = ADMIN_INBOX_EMAIL): Promise<string> {
  const userId = await resolveUserIdByEmail(admin, email);
  return getValidGoogleAccessToken(admin, userId);
}
