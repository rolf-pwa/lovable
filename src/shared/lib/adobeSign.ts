// Adobe Sign Web Form integration — the "interim, no Enterprise API" plan:
// a Web Form's fields can be prefilled entirely via URL query-string
// parameters, no OAuth or REST API calls needed. Each field below has
// "Default value may come from URL" enabled in Adobe's field editor, and
// the parameter names must match the field names there exactly (confirmed
// directly against the live field editor, not assumed).
const IA_WITHDRAWAL_WIDGET_URL =
  "https://prosperwise.na4.documents.adobe.com/public/esignWidget?wid=CBFCIBAA3AAABLblqZhA-rQfvflfU7V1uxlWm0gZfBijBy6rDmt1BH-HPz5vo7bqKTKMEyuTEKWx1twhuB9M*";

export interface IaWithdrawalPrefill {
  /** iA contract/account number. */
  account: string;
  /** Annuitant's full legal name. */
  name: string;
  /** Withdrawal amount — transactional, never pulled from stored CRM data. */
  amount: string;
  /** Fund the withdrawal is drawn from — transactional, entered per request. */
  fund: string;
  /** Special instructions — transactional, entered per request. */
  instructions: string;
}

/** Builds the embeddable/shareable Web Form URL with all fields prefilled.
 *
 *  Two easy-to-miss Adobe quirks, confirmed against their own docs
 *  (helpx.adobe.com/sign/adv-user/web-form/url-parameters.html) after a
 *  first attempt using plain `&`-joined query params silently did nothing:
 *  1. `hosted=false` (query string) is required for embedded/iframe use —
 *     from Adobe's own embed snippet, unrelated to field prefill.
 *  2. Field prefill values do NOT go in the query string at all — they go
 *     in the URL's hash fragment, starting with `#`, as `Field=Value` pairs
 *     joined by `&`. A fragment is never sent to the server; Adobe's own
 *     client-side JS reads window.location.hash after the page loads and
 *     fills the fields from there. Appending them after the query string
 *     with `&` (what a normal REST API would expect) gets silently ignored
 *     server-side — no error, the form just loads with everything blank. */
export function buildIaWithdrawalUrl(prefill: IaWithdrawalPrefill): string {
  const fields: Array<[string, string]> = [
    ["Account", prefill.account],
    ["Name", prefill.name],
    ["Amount", prefill.amount],
    ["Fund", prefill.fund],
    ["Instructions", prefill.instructions],
  ];
  const fragment = fields
    .map(([field, value]) => `${field}=${encodeURIComponent(value)}`)
    .join("&");
  return `${IA_WITHDRAWAL_WIDGET_URL}&hosted=false#${fragment}`;
}
