import { useState, useRef, useMemo } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, Upload, Save, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type ParsedRow = {
  rowIndex: number;
  lastName: string;
  firstName: string;
  contractNumber: string;
  product: string;
  registrationType: string;
  issueDate: string;
  boyValue: number;
  currentValue: number;
  variationPct: number;
  variationDollar: number;
  rorYtd?: number;
  ror6m?: number;
  ror1y?: number;
  ror3y?: number;
  ror5y?: number;
  rorSinceInception?: number;
  // Resolved
  contactId?: string | null;
  contactLabel?: string;
  vineyardAccountId?: string | null;
  matchStatus: "matched" | "no_contact" | "no_account" | "ambiguous";
};

const num = (v: any): number => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/[$,\s%]/g, "").replace(/[()]/g, (m) => m === "(" ? "-" : "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const norm = (s: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

const fmt$ = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const fmtPct = (n: number) => `${n.toFixed(2)}%`;

export function PerformanceAnalyst() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [asOfDate, setAsOfDate] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");

  const handleFile = async (file: File) => {
    setParsing(true);
    setRows([]);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });

      const headers = parsed.meta.fields || [];
      // Find as-of date from "Market Value As of YYYY-MM-DD"
      const asOfHeader = headers.find((h) => /market value as of/i.test(h));
      const asOfMatch = asOfHeader?.match(/(\d{4}-\d{2}-\d{2})/);
      const asOf = asOfMatch?.[1] || "";
      setAsOfDate(asOf);

      const findCol = (re: RegExp) => headers.find((h) => re.test(h)) || "";
      const cols = {
        last: findCol(/^last\s*name/i),
        first: findCol(/^first\s*name/i),
        contract: findCol(/contract\s*(number|#|no)/i),
        product: findCol(/^product/i),
        registration: findCol(/registration/i),
        issue: findCol(/issue\s*date/i),
        boy: findCol(/begin(ning)?\s*of\s*(the\s*)?year|market value beg/i),
        asOf: asOfHeader || "",
        varPct: findCol(/variation\s*%/i),
        varDol: findCol(/variation\s*\$/i),
        ytd: findCol(/year[-\s]*to[-\s]*date|\bYTD\b/i),
        m6: findCol(/6\s*months?/i),
        y1: findCol(/^.*\b1\s*year\b.*$/i),
        y3: findCol(/3\s*years?/i),
        y5: findCol(/5\s*years?/i),
        sinceInit: findCol(/since\s*initial|inception/i),
      };

      // Pull contacts for matching
      const { data: contactsData } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, full_name, household_id, family_id");
      const contacts = contactsData || [];

      // Pull vineyard accounts for contract match
      const { data: vineyardData } = await (supabase.from("vineyard_accounts" as any) as any)
        .select("id, contact_id, account_number, account_name");
      const accounts = (vineyardData || []) as Array<{
        id: string;
        contact_id: string;
        account_number: string | null;
        account_name: string | null;
      }>;

      const out: ParsedRow[] = parsed.data.map((r, i) => {
        const lastName = (r[cols.last] || "").trim();
        const firstName = (r[cols.first] || "").trim();
        const contractNumber = (r[cols.contract] || "").trim();

        // Match contact by name (case-insensitive)
        const matches = contacts.filter(
          (c) =>
            norm(c.last_name || "") === norm(lastName) &&
            norm(c.first_name || "") === norm(firstName)
        );
        let contactId: string | null = null;
        let contactLabel = `${firstName} ${lastName}`.trim();
        let matchStatus: ParsedRow["matchStatus"] = "no_contact";
        if (matches.length === 1) {
          contactId = matches[0].id;
          contactLabel = matches[0].full_name || contactLabel;
          matchStatus = "matched";
        } else if (matches.length > 1) {
          matchStatus = "ambiguous";
        }

        // Match vineyard account by contract number (scoped to contact if known)
        let vineyardAccountId: string | null = null;
        if (contactId && contractNumber) {
          const acctMatches = accounts.filter(
            (a) =>
              a.contact_id === contactId &&
              (a.account_number || "").trim() === contractNumber
          );
          if (acctMatches.length === 1) {
            vineyardAccountId = acctMatches[0].id;
          } else {
            // Fall back: any account anywhere with that contract number
            const global = accounts.filter(
              (a) => (a.account_number || "").trim() === contractNumber
            );
            if (global.length === 1) vineyardAccountId = global[0].id;
          }
        }
        if (matchStatus === "matched" && !vineyardAccountId) {
          matchStatus = "no_account";
        }

        return {
          rowIndex: i,
          lastName,
          firstName,
          contractNumber,
          product: (r[cols.product] || "").trim(),
          registrationType: (r[cols.registration] || "").trim(),
          issueDate: (r[cols.issue] || "").trim(),
          boyValue: num(r[cols.boy]),
          currentValue: num(r[cols.asOf]),
          variationPct: num(r[cols.varPct]),
          variationDollar: num(r[cols.varDol]),
          rorYtd: cols.ytd ? num(r[cols.ytd]) : undefined,
          ror6m: cols.m6 ? num(r[cols.m6]) : undefined,
          ror1y: cols.y1 ? num(r[cols.y1]) : undefined,
          ror3y: cols.y3 ? num(r[cols.y3]) : undefined,
          ror5y: cols.y5 ? num(r[cols.y5]) : undefined,
          rorSinceInception: cols.sinceInit ? num(r[cols.sinceInit]) : undefined,
          contactId,
          contactLabel,
          vineyardAccountId,
          matchStatus,
        };
      });

      setRows(out);
      if (!asOf) {
        toast.warning("Could not parse as-of date from CSV header. Set it manually before saving.");
      }
    } catch (e: any) {
      toast.error(`Parse failed: ${e.message}`);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const totals = useMemo(() => {
    const boy = rows.reduce((s, r) => s + r.boyValue, 0);
    const cur = rows.reduce((s, r) => s + r.currentValue, 0);
    const delta = cur - boy;
    const pct = boy > 0 ? (delta / boy) * 100 : 0;
    return { boy, cur, delta, pct };
  }, [rows]);

  const chartData = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.variationDollar - a.variationDollar)
        .slice(0, 25)
        .map((r) => ({
          name: r.contractNumber || `${r.firstName} ${r.lastName}`,
          variation: r.variationDollar,
        })),
    [rows]
  );

  const saveable = rows.filter((r) => r.matchStatus === "matched" && r.vineyardAccountId);

  const handleSave = async () => {
    if (!asOfDate) {
      toast.error("As-of date required to save snapshots.");
      return;
    }
    if (saveable.length === 0) {
      toast.error("No rows can be saved — need both a matched contact and a matched Vineyard account.");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = saveable.map((r) => ({
        contact_id: r.contactId!,
        vineyard_account_id: r.vineyardAccountId!,
        snapshot_date: asOfDate,
        boy_value: r.boyValue,
        ytd_value: r.currentValue,
        current_harvest: r.variationDollar,
        current_value: r.currentValue,
        notes: `Imported from ${fileName} (Performance Analyst)`,
        created_by: user?.id || null,
      }));
      const { error } = await (supabase.from("account_harvest_snapshots" as any) as any).insert(payload);
      if (error) throw error;
      toast.success(`Saved ${payload.length} harvest snapshot${payload.length === 1 ? "" : "s"}.`);
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (s: ParsedRow["matchStatus"]) => {
    switch (s) {
      case "matched":
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Matched</Badge>;
      case "no_account":
        return <Badge variant="outline" className="text-amber-600 border-amber-500/40">No account</Badge>;
      case "ambiguous":
        return <Badge variant="outline" className="text-amber-600 border-amber-500/40">Ambiguous</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">No contact</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Performance Analyst</CardTitle>
              <p className="text-xs text-muted-foreground">
                Upload a multi-client performance CSV. Compares BOY → as-of values, matches clients by name, and saves harvest snapshots.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={parsing}>
              {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload CSV
            </Button>
          </div>
        </div>
      </CardHeader>

      {rows.length > 0 && (
        <CardContent className="space-y-6">
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Rows" value={String(rows.length)} />
            <Stat label="BOY total" value={fmt$(totals.boy)} />
            <Stat label={`As of ${asOfDate || "—"}`} value={fmt$(totals.cur)} />
            <Stat
              label="Variation"
              value={`${fmt$(totals.delta)} (${fmtPct(totals.pct)})`}
              accent={totals.delta >= 0 ? "positive" : "negative"}
            />
          </div>

          {/* Date + save controls */}
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <Label htmlFor="asof" className="text-xs">Snapshot (as-of) date</Label>
              <Input
                id="asof"
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="text-xs text-muted-foreground flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                {saveable.length === rows.length ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span>
                  {saveable.length} of {rows.length} row{rows.length === 1 ? "" : "s"} can be saved as harvest snapshots
                  (require matched contact + matched Vineyard account by contract number).
                </span>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving || saveable.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save {saveable.length} snapshot{saveable.length === 1 ? "" : "s"}
            </Button>
          </div>

          {/* Chart */}
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Variation ($) — top 25 by absolute change
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <RTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: any) => fmt$(Number(v))}
                />
                <Bar dataKey="variation" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">BOY</TableHead>
                  <TableHead className="text-right">As of</TableHead>
                  <TableHead className="text-right">Δ $</TableHead>
                  <TableHead className="text-right">Δ %</TableHead>
                  <TableHead className="text-right">YTD</TableHead>
                  <TableHead className="text-right">1Y</TableHead>
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.rowIndex}>
                    <TableCell className="whitespace-nowrap">
                      {r.contactLabel || `${r.firstName} ${r.lastName}`}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.contractNumber}</TableCell>
                    <TableCell className="text-xs">{r.product}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt$(r.boyValue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt$(r.currentValue)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${r.variationDollar >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmt$(r.variationDollar)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${r.variationPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmtPct(r.variationPct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {r.rorYtd !== undefined ? fmtPct(r.rorYtd) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {r.ror1y !== undefined ? fmtPct(r.ror1y) : "—"}
                    </TableCell>
                    <TableCell>{statusBadge(r.matchStatus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Stat({
  label, value, accent,
}: { label: string; value: string; accent?: "positive" | "negative" }) {
  const color =
    accent === "positive" ? "text-emerald-600" : accent === "negative" ? "text-red-600" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
