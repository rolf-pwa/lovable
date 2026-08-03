export const formatMoney = (v: number | string | null | undefined, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v || 0));

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  refunded: "Refunded",
  canceled: "Canceled",
  failed: "Failed",
};

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-secondary text-secondary-foreground",
  sent: "bg-accent text-accent-foreground",
  partially_paid: "bg-accent text-accent-foreground",
  paid: "bg-primary text-primary-foreground",
  refunded: "bg-muted text-muted-foreground",
  canceled: "bg-muted text-muted-foreground",
  failed: "bg-destructive text-destructive-foreground",
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  awaiting_payment: "Awaiting payment",
  confirmed: "Confirmed",
  completed: "Completed",
  canceled: "Canceled",
};

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
