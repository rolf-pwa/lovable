import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type TargetField =
  | "__skip__"
  | "account_number"
  | "client_name"
  | "custodian"
  | "account_type"
  | "boy_value"
  | "current_value"
  | "as_of_date";

const FIELDS: { value: TargetField; label: string; required?: boolean }[] = [
  { value: "__skip__", label: "— Skip —" },
  { value: "account_number", label: "Account Number", required: true },
  { value: "client_name", label: "Client Name" },
  { value: "custodian", label: "Custodian" },
  { value: "account_type", label: "Account Type" },
  { value: "boy_value", label: "BOY Balance", required: true },
  { value: "current_value", label: "Current Balance", required: true },
  { value: "as_of_date", label: "As-of Date (YYYY-MM-DD)", required: true },
];

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === ",") { out.push(cur.trim()); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur.trim());
    return out;
  };
  return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
}

function guessField(header: string): TargetField {
  const h = header.toLowerCase().replace(/[_\-\s]+/g, "");
  if (h.includes("accountnumber") || h === "acct" || h === "accountno" || h === "account") return "account_number";
  if (h.includes("client") || h.includes("owner") || h === "name") return "client_name";
  if (h.includes("custodian") || h.includes("institution") || h.includes("firm")) return "custodian";
  if (h.includes("accounttype") || h === "type") return "account_type";
  if (h.includes("boy") || h.includes("beginningofyear") || h.includes("jan1") || h.includes("openingbalance")) return "boy_value";
  if (h.includes("current") || h.includes("closing") || h.includes("ending") || h.includes("market") || h === "balance") return "current_value";
  if (h.includes("asof") || h.includes("date") || h.includes("statementdate")) return "as_of_date";
  return "__skip__";
}

