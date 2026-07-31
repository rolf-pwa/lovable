// Quo (OpenPhone) click-to-call helper.
// OpenPhone has no REST endpoint to place outbound calls from a server,
// so we deep-link into the OpenPhone desktop app and fall back to the
// web app if the protocol handler doesn't catch the request.

export function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function dialViaQuo(rawPhone: string) {
  const e164 = normalizePhone(rawPhone);
  if (!e164) return;

  const desktop = `openphone://dial?number=${encodeURIComponent(e164)}&action=call`;
  const web = `https://my.openphone.com/dial?number=${encodeURIComponent(e164)}&action=call`;

  // Try the desktop app first.
  window.location.href = desktop;

  // Fallback: open the web app in a new tab if the protocol handler did
  // nothing (no app installed). Short delay so the OS gets a chance to
  // launch the desktop client first.
  window.setTimeout(() => {
    window.open(web, "_blank", "noopener,noreferrer");
  }, 600);
}
