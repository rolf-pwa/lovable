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
}: Props) => {
  const qs = `?${new URLSearchParams({
    ...(fullName ? { name: fullName } : {}),
    ...(email ? { email } : {}),
  }).toString()}`;

  const isCorporate = (serviceName || "").toLowerCase().includes("corporate");
  const primaryUrl = schedulingUrl || (isCorporate ? CORPORATE_AUDIT_URL : PERSONAL_AUDIT_URL);

  // Auto-advance: once the client opens the scheduling tab, we move them
  // forward as soon as they come back to the portal — no manual click needed.
  const [opened, setOpened] = useState(false);
  const advanced = useRef(false);

  useEffect(() => {
    if (!opened || bookedAt) return;
    const advance = () => {
      if (advanced.current || document.visibilityState !== "visible") return;
      advanced.current = true;
      onConfirm();
    };
    window.addEventListener("focus", advance);
    document.addEventListener("visibilitychange", advance);
    return () => {
      window.removeEventListener("focus", advance);
      document.removeEventListener("visibilitychange", advance);
    };
  }, [opened, bookedAt, onConfirm]);

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
          <Button asChild onClick={() => setOpened(true)}>
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
            <Button asChild variant="outline" onClick={() => setOpened(true)}>
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
          ) : opened ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for you to finish scheduling — we'll continue automatically when you come
              back to this tab.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Pick your time above and we'll take you straight to the next step.
              </p>
              <button
                type="button"
                onClick={onConfirm}
                disabled={saving}
                className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
              >
                Already booked? Skip ahead
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
