import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Papa from "papaparse";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft,
  TrendingUp, Save, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type TargetField =
  | "__skip__" | "account_number" | "client_name" | "first_name" | "last_name"
  | "custodian" | "account_type" | "product"
  | "boy_value" | "current_value" | "as_of_date"
  | "ror_ytd" | "ror_6m" | "ror_1y" | "ror_3y" | "ror_5y" | "ror_since_inception";

const FIELDS: { value: TargetField; label: string; required?: boolean }[] = [
  { value: "__skip__", label: "— Skip —" },
  { value: "account_number", label: "Account / Contract Number", required: true },
  { value: "client_name", label: "Client Name (full)" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "custodian", label: "Custodian" },
  { value: "account_type", label: "Account Type / Registration" },
  { value: "product", label: "Product" },
  { value: "boy_value", label: "BOY Balance", required: true },
  { value: "current_value", label: "Current Balance", required: true },
  { value: "as_of_date", label: "As-of Date" },
  { value: "ror_ytd", label: "RoR YTD" },
  { value: "ror_6m", label: "RoR 6M" },
  { value: "ror_1y", label: "RoR 1Y" },
  { value: "ror_3y", label: "RoR 3Y" },
  { value: "ror_5y", label: "RoR 5Y" },
  { value: "ror_since_inception", label: "RoR Since Inception" },
];

function guessField(header: string): TargetField {
  const h = header.toLowerCase().replace(/[_\-\s]+/g, "");
  if (h.includes("accountnumber") || h.includes("contract") || h === "acct" || h === "accountno" || h === "account") return "account_number";
  if (h === "firstname" || h === "givenname" || h.endsWith("firstname")) return "first_name";
  if (h === "lastname" || h === "surname" || h === "familyname" || h.endsWith("lastname")) return "last_name";
  if (h.includes("client") || h.includes("owner") || h === "name" || h === "fullname") return "client_name";
  if (h.includes("custodian") || h.includes("institution") || h.includes("firm")) return "custodian";
  if (h.includes("accounttype") || h.includes("registration") || h === "type") return "account_type";
  if (h.includes("product")) return "product";
  // Handle "Begining of the year" typo + "Beginning of year" + "BOY"
  if (h === "boy" || h.includes("beginingof") || h.includes("beginningof") || h.includes("openingbalance") || h.includes("marketvaluebeg") || h.startsWith("begining") || h.startsWith("beginning")) return "boy_value";
  // "As of YYYY-MM-DD" in IAG exports is the current balance column
  if (/^asof\d/.test(h) || h.startsWith("asof20") || h.startsWith("asof19")) return "current_value";
  if (h === "asof" || h === "asofdate" || h.includes("statementdate")) return "as_of_date";
  if (h.includes("current") || h.includes("closing") || h.includes("ending") || h.includes("marketvalueasof") || h === "balance") return "current_value";
  if (h.includes("issuedate")) return "__skip__";
  if (h.includes("yeartodate") || h === "ytd" || h.includes("rorytd")) return "ror_ytd";
  if (h.includes("6month") || h === "6m" || h === "6mo") return "ror_6m";
  if (h.includes("1year") || h === "1y" || h === "1yr") return "ror_1y";
  if (h.includes("3year") || h === "3y" || h === "3yr") return "ror_3y";
  if (h.includes("5year") || h === "5y" || h === "5yr") return "ror_5y";
  if (h.includes("inception") || h.includes("sinceinit") || h.includes("sincepurchase")) return "ror_since_inception";
  if (h.includes("date")) return "as_of_date";
  return "__skip__";
}

