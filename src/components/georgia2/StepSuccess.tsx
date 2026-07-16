import { useGeorgia2 } from "./state";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { CATALYST_LABELS, formatCAD } from "@/lib/georgia2/derive";

const PATHWAY_COPY: Record<
  string,
  { title: string; body: string; next: string }
> = {
  vfo_stabilization: {
    title: "Stabilization Session Requested",
    body: "Rolf's office will reach out within one business day to confirm your $249 Stabilization Session and share a private prep brief.",
    next: "Watch for a confidential email from ProsperWise. Add rolf@prosperwise.ca to your safe senders.",
  },
  vfo_catalyst_guide: {
    title: "Catalyst Guide Requested",
    body: "Your catalyst-specific sovereignty guide is being prepared and will be delivered to your confidential inbox shortly.",
    next: "We'll follow up with an optional 20-minute framing call if you'd like one.",
  },
  standalone_build: {
    title: "90-Day Build Request Received",
    body: "A private scoping call will be sent to your inbox. This is a flat, project-based engagement — no recurring fees, no drag.",
    next: "You'll receive a scoping questionnaire and calendar link within one business day.",
  },
  academy_pass: {
    title: "Academy Pass Unlocked",
    body: "Your complimentary ProsperWise Academy access is being issued. Look for your welcome email momentarily.",
    next: "The Academy is self-guided — start whenever you're ready.",
  },
};

export function StepSuccess() {
  const { state, dispatch } = useGeorgia2();
  const copy = state.chosenPathway ? PATHWAY_COPY[state.chosenPathway] : null;

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-3xl">{copy?.title ?? "Received"}</h2>
        {state.catalyst && (
          <p className="mt-2 text-sm text-muted-foreground">
            {CATALYST_LABELS[state.catalyst]} · {formatCAD(state.scale)}
          </p>
        )}
      </div>
      <p className="mx-auto max-w-md text-sm text-muted-foreground">{copy?.body}</p>
      <div className="mx-auto max-w-md rounded-md border border-border bg-card p-4 text-left text-sm">
        <p className="font-medium">What happens next</p>
        <p className="mt-1 text-muted-foreground">{copy?.next}</p>
      </div>
      <Button variant="outline" onClick={() => dispatch({ type: "reset" })}>
        Start a new diagnostic
      </Button>
    </div>
  );
}
