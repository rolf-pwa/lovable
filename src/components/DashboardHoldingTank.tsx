import { useEffect, useState } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Anchor, ArrowRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useNavigate } from "react-router-dom";

interface HoldingSummary {
  contact_id: string;
  contact_name: string;
  count: number;
  total_value: number;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

export function DashboardHoldingTank() {
  const [summaries, setSummaries] = useState<HoldingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data: accounts } = await supabase
          .from("holding_tank")
          .select("id, contact_id, current_value, status")
          .eq("status", "holding");

        if (!accounts || accounts.length === 0) {
          setSummaries([]);
          setLoading(false);
          return;
        }

        const contactIds = [...new Set(accounts.map((a) => a.contact_id))];
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, full_name")
          .in("id", contactIds);

        const contactMap = new Map(
          (contacts || []).map((c) => [c.id, c.full_name])
        );

        const grouped = new Map<string, { count: number; total: number }>();
        for (const a of accounts) {
          const existing = grouped.get(a.contact_id) || { count: 0, total: 0 };
          existing.count++;
          existing.total += Number(a.current_value) || 0;
          grouped.set(a.contact_id, existing);
        }

        const result: HoldingSummary[] = Array.from(grouped.entries()).map(
          ([cid, { count, total }]) => ({
            contact_id: cid,
            contact_name: contactMap.get(cid) || "Unknown",
            count,
            total_value: total,
          })
        );

        setSummaries(result);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || summaries.length === 0) return null;

  const totalAccounts = summaries.reduce((s, r) => s + r.count, 0);
  const totalValue = summaries.reduce((s, r) => s + r.total_value, 0);

  return (
    <Card className="border-amber-500/20">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <Anchor className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-lg font-serif">The Holding Tank</CardTitle>
            <p className="text-xs text-muted-foreground">
              Accounts awaiting Charter ratification
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xl font-bold text-amber-600">
              {formatCurrency(totalValue)}
            </p>
            <Badge variant="secondary" className="text-[10px]">
              {totalAccounts} account{totalAccounts !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {summaries.map((s) => (
          <div
            key={s.contact_id}
            className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{s.contact_name}</p>
              <p className="text-[10px] text-muted-foreground">
                {s.count} account{s.count !== 1 ? "s" : ""} staged
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold">
                {formatCurrency(s.total_value)}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => navigate(`/contacts/${s.contact_id}`)}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
