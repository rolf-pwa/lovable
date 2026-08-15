import { CalendarCheck, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

// Unlike the two payment-track schedules in StepBookAudit.tsx, this link's
// resolved calendar.google.com URL still sends X-Frame-Options: SAMEORIGIN
// (confirmed via a direct request) — it can't be embedded, only opened.
const MEETING_LINK = "https://calendar.app.google/JCrhok5xgunLQ9qF6";

interface Props {
  saving: boolean;
  onConfirm: () => void;
}

/** Legacy-upgrade Step 4 (last step) — book the stabilization session via the
 *  firm's Google Calendar link, then confirm to finish onboarding. */
export const StepBookMeeting = ({ saving, onConfirm }: Props) => (
  <Card>
    <CardContent className="space-y-5 p-6">
      <div className="space-y-1.5">
        <h2 className="font-serif text-lg font-semibold text-foreground">Book your meeting</h2>
        <p className="text-sm text-muted-foreground">
          Last step — pick a time for your Stabilization Session, then confirm below.
        </p>
      </div>

      <Button asChild variant="outline" className="w-full">
        <a href={MEETING_LINK} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" />
          Open the scheduling page
        </a>
      </Button>

      <Button className="w-full" onClick={onConfirm} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
        I've booked my meeting
      </Button>
    </CardContent>
  </Card>
);
