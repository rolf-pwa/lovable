import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, RefreshCw, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useAutoSave, AutoSaveIndicator } from "@/hooks/useAutoSave";
import pwLogoWhite from "@/assets/prosperwise-logo-white.png";

type StatusKind = "red" | "amber" | "green";

type SMap = {
  id: string;
  lead_id: string | null;
  contact_id: string | null;
  client_first_name: string;
  client_last_name: string;
  session_date: string | null;
  event_type: string;
  event_context: string;
  situation_summary: string;
  urgency_flag: string;
  risk_1: string; risk_2: string; risk_3: string; risk_4: string; risk_5: string;
  next_step_1: string; next_step_2: string; next_step_3: string; next_step_4: string; next_step_5: string;
  storehouse_status: string; storehouse_detail: string;
  solicitation_status: string; solicitation_detail: string;
  sovereignty_charter_status: string; sovereignty_charter_detail: string;
  tax_status: string; tax_detail: string;
  footer_note: string;
  generation_status: string;
  generation_error: string | null;
  logic_trace: string | null;
};

const STATUS_KIND: Record<string, StatusKind> = {
  "Not Established": "red",
  "Not Assessed": "red",
  "Not Started": "red",
  "Partial": "amber",
  "In Progress": "amber",
  "Established": "green",
  "Assessed": "green",
  "Complete": "green",
};

const STATUS_COLOR: Record<StatusKind, string> = {
  red: "#c0392b",
  amber: "#e67e22",
  green: "#27ae60",
};

const EVENT_TYPES = ["Business Exit", "Inheritance", "Sudden Windfall", "Taxable Event"];
const EVENT_CONTEXTS = ["Post-Close Governance", "Pre-Close Planning", "Growth-Stage Governance", "Post-Inheritance Governance", "Post-Windfall Governance", "Ongoing Governance"];
const STOREHOUSE_OPTS = ["Not Established", "Partial", "Established"];
const SOLICITATION_OPTS = ["Not Established", "Partial", "Established"];
const CHARTER_OPTS = ["Not Started", "In Progress", "Complete"];
const TAX_OPTS = ["Not Assessed", "In Progress", "Assessed"];

