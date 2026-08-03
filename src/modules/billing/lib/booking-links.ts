// Public-facing booking links live on the marketing site, not the secure app.
// The marketing page at PUBLIC_BOOKING_BASE embeds the app booking page.
export const PUBLIC_BOOKING_BASE = "https://www.prosperwise.ca/book";

export const publicBookingUrl = (handle: string) =>
  `${PUBLIC_BOOKING_BASE}/${handle}`.replace(/([^:]\/)\/+/g, "$1");

/** Iframe snippet to paste into the public site page (Wix embed / HTML block). */
export const bookingEmbedSnippet = (handle: string, appOrigin: string) =>
  `<iframe src="${appOrigin}/book/${handle}/embed" title="Book a service" width="100%" height="900" style="border:0;max-width:720px" loading="lazy"></iframe>`;
