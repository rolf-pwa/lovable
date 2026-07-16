import { Georgia2Provider, useGeorgia2 } from "./state";
import { Stepper } from "./Stepper";
import { StepDomain } from "./StepDomain";
import { StepCatalyst } from "./StepCatalyst";
import { StepDiagnostic } from "./StepDiagnostic";
import { StepResults } from "./StepResults";
import { StepLeadCapture } from "./StepLeadCapture";
import { StepSuccess } from "./StepSuccess";
import { BlueprintCanvas } from "./BlueprintCanvas";
import { useGeorgia2ExitBeacon } from "@/lib/georgia2/session-tracker";

function Shell({ embed }: { embed?: boolean }) {
  const { state } = useGeorgia2();
  useGeorgia2ExitBeacon(
    () => ({
      domain: state.domain,
      catalyst: state.catalyst,
      answers: state.answers as Record<string, unknown>,
      scale: state.scale,
      chosen_pathway: state.chosenPathway,
      reached_lead_capture: state.step >= 5,
      lead_captured: state.step >= 6,
      final_phase: state.step >= 6 ? "complete" : state.step >= 5 ? "lead_capture" : "chat",
    }),
    state.sessionKey
  );

  return (
    <div className={embed ? "min-h-screen bg-background" : "min-h-screen bg-background"}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        {!embed && (
          <div className="mb-6">
            <p className="text-xs uppercase tracking-widest text-accent">Georgia · Sovereignty OS™</p>
            <h1 className="mt-1 font-serif text-3xl md:text-4xl">Decoupled Sovereignty Diagnostic</h1>
          </div>
        )}
        {state.step < 6 && (
          <div className="mb-6">
            <Stepper current={state.step} />
          </div>
        )}
        <div className="grid gap-6 md:grid-cols-5">
          <div className="rounded-2xl border border-border bg-card p-5 md:col-span-3 md:p-8">
            {state.step === 1 && <StepDomain />}
            {state.step === 2 && <StepCatalyst />}
            {state.step === 3 && <StepDiagnostic />}
            {state.step === 4 && <StepResults />}
            {state.step === 5 && <StepLeadCapture />}
            {state.step === 6 && <StepSuccess />}
          </div>
          <aside className="rounded-2xl border border-border bg-muted/30 p-5 md:col-span-2 md:p-6">
            <BlueprintCanvas />
          </aside>
        </div>
        <p className="mt-6 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          Montréal Data Pinning · Zero Tracking Cookies · PIPEDA-Aligned
        </p>
      </div>
    </div>
  );
}

export function Georgia2App({ embed }: { embed?: boolean }) {
  return (
    <Georgia2Provider>
      <Shell embed={embed} />
    </Georgia2Provider>
  );
}
