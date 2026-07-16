import { useGeorgia2 } from "./state";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, BookOpen, Wrench, GraduationCap } from "lucide-react";
import { deriveResult, formatCAD, CATALYST_LABELS, type Pathway } from "@/lib/georgia2/derive";
import { trackGeorgia2 } from "@/lib/georgia2/session-tracker";

export function StepResults() {
  const { state, dispatch } = useGeorgia2();
  if (!state.domain || !state.catalyst) return null;
  const result = deriveResult(state.domain, state.scale);

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
          <h2 className="mt-1 text-2xl">Your Decoupled Sovereignty OS™ pathway.</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "set_step", step: 3 })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-[10px] uppercase tracking-widest text-primary">Rolf's Voice</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground">
          The way our Virtual Family Office works: two entirely separate phases. First is the <em>Sovereignty OS™ Build</em> — a 90-day project where we act as your system developers, mapping structures, building your Vault, and signing your Charter. Open to any family ready to invest the flat setup fee ($5,000 personal / $10,000 corporate). Second is <em>Ongoing System Oversight</em>, which requires a strict $1M velvet rope so ongoing fees are mathematically justified. The moment your assets cross $1M, we flip the switch to permanent Family Office oversight. Simple, mathematically sound, and protective.
        </p>
      </div>

      {result.qualified ? (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-6">
            <h3 className="text-xl">Ongoing VFO Oversight</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your scale qualifies for full Sovereignty OS™ Build with ongoing Virtual Family Office oversight.
              Begin with a private stabilization session with Rolf.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button size="lg" onClick={() => pick("vfo_stabilization")}>
                <Calendar className="mr-2 h-4 w-4" />
                Book $249 Stabilization Session with Rolf
              </Button>
              <Button size="lg" variant="outline" onClick={() => pick("vfo_catalyst_guide")}>
                <BookOpen className="mr-2 h-4 w-4" />
                Request {CATALYST_LABELS[state.catalyst]} Guide
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
            To prevent ongoing advisory "fee drag" at your scale, we bypass recurring fees. Choose the
            path that fits you.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <PathCard
              icon={<Wrench className="h-6 w-6" />}
              title="Standalone Sovereignty OS™ Build"
              price={`${formatCAD(result.fee ?? 0)} flat`}
              body={
                <>
                  A 90-day project-based build. On day 90 you transition to fully self-directed sovereignty
                  — no recurring advisory fee.
                </>
              }
              cta="Request 90-Day Setup Build"
              onClick={() => pick("standalone_build")}
            />
            <PathCard
              icon={<GraduationCap className="h-6 w-6" />}
              title="ProsperWise Academy"
              price="Complimentary"
              body="Self-guided education pathway with the same first-principles frameworks."
              cta="Unlock Complimentary Academy Pass"
              onClick={() => pick("academy_pass")}
              secondary
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PathCard({
  icon,
  title,
  price,
  body,
  cta,
  onClick,
  secondary,
}: {
  icon: React.ReactNode;
  title: string;
  price: string;
  body: React.ReactNode;
  cta: string;
  onClick: () => void;
  secondary?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-xl border-2 border-border bg-card p-5">
      <div className="text-accent">{icon}</div>
      <h4 className="mt-3 text-lg">{title}</h4>
      <p className="mt-1 text-sm font-medium text-primary">{price}</p>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{body}</p>
      <Button className="mt-4" variant={secondary ? "outline" : "default"} onClick={onClick}>
        {cta}
      </Button>
    </div>
  );
}
