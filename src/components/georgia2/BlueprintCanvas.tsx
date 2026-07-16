import { useGeorgia2 } from "./state";
import {
  CATALYST_LABELS,
  CATALYST_TIMELINES,
  bcContextNotes,
  computeGauges,
  deriveResult,
  formatCAD,
} from "@/lib/georgia2/derive";
import { cn } from "@/lib/utils";

export function BlueprintCanvas() {
  const { state } = useGeorgia2();
  const gauges = computeGauges(state.domain, state.catalyst, state.answers, state.scale);
  const notes = bcContextNotes(state.domain, state.catalyst, state.answers);
  const timeline = state.catalyst ? CATALYST_TIMELINES[state.catalyst] : null;
  const result = state.domain ? deriveResult(state.domain, state.scale) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Generative Blueprint
        </p>
        <h3 className="mt-1 font-serif text-xl">
          {state.catalyst ? CATALYST_LABELS[state.catalyst] : "Awaiting inputs…"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {result ? result.pathwayHeadline : "Live-render updates as you answer."}
        </p>
      </div>

      {/* Timeline */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Timeline
        </p>
        <div className="rounded-lg border border-border bg-card p-4">
          {timeline ? (
            <ol className="flex items-start justify-between gap-2">
              {timeline.map((m, i) => (
                <li key={m.label} className="flex-1 text-center">
                  <div className="relative mx-auto mb-2 flex h-6 items-center justify-center">
                    {i > 0 && <span className="absolute left-0 right-1/2 top-1/2 h-px bg-border" />}
                    {i < timeline.length - 1 && (
                      <span className="absolute left-1/2 right-0 top-1/2 h-px bg-border" />
                    )}
                    <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border border-accent bg-background text-[10px] font-medium text-accent">
                      {i + 1}
                    </span>
                  </div>
                  <p className="text-xs font-medium leading-tight">{m.label}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    {m.detail}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">Pick a catalyst to render your timeline.</p>
          )}
        </div>
      </div>

      {/* Gauges */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Risk Metrics
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Gauge label="Tax Drag Risk" value={gauges.taxDragRisk} tone="risk" />
          <Gauge label="Structure Safety" value={gauges.structureSafety} tone="safety" />
          <Gauge label="Noise Strain" value={gauges.noiseStrain} tone="risk" />
          <Gauge label="Readiness" value={gauges.readiness} tone="safety" />
        </div>
      </div>

      {/* BC Context */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          British Columbia Context
        </p>
        <div className="rounded-lg border border-border bg-card p-4">
          <ul className="space-y-2">
            {notes.map((n, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Scale summary */}
      {state.scale > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Capital Scale
          </p>
          <p className="mt-1 font-serif text-2xl">{formatCAD(state.scale)}</p>
        </div>
      )}
    </div>
  );
}

function Gauge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "risk" | "safety";
}) {
  // For risk: high = bad (accent red-ish via destructive); for safety: high = good.
  const isBad = tone === "risk" ? value >= 60 : value < 40;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium">{label}</p>
        <p className={cn("text-xs font-medium", isBad ? "text-destructive" : "text-primary")}>
          {value}
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isBad ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
