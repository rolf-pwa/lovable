// Shared Gmail-send mechanics: base64url encoding and raw RFC 2822 message
// construction, used by every function that sends mail via the Gmail API's
// users.messages.send (which takes a base64url-encoded raw MIME message).

export function base64UrlEncode(input: string): string {
  // Use TextEncoder + manual base64 to support unicode bodies
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildRawEmail(opts: {
  /** Omit to let Gmail auto-fill the authenticated account's own address —
   *  the safer default when the sender varies (e.g. per-staff sending),
   *  since Gmail rejects a From value that isn't an alias the account owns. */
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}): string {
  const headers: string[] = [];
  if (opts.from) headers.push(`From: ${opts.from}`);
  headers.push(`To: ${opts.to.join(", ")}`);
  if (opts.cc && opts.cc.length) headers.push(`Cc: ${opts.cc.join(", ")}`);
  if (opts.bcc && opts.bcc.length) headers.push(`Bcc: ${opts.bcc.join(", ")}`);
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
  // RFC 2047 encode subject if needed
  const subjectEncoded = /[^\x00-\x7F]/.test(opts.subject)
    ? `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`
    : opts.subject;
  headers.push(`Subject: ${subjectEncoded}`);
  headers.push("MIME-Version: 1.0");

  let body: string;
  if (opts.html && opts.text) {
    const boundary = `pw_boundary_${crypto.randomUUID()}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      opts.text,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      opts.html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  } else if (opts.html) {
    headers.push('Content-Type: text/html; charset="UTF-8"');
    body = `\r\n${opts.html}`;
  } else {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    body = `\r\n${opts.text ?? ""}`;
  }

  return headers.join("\r\n") + "\r\n" + body;
}
