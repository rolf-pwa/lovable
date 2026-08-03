// Booking links are served directly from the secure app, which exposes a
// public, login-free booking page at /book. The marketing site can link here
// or embed the app booking page in an iframe.
export const PUBLIC_BOOKING_BASE = "https://app.prosperwise.ca/book";

export const publicBookingUrl = (handle: string) =>
  `${PUBLIC_BOOKING_BASE}/${handle}`.replace(/([^:]\/)\/+/g, "$1");

/** Iframe snippet to paste into the public site page (Wix embed / HTML block). */
export const bookingEmbedSnippet = (handle: string, appOrigin: string) =>
  `<iframe src="${appOrigin}/book/${handle}/embed" title="Book a service" width="100%" height="900" style="border:0;max-width:720px" loading="lazy"></iframe>`;
