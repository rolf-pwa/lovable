import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { CashflowAnalyst } from "@/components/workbench/CashflowAnalyst";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart3, Loader2, Cpu, FileSpreadsheet } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Workbench = () => {
  const [searchParams] = useSearchParams();
  const preselectedHousehold = searchParams.get("household");

  const [households, setHouseholds] = useState<any[]>([]);
  const [selectedHousehold, setSelectedHousehold] = useState<string>(preselectedHousehold || "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("households")
        .select("id, label, family_id, families:family_id(name)")
        .order("label");
      setHouseholds(data || []);
      if (preselectedHousehold && !selectedHousehold) {
        setSelectedHousehold(preselectedHousehold);
      }
      setLoading(false);
    })();
  }, []);

  const currentHH = households.find((h) => h.id === selectedHousehold);

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Workbench" },
          ]}
        />

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Cpu className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">Agentic Workbench</h1>
              <Badge variant="outline" className="text-[10px] font-mono">Beta</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-powered operational intelligence for the Personal Sanctuary
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/workbench/quarterly-review">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Quarterly Review
            </Link>
          </Button>
        </div>

        {/* Household Selector */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <Label className="text-sm font-medium whitespace-nowrap">Select Household</Label>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Select value={selectedHousehold} onValueChange={setSelectedHousehold}>
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder="Choose a household…" />
                  </SelectTrigger>
                  <SelectContent>
                    {households.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.label} — {(h.families as any)?.name || "Unknown"} Family
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>


        {/* Household-scoped agents */}
        {selectedHousehold && currentHH ? (
          <CashflowAnalyst
            householdId={selectedHousehold}
            householdName={`${currentHH.label} — ${(currentHH.families as any)?.name || ""}`}
          />
        ) : (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-foreground">Select a household to unlock household-scoped agents</p>
                <p className="text-sm text-muted-foreground">
                  Choose a household above to access the Cashflow Analyst and other household-scoped workbench tools.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Workbench;
