// Adobe Sign Web Form integration — the "interim, no Enterprise API" plan:
// a Web Form's fields can be prefilled entirely via URL parameters, no
// OAuth or REST API calls needed.
//
// Real Adobe quirk, confirmed against their own docs
// (helpx.adobe.com/sign/adv-user/web-form/url-parameters.html) after a
// first attempt using plain query-string params silently did nothing:
// prefill values don't go in the query string — they go in the URL's hash
// fragment, starting with #, as Field=Value pairs joined by &. A fragment
// is never sent to the server; Adobe's own client-side JS reads
// window.location.hash after the page loads and fills the fields from
// there. Appending them with & after the query string (a normal REST API
// assumption) is silently ignored — no error, the form just loads blank.
// Each field also needs "Default value may come from URL" enabled in
// Adobe's field editor, and the parameter name must match the field name
// there exactly (case-sensitive).

/** Builds a prefilled Web Form URL. `widgetUrl` is the base
 *  `.../esignWidget?wid=...` URL; `fields` maps each Adobe field name to
 *  its value. `hosted=false` is required for embedded use per Adobe's own
 *  embed snippet. */
export function buildWebFormUrl(widgetUrl: string, fields: Record<string, string>): string {
  const fragment = Object.entries(fields)
    .map(([field, value]) => `${field}=${encodeURIComponent(value)}`)
    .join("&");
  const separator = widgetUrl.includes("?") ? "&" : "?";
  return `${widgetUrl}${separator}hosted=false#${fragment}`;
}

/** Staff pastes either a bare widget URL or the full <iframe>/<script>
 *  embed snippet Adobe provides — this pulls out just the clean base URL
 *  (through the wid= token) either way, stripping any query params already
 *  attached (hosted=false gets re-added by buildWebFormUrl) so what's
 *  stored is always the same canonical shape. Returns null if nothing
 *  resembling an esignWidget/embeddedWidget URL is found. */
export function extractWidgetUrl(pasted: string): string | null {
  const match = pasted.match(
    /https:\/\/[a-z0-9.-]+\.documents\.adobe\.com\/public\/(?:esignWidget|embeddedWidget)\?wid=[^"'&\s]+/i,
  );
  return match ? match[0] : null;
}
