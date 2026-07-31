import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Progress } from "@/shared/components/ui/progress";
import { toast } from "sonner";
import {
  FileUp, X, FileText, Loader2, TrendingDown, Shield, AlertTriangle,
  DollarSign, BarChart3, ArrowRight, CheckCircle2, Clock, Flame
} from "lucide-react";

interface CashflowAnalystProps {
  householdId: string;
  householdName: string;
  liquidAssets?: number;
}

interface AnalysisResult {
  burn_rate: { monthly_average: number; fixed_baseline: number; variable_leakage: number };
  liquidity_status: { wall_months: number; status: string; liquid_assets: number; gap_to_sovereignty: number };
  category_breakdown: Record<string, number>;
  total_inflows: number;
  total_outflows: number;
  net_cashflow: number;
  outliers: Array<{ date: string; description: string; amount: number; category: string; flag_reason: string }>;
  internal_transfers_neutralized: number;
  proposed_tasks: Array<{ title: string; phase: string; description: string }>;
  logic_trace: string;
  executive_summary: string;
  anxiety_anchor_findings: string | null;
  period_start: string;
  period_end: string;
}

interface SavedAnalysis {
  id: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  burn_rate: any;
  liquidity_status: any;
  category_breakdown: any;
  outliers: any;
  proposed_tasks: any;
  logic_trace: string | null;
  created_at: string;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const STATUS_COLORS: Record<string, string> = {
  Green: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  Yellow: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Red: "bg-red-500/15 text-red-700 border-red-500/30",
};

const PHASE_LABELS: Record<string, string> = { C: "Fortify", D: "Eliminate", E: "Migrate" };

export function CashflowAnalyst({ householdId, householdName, liquidAssets }: CashflowAnalystProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [customLiquid, setCustomLiquid] = useState<string>(liquidAssets?.toString() || "");
  const [anxietyAnchor, setAnxietyAnchor] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [pastAnalyses, setPastAnalyses] = useState<SavedAnalysis[]>([]);
  const [viewingPast, setViewingPast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const fetchPastAnalyses = useCallback(async () => {
    const { data } = await supabase
      .from("cashflow_analyses" as any)
      .select("id, status, period_start, period_end, burn_rate, liquidity_status, category_breakdown, outliers, proposed_tasks, logic_trace, created_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setPastAnalyses(data as any);
  }, [householdId]);

  useEffect(() => { fetchPastAnalyses(); }, [fetchPastAnalyses]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".csv"));
    if (dropped.length) setFiles(prev => [...prev, ...dropped]);
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length) setFiles(prev => [...prev, ...selected]);
    e.target.value = "";
  }

