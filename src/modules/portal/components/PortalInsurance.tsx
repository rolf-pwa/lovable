import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Shield, ChevronDown, ChevronRight } from "lucide-react";
import { policyTypeLabel } from "@/shared/lib/insurance";

interface PortalInsuranceProps {
  policies: Array<{
    id: string;
    carrier: string;
    policy_number: string | null;
    policy_type: string;
    coverage_amount: number | null;
    cash_value: number | null;
  }>;
  defaultCollapsed?: boolean;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

export function PortalInsurance({ policies, defaultCollapsed = false }: PortalInsuranceProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  if (!policies || policies.length === 0) return null;

  const totalCoverage = policies.reduce((sum, p) => sum + (p.coverage_amount || 0), 0);

  return (
    <Card className="border-accent/20">
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
            <Shield className="h-5 w-5 text-accent" />
          </div>
          <div>
            <CardTitle className="text-lg font-serif">The Shield</CardTitle>
            <p className="text-xs text-muted-foreground">Asset Protection</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-xl font-bold text-accent">{formatCurrency(totalCoverage)}</p>
              <Badge variant="secondary" className="text-[10px]">
                {policies.length} polic{policies.length !== 1 ? "ies" : "y"}
              </Badge>
            </div>
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          {policies.map((p) => (
            <div key={p.id} className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.carrier}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.policy_number && (
                      <span className="text-[10px] text-muted-foreground">#{p.policy_number}</span>
                    )}
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                      {policyTypeLabel(p.policy_type)}
                    </Badge>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  {p.coverage_amount != null && p.coverage_amount > 0 && (
                    <p className="text-sm font-semibold">{formatCurrency(p.coverage_amount)}</p>
                  )}
                  {p.cash_value != null && p.cash_value > 0 && (
                    <p className="text-[10px] text-muted-foreground">Cash Value: {formatCurrency(p.cash_value)}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
