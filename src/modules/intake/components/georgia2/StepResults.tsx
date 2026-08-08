import { useGeorgia2 } from "./state";
import { Button } from "@/shared/components/ui/button";
import { ArrowLeft, Calendar, BookOpen } from "lucide-react";
import {
  deriveResult,
  formatCAD,
  CATALYST_LABELS,
  CATALYST_ACADEMY,
  type Pathway,
} from "@/modules/intake/lib/derive";
import { trackGeorgia2 } from "@/modules/intake/lib/session-tracker";

export function StepResults() {
  const { state, dispatch } = useGeorgia2();
  if (!state.domain || !state.catalyst) return null;
  const result = deriveResult(state.domain);
  const academy = CATALYST_ACADEMY[state.catalyst];

  const pick = (p: Pathway) => {
    dispatch({ type: "set_pathway", pathway: p });
    trackGeorgia2({ chosen_pathway: p, reached_lead_capture: true, final_phase: "lead_capture" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {CATALYST_LABELS[state.catalyst]} · {formatCAD(state.scale)}
          </p>
          <h2 className="mt-1 text-2xl">Your Sovereignty Operating System™ next step.</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "set_step", step: 3 })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-[10px] uppercase tracking-widest text-primary">Rolf's Voice</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground">
          The Sovereignty Survey is a working session, not a sales call — 90 minutes with me, built
          around exactly what you've just told Georgia. You leave with a Stabilization Map, an
          Immediate Risk Scan, and a 30-Day Action Framework. No pitch, no commitment beyond the
          session itself.
        </p>
      </div>

      <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-6">
        <h3 className="text-xl">Your next step</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Based on what you've shared, the Sovereignty Survey is the right starting point.{" "}
          {formatCAD(result.surveyPrice)} for {result.domainLabel} situations like yours.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={() => pick("survey")}>
            <Calendar className="mr-2 h-4 w-4" />
            Start the Sovereignty Survey — {formatCAD(result.surveyPrice)}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              trackGeorgia2({ chosen_pathway: "academy_guide" });
              window.open(academy.url, "_blank", "noopener,noreferrer");
            }}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            Read the {academy.title} Guide
          </Button>
        </div>
      </div>
    </div>
  );
}