export default function StabilizationMap() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [map, setMap] = useState<SMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const autoSave = useAutoSave<SMap>({
    data: map,
    enabled: editing,
    onSave: async (current) => {
      const { id: _, lead_id: __, contact_id: ___, generation_error: ____, ...rest } = current;
      const { error } = await supabase
        .from("stabilization_maps" as any)
        .update({ ...rest, generation_status: "manually_edited" } as any)
        .eq("id", current.id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      return true;
    },
  });

  const load = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("stabilization_maps" as any)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setMap(data as unknown as SMap);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // Poll while generating
  useEffect(() => {
    if (!map) return;
    if (map.generation_status === "generating" || map.generation_status === "pending") {
      const t = setInterval(load, 3000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line
  }, [map?.generation_status]);

  const sessionDateLabel = useMemo(() => {
    if (!map?.session_date) return "";
    try {
      // Parse YYYY-MM-DD format directly to avoid timezone issues
      const match = map.session_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const [, year, month, day] = match;
        const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        return format(date, "MMMM d, yyyy");
      }
      return format(new Date(map.session_date), "MMMM d, yyyy");
    } catch { return map.session_date; }
  }, [map?.session_date]);

  const fullName = useMemo(() => {
    if (!map) return "";
    return [map.client_first_name, map.client_last_name].filter(Boolean).join(" ");
  }, [map]);

  const updateField = (key: keyof SMap, value: string) => {
    setMap((m) => (m ? { ...m, [key]: value } : m));
    autoSave.markDirty();
  };

  const save = async () => {
    const ok = await autoSave.flush();
    if (ok) {
      toast.success("Stabilization Map saved");
      setEditing(false);
      load();
    }
  };

  const regenerate = async () => {
    if (!map) return;
    setRegenerating(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stabilization-map-generate`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ mapId: map.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regeneration failed");
      toast.success("Regeneration started");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!map) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Stabilization Map not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/leads")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Leads
        </Button>
      </div>
    );
  }

  const isGenerating = map.generation_status === "generating" || map.generation_status === "pending";

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      {/* Toolbar — hidden in print */}
      <div className="print:hidden sticky top-0 z-20 border-b border-[#D3C5B7] bg-[#F8F6F2]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="text-sm text-[#3B3F3F]">
              <span className="font-semibold">Stabilization Map</span>
              <span className="ml-2 text-xs uppercase tracking-wider text-[#A98C5A]">
                {map.generation_status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editing && <AutoSaveIndicator status={autoSave} />}
            {editing ? (
              <>
                <Button size="sm" variant="outline" onClick={async () => {
                  if (autoSave.isDirty) await autoSave.flush();
                  setEditing(false);
                  load();
                }}>Done</Button>
                <Button size="sm" onClick={save} disabled={autoSave.saving}>
                  {autoSave.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save & Close
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={regenerate} disabled={regenerating || isGenerating}>
                  {regenerating || isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Regenerate
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={isGenerating}>Edit</Button>
                <Button size="sm" onClick={() => window.print()} disabled={isGenerating}>
                  <Printer className="mr-2 h-4 w-4" /> Print / PDF
                </Button>
              </>
            )}
          </div>
        </div>
        {map.generation_status === "failed" && (
          <div className="border-t border-red-300 bg-red-50 px-6 py-2 text-xs text-red-700">
            Generation failed: {map.generation_error || "Unknown error"}. Click Regenerate to retry.
          </div>
        )}
        {isGenerating && (
          <div className="border-t border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-800">
            Georgia is drafting this map. Auto-refreshing every 3 seconds…
          </div>
        )}
      </div>

      {/* Editor pane */}
      {editing && (
        <div className="mx-auto max-w-[1100px] px-6 py-6 print:hidden">
          <EditorForm map={map} onChange={updateField} />
        </div>
      )}

      {/* Document — A4 landscape preview */}
      <div className="mx-auto max-w-[297mm] px-6 py-6 print:p-0 print:max-w-none">
        <div className="stab-doc bg-white shadow-lg print:shadow-none" style={{ width: "297mm", minHeight: "210mm", display: "flex", fontFamily: "'DM Sans', sans-serif", color: "#3B3F3F" }}>
          {/* Sidebar */}
          <aside style={{ width: "72mm", backgroundColor: "#2A4034", color: "#fff", padding: "10mm 7mm", display: "flex", flexDirection: "column", gap: "6mm", flexShrink: 0 }}>
            <div>
              <img
                src={pwLogoWhite}
                alt="ProsperWise"
                style={{ width: "48mm", height: "auto", display: "block", marginBottom: "3mm" }}
              />
              <div style={{ fontSize: "9pt", fontWeight: 300, color: "rgba(255,255,255,.5)", letterSpacing: ".08em", textTransform: "uppercase" }}>
                Sovereignty Operating System
              </div>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.18)" }} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "16pt", fontWeight: 300, lineHeight: 1.3 }}>
              Don't Invest. <em style={{ fontStyle: "italic", color: "rgba(255,255,255,.7)" }}>Integrate.</em>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.18)" }} />
            <div>
              <div style={{ fontSize: "6.5pt", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: "2mm" }}>Our Process</div>
              <div style={{ marginBottom: "3mm" }}>
                <strong style={{ fontSize: "8.5pt", fontWeight: 600 }}>1 · Stabilize</strong>
                <p style={{ fontSize: "7.5pt", color: "rgba(255,255,255,.5)", marginTop: "1pt" }}>Find your footing. Quiet the noise.</p>
              </div>
              <div style={{ marginBottom: "3mm" }}>
                <strong style={{ fontSize: "8.5pt", fontWeight: 600 }}>2 · Charter</strong>
                <p style={{ fontSize: "7.5pt", color: "rgba(255,255,255,.5)", marginTop: "1pt" }}>Author your governing document.</p>
              </div>
              <div style={{ marginBottom: "3mm" }}>
                <strong style={{ fontSize: "8.5pt", fontWeight: 600 }}>3 · Govern</strong>
                <p style={{ fontSize: "7.5pt", color: "rgba(255,255,255,.5)", marginTop: "1pt" }}>Operate with clarity. Compound quietly.</p>
              </div>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.18)" }} />
            <div>
              <strong style={{ display: "block", fontSize: "8.5pt", fontWeight: 600 }}>Rolf Issler</strong>
              <p style={{ fontSize: "7.5pt", color: "rgba(255,255,255,.5)", marginTop: "1pt" }}>Founder · Sudden Wealth Specialist · Fee-Only · Canada</p>
            </div>
            <div style={{ marginTop: "auto", paddingTop: "4mm" }}>
              <div style={{ fontSize: "6.5pt", color: "rgba(255,255,255,.4)", lineHeight: 1.5 }}>
                © {new Date().getFullYear()} ProsperWise Advisors · www.prosperwise.ca<br />
                Data residency: Canada. All client data stored and processed in Canadian data centers in compliance with PIPEDA.
              </div>
            </div>
          </aside>

          {/* Main */}
          <main style={{ flex: 1, padding: "10mm 10mm 0 10mm", display: "flex", flexDirection: "column", gap: "5mm" }}>
            <div>
              <div style={{ fontSize: "7.5pt", letterSpacing: ".1em", textTransform: "uppercase", color: "#7a8a8a", marginBottom: "1.5mm" }}>
                Stabilization Map &nbsp;·&nbsp; Prepared for <strong>{fullName}</strong>
                {sessionDateLabel && <> &nbsp;·&nbsp; {sessionDateLabel}</>}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "26pt", fontWeight: 300, color: "#3B3F3F", lineHeight: 1.1, letterSpacing: "-0.005em" }}>
                {map.event_type} &nbsp;·&nbsp; Post-Close Governance<br />
                Your Sovereignty OS — Session One Findings
              </div>
              <hr style={{ width: "18mm", height: "3px", background: "#A98C5A", border: "none", marginTop: "2.5mm" }} />
            </div>

            {/* Insight */}
            <div style={{ background: "#F8F6F2", borderLeft: "3px solid #A98C5A", padding: "3mm 5mm", display: "flex", flexDirection: "column", gap: "1mm" }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontStyle: "italic", fontSize: "7.5pt", fontWeight: 400, color: "#3B3F3F", lineHeight: 1.55 }}>
                {map.situation_summary || "—"}
              </div>
              <div style={{ fontSize: "7.5pt", color: "#3B3F3F" }}>{map.urgency_flag || "—"}</div>
            </div>

            {/* Two col */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6mm" }}>
              <div>
                <div style={colLabel}>What You're Currently Exposed To</div>
                {[map.risk_1, map.risk_2, map.risk_3, map.risk_4, map.risk_5].map((r, i) => (
                  <div key={i} style={colItem}>
                    <div style={dot} />
                    <p style={colText}>{r || "—"}</p>
                  </div>
                ))}
              </div>
              <div>
                <div style={colLabel}>Your Immediate Next Steps</div>
                {[map.next_step_1, map.next_step_2, map.next_step_3, map.next_step_4, map.next_step_5].map((s, i) => (
                  <div key={i} style={colItem}>
                    <div style={sq} />
                    <p style={colText}>{s || "—"}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3mm" }}>
              <StatusCard label="Storehouse" status={map.storehouse_status} detail={map.storehouse_detail} />
              <StatusCard label="Solicitation Protocol" status={map.solicitation_status} detail={map.solicitation_detail} />
              <StatusCard label="Sovereignty Charter" status={map.sovereignty_charter_status} detail={map.sovereignty_charter_detail} />
              <StatusCard label="Tax Assessment" status={map.tax_status} detail={map.tax_detail} />
            </div>

            {/* Footer */}
            <div style={{ background: "#A98C5A", color: "#fff", margin: "auto -10mm 0 -10mm", padding: "3mm 10mm", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "8.5pt", fontWeight: 500, maxWidth: "60%" }}>{map.footer_note}</div>
            </div>
          </main>
        </div>

        {map.logic_trace && !editing && (
          <div className="mt-6 rounded-lg border border-[#D3C5B7] bg-white p-4 text-xs text-[#6B7070] print:hidden">
            <div className="mb-1 font-semibold uppercase tracking-wider text-[#A98C5A]">AI Logic Trace (staff only)</div>
            <p className="whitespace-pre-wrap">{map.logic_trace}</p>
          </div>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body { background: white !important; }
          .stab-doc { box-shadow: none !important; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500;1,600&family=DM+Sans:wght@300;400;500;600&display=swap');
      `}</style>
    </div>
  );
}

const colLabel: React.CSSProperties = { fontSize: "6.5pt", letterSpacing: ".1em", textTransform: "uppercase", color: "#7a8a8a", marginBottom: "2mm", paddingBottom: "1.5mm", borderBottom: "1px solid #dde0dc" };
const colItem: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: "3mm", marginBottom: "2.5mm" };
const colText: React.CSSProperties = { fontSize: "8.5pt", color: "#3B3F3F", lineHeight: 1.4 };
const dot: React.CSSProperties = { width: "6px", height: "6px", borderRadius: "50%", background: "#A98C5A", flexShrink: 0, marginTop: "2pt" };
const sq: React.CSSProperties = { width: "6px", height: "6px", background: "#A98C5A", flexShrink: 0, marginTop: "2pt" };