function parseDate(v: string): string | null {
  const s = (v || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or M/D/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

interface RowResult {
  csv_row_number: number;
  destination: string;
  account_number: string | null;
  client_name: string | null;
  matched_table?: string | null;
  matched_contact_name?: string | null;
  message?: string;
  applied?: boolean;
}

const destinationLabel = (d: string) => {
  switch (d) {
    case "vineyard_update": return { label: "Vineyard Update", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
    case "holding_tank_update": return { label: "Holding Tank Update", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
    case "holding_tank_new": return { label: "New → Holding Tank", color: "bg-sky-500/15 text-sky-700 dark:text-sky-300" };
    case "conflict": return { label: "Conflict", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" };
    case "missing_account_number": return { label: "Missing Acct #", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" };
    case "missing_contact": return { label: "No Contact Match", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" };
    default: return { label: d, color: "bg-muted text-muted-foreground" };
  }
};

export default function QuarterlyAccountSync() {
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, TargetField>>({});
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    const guessed: Record<number, TargetField> = {};
    parsed.headers.forEach((h, i) => { guessed[i] = guessField(h); });
    setMapping(guessed);
    setStep("map");
  };

  const buildRows = () => {
    const idx = (f: TargetField) =>
      Object.entries(mapping).find(([, v]) => v === f)?.[0];
    const get = (row: string[], f: TargetField) => {
      const i = idx(f);
      return i !== undefined ? row[Number(i)] : undefined;
    };
    return rows.map((row, i) => ({
      csv_row_number: i + 2,
      account_number: get(row, "account_number") || null,
      client_name: get(row, "client_name") || null,
      custodian: get(row, "custodian") || null,
      account_type: get(row, "account_type") || null,
      boy_value: get(row, "boy_value") || null,
      current_value: get(row, "current_value") || null,
      as_of_date: parseDate(get(row, "as_of_date") || ""),
    }));
  };

  const callSync = async (mode: "preview" | "commit") => {
    setBusy(true);
    try {
      const payload = { mode, rows: buildRows(), source_file: fileName };
      const { data, error } = await supabase.functions.invoke("quarterly-account-sync", {
        body: payload,
      });
      if (error) throw error;
      setResults(data.results);
      setSummary(data.summary);
      setStep(mode === "commit" ? "done" : "preview");
      if (mode === "commit") {
        toast({ title: "Sync complete", description: `${data.summary.applied} rows applied.` });
      }
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const requiredMissing = useMemo(() => {
    const mapped = new Set(Object.values(mapping));
    return FIELDS.filter((f) => f.required && !mapped.has(f.value));
  }, [mapping]);

  const downloadErrors = () => {
    if (!results) return;
    const bad = results.filter((r) => !["vineyard_update", "holding_tank_update", "holding_tank_new"].includes(r.destination) || (r.applied === false && r.message));
    const csv = [
      ["CSV Row", "Destination", "Account #", "Client", "Message"],
      ...bad.map((r) => [r.csv_row_number, r.destination, r.account_number || "", r.client_name || "", r.message || ""]),
    ].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `account-sync-errors-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Workbench", href: "/workbench" },
            { label: "Bulk Account Sync" },
          ]}
        />

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Quarterly Bulk Account Sync</h1>
            <p className="text-sm text-muted-foreground">
              Upload a custodian CSV. Rows are auto-routed by account number to Vineyard or Holding Tank, with BOY + current balance written to the harvest snapshot.
            </p>
          </div>
          <Button variant="ghost" asChild>
            <Link to="/workbench"><ArrowLeft className="h-4 w-4 mr-2" />Workbench</Link>
          </Button>
        </div>

        {step === "upload" && (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-4">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center max-w-md">
                CSV must include columns for Account Number, BOY Balance, Current Balance, and As-of Date. Client Name, Custodian, and Account Type are recommended.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="hidden"
              />
              <Button onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Choose CSV
              </Button>
              <p className="text-xs text-muted-foreground">
                Note: Storehouse accounts (Liquidity Reserve, Strategic Reserve, Philanthropic Trust, Legacy Trust) are out of scope for this sync — update those manually.
              </p>
            </CardContent>
          </Card>
        )}

        {step === "map" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Map columns — {fileName} ({rows.length} rows)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Label className="w-1/2 text-xs truncate">{h}</Label>
                    <Select
                      value={mapping[i] || "__skip__"}
                      onValueChange={(v) => setMapping({ ...mapping, [i]: v as TargetField })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}{f.required ? " *" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {requiredMissing.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="h-4 w-4" />
                  Required fields not mapped: {requiredMissing.map((f) => f.label).join(", ")}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep("upload")}>Back</Button>
                <Button
                  disabled={requiredMissing.length > 0 || busy}
                  onClick={() => callSync("preview")}
                >
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Preview Sync
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {(step === "preview" || step === "done") && summary && results && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {step === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
                  {step === "done" ? "Sync Complete" : "Preview"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                  <Stat label="Total" value={summary.total} />
                  <Stat label="Vineyard" value={summary.vineyard_update} tone="emerald" />
                  <Stat label="Tank Update" value={summary.holding_tank_update} tone="amber" />
                  <Stat label="New → Tank" value={summary.holding_tank_new} tone="sky" />
                  <Stat label="Conflicts" value={summary.conflict} tone="rose" />
                  <Stat label="Errors" value={summary.missing_account_number + summary.missing_contact} tone="rose" />
                </div>
                <div className="flex gap-2 mt-4">
                  {step === "preview" && (
                    <>
                      <Button variant="ghost" onClick={() => setStep("map")}>Back</Button>
                      <Button onClick={() => callSync("commit")} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Run Sync ({summary.vineyard_update + summary.holding_tank_update + summary.holding_tank_new} rows)
                      </Button>
                    </>
                  )}
                  {step === "done" && (
                    <>
                      <Button variant="outline" asChild>
                        <Link to="/holding-tank">Open Holding Tank</Link>
                      </Button>
                      <Button variant="ghost" onClick={() => { setStep("upload"); setResults(null); setSummary(null); }}>
                        Upload Another
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" onClick={downloadErrors}>Download Issues CSV</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Row-by-row</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[480px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Account #</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Matched Contact</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r) => {
                        const d = destinationLabel(r.destination);
                        return (
                          <TableRow key={r.csv_row_number}>
                            <TableCell className="text-xs">{r.csv_row_number}</TableCell>
                            <TableCell>
                              <Badge className={`${d.color} border-0 text-[10px] font-normal`}>{d.label}</Badge>
                              {r.applied ? <span className="ml-2 text-[10px] text-emerald-600">applied</span> : null}
                            </TableCell>
                            <TableCell className="text-xs font-mono">{r.account_number}</TableCell>
                            <TableCell className="text-xs">{r.client_name}</TableCell>
                            <TableCell className="text-xs">{r.matched_contact_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.message}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    sky: "text-sky-600 dark:text-sky-400",
    rose: "text-rose-600 dark:text-rose-400",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={`text-xl font-bold ${tone ? colorMap[tone] : "text-foreground"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
