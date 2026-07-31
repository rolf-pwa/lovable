/**
 * Parse a YYYY-MM-DD date string as a local date (not UTC).
 * Prevents the off-by-one-day bug caused by `new Date("YYYY-MM-DD")` interpreting as UTC.
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}
