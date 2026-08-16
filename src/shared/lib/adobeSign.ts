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
 *  `hosted=false` is required for embedded (iframe) use per Adobe's own
 *  embed snippet — omitting it still loads the form but isn't the supported
 *  embedded configuration. */
export function buildIaWithdrawalUrl(prefill: IaWithdrawalPrefill): string {
  const params = new URLSearchParams({
    hosted: "false",
    Account: prefill.account,
    Name: prefill.name,
    Amount: prefill.amount,
    Fund: prefill.fund,
    Instructions: prefill.instructions,
  });
  return `${IA_WITHDRAWAL_WIDGET_URL}&${params.toString()}`;
}
