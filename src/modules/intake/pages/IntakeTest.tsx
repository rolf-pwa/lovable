import { useCallback, useEffect, useRef, useState } from "react";
import { AppLayout } from "@/shared/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { supabase } from "@/shared/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  Rocket,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface HouseholdRow {
  id: string;
  label: string | null;
  vault_root_folder_id: string | null;
  families?: { name: string | null } | null;
}

interface PushRow {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  error: string | null;
  family_folder_url: string | null;
  household_folder_url: string | null;
  callback_payload: any;
  response_body: any;
}

type CheckState = "pending" | "running" | "pass" | "fail";

interface Check {
  key: string;
  label: string;
  state: CheckState;
  detail?: string;
}

const INITIAL_CHECKS: Check[] = [
  { key: "push", label: "Payload signed and accepted by intake agent", state: "pending" },
  { key: "log", label: "Push logged in intake history", state: "pending" },
  { key: "callback", label: "Agent callback received (provisioned)", state: "pending" },
  { key: "folders", label: "Family + household folder URLs returned", state: "pending" },
  { key: "persist", label: "Household vault_root_folder_id written to CRM", state: "pending" },
];

const POLL_MS = 4000;
const POLL_TIMEOUT_MS = 180_000;

function StateIcon({ state }: { state: CheckState }) {
  if (state === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (state === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  if (state === "running") return <Loader2 className="h-4 w-4 animate-spin text-amber-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground/50" />;
}

export default function IntakeTest() {
  const [households, setHouseholds] = useState<HouseholdRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<Check[]>(INITIAL_CHECKS);
  const [push, setPush] = useState<PushRow | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const loadHouseholds = useCallback(async () => {
    const { data, error } = await supabase
      .from("households")
      .select("id, label, vault_root_folder_id, families(name)")
      .order("label");
    if (error) { toast.error("Could not load households"); return; }
    setHouseholds((data || []) as any);
  }, []);

  useEffect(() => { loadHouseholds(); }, [loadHouseholds]);

  const setCheck = (key: string, state: CheckState, detail?: string) =>
    setChecks((prev) => prev.map((c) => (c.key === key ? { ...c, state, detail } : c)));

  const finish = (msg: string, ok: boolean) => {
    setRunning(false);
    setSummary(msg);
    ok ? toast.success(msg) : toast.error(msg);
  };

  const pollCallback = useCallback(
    (householdId: string, startedAt: number, sinceIso: string) => {
      const tick = async () => {
        const { data: rows } = await supabase
          .from("crm_intake_pushes")
          .select("id, status, created_at, updated_at, error, family_folder_url, household_folder_url, callback_payload, response_body")
          .eq("household_id", householdId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(1);
        const row = (rows?.[0] as PushRow) || null;
        if (row) setPush(row);

        if (row?.status === "provisioned") {
          setCheck("callback", "pass", `Callback received ${new Date(row.updated_at).toLocaleTimeString()}`);

          const hasFolders = Boolean(row.household_folder_url);
          setCheck(
            "folders",
            hasFolders ? "pass" : "fail",
            hasFolders
              ? [row.family_folder_url && "family", "household"].filter(Boolean).join(" + ") + " folder URL returned"
              : "Callback contained no householdFolderUrl",
          );

          setCheck("persist", "running");
          const { data: hh } = await supabase
            .from("households")
            .select("id, label, vault_root_folder_id, families(name)")
            .eq("id", householdId)
            .maybeSingle();
          const expected = String(row.household_folder_url || "").match(/folders\/([A-Za-z0-9_-]+)/)?.[1];
          const actual = hh?.vault_root_folder_id || null;
          const ok = Boolean(expected) && expected === actual;
          setCheck(
            "persist",
            ok ? "pass" : "fail",
            ok
              ? `vault_root_folder_id = ${actual}`
              : `Expected ${expected || "(none parsed)"} · stored ${actual || "(empty)"}`,
          );
          if (hh) setHouseholds((prev) => prev.map((h) => (h.id === hh.id ? (hh as any) : h)));
          finish(
            ok && hasFolders ? "Test push verified end-to-end" : "Callback arrived but verification failed",
            ok && hasFolders,
          );
          return;
        }

        if (row?.status === "failed") {
          setCheck("callback", "fail", row.error || "Agent reported failure");
          setCheck("folders", "fail", "Skipped — callback failed");
          setCheck("persist", "fail", "Skipped — callback failed");
          finish("Intake agent reported a failure", false);
          return;
        }

        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setCheck("callback", "fail", "No callback within 3 minutes");
          setCheck("folders", "fail", "Skipped — no callback");
          setCheck("persist", "fail", "Skipped — no callback");
          finish("Timed out waiting for the agent callback", false);
          return;
        }

        timer.current = window.setTimeout(tick, POLL_MS);
      };
      tick();
    },
    [],
  );

  const runTest = useCallback(async () => {
    if (!selected) return toast.error("Pick a household first");
    if (timer.current) window.clearTimeout(timer.current);
    setRunning(true);
    setSummary(null);
    setPush(null);
    setChecks(INITIAL_CHECKS.map((c) => ({ ...c, state: "pending", detail: undefined })));

    const sinceIso = new Date(Date.now() - 5000).toISOString();
    setCheck("push", "running");

    const { data, error } = await supabase.functions.invoke("crm-intake-push", {
      body: { household_id: selected },
    });

    if (error || data?.error) {
      const details =
        (error as any)?.context && typeof (error as any).context.text === "function"
          ? await (error as any).context.text()
          : error?.message || data?.error;
      setCheck("push", "fail", String(details || "Push rejected"));
      setCheck("log", "fail", "Skipped — push failed");
      finish("Push to intake agent failed", false);
      return;
    }

    setCheck("push", "pass", `${data?.members ?? 0} members · ${data?.itemsSent ?? 0} known items`);

    setCheck("log", "running");
    const { data: logRows } = await supabase
      .from("crm_intake_pushes")
      .select("id, status, created_at, updated_at, error, family_folder_url, household_folder_url, callback_payload, response_body")
      .eq("household_id", selected)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1);
    const logRow = (logRows?.[0] as PushRow) || null;
    if (logRow) setPush(logRow);
    setCheck(
      "log",
      logRow ? "pass" : "fail",
      logRow ? `Status: ${logRow.status}` : "No intake push row was written",
    );

    setCheck("callback", "running");
    pollCallback(selected, Date.now(), sinceIso);
  }, [selected, pollCallback]);

  const selectedHousehold = households.find((h) => h.id === selected);

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Vault Intake — Test Push</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Push one household to the intake agent and verify the callback writes the Drive folder IDs back into the CRM.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">1 · Select household</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Household</Label>
              <div className="flex gap-2">
                <Select value={selected} onValueChange={setSelected} disabled={running}>
                  <SelectTrigger><SelectValue placeholder="Choose a household…" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {households.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.label || "Untitled household"}
                        {h.families?.name ? ` — ${h.families.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={loadHouseholds} disabled={running}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {selectedHousehold && (
              <div className="text-xs text-muted-foreground">
                Current vault root:{" "}
                {selectedHousehold.vault_root_folder_id ? (
                  <span className="font-mono text-foreground">{selectedHousehold.vault_root_folder_id}</span>
                ) : (
                  <span className="italic">not provisioned yet</span>
                )}
              </div>
            )}

            <Button onClick={runTest} disabled={running || !selected} className="w-full sm:w-auto">
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
              {running ? "Running test push…" : "Run Test Push"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">2 · Verification</CardTitle>
            {summary && (
              <Badge variant={checks.every((c) => c.state === "pass") ? "default" : "destructive"}>
                {summary}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {checks.map((c) => (
                <li key={c.key} className="flex items-start gap-3">
                  <span className="mt-0.5"><StateIcon state={c.state} /></span>
                  <div className="min-w-0">
                    <div className="text-sm text-foreground">{c.label}</div>
                    {c.detail && (
                      <div className="text-[11px] text-muted-foreground break-words">{c.detail}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {push?.household_folder_url && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={push.household_folder_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Household folder
                  </a>
                </Button>
                {push.family_folder_url && (
                  <Button asChild size="sm" variant="outline">
                    <a href={push.family_folder_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Family folder
                    </a>
                  </Button>
                )}
              </div>
            )}

            {push && (
              <details className="mt-5">
                <summary className="text-xs text-muted-foreground cursor-pointer">Raw intake log</summary>
                <pre className="mt-2 text-[11px] bg-muted/40 rounded-md p-3 overflow-auto max-h-72">
                  {JSON.stringify(
                    {
                      status: push.status,
                      error: push.error,
                      response_body: push.response_body,
                      callback_payload: push.callback_payload,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
