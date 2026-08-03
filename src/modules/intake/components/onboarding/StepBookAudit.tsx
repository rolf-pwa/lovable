import { useEffect, useRef, useState } from "react";
import { Building2, CalendarCheck, ExternalLink, Loader2, MapPin } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

const PERSONAL_AUDIT_URL = "https://calendar.app.google/Fwsmx2LC8BjWf3Zh9";
const CORPORATE_AUDIT_URL = "https://calendar.app.google/raxnRa2RFQGL7KnD9";

interface Props {
  fullName: string;
  email: string;
  serviceName: string | null;
  schedulingUrl: string | null;
  bookedAt: string | null;
  saving: boolean;
  onConfirm: () => void;
  /** Polls the CRM, which checks staff Google Calendars for this client's session. */
  onCheckBooking?: () => Promise<boolean>;
}

/** Step 1 — book the Sovereignty Audit session. */
export const StepBookAudit = ({
  fullName,
  email,
  serviceName,
  schedulingUrl,
  bookedAt,
  saving,
  onConfirm,
  onCheckBooking,
}: Props) => {
  const qs = `?${new URLSearchParams({
    ...(fullName ? { name: fullName } : {}),
    ...(email ? { email } : {}),
  }).toString()}`;

  const isCorporate = (serviceName || "").toLowerCase().includes("corporate");
  const primaryUrl = schedulingUrl || (isCorporate ? CORPORATE_AUDIT_URL : PERSONAL_AUDIT_URL);

  // Calendar-verified auto-advance: we poll the CRM, which looks for this
  // client's session on the staff Google Calendars. No manual click needed.
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!onCheckBooking || bookedAt) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      setChecking(true);
      const found = await onCheckBooking();
      if (cancelled) return;
      setChecking(false);
      if (!found) timer = window.setTimeout(poll, 15000);
    };

    void poll();
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [onCheckBooking, bookedAt]);

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1.5">
          <h2 className="font-serif text-lg font-semibold text-foreground">Book your Audit</h2>
          <p className="text-sm text-muted-foreground">
            Your payment is confirmed{serviceName ? ` for the ${serviceName}` : ""}. Choose a time
            that works for you — the session runs about 90 minutes, and there is nothing to prepare
            beforehand.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={`${primaryUrl}${qs}`} target="_blank" rel="noopener noreferrer">
              {isCorporate ? (
                <Building2 className="h-4 w-4" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              Choose your time
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          {!schedulingUrl && (
            <Button asChild variant="outline">
              <a
                href={`${isCorporate ? PERSONAL_AUDIT_URL : CORPORATE_AUDIT_URL}${qs}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {isCorporate ? "Personal Audit instead" : "Corporate Audit instead"}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          {bookedAt ? (
            <p className="flex items-center gap-2 text-sm text-foreground">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Thank you — we have your session on the calendar.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                {checking ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <CalendarCheck className="h-4 w-4 shrink-0" />
                )}
                Pick your time above — we watch our calendar and move you to the next step
                automatically as soon as your session appears. No extra click needed.
              </p>
              <button
                type="button"
                onClick={onConfirm}
                disabled={saving}
                className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
              >
                Booked somewhere else? Continue anyway
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
