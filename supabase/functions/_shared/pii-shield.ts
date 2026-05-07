// PII Shield — outbound content filter for Quo (US-hosted)
// Blocks any message containing financial PII before it leaves Canadian infra.
// Per Sanctuary compliance: SIN, account numbers, balances, health terms must
// never transit through US-resident services.

const SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/;
const ACCOUNT_NUMBER_PATTERN = /\b(?:account|acct|a\/c)\s*(?:#|no\.?|number)?\s*[:#]?\s*\d{6,}\b/i;
const LONG_DIGIT_RUN = /\b\d{8,}\b/; // catches raw account/card numbers
const CREDIT_CARD = /\b(?:\d[ -]*?){13,19}\b/;
const BALANCE_PATTERN =
  /\b(?:balance|portfolio\s+value|net\s+worth|aum|assets?\s+under\s+management)\s*(?:is|of|:)?\s*\$?[\d,]+/i;
const DOLLAR_AMOUNT = /\$\s?[\d,]{4,}(?:\.\d{2})?/; // $1,000+
const HEALTH_TERMS =
  /\b(?:diagnosis|prognosis|cancer|chemotherapy|hiv|aids|psychiatric|mental\s+health|prescription|medication|dementia|alzheimer)\b/i;

export interface PiiCheckResult {
  blocked: boolean;
  reason?: string;
  matched?: string;
}

export function checkOutboundPii(text: string): PiiCheckResult {
  if (!text || typeof text !== "string") return { blocked: false };

  const checks: Array<[RegExp, string]> = [
    [SIN_PATTERN, "Social Insurance Number"],
    [ACCOUNT_NUMBER_PATTERN, "Account number reference"],
    [CREDIT_CARD, "Credit card number"],
    [BALANCE_PATTERN, "Portfolio balance / AUM figure"],
    [DOLLAR_AMOUNT, "Dollar amount ($1,000+)"],
    [LONG_DIGIT_RUN, "Long digit sequence (possible account #)"],
    [HEALTH_TERMS, "Health / medical term"],
  ];

  for (const [pattern, reason] of checks) {
    const match = text.match(pattern);
    if (match) {
      return {
        blocked: true,
        reason,
        matched: match[0].slice(0, 40),
      };
    }
  }

  return { blocked: false };
}

export function piiBlockMessage(reason: string): string {
  return `Message blocked by PII Shield: ${reason}. Please use the Sovereign Portal for sensitive details.`;
}
