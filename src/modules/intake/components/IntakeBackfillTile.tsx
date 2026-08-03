import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";

interface Row {
  id: string;
  label: string;
  hasToken: boolean;
}

/**
 * Intake Agent token backfill.
 * Households provisioned before the agent's callback contract included
 * `shareToken` have no `intake_share_token`, so their client portal intake
 * page stays hidden. Re-pushing them repopulates the token.
 */
export const IntakeBackfillTile = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("households")
      .select("id, label, intake_share_token")
      .order("label");
    setRows(
      (data || []).map((h: any) => ({
        id: h.id,
        label: h.label,
        hasToken: !!h.intake_share_token,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const missing = rows.filter((r) => !r.hasToken);

  const rePushAll = async () => {
    setRunning(true);
    let ok = 0;
    const failures: string[] = [];

    for (const hh of missing) {
      setCurrent(hh.label);
      try {
        const { data, error } = await supabase.functions.invoke("crm-intake-push", {
          body: { household_id: hh.id },
        });
        if (error || (data as any)?.error) {
          failures.push(hh.label);
        } else {
          ok += 1;
        }
      } catch {
        failures.push(hh.label);
      }
    }

    setCurrent(null);
    setRunning(false);
    await load();

    toast({
      title: `Re-pushed ${ok} household${ok === 1 ? "" : "s"}`,
      description: failures.length
        ? `Skipped/failed: ${failures.slice(0, 6).join(", ")}${failures.length > 6 ? `, +${failures.length - 6} more` : ""}`
        : "Tokens will land as the agent's callbacks arrive.",
      variant: failures.length ? "destructive" : "default",
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-sanctuary-bronze" />
          Audit Agent Tokens
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{rows.length - missing.length} linked</Badge>
              <Badge variant="outline">{missing.length} missing</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Households without a portal share token can&apos;t show the client intake page.
              Re-push them to the Audit Agent to populate it.
            </p>
            <Button
              size="sm"
              className="w-full"
              disabled={running || missing.length === 0}
              onClick={rePushAll}
            >
              {running ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  {current ? `Pushing ${current}…` : "Pushing…"}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Re-push {missing.length} household{missing.length === 1 ? "" : "s"}
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
