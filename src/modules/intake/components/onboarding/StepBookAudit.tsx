import { useEffect, useRef, useState } from "react";
import { Building2, CalendarCheck, ExternalLink, Loader2, MapPin } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

// The short calendar.app.google links set X-Frame-Options: SAMEORIGIN and
// can't be embedded — only the resolved calendar.google.com/.../schedules/...
// URL behind them is embeddable, so these are the resolved form.
const PERSONAL_SCHEDULE_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ2OCWM5PQ0LgBC9JN75R3JZyoOnN6npNH8j9nSQaRHfSB1gL18gtZ5qPULeSb0-dGZjvA5GC0Wb";
const CORPORATE_SCHEDULE_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ3knIG_inR-RLPoJ52B7LnnlIhEhQUfxIrWbWDpSUilkobnikFhtPoRV1QhotP6A1mBi-dVAGY5";

function isEmbeddable(url: string) {
  return /^https:\/\/calendar\.google\.com\/(calendar\/)?appointments\/schedules\//.test(url);
}

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

/** Step 1 — book the Sovereignty Survey session. */
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
  const isCorporate = (serviceName || "").toLowerCase().includes("corporate");
  const defaultUrl = isCorporate ? CORPORATE_SCHEDULE_URL : PERSONAL_SCHEDULE_URL;
  // A CRM-pinned schedulingUrl (already embeddable) removes the ambiguity —
  // otherwise pick by service type and let the client switch if we guessed wrong.
  const pinnedUrl = schedulingUrl && isEmbeddable(schedulingUrl) ? schedulingUrl : null;
  const canToggle = !pinnedUrl;

  const [embedUrl, setEmbedUrl] = useState(pinnedUrl ?? defaultUrl);
  const [iframeLoading, setIframeLoading] = useState(true);

  useEffect(() => {
    setIframeLoading(true);
  }, [embedUrl]);

  const qs = `?${new URLSearchParams({
    ...(fullName ? { name: fullName } : {}),
    ...(email ? { email } : {}),
    gv: "true",
  }).toString()}`;
  const embedSrc = `${embedUrl}${qs}`;

  // Calendar-verified auto-advance: we poll the CRM, which looks for this
  // client's session on the staff Google Calendars. No manual click needed.
  const [checking, setChecking] = useState(false);
  const checkRef = useRef(onCheckBooking);
  checkRef.current = onCheckBooking;
  const canCheck = Boolean(onCheckBooking);

  useEffect(() => {
    if (!canCheck || bookedAt) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      setChecking(true);
      const found = await checkRef.current?.();
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
  }, [canCheck, bookedAt]);

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1.5">
          <h2 className="font-serif text-lg font-semibold text-foreground">Book your Survey</h2>
          <p className="text-sm text-muted-foreground">
            Your payment is confirmed{serviceName ? ` for the ${serviceName}` : ""}. Pick a time
            below — the session runs about 90 minutes, and there is nothing to prepare beforehand.
          </p>
        </div>

        {canToggle && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={embedUrl === PERSONAL_SCHEDULE_URL ? "default" : "outline"}
              onClick={() => setEmbedUrl(PERSONAL_SCHEDULE_URL)}
            >
              <MapPin className="h-3.5 w-3.5" />
              Personal
            </Button>
            <Button
              type="button"
              size="sm"
              variant={embedUrl === CORPORATE_SCHEDULE_URL ? "default" : "outline"}
              onClick={() => setEmbedUrl(CORPORATE_SCHEDULE_URL)}
            >
              <Building2 className="h-3.5 w-3.5" />
              Corporate
            </Button>
          </div>
        )}

        <div className="relative overflow-hidden rounded-lg border border-border">
          {iframeLoading && (
            <div className="flex h-[600px] items-center justify-center bg-muted/20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <iframe
            key={embedUrl}
            src={embedSrc}
            title="Book your Survey session"
            className={iframeLoading ? "hidden" : "block w-full"}
            style={{ height: 600, border: 0 }}
            onLoad={() => setIframeLoading(false)}
          />
        </div>

        <a
          href={embedSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Having trouble? Open in a new tab
          <ExternalLink className="h-3 w-3" />
        </a>

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