function parseDate(v: string): string | null {
  const s = (v || "").trim();
  if (!s) return null;
  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

// Returns null for blank/n/a/—; otherwise a number. Strips currency, spaces, %, and uses ()=negative.
const num = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  if (/^(n\/?a|na|—|-+|null)$/i.test(raw)) return null;
  const s = raw.replace(/[$,\s%]/g, "").replace(/[()]/g, (m) => m === "(" ? "-" : "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const fmt$ = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

type OverrideKind = "vineyard" | "holding" | "storehouse" | "holding_tank_new" | "skip";
interface Override { kind: OverrideKind; id?: string | null; contact_id?: string | null }

interface RowResult {
  csv_row_number: number;
  destination: string;
  account_number: string | null;
  client_name: string | null;
  matched_table?: string | null;
  matched_contact_id?: string | null;
  matched_contact_name?: string | null;
  message?: string;
  applied?: boolean;
}

const destLabel = (d: string) => {
  switch (d) {
    case "vineyard_update": return { label: "Vineyard", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
    case "holding_tank_update": return { label: "Holding Tank", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
    case "storehouse_update": return { label: "Storehouse", color: "bg-violet-500/15 text-violet-700 dark:text-violet-300" };
    case "holding_tank_new": return { label: "New → Tank", color: "bg-sky-500/15 text-sky-700 dark:text-sky-300" };
    case "conflict": return { label: "Conflict", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" };
    case "missing_account_number": return { label: "Missing Acct#", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" };
    case "missing_contact": return { label: "No Contact", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" };
    case "skipped": return { label: "Skipped", color: "bg-muted text-muted-foreground" };
    default: return { label: d, color: "bg-muted text-muted-foreground" };
  }
};

type Step = "upload" | "map" | "preview" | "done";

interface NormalizedRow {
  csv_row_number: number;
  account_number: string | null;
  client_name: string | null;
  custodian: string | null;
  account_type: string | null;
  product: string | null;
  boy_value: number | null;
  current_value: number | null;
  as_of_date: string | null;
  ror_ytd: number | null; ror_6m: number | null; ror_1y: number | null;
  ror_3y: number | null; ror_5y: number | null; ror_since_inception: number | null;
}

interface DirectoryContact { id: string; first_name: string | null; last_name: string | null; full_name: string | null }
interface DirectoryAccount { id: string; contact_id: string; account_number: string | null; account_name: string | null }
interface DirectoryStorehouse { id: string; contact_id: string; label: string; storehouse_number: number }

export default function QuarterlyReview() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, TargetField>>({});
  const [normalized, setNormalized] = useState<NormalizedRow[]>([]);
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [vineyardAccts, setVineyardAccts] = useState<DirectoryAccount[]>([]);
  const [holdingAccts, setHoldingAccts] = useState<DirectoryAccount[]>([]);
  const [storehouses, setStorehouses] = useState<DirectoryStorehouse[]>([]);
  const [defaultAsOfDate, setDefaultAsOfDate] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Preload directory once entering map step (needed for resolver later)
  useEffect(() => {
    if (step !== "map" || contacts.length > 0) return;
    (async () => {
      const [{ data: c }, { data: v }, { data: h }, { data: s }] = await Promise.all([
        supabase.from("contacts").select("id, first_name, last_name, full_name").order("last_name"),
        (supabase.from("vineyard_accounts" as any) as any).select("id, contact_id, account_number, account_name"),
        (supabase.from("holding_tank" as any) as any).select("id, contact_id, account_number, account_name"),
        (supabase.from("storehouses" as any) as any).select("id, contact_id, label, storehouse_number"),
      ]);
      setContacts((c as any) || []);
      setVineyardAccts((v as any) || []);
      setHoldingAccts((h as any) || []);
      setStorehouses((s as any) || []);
    })();
  }, [step]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const text = await file.text();
      // Locate the real header row (some custodian exports prefix with title rows).
      const raw = Papa.parse<string[]>(text, { skipEmptyLines: true });
      const all = (raw.data as string[][]).filter(Array.isArray);
      let headerIdx = all.findIndex((r) =>
        r.some((c) => /account\s*(number|#)|contract/i.test(c || "")) ||
        (r.some((c) => /last\s*name/i.test(c || "")) && r.some((c) => /first\s*name/i.test(c || "")))
      );
      if (headerIdx < 0) headerIdx = 0;

      // Look for a global as-of date in title rows above the header, or inside any header cell
      // (IAG exports: "Client investment data as at 2026-05-29" or column "As of 2026-05-29").
      const scanRows = [...all.slice(0, headerIdx), all[headerIdx] || []];
      let detectedDate = "";
      for (const r of scanRows) {
        for (const cell of r) {
          const d = parseDate(String(cell || ""));
          if (d) { detectedDate = d; break; }
        }
        if (detectedDate) break;
      }
      setDefaultAsOfDate(detectedDate);

      const hdrs = (all[headerIdx] || []).map((h, i) => (h || "").trim() || `col_${i}`);
      const data = all.slice(headerIdx + 1).filter((r) => r.some((c) => (c || "").trim() !== ""));
      setHeaders(hdrs);
      setRawRows(data);
      const guessed: Record<number, TargetField> = {};
      hdrs.forEach((h, i) => { guessed[i] = guessField(h); });
      setMapping(guessed);
      setStep("map");
    } catch (e: any) {
      toast({ title: "Parse failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const buildNormalized = (): NormalizedRow[] => {
    const idxOf = (f: TargetField) => Object.entries(mapping).find(([, v]) => v === f)?.[0];
    const get = (row: string[], f: TargetField) => {
      const i = idxOf(f);
      return i !== undefined ? row[Number(i)] : undefined;
    };
    return rawRows.map((row, i) => {
      const acctRaw = (get(row, "account_number") || "").trim();
      const firstRaw = (get(row, "first_name") || "").trim();
      const lastRaw = (get(row, "last_name") || "").trim();
      const fullRaw = (get(row, "client_name") || "").trim();
      const combinedName = fullRaw || [firstRaw, lastRaw].filter(Boolean).join(" ") || null;
      // Skip rows without any identifying data (footer/total/note rows)
      if (!acctRaw && !combinedName) return null as any;
      const rowDate = parseDate(get(row, "as_of_date") || "") || defaultAsOfDate || null;
      return {
        csv_row_number: i + 2,
        account_number: acctRaw || null,
        client_name: combinedName,
        custodian: (get(row, "custodian") || "").trim() || null,
        account_type: (get(row, "account_type") || "").trim() || null,
        product: (get(row, "product") || "").trim() || null,
        boy_value: num(get(row, "boy_value")),
        current_value: num(get(row, "current_value")),
        as_of_date: rowDate,
        ror_ytd: num(get(row, "ror_ytd")),
        ror_6m: num(get(row, "ror_6m")),
        ror_1y: num(get(row, "ror_1y")),
        ror_3y: num(get(row, "ror_3y")),
        ror_5y: num(get(row, "ror_5y")),
        ror_since_inception: num(get(row, "ror_since_inception")),
      };
    }).filter(Boolean);
  };


  const callSync = async (mode: "preview" | "commit", rows: NormalizedRow[]) => {
    setBusy(true);
    try {
      const payload = {
        mode,
        source_file: fileName,
        rows: rows.map((r) => ({
          ...r,
          override: overrides[r.csv_row_number] || null,
        })),
      };
      const { data, error } = await supabase.functions.invoke("quarterly-account-sync", { body: payload });
      if (error) throw error;
      setResults(data.results);
      setSummary(data.summary);
      setStep(mode === "commit" ? "done" : "preview");
      if (mode === "commit") {
        toast({ title: "Quarterly review committed", description: `${data.summary.applied} rows applied.` });
      }
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const [committingRows, setCommittingRows] = useState<Set<number>>(new Set());

  const commitSingleRow = async (rowNum: number) => {
    const row = normalized.find((n) => n.csv_row_number === rowNum);
    if (!row) return;
    setCommittingRows((prev) => {
      const next = new Set(prev);
      next.add(rowNum);
      return next;
    });
    try {
      const payload = {
        mode: "commit",
        source_file: fileName,
        rows: [{ ...row, override: overrides[rowNum] || null }],
      };
      const { data, error } = await supabase.functions.invoke("quarterly-account-sync", { body: payload });
      if (error) throw error;
      const newRow: RowResult | undefined = data?.results?.[0];
      if (newRow) {
        setResults((prev) => prev ? prev.map((r) => r.csv_row_number === rowNum ? newRow : r) : prev);
        toast({
          title: newRow.applied ? `Row ${rowNum} committed` : `Row ${rowNum} not applied`,
          description: newRow.message || newRow.destination,
          variant: newRow.applied ? "default" : "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: `Row ${rowNum} failed`, description: err.message, variant: "destructive" });
    } finally {
      setCommittingRows((prev) => {
        const next = new Set(prev);
        next.delete(rowNum);
        return next;
      });
    }
  };

  const requiredMissing = useMemo(() => {
    const mapped = new Set(Object.values(mapping));
    const missing: { label: string }[] = [];
    if (!mapped.has("account_number")) missing.push({ label: "Account / Contract Number" });
    if (!mapped.has("boy_value")) missing.push({ label: "BOY Balance" });
    if (!mapped.has("current_value")) missing.push({ label: "Current Balance" });
    if (!mapped.has("as_of_date") && !defaultAsOfDate) missing.push({ label: "As-of Date (column or default)" });
    return missing;
  }, [mapping, defaultAsOfDate]);


  const totals = useMemo(() => {
    const boy = normalized.reduce((s, r) => s + (r.boy_value || 0), 0);
    const cur = normalized.reduce((s, r) => s + (r.current_value || 0), 0);
    const delta = cur - boy;
    const pct = boy > 0 ? (delta / boy) * 100 : 0;
    return { boy, cur, delta, pct };
  }, [normalized]);

  const chartData = useMemo(() => {
    return [...normalized]
      .map((r) => ({
        name: r.account_number || r.client_name || `Row ${r.csv_row_number}`,
        variation: (r.current_value || 0) - (r.boy_value || 0),
      }))
      .sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation))
      .slice(0, 25);
  }, [normalized]);

  const setOverride = (rowNum: number, ov: Override | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (!ov) delete next[rowNum];
      else next[rowNum] = ov;
      return next;
    });
  };

  const downloadIssues = () => {
    if (!results) return;
    const bad = results.filter((r) => !["vineyard_update", "holding_tank_update", "storehouse_update", "holding_tank_new"].includes(r.destination) || (r.applied === false && r.message));
    const csv = [
      ["CSV Row", "Destination", "Account #", "Client", "Message"],
      ...bad.map((r) => [r.csv_row_number, r.destination, r.account_number || "", r.client_name || "", r.message || ""]),
    ].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `quarterly-review-issues-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const goToPreview = () => {
    const n = buildNormalized();
    setNormalized(n);
    callSync("preview", n);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Workbench", href: "/workbench" },
            { label: "Quarterly Review" },
          ]}
        />

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Quarterly Review</h1>
            <p className="text-sm text-muted-foreground">
              Upload a custodian CSV. Auto-routes by account number to Vineyard, Holding Tank, or Storehouse, surfaces BOY → current performance, lets you resolve conflicts inline, and commits balances + harvest snapshots in one step.
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
                CSV must include Account Number (or Contract #), BOY Balance, Current Balance, and As-of Date. Client Name, Custodian, Account Type, and RoR columns are recognized automatically.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <Button onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Choose CSV
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "map" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Map columns — {fileName} ({rawRows.length} rows)</CardTitle>
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
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}{f.required ? " *" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <Label className="text-xs w-1/2">Default As-of Date (used when no column maps)</Label>
                <Input
                  type="date"
                  value={defaultAsOfDate}
                  onChange={(e) => setDefaultAsOfDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              {requiredMissing.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="h-4 w-4" />
                  Required fields not mapped: {requiredMissing.map((f) => f.label).join(", ")}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep("upload")}>Back</Button>
                <Button disabled={requiredMissing.length > 0 || busy} onClick={goToPreview}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Preview Review
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {(step === "preview" || step === "done") && summary && results && (
          <>
            {/* Performance summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Performance Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Rows" value={String(normalized.length)} />
                  <Stat label="BOY Total" value={fmt$(totals.boy)} />
                  <Stat label="Current Total" value={fmt$(totals.cur)} />
                  <Stat
                    label={`Δ (${totals.pct.toFixed(2)}%)`}
                    value={fmt$(totals.delta)}
                    tone={totals.delta >= 0 ? "emerald" : "rose"}
                  />
                </div>
              </CardContent>

            </Card>

            {/* Routing summary + actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {step === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
                  {step === "done" ? "Review Committed" : "Routing Preview"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                  <Stat small label="Total" value={String(summary.total)} />
                  <Stat small label="Vineyard" value={String(summary.vineyard_update)} tone="emerald" />
                  <Stat small label="Tank" value={String(summary.holding_tank_update + summary.holding_tank_new)} tone="amber" />
                  <Stat small label="Storehouse" value={String(summary.storehouse_update)} tone="violet" />
                  <Stat small label="Issues" value={String(summary.conflict + summary.missing_account_number + summary.missing_contact)} tone="rose" />
                  <Stat small label="Skipped" value={String(summary.skipped || 0)} />
                </div>
                <div className="flex gap-2 mt-4 flex-wrap">
                  {step === "preview" && (
                    <>
                      <Button variant="ghost" onClick={() => setStep("map")}>Back</Button>
                      <Button variant="outline" onClick={() => callSync("preview", normalized)} disabled={busy}>
                        Re-run Preview
                      </Button>
                    </>
                  )}
                  {step === "done" && (
                    <>
                      <Button variant="outline" asChild>
                        <Link to="/holding-tank">Open Holding Tank</Link>
                      </Button>
                      <Button variant="ghost" onClick={() => {
                        setStep("upload"); setResults(null); setSummary(null);
                        setNormalized([]); setOverrides({}); setHeaders([]); setRawRows([]); setMapping({});
                      }}>
                        Upload Another
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" onClick={downloadIssues}>Download Issues CSV</Button>
                </div>
              </CardContent>
            </Card>

            {/* Row table with inline resolver */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm">Row-by-row</CardTitle>
                {step === "preview" && (
                  <Button size="sm" onClick={() => callSync("commit", normalized)} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Commit All ({summary.vineyard_update + summary.holding_tank_update + summary.storehouse_update + summary.holding_tank_new} rows)
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="max-h-[560px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Row</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Account #</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">BOY</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">Δ $</TableHead>
                        <TableHead className="min-w-[280px]">Resolve / Override</TableHead>
                        {step === "preview" && <TableHead className="w-[110px] text-right">Commit</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r) => {
                        const d = destLabel(r.destination);
                        const norm = normalized.find((n) => n.csv_row_number === r.csv_row_number);
                        const delta = (norm?.current_value || 0) - (norm?.boy_value || 0);
                        return (
                          <TableRow key={r.csv_row_number}>
                            <TableCell className="text-xs">{r.csv_row_number}</TableCell>
                            <TableCell>
                              <Badge className={`${d.color} border-0 text-[10px] font-normal`}>{d.label}</Badge>
                              {r.applied ? <span className="ml-2 text-[10px] text-emerald-600">applied</span> : null}
                              {r.message ? (
                                <div className="text-[10px] text-muted-foreground mt-0.5">{r.message}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs font-mono">{r.account_number}</TableCell>
                            <TableCell className="text-xs">
                              {r.matched_contact_name || r.client_name}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{fmt$(norm?.boy_value || 0)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{fmt$(norm?.current_value || 0)}</TableCell>
                            <TableCell className={`text-right text-xs tabular-nums ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {fmt$(delta)}
                            </TableCell>
                            <TableCell>
                              {step === "done" ? null : (
                                <RowResolver
                                  rowNum={r.csv_row_number}
                                  current={overrides[r.csv_row_number] || null}
                                  contacts={contacts}
                                  vineyardAccts={vineyardAccts}
                                  holdingAccts={holdingAccts}
                                  storehouses={storehouses}
                                  onChange={(ov) => setOverride(r.csv_row_number, ov)}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {step === "preview" && Object.keys(overrides).length > 0 && (
                  <div className="mt-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {Object.keys(overrides).length} override{Object.keys(overrides).length === 1 ? "" : "s"} set — click <span className="font-medium">Re-run Preview</span> to validate before committing.
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

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: string; small?: boolean }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    sky: "text-sky-600 dark:text-sky-400",
    rose: "text-rose-600 dark:text-rose-400",
    violet: "text-violet-600 dark:text-violet-400",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={`${small ? "text-xl" : "text-lg"} font-bold tabular-nums ${tone ? colorMap[tone] : "text-foreground"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function RowResolver({
  rowNum, current, contacts, vineyardAccts, holdingAccts, storehouses, onChange,
}: {
  rowNum: number;
  current: Override | null;
  contacts: DirectoryContact[];
  vineyardAccts: DirectoryAccount[];
  holdingAccts: DirectoryAccount[];
  storehouses: DirectoryStorehouse[];
  onChange: (ov: Override | null) => void;
}) {
  const [kind, setKind] = useState<OverrideKind | "auto">(current?.kind || "auto");
  const [contactId, setContactId] = useState<string | null>(current?.contact_id || null);
  const [linkId, setLinkId] = useState<string | null>(current?.id || null);
  const [contactQuery, setContactQuery] = useState("");

  const contactOptions = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter((c) => {
      const n = `${c.first_name || ""} ${c.last_name || ""} ${c.full_name || ""}`.toLowerCase();
      return n.includes(q);
    }).slice(0, 8);
  }, [contactQuery, contacts]);

  const linkOptions = useMemo(() => {
    if (!contactId) return [];
    if (kind === "vineyard") return vineyardAccts.filter((a) => a.contact_id === contactId).map((a) => ({ id: a.id, label: `${a.account_number || ""} · ${a.account_name || "Account"}` }));
    if (kind === "holding") return holdingAccts.filter((a) => a.contact_id === contactId).map((a) => ({ id: a.id, label: `${a.account_number || ""} · ${a.account_name || "Holding Tank"}` }));
    if (kind === "storehouse") return storehouses.filter((s) => s.contact_id === contactId).map((s) => ({ id: s.id, label: `#${s.storehouse_number} · ${s.label}` }));
    return [];
  }, [kind, contactId, vineyardAccts, holdingAccts, storehouses]);

  const apply = (k: OverrideKind | "auto", cid: string | null, lid: string | null) => {
    setKind(k); setContactId(cid); setLinkId(lid);
    if (k === "auto") { onChange(null); return; }
    if (k === "skip") { onChange({ kind: "skip" }); return; }
    if (k === "holding_tank_new") {
      if (cid) onChange({ kind: "holding_tank_new", contact_id: cid });
      return;
    }
    if (cid && lid) onChange({ kind: k, id: lid, contact_id: cid });
  };

  const selectedContact = contactId ? contacts.find((c) => c.id === contactId) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5 items-center">
        <Select value={kind} onValueChange={(v) => apply(v as any, contactId, null)}>
          <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto" className="text-xs">Auto-match</SelectItem>
            <SelectItem value="vineyard" className="text-xs">Vineyard</SelectItem>
            <SelectItem value="holding" className="text-xs">Holding Tank</SelectItem>
            <SelectItem value="storehouse" className="text-xs">Storehouse</SelectItem>
            <SelectItem value="holding_tank_new" className="text-xs">New → Tank</SelectItem>
            <SelectItem value="skip" className="text-xs">Skip</SelectItem>
          </SelectContent>
        </Select>
        {current && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => apply("auto", null, null)}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {(kind === "vineyard" || kind === "holding" || kind === "storehouse" || kind === "holding_tank_new") && (
        <>
          {selectedContact ? (
            <div className="flex items-center gap-1.5">
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] truncate max-w-[180px]">
                {selectedContact.full_name || `${selectedContact.first_name} ${selectedContact.last_name}`}
              </Badge>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => apply(kind, null, null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Search contact…"
                className="h-7 text-xs"
              />
              {contactOptions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-44 overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {contactOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full text-left px-2 py-1.5 text-xs hover:bg-muted"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { apply(kind, c.id, null); setContactQuery(""); }}
                    >
                      {c.full_name || `${c.first_name || ""} ${c.last_name || ""}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {selectedContact && (kind === "vineyard" || kind === "holding" || kind === "storehouse") && (
            linkOptions.length > 0 ? (
              <Select value={linkId || ""} onValueChange={(v) => apply(kind, contactId, v)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder={`Pick ${kind}…`} />
                </SelectTrigger>
                <SelectContent>
                  {linkOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-[10px] text-amber-600">No {kind} accounts for this contact</span>
            )
          )}
        </>
      )}
    </div>
  );
}
