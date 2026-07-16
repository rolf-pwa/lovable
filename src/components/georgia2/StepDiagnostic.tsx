import { useGeorgia2 } from "./state";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  formatCAD,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  VELVET_ROPE,
  type Answer,
  deriveResult,
} from "@/lib/georgia2/derive";
import { cn } from "@/lib/utils";
import { trackGeorgia2 } from "@/lib/georgia2/session-tracker";

const CORP_QUESTIONS: { key: string; text: string }[] = [
  { key: "bc_registered", text: "Is your operating company registered and active in British Columbia?" },
  { key: "lcge_used", text: "Have you utilized your Lifetime Capital Gains Exemption (LCGE) yet?" },
  { key: "holdco_active", text: "Are your corporate assets held within an active holding company (HoldCo)?" },
];
const PERSONAL_QUESTIONS: { key: string; text: string }[] = [
  { key: "cross_border", text: "Are there cross-border / US tax exposures or out-of-province assets?" },
  { key: "probate_active", text: "Is the estate or capital transfer currently subject to BC Probate fees?" },
  { key: "trusts_exist", text: "Do you have existing trusts or family legal structures set up?" },
];

const OPTIONS: { value: Answer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Unsure" },
];

export function StepDiagnostic() {
  const { state, dispatch } = useGeorgia2();
  const questions = state.domain === "corporate" ? CORP_QUESTIONS : PERSONAL_QUESTIONS;
  const allAnswered = questions.every((q) => state.answers[q.key as keyof typeof state.answers]);
  const result = state.domain ? deriveResult(state.domain, state.scale) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl">Three quick BC-context questions.</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Then set your capital scale — this determines your pathway.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "set_step", step: 2 })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="space-y-4">
        {questions.map((q) => {
          const value = state.answers[q.key as keyof typeof state.answers] ?? null;
          return (
            <div key={q.key} className="rounded-lg border border-border bg-card p-4">
              <p className="mb-3 text-sm font-medium">{q.text}</p>
              <div className="grid grid-cols-3 gap-2">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      dispatch({ type: "set_answer", key: q.key, value: o.value });
                      const nextAnswers = { ...state.answers, [q.key]: o.value };
                      trackGeorgia2({ answers: nextAnswers as Record<string, unknown> });
                    }}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm transition-colors",
                      value === o.value
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-background hover:border-accent/60"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium">Scale of Capital Transfer</span>
          <span className="font-serif text-2xl">{formatCAD(state.scale)}</span>
        </div>
        <div className="relative pt-2">
          <Slider
            value={[state.scale]}
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={SCALE_STEP}
            onValueChange={(v) => {
              dispatch({ type: "set_scale", scale: v[0] });
              trackGeorgia2({ scale: v[0] });
            }}
          />
          {/* Velvet Rope marker at $1M */}
          <div
            className="pointer-events-none absolute top-0 flex flex-col items-center"
            style={{ left: `${((VELVET_ROPE - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100}%` }}
          >
            <span className="h-6 w-px bg-accent" />
            <span className="mt-1 whitespace-nowrap text-[10px] uppercase tracking-wider text-accent">
              Velvet Rope · $1M
            </span>
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatCAD(SCALE_MIN)}</span>
          <span>{formatCAD(SCALE_MAX)}</span>
        </div>
        {result && (
          <div
            className={cn(
              "mt-4 rounded-md border px-3 py-2 text-sm",
              result.qualified
                ? "border-primary/40 bg-primary/5 text-primary"
                : "border-accent/40 bg-accent/5 text-foreground"
            )}
          >
            {result.pathwayHeadline}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          disabled={!allAnswered}
          onClick={() => dispatch({ type: "set_step", step: 4 })}
        >
          See my pathway <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
