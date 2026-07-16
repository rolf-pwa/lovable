import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Anchor, Landmark, Castle, Sword, Wheat, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface Stats {
  vineyardTotal: number;
  liquidityTotal: number;
  strategicTotal: number;
  philanthropicTotal: number;
  holdingTankTotal: number;
  holdingTankCount: number;
  newAumTotal: number;
  newAumCount: number;
  aumDepositsTotal: number;
  aumDepositsCount: number;
}

export function DashboardSidebar() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data: vineyardAccounts } = await supabase
          .from("vineyard_accounts")
          .select("current_value");

        const { data: storehouseAccounts } = await supabase
          .from("storehouses")
          .select("current_value, storehouse_number, asset_type");

        const vineyardTotal = (vineyardAccounts || []).reduce(
          (sum, a) => sum + (Number(a.current_value) || 0),
          0
        );

        const sumStorehouse = (num: number) =>
          (storehouseAccounts || [])
            .filter((s: any) => s.storehouse_number === num && s.asset_type !== 'Primary Residence & Protected Legacy Accounts')
            .reduce((sum: number, s: any) => sum + (Number(s.current_value) || 0), 0);

        const liquidityTotal = sumStorehouse(1);
        const strategicTotal = sumStorehouse(2);
        const philanthropicTotal = sumStorehouse(3);

        const { data: holdingAccounts } = await supabase
          .from("holding_tank")
          .select("id, current_value, expected_deposit_date")
          .eq("status", "holding");

        const holdingTankCount = holdingAccounts?.length ?? 0;
        const holdingTankTotal = (holdingAccounts || []).reduce(
          (sum, a) => sum + (Number(a.current_value) || 0),
          0
        );

        const aumDeposits = (holdingAccounts || []).filter((a: any) => a.expected_deposit_date);
        const aumDepositsCount = aumDeposits.length;
        const aumDepositsTotal = aumDeposits.reduce(
          (sum, a: any) => sum + (Number(a.current_value) || 0),
          0
        );

        const { data: pipelineRows } = await (supabase.from("business_pipeline" as any) as any)
          .select("amount, status, category")
          .eq("category", "new_aum")
          .in("status", ["pending", "in_process"]);
        const newAumCount = pipelineRows?.length ?? 0;
        const newAumTotal = (pipelineRows || []).reduce(
          (sum: number, p: any) => sum + (Number(p.amount) || 0),
          0
        );

        setStats({
          vineyardTotal,
          liquidityTotal,
          strategicTotal,
          philanthropicTotal,
          holdingTankTotal,
          holdingTankCount,
          newAumTotal,
          newAumCount,
          aumDepositsTotal,
          aumDepositsCount,
        });
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  if (loading) {
    return (
      <div className="flex justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="flex items-center gap-6 border-y border-border/60 px-4 py-2 text-xs overflow-hidden whitespace-nowrap">
      <div className="flex items-center gap-2 text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        <span>Vineyard</span>
        <span className="font-semibold text-foreground">{formatCurrency(stats.vineyardTotal)}</span>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        <Castle className="h-3.5 w-3.5" />
        <span>Liquidity</span>
        <span className="font-semibold text-foreground">{formatCurrency(stats.liquidityTotal)}</span>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        <Sword className="h-3.5 w-3.5" />
        <span>Strategic</span>
        <span className="font-semibold text-foreground">{formatCurrency(stats.strategicTotal)}</span>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        <Wheat className="h-3.5 w-3.5" />
        <span>Philanthropic</span>
        <span className="font-semibold text-foreground">{formatCurrency(stats.philanthropicTotal)}</span>
      </div>

      {stats.newAumCount > 0 && (
        <button
          onClick={() => navigate("/pipeline")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Landmark className="h-3.5 w-3.5" />
          <span>New AUM</span>
          <span className="font-semibold text-foreground">{formatCurrency(stats.newAumTotal)}</span>
          <span>({stats.newAumCount})</span>
        </button>
      )}

      {stats.holdingTankCount > 0 && (
        <button
          onClick={() => navigate("/holding-tank")}
          className="flex items-center gap-2 text-amber-600 hover:text-amber-500 transition-colors"
        >
          <Anchor className="h-3.5 w-3.5" />
          <span>Holding Tank</span>
          <span className="font-semibold">{formatCurrency(stats.holdingTankTotal)}</span>
          <span className="text-muted-foreground">({stats.holdingTankCount} staged)</span>
        </button>
      )}
    </div>
  );
}
