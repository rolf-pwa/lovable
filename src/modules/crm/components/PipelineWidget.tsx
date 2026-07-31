import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Loader2, TrendingUp, DollarSign, Landmark } from "lucide-react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Link } from "react-router-dom";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

interface Summary {
  // Consulting + Insurance (direct revenue)
  revenuePending: number;
  revenueInProcess: number;
  revenueCompleted: number;
  consultingTotal: number;
  insuranceTotal: number;
  // AUM (aggregate deposits, not direct commissions)
  aumPending: number;
  aumInProcess: number;
  aumCompleted: number;
}

export function PipelineWidget() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from("business_pipeline" as any) as any).select("category, status, amount");
      const items = (data || []) as any[];

      const revenue = items.filter((i) => i.category === "pws_consulting" || i.category === "insurance");
      const aum = items.filter((i) => i.category === "new_aum");

      const sumByStatus = (arr: any[], status: string) =>
        arr.filter((i) => i.status === status).reduce((s: number, i: any) => s + Number(i.amount), 0);

      const activeRevenue = revenue.filter((i) => i.status !== "completed");
      const consultingTotal = activeRevenue.filter((i) => i.category === "pws_consulting").reduce((s: number, i: any) => s + Number(i.amount), 0);
      const insuranceTotal = activeRevenue.filter((i) => i.category === "insurance").reduce((s: number, i: any) => s + Number(i.amount), 0);

      setSummary({
        revenuePending: sumByStatus(revenue, "pending"),
        revenueInProcess: sumByStatus(revenue, "in_process"),
        revenueCompleted: sumByStatus(revenue, "completed"),
        consultingTotal,
        insuranceTotal,
        aumPending: sumByStatus(aum, "pending"),
        aumInProcess: sumByStatus(aum, "in_process"),
        aumCompleted: sumByStatus(aum, "completed"),
      });
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (!summary) return null;

  const totalActiveRevenue = summary.revenuePending + summary.revenueInProcess;
  const totalActiveAum = summary.aumPending + summary.aumInProcess;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Direct Revenue: Consulting + Insurance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
            <span className="flex items-center gap-2"><DollarSign className="h-4 w-4" />Revenue Pipeline</span>
            <Link to="/pipeline" className="text-xs text-primary hover:underline">View All</Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalActiveRevenue)}</p>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>Pending: <strong className="text-foreground">{formatCurrency(summary.revenuePending)}</strong></span>
            <span>In Process: <strong className="text-foreground">{formatCurrency(summary.revenueInProcess)}</strong></span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {summary.consultingTotal > 0 && (
              <Badge variant="secondary" className="text-xs">Consulting: {formatCurrency(summary.consultingTotal)}</Badge>
            )}
            {summary.insuranceTotal > 0 && (
              <Badge variant="secondary" className="text-xs">Insurance: {formatCurrency(summary.insuranceTotal)}</Badge>
            )}
          </div>
          {summary.revenueCompleted > 0 && (
            <p className="text-xs text-muted-foreground pt-1">Completed: {formatCurrency(summary.revenueCompleted)}</p>
          )}
        </CardContent>
      </Card>

      {/* AUM Deposits */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
            <span className="flex items-center gap-2"><Landmark className="h-4 w-4" />New AUM Deposits</span>
            <Link to="/pipeline" className="text-xs text-primary hover:underline">View All</Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalActiveAum)}</p>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>Pending: <strong className="text-foreground">{formatCurrency(summary.aumPending)}</strong></span>
            <span>In Process: <strong className="text-foreground">{formatCurrency(summary.aumInProcess)}</strong></span>
          </div>
          <p className="text-xs text-muted-foreground pt-1 italic">Subject to AUM fees</p>
          {summary.aumCompleted > 0 && (
            <p className="text-xs text-muted-foreground">Completed: {formatCurrency(summary.aumCompleted)}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}