function StatusCard({ label, status, detail }: { label: string; status: string; detail: string }) {
  const kind = STATUS_KIND[status] || "amber";
  return (
    <div style={{ background: "#F8F6F2", borderLeft: "3px solid #A98C5A", padding: "3mm 4mm" }}>
      <strong style={{ display: "block", fontSize: "8.5pt", fontWeight: 600, color: "#3B3F3F", marginBottom: "1mm" }}>
        {label}&nbsp;
        <span style={{ color: STATUS_COLOR[kind], fontSize: "7pt", letterSpacing: ".08em", textTransform: "uppercase" }}>
          {status}
        </span>
      </strong>
      <p style={{ fontSize: "7.5pt", color: "#3B3F3F", lineHeight: 1.5 }}>{detail || "—"}</p>
    </div>
  );
}

function EditorForm({ map, onChange }: { map: SMap; onChange: (k: keyof SMap, v: string) => void }) {
  const F = (key: keyof SMap, label: string, multiline = false) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {multiline ? (
        <Textarea value={(map[key] as string) || ""} onChange={(e) => onChange(key, e.target.value)} rows={2} />
      ) : (
        <Input value={(map[key] as string) || ""} onChange={(e) => onChange(key, e.target.value)} />
      )}
    </div>
  );
  const S = (key: keyof SMap, label: string, opts: string[]) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={(map[key] as string) || opts[0]} onValueChange={(v) => onChange(key, v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  return (
    <div className="space-y-4 rounded-lg border border-[#D3C5B7] bg-white p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {F("client_first_name", "First Name")}
        {F("client_last_name", "Last Name")}
        <div className="space-y-1">
          <Label className="text-xs">Session Date</Label>
          <Input type="date" value={map.session_date || ""} onChange={(e) => onChange("session_date", e.target.value)} />
        </div>
      </div>
      {S("event_type", "Event Type", EVENT_TYPES)}
      {F("situation_summary", "Situation Summary", true)}
      {F("urgency_flag", "Urgency Flag", true)}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#A98C5A]">Risks</div>
          {[1, 2, 3, 4, 5].map((n) => F(`risk_${n}` as keyof SMap, `Risk ${n}`))}
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#A98C5A]">Next Steps</div>
          {[1, 2, 3, 4, 5].map((n) => F(`next_step_${n}` as keyof SMap, `Next Step ${n}`))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {S("storehouse_status", "Storehouse Status", STOREHOUSE_OPTS)}
        {F("storehouse_detail", "Storehouse Detail")}
        {S("solicitation_status", "Solicitation Status", SOLICITATION_OPTS)}
        {F("solicitation_detail", "Solicitation Detail")}
        {S("sovereignty_charter_status", "Sovereignty Charter Status", CHARTER_OPTS)}
        {F("sovereignty_charter_detail", "Sovereignty Charter Detail")}
        {S("tax_status", "Tax Status", TAX_OPTS)}
        {F("tax_detail", "Tax Detail")}
      </div>
      {F("footer_note", "Footer Note", true)}
    </div>
  );
}
