import { useGeorgia2 } from "./state";
import {
  CATALYST_DESCRIPTIONS,
  CATALYST_LABELS,
  CORPORATE_CATALYSTS,
  DOMAIN_GREETING,
  PERSONAL_CATALYSTS,
  type Catalyst,
} from "@/lib/georgia2/derive";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { trackGeorgia2 } from "@/lib/georgia2/session-tracker";

export function StepCatalyst() {
  const { state, dispatch } = useGeorgia2();
  const catalysts: Catalyst[] =
    state.domain === "corporate" ? [...CORPORATE_CATALYSTS] : [...PERSONAL_CATALYSTS];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl">Which catalyst best describes your event?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick the closest match — you'll refine details next.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "set_step", step: 1 })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      {state.domain && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
          <p className="text-[10px] uppercase tracking-widest text-accent">Georgia's Note</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {DOMAIN_GREETING[state.domain]}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {catalysts.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              dispatch({ type: "set_catalyst", catalyst: c });
              trackGeorgia2({ catalyst: c });
            }}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border-2 bg-card p-4 text-left transition-all hover:border-accent hover:shadow-sm",
              state.catalyst === c ? "border-accent" : "border-border"
            )}
          >
            <span className="font-medium">{CATALYST_LABELS[c]}</span>
            <span className="text-xs text-muted-foreground">{CATALYST_DESCRIPTIONS[c]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
