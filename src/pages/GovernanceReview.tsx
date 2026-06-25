import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, ShieldCheck, AlertTriangle, BookOpen, FileText, Copy, CheckCircle2 } from "lucide-react";

type ScopeType = "household" | "contact";

interface Review {
  id: string;
  scope_type: ScopeType;
  scope_id: string;
  period_end: string;
  status: string;
  counts: Record<string, number>;
  verified_at: string | null;
  charter_checked_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  briefing_markdown: string | null;
  briefing_principal_markdown: string | null;
  generation_error: string | null;
}

interface Finding {
  id: string;
  severity: "info" | "warn" | "critical";
  code: string;
  message: string;
  account_ref: any;
  status: "open" | "acknowledged" | "resolved";
}

interface Alignment {
  id: string;
  fact_key: string;
  performance_fact: any;
  charter_section_key: string | null;
  charter_principle: string;
  alignment_status: "aligned" | "exception" | "needs_review";
  exception_reason: string | null;
  recommended_action: string | null;
  evidence_source: any;
  advisor_override: string | null;
  advisor_note: string | null;
}

interface HouseholdOption { id: string; label: string }

const severityColor: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
};
const alignmentColor: Record<string, string> = {
  aligned: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  exception: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
  needs_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

function todayMonthEnd() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

export default function GovernanceReview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [scopeId, setScopeId] = useState<string>(searchParams.get("scope_id") || "");
  const [periodEnd, setPeriodEnd] = useState<string>(searchParams.get("period_end") || todayMonthEnd());
  const [review, setReview] = useState<Review | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [alignments, setAlignments] = useState<Alignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"verify" | "align" | "approve" | "brief" | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("households").select("id, label").order("label");
      setHouseholds((data ?? []) as HouseholdOption[]);
    })();
  }, []);

  const loadReview = async (id?: string) => {
    setLoading(true);
    try {
      let query = supabase.from("monthly_governance_reviews")
        .select("*").eq("scope_type", "household").eq("period_end", periodEnd);
      const targetId = id || scopeId;
      if (!targetId) return;
      const { data } = await query.eq("scope_id", targetId).maybeSingle();
      if (data) {
        setReview(data as any);
        const [{ data: f }, { data: a }] = await Promise.all([
          supabase.from("governance_review_findings").select("*").eq("review_id", data.id).order("severity", { ascending: false }),
          supabase.from("governance_alignment_results").select("*").eq("review_id", data.id),
        ]);
        setFindings((f ?? []) as any);
        setAlignments((a ?? []) as any);
      } else {
        setReview(null); setFindings([]); setAlignments([]);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { if (scopeId) loadReview(); /* eslint-disable-next-line */ }, [scopeId, periodEnd]);

  const runVerify = async () => {
    if (!scopeId) { toast.error("Pick a household first"); return; }
    setBusy("verify");
    try {
      const { data, error } = await supabase.functions.invoke("governance-verify", {
        body: { scope_type: "household", scope_id: scopeId, period_end: periodEnd },
      });
      if (error || (data as any)?.error) throw new Error((error as any)?.message || (data as any).error);
      toast.success(`Verification complete — ${(data as any).findings?.length ?? 0} findings`);
      setSearchParams({ scope_id: scopeId, period_end: periodEnd });
      await loadReview();
    } catch (e: any) { toast.error(e.message || "Verify failed"); }
    finally { setBusy(null); }
  };

  const runAlign = async () => {
    if (!review) { toast.error("Run verification first"); return; }
    setBusy("align");
    try {
      const { data, error } = await supabase.functions.invoke("governance-align", {
        body: { review_id: review.id },
      });
      if (error || (data as any)?.error) throw new Error((error as any)?.message || (data as any).error);
      toast.success(`Charter alignment complete (${(data as any).alignments} facts)`);
      await loadReview();
    } catch (e: any) { toast.error(e.message || "Alignment failed"); }
    finally { setBusy(null); }
  };

  const approve = async () => {
    if (!review) return;
    setBusy("approve");
    try {
      const { data: au } = await supabase.auth.getUser();
      const { error } = await supabase.from("monthly_governance_reviews").update({
        status: "approved_for_reporting",
        approved_by: au.user?.id,
        approved_at: new Date().toISOString(),
      }).eq("id", review.id);
      if (error) throw error;
      toast.success("Review approved for reporting");
      await loadReview();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const generateBriefing = async () => {
    if (!review) return;
    setBusy("brief");
    try {
      const { data, error } = await supabase.functions.invoke("governance-briefing", {
        body: { review_id: review.id },
      });
      if (error || (data as any)?.error) throw new Error((error as any)?.message || (data as any).error);
      toast.success("Briefing generated");
      await loadReview();
    } catch (e: any) { toast.error(e.message || "Briefing failed"); }
    finally { setBusy(null); }
  };

  const updateAlignment = async (id: string, patch: Partial<Alignment>) => {
    const { error } = await supabase.from("governance_alignment_results").update(patch as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setAlignments((rows) => rows.map((r) => r.id === id ? { ...r, ...patch } as Alignment : r));
  };

  const updateFindingStatus = async (id: string, status: Finding["status"]) => {
    const { error } = await supabase.from("governance_review_findings").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setFindings((rows) => rows.map((r) => r.id === id ? { ...r, status } : r));
  };

  const copyMd = (txt?: string | null) => {
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    toast.success("Copied to clipboard");
  };

  const statusBadge = useMemo(() => {
    if (!review) return null;
    const map: Record<string, string> = {
      verified: "border-amber-500/40 text-amber-500",
      charter_checked: "border-blue-500/40 text-blue-500",
      approved_for_reporting: "border-emerald-500/40 text-emerald-500",
      failed: "border-red-500/40 text-red-500",
    };
    return <Badge variant="outline" className={map[review.status] || ""}>{review.status.replace(/_/g, " ")}</Badge>;
  }, [review]);

  return (
    <AppLayout>
      <div className="container max-w-7xl mx-auto py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-serif">Monthly Governance Review</h1>
          <p className="text-muted-foreground">Verify the month, compare against the Charter, then approve the briefing.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. Select scope</CardTitle>
            <CardDescription>Run the governance review for a household at a given period end.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4 items-end">
            <div>
              <Label>Household</Label>
              <Select value={scopeId} onValueChange={setScopeId}>
                <SelectTrigger><SelectValue placeholder="Pick a household" /></SelectTrigger>
                <SelectContent>
                  {households.map((h) => <SelectItem key={h.id} value={h.id}>{h.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period end (month-end)</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={runVerify} disabled={!scopeId || busy === "verify"}>
                {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Run verification
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>}

        {review && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3">
                    Review status {statusBadge}
                  </CardTitle>
                  <CardDescription>
                    {review.counts?.accounts ?? 0} accounts ·{" "}
                    {review.counts?.aligned ?? 0} aligned ·{" "}
                    {review.counts?.exception ?? 0} exceptions ·{" "}
                    {review.counts?.needs_review ?? 0} needs review
                  </CardDescription>
                </div>
                {review.generation_error && (
                  <div className="text-sm text-red-500 max-w-xs truncate">{review.generation_error}</div>
                )}
              </CardHeader>
            </Card>

            {/* 2. Findings */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Verification findings</CardTitle>
                  <CardDescription>Stale snapshots, material variance, missing values.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={runVerify} disabled={busy === "verify"}>Re-verify</Button>
              </CardHeader>
              <CardContent>
                {findings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No findings.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severity</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {findings.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell><Badge variant="outline" className={severityColor[f.severity]}>{f.severity}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{f.code}</TableCell>
                          <TableCell>{f.message}</TableCell>
                          <TableCell className="capitalize">{f.status}</TableCell>
                          <TableCell className="text-right">
                            {f.status !== "resolved" && (
                              <Button size="sm" variant="ghost" onClick={() => updateFindingStatus(f.id, "resolved")}>Resolve</Button>
                            )}
                            {f.status === "open" && (
                              <Button size="sm" variant="ghost" onClick={() => updateFindingStatus(f.id, "acknowledged")}>Ack</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* 3. Charter alignment */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Charter alignment</CardTitle>
                  <CardDescription>Each verified fact compared to a Charter principle.</CardDescription>
                </div>
                <Button onClick={runAlign} disabled={busy === "align"}>
                  {busy === "align" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Run / re-run alignment
                </Button>
              </CardHeader>
              <CardContent>
                {alignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No alignment results yet.</p>
                ) : (
                  <div className="space-y-3">
                    {alignments.map((a) => {
                      const effective = a.advisor_override || a.alignment_status;
                      return (
                        <div key={a.id} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="font-medium">{a.performance_fact?.description ?? a.fact_key}</div>
                              {a.charter_principle && (
                                <div className="text-sm text-muted-foreground italic mt-1">
                                  Charter ({a.charter_section_key || "—"}): {a.charter_principle}
                                </div>
                              )}
                              {a.exception_reason && <div className="text-sm mt-1"><b>Exception:</b> {a.exception_reason}</div>}
                              {a.recommended_action && <div className="text-sm mt-1"><b>Action:</b> {a.recommended_action}</div>}
                            </div>
                            <Badge variant="outline" className={alignmentColor[effective]}>{effective.replace(/_/g, " ")}</Badge>
                          </div>
                          <div className="grid md:grid-cols-2 gap-2 pt-2 border-t">
                            <Select
                              value={a.advisor_override ?? ""}
                              onValueChange={(v) => updateAlignment(a.id, { advisor_override: (v || null) as any })}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Override status…" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="aligned">Override: aligned</SelectItem>
                                <SelectItem value="exception">Override: exception</SelectItem>
                                <SelectItem value="needs_review">Override: needs review</SelectItem>
                              </SelectContent>
                            </Select>
                            <Textarea
                              className="h-8 min-h-[2rem] text-xs"
                              placeholder="Advisor note"
                              defaultValue={a.advisor_note ?? ""}
                              onBlur={(e) => {
                                const val = e.target.value;
                                if (val !== (a.advisor_note ?? "")) updateAlignment(a.id, { advisor_note: val });
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 4. Approve & Brief */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Approve & generate briefing</CardTitle>
                <CardDescription>The briefing reads only from this approved review object.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    onClick={approve}
                    disabled={review.status === "approved_for_reporting" || busy === "approve" || review.status !== "charter_checked"}
                  >
                    {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    {review.status === "approved_for_reporting" ? "Approved" : "Mark approved for reporting"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={generateBriefing}
                    disabled={review.status !== "approved_for_reporting" || busy === "brief"}
                  >
                    {busy === "brief" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                    Generate briefing
                  </Button>
                </div>

                {review.briefing_markdown && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Advisor briefing</h3>
                        <Button size="sm" variant="ghost" onClick={() => copyMd(review.briefing_markdown)}>
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap font-sans">{review.briefing_markdown}</pre>
                    </div>
                    <div className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Principal note</h3>
                        <Button size="sm" variant="ghost" onClick={() => copyMd(review.briefing_principal_markdown)}>
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap font-sans">{review.briefing_principal_markdown}</pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
