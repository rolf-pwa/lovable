import { useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/shared/components/AppLayout";
import { PageBreadcrumbs } from "@/shared/components/PageBreadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Scale, Loader2, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { supabase } from "@/shared/integrations/supabase/client";
import { toast } from "@/shared/hooks/use-toast";

interface FlaggedLoan {
  id: string;
  description: string;
  liability_type: string;
  current_balance: number;
  due_date: string | null;
  isOverdue: boolean;
  isDueSoon: boolean;
  holder_name: string;
  link: string;
}

interface AuditResult {
  flaggedCount: number;
  newlyNotified: number;
  flags: FlaggedLoan[];
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
}

const QuarterlyVfoAudit = () => {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);

  const runAudit = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("quarterly-vfo-audit-generate");
      if (error) throw error;
      setResult(data as AuditResult);
      const notified = (data as AuditResult).newlyNotified;
      toast({
        title: "Audit complete",
        description:
          notified > 0
            ? `${notified} new notification${notified === 1 ? "" : "s"} sent to staff.`
            : "No new notifications needed — every flagged loan was already notified recently.",
      });
    } catch (e) {
      toast({
        title: "Audit failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Workbench", href: "/workbench" },
            { label: "Intercompany Loan Audit" },
          ]}
        />

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Scale className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Intercompany/Shareholder Loan Audit</h1>
            <p className="text-sm text-muted-foreground">
              Checks every intercompany and shareholder loan on file against its due date (CRA s.15(2)).
              Runs automatically every quarter, or on demand below.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              A loan is flagged if it's overdue or due within 60 days. Staff are notified for any newly
              flagged loan (or one not re-notified in the last 80 days) via the notification bell.
            </p>
            <Button onClick={runAudit} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scale className="h-4 w-4 mr-2" />}
              Run Audit Now
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Flagged Loans
                <Badge variant="outline">{result.flaggedCount}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.flags.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  No overdue or soon-due intercompany/shareholder loans on file.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {result.flags.map((loan) => (
                    <div key={loan.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Link to={loan.link} className="font-medium text-foreground hover:underline">
                          {loan.holder_name}
                        </Link>
                        <p className="text-sm text-muted-foreground truncate">{loan.description}</p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-sm font-mono tabular-nums">{formatCurrency(loan.current_balance)}</span>
                        <span className="text-sm text-muted-foreground">
                          {loan.due_date ? new Date(loan.due_date).toLocaleDateString("en-CA") : "No due date"}
                        </span>
                        <Badge variant={loan.isOverdue ? "destructive" : "outline"} className="gap-1">
                          {loan.isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {loan.isOverdue ? "Overdue" : "Due Soon"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default QuarterlyVfoAudit;
