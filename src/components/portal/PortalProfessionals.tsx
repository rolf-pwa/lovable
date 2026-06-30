import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale, Calculator, Shield, ScrollText, HeartHandshake, Briefcase, Users } from "lucide-react";

const TYPE_META: Record<string, { label: string; Icon: any }> = {
  lawyer: { label: "Lawyer", Icon: Scale },
  accountant: { label: "Accountant", Icon: Calculator },
  insurance_broker: { label: "Insurance Broker", Icon: Shield },
  executor: { label: "Executor", Icon: ScrollText },
  poa: { label: "Power of Attorney", Icon: ScrollText },
  financial_planner: { label: "Financial Planner", Icon: Briefcase },
  philanthropy: { label: "Philanthropy Advisor", Icon: HeartHandshake },
  other: { label: "Advisor", Icon: Briefcase },
};

const PILLAR_LABEL: Record<string, string> = {
  tax: "Tax", legal: "Legal", insurance: "Insurance",
  estate: "Estate", philanthropy: "Giving", governance: "Governance", other: "Other",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  invited: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  completed: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted/50 text-muted-foreground border-border",
};

interface Engagement {
  id: string; professional_id: string; pillar: string | null;
  title: string; status: string; started_at: string | null; completed_at: string | null;
}
interface Professional {
  id: string; full_name: string; firm: string | null;
  professional_type: string; credentials: string | null; email: string; phone: string | null;
}

export function PortalProfessionals({
  professionals,
  engagements,
}: {
  professionals: Professional[];
  engagements: Engagement[];
}) {
  if (!professionals?.length) {
    return (
      <Card className="border-amber-500/15">
        <CardContent className="p-8 text-center space-y-2">
          <Users className="h-6 w-6 text-amber-500/60 mx-auto" />
          <p className="font-serif text-foreground">Your team is being assembled.</p>
          <p className="text-xs text-muted-foreground">
            Your advisor will introduce you to the professionals coordinating your tax, legal, insurance, and estate work as engagements begin.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {professionals.map((p) => {
        const meta = TYPE_META[p.professional_type] || TYPE_META.other;
        const engs = engagements.filter((e) => e.professional_id === p.id);
        return (
          <Card key={p.id} className="border-amber-500/15">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 shrink-0">
                  <meta.Icon className="h-5 w-5 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-base text-foreground">
                    {p.full_name}
                    {p.credentials ? <span className="text-muted-foreground text-sm font-sans"> · {p.credentials}</span> : null}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {meta.label}{p.firm ? ` · ${p.firm}` : ""}
                  </p>
                </div>
              </div>

              {engs.length > 0 ? (
                <ul className="space-y-2 border-t border-amber-500/10 pt-3">
                  {engs.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="text-foreground truncate">{e.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {e.pillar ? PILLAR_LABEL[e.pillar] || e.pillar : ""}
                          {e.started_at ? ` · Started ${new Date(e.started_at).toLocaleDateString()}` : ""}
                          {e.completed_at ? ` · Completed ${new Date(e.completed_at).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_TONE[e.status] || ""}`}>
                        {e.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground border-t border-amber-500/10 pt-3">
                  No active engagements with this professional.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
      <p className="text-[10px] text-muted-foreground text-center pt-2">
        Work product and privileged communications remain between your advisor and your professionals.
      </p>
    </div>
  );
}