  async function runAnalysis() {
    if (!files.length) { toast.error("Upload at least one CSV file"); return; }
    setIsAnalyzing(true);
    setResult(null);

    try {
      // Upload files to storage
      const filePaths: string[] = [];
      for (const file of files) {
        const path = `${householdId}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("cashflow-uploads").upload(path, file);
        if (upErr) throw new Error("Upload failed: " + upErr.message);
        filePaths.push(path);
      }

      // Call edge function
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cashflow-analyst`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          householdId,
          filePaths,
          householdName,
          liquidAssets: customLiquid ? Number(customLiquid) : liquidAssets || 0,
          anxietyAnchor: anxietyAnchor || null,
        }),
      });

      if (res.status === 429) { toast.error("Rate limit exceeded. Please try again shortly."); return; }
      if (res.status === 402) { toast.error("AI credits exhausted. Please add funds to continue."); return; }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      setResult(data.result);
      setFiles([]);
      fetchPastAnalyses();
      toast.success(`Cashflow analysis complete — ${data.result.outliers?.length || 0} outliers detected`);
    } catch (err: any) {
      toast.error(err.message || "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function viewPastAnalysis(a: SavedAnalysis) {
    setViewingPast(a.id);
    setResult({
      burn_rate: a.burn_rate || {},
      liquidity_status: a.liquidity_status || {},
      category_breakdown: a.category_breakdown || {},
      outliers: a.outliers || [],
      proposed_tasks: a.proposed_tasks || [],
      logic_trace: a.logic_trace || "",
      executive_summary: "",
      anxiety_anchor_findings: null,
      period_start: a.period_start || "",
      period_end: a.period_end || "",
      internal_transfers_neutralized: 0,
      total_inflows: 0,
      total_outflows: 0,
      net_cashflow: 0,
    });
  }

  const displayResult = result;

  return (
    <div className="space-y-6">
      {/* Upload & Config Section */}
      {!displayResult && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* CSV Upload */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                Cashflow Analyst
                <Badge variant="outline" className="text-[10px] ml-auto font-mono">v1.2</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Upload 12 months of bank/credit card CSV exports. The AI will extract your True Burn Rate, neutralize internal transfers, and assess liquidity sovereignty.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setFiles(files.filter((_, idx) => idx !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-8 transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <FileUp className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Drop CSV files here or <span className="font-medium text-primary">browse</span>
                </p>
                <p className="text-xs text-muted-foreground/60">RBC, TD, Scotiabank, BMO, CIBC, Amex exports supported</p>
                <input ref={inputRef} type="file" accept=".csv" multiple onChange={handleSelect} className="hidden" />
              </div>
            </CardContent>
          </Card>

          {/* Analysis Config */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Analysis Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Liquid Assets Override ($)</Label>
                  <Input
                    type="number"
                    placeholder={liquidAssets?.toString() || "Enter liquid assets"}
                    value={customLiquid}
                    onChange={(e) => setCustomLiquid(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Cash, HISA, Short-term GICs</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Anxiety Anchor (Optional)</Label>
                  <Textarea
                    placeholder="e.g., Family conflict, job loss, market crash..."
                    value={anxietyAnchor}
                    onChange={(e) => setAnxietyAnchor(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button
                  onClick={runAnalysis}
                  disabled={!files.length || isAnalyzing}
                  className="w-full"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <Flame className="h-4 w-4 mr-2" />
                      Run Burn Rate Analysis
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Past Analyses */}
            {pastAnalyses.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Previous Audits
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pastAnalyses.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => viewPastAnalysis(a)}
                      className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/60 ${
                        viewingPast === a.id ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                          {a.period_start && a.period_end
                            ? `${new Date(a.period_start).toLocaleDateString("en-CA", { month: "short", year: "numeric" })} – ${new Date(a.period_end).toLocaleDateString("en-CA", { month: "short", year: "numeric" })}`
                            : new Date(a.created_at).toLocaleDateString("en-CA")}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {a.burn_rate?.monthly_average ? formatCurrency(a.burn_rate.monthly_average) : "—"}/mo
                        </Badge>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Analyzing state */}
      {isAnalyzing && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium text-foreground">Analyzing {files.length} CSV file{files.length > 1 ? "s" : ""}…</p>
              <p className="text-sm text-muted-foreground mt-1">
                Mapping headers, neutralizing internal transfers, categorizing transactions
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {displayResult && !isAnalyzing && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Cashflow Stewardship Report: {householdName}
              </h3>
              <p className="text-sm text-muted-foreground">
                {displayResult.period_start && displayResult.period_end
                  ? `${displayResult.period_start} to ${displayResult.period_end}`
                  : "Analysis Complete"}
              </p>
            </div>
            <Button variant="outline" onClick={() => { setResult(null); setViewingPast(null); }}>
              New Analysis
            </Button>
          </div>

          {/* Executive Summary */}
          {displayResult.executive_summary && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-4">
                <p className="text-sm text-foreground leading-relaxed">{displayResult.executive_summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Key Metrics */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <TrendingDown className="h-4 w-4" />
                  True Burn Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(displayResult.burn_rate?.monthly_average || 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">/month average</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <DollarSign className="h-4 w-4" />
                  Fixed Baseline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(displayResult.burn_rate?.fixed_baseline || 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">/month non-negotiable</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Variable Leakage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(displayResult.burn_rate?.variable_leakage || 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">/month discretionary</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <Shield className="h-4 w-4" />
                  Liquidity Wall
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-foreground">
                    {displayResult.liquidity_status?.wall_months?.toFixed(1) || "—"}
                  </p>
                  <Badge className={`text-[10px] ${STATUS_COLORS[displayResult.liquidity_status?.status] || ""}`}>
                    {displayResult.liquidity_status?.status || "—"}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">months of fixed burn covered</p>
              </CardContent>
            </Card>
          </div>

          {/* Liquidity Progress */}
          {displayResult.liquidity_status?.wall_months != null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Liquidity Sovereignty Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Current: {displayResult.liquidity_status.wall_months.toFixed(1)} months</span>
                    <span>Sovereign Goal: 12 months</span>
                  </div>
                  <Progress
                    value={Math.min((displayResult.liquidity_status.wall_months / 12) * 100, 100)}
                    className="h-3"
                  />
                  {displayResult.liquidity_status.gap_to_sovereignty > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Gap to sovereignty: {formatCurrency(displayResult.liquidity_status.gap_to_sovereignty)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Category Breakdown */}
          {displayResult.category_breakdown && Object.keys(displayResult.category_breakdown).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Category Breakdown — Annual Totals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Inflows Section */}
                  {Object.entries(displayResult.category_breakdown)
                    .filter(([_, v]) => v > 0)
                    .sort(([, a], [, b]) => b - a)
                    .length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Inflows</p>
                      {Object.entries(displayResult.category_breakdown)
                        .filter(([_, v]) => v > 0)
                        .sort(([, a], [, b]) => b - a)
                        .map(([cat, amount]) => (
                          <div key={cat} className="flex items-center justify-between text-sm">
                            <span className="text-foreground">{cat}</span>
                            <span className="font-medium text-emerald-600">+{formatCurrency(amount)}</span>
                          </div>
                        ))}
                      {displayResult.total_inflows > 0 && (
                        <div className="flex items-center justify-between text-sm border-t border-border pt-1">
                          <span className="font-semibold text-foreground">Total Inflows</span>
                          <span className="font-bold text-emerald-600">+{formatCurrency(displayResult.total_inflows)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Outflows Section */}
                  {Object.entries(displayResult.category_breakdown)
                    .filter(([_, v]) => v < 0)
                    .length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mt-2">Outflows</p>
                      {(() => {
                        const outflows = Object.entries(displayResult.category_breakdown)
                          .filter(([_, v]) => v < 0)
                          .sort(([, a], [, b]) => a - b);
                        const totalOut = outflows.reduce((s, [, v]) => s + Math.abs(v), 0);
                        return outflows.map(([cat, amount]) => {
                          const pct = totalOut > 0 ? (Math.abs(amount) / totalOut) * 100 : 0;
                          return (
                            <div key={cat} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-foreground">{cat}</span>
                                <span className="font-medium text-foreground">{formatCurrency(amount)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Progress value={pct} className="h-1.5 flex-1" />
                                <span className="text-[10px] text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                      {displayResult.total_outflows !== 0 && (
                        <div className="flex items-center justify-between text-sm border-t border-border pt-1">
                          <span className="font-semibold text-foreground">Total Outflows</span>
                          <span className="font-bold text-foreground">{formatCurrency(displayResult.total_outflows)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Net Cashflow */}
                  <div className="flex items-center justify-between text-sm border-t-2 border-border pt-2 mt-2">
                    <span className="font-bold text-foreground">Net Cashflow</span>
                    <span className={`text-lg font-bold ${(displayResult.net_cashflow || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {(displayResult.net_cashflow || 0) >= 0 ? "+" : ""}{formatCurrency(displayResult.net_cashflow || 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Outliers */}
          {displayResult.outliers && displayResult.outliers.length > 0 && (
            <Card className="border-amber-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  Outlier Transactions ({displayResult.outliers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {displayResult.outliers.map((o, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-md border border-amber-500/20 bg-amber-50/30 dark:bg-amber-500/5 p-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-foreground truncate">{o.description}</p>
                          <span className="text-sm font-semibold text-foreground ml-2">{formatCurrency(o.amount)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{o.date} · {o.category}</p>
                        <p className="text-xs text-amber-700 mt-0.5">{o.flag_reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Anxiety Anchor Findings */}
          {displayResult.anxiety_anchor_findings && (
            <Card className="border-purple-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-purple-700">
                  <Shield className="h-4 w-4" />
                  Anxiety Anchor Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground leading-relaxed">{displayResult.anxiety_anchor_findings}</p>
              </CardContent>
            </Card>
          )}

          {/* Proposed Tasks */}
          {displayResult.proposed_tasks && displayResult.proposed_tasks.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Proposed Sovereign Strategy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {displayResult.proposed_tasks.map((t, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-md border border-border p-3">
                      <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                        Phase {t.phase} · {PHASE_LABELS[t.phase] || ""}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Logic Trace */}
          {displayResult.logic_trace && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Logic Trace</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground leading-relaxed font-mono bg-muted/50 rounded-md p-3">
                  {displayResult.logic_trace}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
