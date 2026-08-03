// Public payment/booking links are served from the secure app, which exposes
// login-free routes at /pay (straight to Square checkout) and /book (form).
export const PUBLIC_APP_BASE = "https://app.prosperwise.ca";
export const PUBLIC_BOOKING_BASE = `${PUBLIC_APP_BASE}/book`;
export const PUBLIC_PAY_BASE = `${PUBLIC_APP_BASE}/pay`;

/** Straight-to-Square checkout link — the buyer enters their details once, on Square. */
export const publicPayUrl = (handle: string) =>
  `${PUBLIC_PAY_BASE}/${handle}`.replace(/([^:]\/)\/+/g, "$1");

/** Booking form link (collects details in-app before payment). */
export const publicBookingUrl = (handle: string) =>
  `${PUBLIC_BOOKING_BASE}/${handle}`.replace(/([^:]\/)\/+/g, "$1");

/**
 * Snippet to paste into the public site. A link/button rather than an iframe:
 * Square's hosted checkout refuses to render inside a frame.
 */
export const bookingEmbedSnippet = (handle: string, appOrigin: string) =>
  `<a href="${appOrigin}/pay/${handle}" style="display:inline-block;padding:14px 28px;border-radius:6px;background:#c8952a;color:#fff;font-family:sans-serif;text-decoration:none">Book &amp; pay securely</a>`;
