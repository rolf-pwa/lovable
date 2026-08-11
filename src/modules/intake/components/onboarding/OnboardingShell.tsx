import { useEffect, useState } from "react";
import { AlertCircle, HelpCircle, Loader2, PartyPopper } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useOnboarding } from "../../hooks/useOnboarding";
import { OnboardingStepper } from "./OnboardingStepper";
import { StepBookAudit } from "./StepBookAudit";
import { StepHouseholdProfile } from "./StepHouseholdProfile";
import { StepWealthEvent } from "./StepWealthEvent";
import { PortalIntakePage } from "../PortalIntakePage";

interface Props {
  portalToken: string;
  onBack: () => void;
  onAskForHelp: () => void;
}

/**
 * Guided Sovereignty Survey onboarding — Georgia walks a brand-new client
 * through booking, household details, their wealth event, and finally their
 * documents (which reuses the existing Survey checklist).
 */
export const OnboardingShell = ({ portalToken, onBack, onAskForHelp }: Props) => {
  const {
    state,
    disabled,
    loading,
    saving,
    error,
    confirmAuditBooked,
    checkAuditBooking,
    saveProfile,
    saveWealthEvent,
    markDocumentsComplete,
  } = useOnboarding(portalToken);

  const furthest = state?.household.step ?? 1;
  const [current, setCurrent] = useState(furthest);

  // Follow the server's progress forward as steps complete.
  useEffect(() => {
    setCurrent((prev) => (furthest > prev ? furthest : prev));
  }, [furthest]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Legacy clients aren't in the Sovereignty Survey onboarding flow.
  if (disabled) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Your household isn't in the Sovereignty Survey onboarding flow — everything you need is
            in your portal.
          </p>
          <Button variant="outline" size="sm" onClick={onBack}>
            Back to your portal
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!state) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {error || "We couldn't load your onboarding just now. Please refresh and try again."}
          </p>
        </CardContent>
      </Card>
    );
  }


  const firstName = state.contact.firstName || state.contact.fullName || "there";

  return (
    <div className="space-y-6">
      {/* Georgia's welcome */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="font-serif text-xl font-semibold text-foreground">
              Welcome, {firstName}.
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              I'm Georgia. There are four short steps to get your Sovereignty Survey underway — no
              pressure, no sales, and you can stop and come back at any time.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onAskForHelp} className="shrink-0">
            <HelpCircle className="h-4 w-4" />
            Ask Georgia
          </Button>
        </CardContent>
      </Card>

      <OnboardingStepper
        current={current}
        furthest={furthest}
        onSelect={setCurrent}
        busy={saving}
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {current === 1 && (
        <StepBookAudit
          fullName={state.contact.fullName}
          email={state.contact.email}
          serviceName={state.booking?.serviceName ?? null}
          schedulingUrl={state.booking?.schedulingUrl ?? null}
          bookedAt={state.household.auditBookedAt}
          onCheckBooking={async () => {
            const found = await checkAuditBooking();
            if (found) setCurrent(2);
            return found;
          }}
          saving={saving}
          onConfirm={async () => {
            const ok = await confirmAuditBooked();
            if (ok) setCurrent(2);
          }}
        />
      )}

      {current === 2 && (
        <StepHouseholdProfile
          state={state}
          saving={saving}
          onSave={async (input) => {
            const ok = await saveProfile(input);
            if (ok) setCurrent(3);
          }}
        />
      )}

      {current === 3 && (
        <StepWealthEvent
          state={state}
          saving={saving}
          onSave={async (type, notes) => {
            const ok = await saveWealthEvent(type, notes);
            if (ok) setCurrent(4);
          }}
        />
      )}

      {current === 4 && (
        <div className="space-y-4">
          {state.household.onboardingCompletedAt && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
              <PartyPopper className="h-4 w-4 text-primary" />
              Your onboarding is complete — thank you. We'll take it from here.
            </div>
          )}
          <PortalIntakePage
            portalToken={portalToken}
            onBack={onBack}
            onAskForHelp={onAskForHelp}
            onComplete={
              state.household.onboardingCompletedAt ? undefined : () => void markDocumentsComplete()
            }
          />
        </div>
      )}
    </div>
  );
};
