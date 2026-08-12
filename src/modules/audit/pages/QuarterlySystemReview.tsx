import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, ClipboardCheck, Loader2, Printer, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/shared/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { useAutoSave, AutoSaveIndicator } from "@/shared/hooks/useAutoSave";
import pwLogoWhite from "@/assets/prosperwise-logo-white.png";

type StatusKind = "red" | "amber" | "green";

type ReviewStatus = "Missing" | "Needs Review" | "Needs Attention" | "Partial" | "Aligned";

type QuarterlyReview = {
  id: string;
  contact_id: string;
  updated_at?: string | null;
  client_first_name: string;
  client_last_name: string;
  review_date: string | null;
  review_summary: string;
  alignment_overview: string;
  purpose_statement: string;
  primary_goal: string;
  long_term_vision: string;
  charter_status: ReviewStatus | string;
  charter_detail: string;
  vineyard_status: ReviewStatus | string;
  vineyard_detail: string;
  storehouse_status: ReviewStatus | string;
  storehouse_detail: string;
  cross_system_status: ReviewStatus | string;
  cross_system_detail: string;
  gap_1: string;
  gap_2: string;
  gap_3: string;
  gap_4: string;
  gap_5: string;
  priority_1: string;
  priority_2: string;
  priority_3: string;
  priority_4: string;
  priority_5: string;
  footer_note: string;
  generation_status: string;
  generation_error: string | null;
  logic_trace: string | null;
};

type ReviewHarvestSnapshot = {
  id: string;
  snapshot_date: string;
  boy_value: number;
  current_harvest: number;
  current_value: number;
  vineyard_account_id: string | null;
  storehouse_id: string | null;
};

type ReviewVineyardAccount = {
  id: string;
  account_name: string;
  account_type: string;
  current_value: number | null;
};

type ReviewStorehouse = {
  id: string;
  label: string;
  storehouse_number: number;
  current_value: number | null;
};

const STATUS_KIND: Record<string, StatusKind> = {
  Missing: "red",
  "Needs Review": "red",
  "Needs Attention": "red",
  Partial: "amber",
  Aligned: "green",
};

const STATUS_COLOR: Record<StatusKind, string> = {
  red: "#c0392b",
  amber: "#e67e22",
  green: "#27ae60",
};

const STATUS_OPTIONS: ReviewStatus[] = ["Missing", "Needs Review", "Needs Attention", "Partial", "Aligned"];

const formatCurrency = (value: number | null | undefined) =>
  value == null || Number.isNaN(value)
    ? "—"
    : new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);

export default function QuarterlySystemReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [review, setReview] = useState<QuarterlyReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [harvestSnapshots, setHarvestSnapshots] = useState<ReviewHarvestSnapshot[]>([]);
  const [vineyardAccounts, setVineyardAccounts] = useState<ReviewVineyardAccount[]>([]);
  const [storehouses, setStorehouses] = useState<ReviewStorehouse[]>([]);

  const autoSave = useAutoSave<QuarterlyReview>({
    data: review,
    enabled: editing,
    onSave: async (current) => {
      const { id: _, contact_id: __, generation_error: ___, ...rest } = current;
      const { error } = await supabase
        .from("quarterly_system_reviews")
        .update({ ...rest, generation_status: "manually_edited" })
        .eq("id", current.id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      return true;
    },
  });

  const isFreshGeneration = (updatedAt?: string | null) => {
    if (!updatedAt) return false;
    const updatedTime = new Date(updatedAt).getTime();
    if (Number.isNaN(updatedTime)) return false;
    return Date.now() - updatedTime < 45_000;
  };

  const load = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("quarterly_system_reviews")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setReview(data);

    if (data?.contact_id) {
      const [harvestRes, vineyardRes, storehouseRes] = await Promise.all([
        supabase
          .from("account_harvest_snapshots")
          .select("id, snapshot_date, boy_value, current_harvest, current_value, vineyard_account_id, storehouse_id")
          .eq("contact_id", data.contact_id)
          .order("snapshot_date", { ascending: false }),
        supabase
          .from("vineyard_accounts" as any)
          .select("id, account_name, account_type, current_value")
          .eq("contact_id", data.contact_id)
          .order("created_at"),
        supabase
          .from("storehouses")
          .select("id, label, storehouse_number, current_value")
          .eq("contact_id", data.contact_id)
          .order("storehouse_number"),
      ]);

      if (harvestRes.error) toast.error(harvestRes.error.message);
      if (vineyardRes.error) toast.error(vineyardRes.error.message);
      if (storehouseRes.error) toast.error(storehouseRes.error.message);

      setHarvestSnapshots((harvestRes.data as ReviewHarvestSnapshot[] | null) || []);
      setVineyardAccounts(((vineyardRes.data as unknown) as ReviewVineyardAccount[] | null) || []);
      setStorehouses((storehouseRes.data as ReviewStorehouse[] | null) || []);
    } else {
      setHarvestSnapshots([]);
      setVineyardAccounts([]);
      setStorehouses([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!review) return;
    if ((review.generation_status === "generating" || review.generation_status === "pending") && isFreshGeneration(review.updated_at)) {
      const interval = setInterval(load, 3000);
      return () => clearInterval(interval);
    }
  }, [review?.generation_status, review?.updated_at]);

  const reviewDateLabel = useMemo(() => {
    if (!review?.review_date) return "";
    try {
      const match = review.review_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const [, year, month, day] = match;
        return format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))), "MMMM d, yyyy");
      }
      return format(new Date(review.review_date), "MMMM d, yyyy");
    } catch {
      return review.review_date;
    }
  }, [review?.review_date]);

  const fullName = useMemo(() => {
    if (!review) return "";
    return [review.client_first_name, review.client_last_name].filter(Boolean).join(" ");
  }, [review]);

  const updateField = (key: keyof QuarterlyReview, value: string) => {
    setReview((current) => (current ? { ...current, [key]: value } : current));
    autoSave.markDirty();
  };

  const save = async () => {
    const ok = await autoSave.flush();
    if (ok) {
      toast.success("Quarterly Review saved");
      setEditing(false);
      load();
    }
  };

  const regenerate = async () => {
    if (!review) return;
    setRegenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quarterly-system-review-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ reviewId: review.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regeneration failed");
      toast.success("Quarterly Review refreshed");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Regeneration failed");
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

  if (!review) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Quarterly Review not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/contacts")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Contacts
        </Button>
      </div>
    );
  }

  const isGenerating = review.generation_status === "generating" || review.generation_status === "pending";
  const isGenerationStale = isGenerating && !isFreshGeneration(review.updated_at);
  const isActivelyGenerating = isGenerating && !isGenerationStale;
  const gaps = [review.gap_1, review.gap_2, review.gap_3, review.gap_4, review.gap_5];
  const priorities = [review.priority_1, review.priority_2, review.priority_3, review.priority_4, review.priority_5];
  const reviewYear = review.review_date ? new Date(review.review_date).getFullYear() : new Date().getFullYear();
  const latestHarvestByKey = harvestSnapshots.reduce<Record<string, ReviewHarvestSnapshot>>((acc, snapshot) => {
    const key = snapshot.vineyard_account_id
      ? `vineyard:${snapshot.vineyard_account_id}`
      : snapshot.storehouse_id
        ? `storehouse:${snapshot.storehouse_id}`
        : null;
    if (!key) return acc;
    const existing = acc[key];
    if (!existing || new Date(snapshot.snapshot_date).getTime() > new Date(existing.snapshot_date).getTime()) {
      acc[key] = snapshot;
    }
    return acc;
  }, {});

  const vineyardHarvestRows = vineyardAccounts.map((account) => ({
    id: account.id,
    label: account.account_name,
    kindLabel: account.account_type,
    snapshot: latestHarvestByKey[`vineyard:${account.id}`] ?? null,
  }));

  const storehouseTypeLabels: Record<number, string> = {
    1: "Liquidity Reserve",
    2: "Strategic Reserve",
    3: "Philanthropic Trust",
    4: "Legacy Trust",
  };

  const storehouseHarvestRows = storehouses.map((storehouse) => ({
    id: storehouse.id,
    label: storehouse.label,
    kindLabel: storehouseTypeLabels[storehouse.storehouse_number] || `Storehouse #${storehouse.storehouse_number}`,
    snapshot: latestHarvestByKey[`storehouse:${storehouse.id}`] ?? null,
  }));

  const harvestTotals = [...vineyardHarvestRows, ...storehouseHarvestRows].reduce((totals, row) => {
    if (!row.snapshot) return totals;
    totals.boy += Number(row.snapshot.boy_value) || 0;
    totals.harvest += Number(row.snapshot.current_harvest) || 0;
    totals.current += Number(row.snapshot.current_value) || 0;
    return totals;
  }, { boy: 0, harvest: 0, current: 0 });

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="print:hidden sticky top-0 z-20 border-b border-[#e2e8f0] bg-[#fafafa]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="text-sm text-[#334155]">
              <span className="font-semibold">Quarterly System Review</span>
              <span className="ml-2 text-xs uppercase tracking-wider text-[#a37c58]">
                {review.generation_status.replace(/_/g, " ")}
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
                <Button size="sm" variant="outline" onClick={regenerate} disabled={regenerating || isActivelyGenerating}>
                  {regenerating || isActivelyGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Refresh
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={isActivelyGenerating}>Edit</Button>
                <Button size="sm" onClick={() => window.print()} disabled={isActivelyGenerating}>
                  <Printer className="mr-2 h-4 w-4" /> Print / PDF
                </Button>
              </>
            )}
          </div>
        </div>
        {review.generation_status === "failed" && (
          <div className="border-t border-red-300 bg-red-50 px-6 py-2 text-xs text-red-700">
            Generation failed: {review.generation_error || "Unknown error"}. Click Refresh to retry.
          </div>
        )}
        {isActivelyGenerating && (
          <div className="border-t border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-800">
            Reviewing Charter, Vineyard, and Storehouse alignment. Auto-refreshing every 3 seconds…
          </div>
        )}
        {isGenerationStale && (
          <div className="border-t border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-800">
            Generation stalled before completing. Click Refresh to retry.
          </div>
        )}
      </div>

      {editing && (
        <div className="mx-auto max-w-[1100px] px-6 py-6 print:hidden">
          <EditorForm review={review} onChange={updateField} />
        </div>
      )}

      <div className="mx-auto max-w-[297mm] px-6 py-6 print:p-0 print:max-w-none">
        <div className="stab-doc bg-white shadow-lg print:shadow-none" style={{ width: "297mm", minHeight: "210mm", display: "flex", fontFamily: "'DM Sans', sans-serif", color: "#334155" }}>
          <aside style={{ width: "72mm", backgroundColor: "#1e293b", color: "#fff", padding: "10mm 7mm", display: "flex", flexDirection: "column", gap: "6mm", flexShrink: 0 }}>
            <div>
              <img src={pwLogoWhite} alt="ProsperWise" style={{ width: "48mm", height: "auto", display: "block", marginBottom: "3mm" }} />
              <div style={{ fontSize: "9pt", fontWeight: 300, color: "rgba(255,255,255,.5)", letterSpacing: ".08em", textTransform: "uppercase" }}>
                Sovereignty Operating System™
              </div>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.18)" }} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "16pt", fontWeight: 300, lineHeight: 1.3 }}>
              Govern the system. <em style={{ fontStyle: "italic", color: "rgba(255,255,255,.7)" }}>Not just the assets.</em>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.18)" }} />
            <div>
              <div style={{ fontSize: "6.5pt", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: "2mm" }}>Review Lens</div>
              <div style={{ marginBottom: "3mm" }}>
                <strong style={{ fontSize: "8.5pt", fontWeight: 600 }}>1 · Charter</strong>
                <p style={{ fontSize: "7.5pt", color: "rgba(255,255,255,.5)", marginTop: "1pt" }}>Confirm written intent remains current.</p>
              </div>
              <div style={{ marginBottom: "3mm" }}>
                <strong style={{ fontSize: "8.5pt", fontWeight: 600 }}>2 · Vineyard</strong>
                <p style={{ fontSize: "7.5pt", color: "rgba(255,255,255,.5)", marginTop: "1pt" }}>Check core assets against the operating plan.</p>
              </div>
              <div style={{ marginBottom: "3mm" }}>
                <strong style={{ fontSize: "8.5pt", fontWeight: 600 }}>3 · Storehouses</strong>
                <p style={{ fontSize: "7.5pt", color: "rgba(255,255,255,.5)", marginTop: "1pt" }}>Verify liquidity, protection, and reserves still fit.</p>
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

          <main style={{ flex: 1, padding: "10mm 10mm 0 10mm", display: "flex", flexDirection: "column", gap: "5mm" }}>
            <div>
              <div style={{ fontSize: "7.5pt", letterSpacing: ".1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "1.5mm" }}>
                Quarterly System Review &nbsp;·&nbsp; Prepared for <strong>{fullName}</strong>
                {reviewDateLabel && <> &nbsp;·&nbsp; {reviewDateLabel}</>}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "26pt", fontWeight: 300, color: "#334155", lineHeight: 1.1, letterSpacing: "-0.005em" }}>
                Charter · Vineyard · Storehouse Alignment
              </div>
              <hr style={{ width: "18mm", height: "3px", background: "#a37c58", border: "none", marginTop: "2.5mm" }} />
            </div>

            <div style={{ background: "#fafafa", borderLeft: "3px solid #a37c58", padding: "3mm 5mm", display: "flex", flexDirection: "column", gap: "1.5mm", minHeight: "18mm" }}>
              {!!review.purpose_statement && (
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "11pt", fontWeight: 400, fontStyle: "italic", color: "#334155", lineHeight: 1.5 }}>
                  {review.purpose_statement}
                </div>
              )}
              {!review.purpose_statement && !!review.review_summary && (
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "7.5pt", fontWeight: 400, fontStyle: "italic", color: "#334155", lineHeight: 1.55 }}>
                  {review.review_summary}
                </div>
              )}
              {!review.purpose_statement && !!review.alignment_overview && (
                <div style={{ fontSize: "7.5pt", color: "#334155" }}>{review.alignment_overview}</div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3mm" }}>
              <div style={{ background: "#FFFFFF", border: "1px solid #e2e8f0", padding: "3mm 4mm" }}>
                <div style={{ fontSize: "6.5pt", letterSpacing: ".1em", textTransform: "uppercase", color: "#a37c58", marginBottom: "1.5mm", fontWeight: 600 }}>
                  Primary Goal
                </div>
                <p style={{ fontSize: "8pt", color: "#334155", lineHeight: 1.5 }}>
                  {review.primary_goal || ""}
                </p>
              </div>
              <div style={{ background: "#FFFFFF", border: "1px solid #e2e8f0", padding: "3mm 4mm" }}>
                <div style={{ fontSize: "6.5pt", letterSpacing: ".1em", textTransform: "uppercase", color: "#a37c58", marginBottom: "1.5mm", fontWeight: 600 }}>
                  Long-Term Vision
                </div>
                <p style={{ fontSize: "8pt", color: "#334155", lineHeight: 1.5 }}>
                  {review.long_term_vision || ""}
                </p>
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "0" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3mm" }}>
              <StatusCard label="Sovereignty Charter" status={review.charter_status} detail={review.charter_detail} />
              <StatusCard label="The Vineyard" status={review.vineyard_status} detail={review.vineyard_detail} />
              <StatusCard label="The Storehouses" status={review.storehouse_status} detail={review.storehouse_detail} />
              <StatusCard label="Cross-System Alignment" status={review.cross_system_status} detail={review.cross_system_detail} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6mm" }}>
              <div>
                <div style={colLabel}>Alignment Gaps</div>
                {gaps.map((gap, index) => (
                  <div key={index} style={colItem}>
                    {gap ? <div style={dot} /> : null}
                    <p style={colText}>{gap || ""}</p>
                  </div>
                ))}
              </div>
              <div>
                <div style={colLabel}>Priorities for the Next 90 Days</div>
                {priorities.map((priority, index) => (
                  <div key={index} style={colItem}>
                    {priority ? <div style={sq} /> : null}
                    <p style={colText}>{priority || ""}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "#a37c58", color: "#fff", margin: "auto -10mm 0 -10mm", padding: "3mm 10mm", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "8.5pt", fontWeight: 500, maxWidth: "60%" }}>{review.footer_note || ""}</div>
            </div>
          </main>
        </div>

        <div className="stab-doc print-page-break bg-white shadow-lg print:shadow-none" style={{ width: "297mm", minHeight: "210mm", display: "flex", fontFamily: "'DM Sans', sans-serif", color: "#334155", marginTop: "6mm" }}>
          <aside style={{ width: "72mm", backgroundColor: "#1e293b", color: "#fff", padding: "10mm 7mm", display: "flex", flexDirection: "column", gap: "6mm", flexShrink: 0 }}>
            <div>
              <img src={pwLogoWhite} alt="ProsperWise" style={{ width: "48mm", height: "auto", display: "block", marginBottom: "3mm" }} />
              <div style={{ fontSize: "9pt", fontWeight: 300, color: "rgba(255,255,255,.5)", letterSpacing: ".08em", textTransform: "uppercase" }}>
                Sovereignty Operating System™
              </div>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.18)" }} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "16pt", fontWeight: 300, lineHeight: 1.3 }}>
              Track movement through the year. <em style={{ fontStyle: "italic", color: "rgba(255,255,255,.7)" }}>Not just the ending balance.</em>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.18)" }} />
            <div>
              <div style={{ fontSize: "6.5pt", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: "2mm" }}>{reviewYear} Estate Totals</div>
              <div style={{ marginBottom: "3mm" }}>
                <strong style={{ fontSize: "8.5pt", fontWeight: 600 }}>Beginning Value</strong>
                <p style={{ fontSize: "8pt", color: "rgba(255,255,255,.75)", marginTop: "1pt" }}>{formatCurrency(harvestTotals.boy)}</p>
              </div>
              <div style={{ marginBottom: "3mm" }}>
                <strong style={{ fontSize: "8.5pt", fontWeight: 600 }}>Current Harvest</strong>
                <p style={{ fontSize: "8pt", color: "rgba(255,255,255,.75)", marginTop: "1pt" }}>{formatCurrency(harvestTotals.harvest)}</p>
              </div>
              <div>
                <strong style={{ fontSize: "8.5pt", fontWeight: 600 }}>Current Value</strong>
                <p style={{ fontSize: "8pt", color: "rgba(255,255,255,.75)", marginTop: "1pt" }}>{formatCurrency(harvestTotals.current)}</p>
              </div>
            </div>
          </aside>

          <main style={{ flex: 1, padding: "10mm", display: "flex", flexDirection: "column", gap: "5mm" }}>
            <div>
              <div style={{ fontSize: "7.5pt", letterSpacing: ".1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "1.5mm" }}>
                Quarterly System Review &nbsp;·&nbsp; Vineyard Harvest - Storehouse Detail for <strong>{fullName}</strong>
                {reviewDateLabel && <> &nbsp;·&nbsp; {reviewDateLabel}</>}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "24pt", fontWeight: 300, color: "#334155", lineHeight: 1.1 }}>
                Vineyard Harvest - Storehouse Detail
              </div>
              <hr style={{ width: "18mm", height: "3px", background: "#a37c58", border: "none", marginTop: "2.5mm" }} />
            </div>

            <div style={{ background: "#fafafa", borderLeft: "3px solid #a37c58", padding: "3mm 5mm", fontFamily: "'DM Sans', sans-serif", fontSize: "7.5pt", fontWeight: 400, fontStyle: "italic", color: "#334155", lineHeight: 1.65 }}>
              This page summarizes the latest harvest snapshot for each Vineyard and Storehouse account included in the quarterly review.
            </div>

            <HarvestTable title="Vineyard Accounts" rows={vineyardHarvestRows} emptyLabel="No Vineyard accounts are available for harvest review." />
            <HarvestTable title="Storehouses" rows={storehouseHarvestRows} emptyLabel="No Storehouse items are available for harvest review." />
          </main>
        </div>

        {review.logic_trace && !editing && (
          <div className="mt-6 rounded-lg border border-[#e2e8f0] bg-white p-4 text-xs text-[#64748b] print:hidden">
            <div className="mb-1 font-semibold uppercase tracking-wider text-[#a37c58]">Review Logic Trace (staff only)</div>
            <p className="whitespace-pre-wrap">{review.logic_trace}</p>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body { background: white !important; }
          .stab-doc { box-shadow: none !important; }
          .print-page-break { break-before: page; margin-top: 0 !important; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500;1,600&family=DM+Sans:wght@300;400;500;600&display=swap');
      `}</style>
    </div>
  );
}

const colLabel: React.CSSProperties = { fontSize: "6.5pt", letterSpacing: ".1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "2mm", paddingBottom: "1.5mm", borderBottom: "1px solid #e2e8f0" };
const colItem: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: "3mm", marginBottom: "2.5mm" };
const colText: React.CSSProperties = { fontSize: "8.5pt", color: "#334155", lineHeight: 1.4 };
const dot: React.CSSProperties = { width: "6px", height: "6px", borderRadius: "50%", background: "#a37c58", flexShrink: 0, marginTop: "2pt" };
const sq: React.CSSProperties = { width: "6px", height: "6px", background: "#a37c58", flexShrink: 0, marginTop: "2pt" };
const tableHeadCellWide: React.CSSProperties = { padding: "2.5mm 2mm", width: "30%", borderBottom: "1px solid #e2e8f0", fontWeight: 600 };
const tableHeadCell: React.CSSProperties = { padding: "2.5mm 2mm", borderBottom: "1px solid #e2e8f0", fontWeight: 600 };
const tableBodyCellWide: React.CSSProperties = { padding: "2.5mm 2mm", width: "30%", verticalAlign: "top", color: "#334155" };
const tableBodyCell: React.CSSProperties = { padding: "2.5mm 2mm", verticalAlign: "top", color: "#334155" };

function StatusCard({ label, status, detail }: { label: string; status: string; detail: string }) {
  const kind = STATUS_KIND[status] || "amber";
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #e2e8f0", padding: "3mm 4mm" }}>
      <strong style={{ display: "block", fontSize: "8.5pt", fontWeight: 600, color: "#334155", marginBottom: "1mm" }}>
        {label}&nbsp;
        <span style={{ color: STATUS_COLOR[kind], fontSize: "7pt", letterSpacing: ".08em", textTransform: "uppercase" }}>
          {status}
        </span>
      </strong>
      <p style={{ fontSize: "7.5pt", color: "#334155", lineHeight: 1.5 }}>{detail || ""}</p>
    </div>
  );
}

function HarvestTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: Array<{
    id: string;
    label: string;
    kindLabel: string;
    snapshot: ReviewHarvestSnapshot | null;
  }>;
  emptyLabel: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2mm" }}>
      <div style={colLabel}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ background: "#fafafa", padding: "4mm", fontSize: "8pt", color: "#64748b" }}>{emptyLabel}</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: "7.5pt" }}>
          <thead>
            <tr style={{ background: "#fafafa", textAlign: "left", color: "#64748b" }}>
              <th style={tableHeadCellWide}>Account</th>
              <th style={tableHeadCell}>Type</th>
              <th style={tableHeadCell}>Snapshot</th>
              <th style={tableHeadCell}>BOY</th>
              <th style={tableHeadCell}>Harvest</th>
              <th style={tableHeadCell}>Current</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={tableBodyCellWide}>{row.label}</td>
                <td style={tableBodyCell}>{row.kindLabel}</td>
                <td style={tableBodyCell}>{row.snapshot?.snapshot_date || "—"}</td>
                <td style={tableBodyCell}>{formatCurrency(row.snapshot?.boy_value)}</td>
                <td style={tableBodyCell}>{formatCurrency(row.snapshot?.current_harvest)}</td>
                <td style={tableBodyCell}>{formatCurrency(row.snapshot?.current_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EditorForm({ review, onChange }: { review: QuarterlyReview; onChange: (key: keyof QuarterlyReview, value: string) => void }) {
  const F = (key: keyof QuarterlyReview, label: string, multiline = false) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {multiline ? (
        <Textarea value={(review[key] as string) || ""} onChange={(e) => onChange(key, e.target.value)} rows={2} />
      ) : (
        <Input value={(review[key] as string) || ""} onChange={(e) => onChange(key, e.target.value)} />
      )}
    </div>
  );

  const S = (key: keyof QuarterlyReview, label: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={(review[key] as string) || STATUS_OPTIONS[0]} onValueChange={(value) => onChange(key, value)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4 rounded-lg border border-[#e2e8f0] bg-white p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {F("client_first_name", "First Name")}
        {F("client_last_name", "Last Name")}
        <div className="space-y-1">
          <Label className="text-xs">Review Date</Label>
          <Input type="date" value={review.review_date || ""} onChange={(e) => onChange("review_date", e.target.value)} />
        </div>
      </div>
      {F("review_summary", "Review Summary", true)}
      {F("alignment_overview", "Alignment Overview", true)}
      {F("purpose_statement", "Purpose Statement (Charter intro callout)", true)}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {F("primary_goal", "Primary Goal", true)}
        {F("long_term_vision", "Long-Term Vision", true)}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#a37c58]">Alignment Gaps</div>
          {[1, 2, 3, 4, 5].map((n) => F(`gap_${n}` as keyof QuarterlyReview, `Gap ${n}`))}
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#a37c58]">Next 90 Days</div>
          {[1, 2, 3, 4, 5].map((n) => F(`priority_${n}` as keyof QuarterlyReview, `Priority ${n}`))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {S("charter_status", "Charter Status")}
        {F("charter_detail", "Charter Detail")}
        {S("vineyard_status", "Vineyard Status")}
        {F("vineyard_detail", "Vineyard Detail")}
        {S("storehouse_status", "Storehouse Status")}
        {F("storehouse_detail", "Storehouse Detail")}
        {S("cross_system_status", "Cross-System Status")}
        {F("cross_system_detail", "Cross-System Detail")}
      </div>
      {F("footer_note", "Footer Note", true)}
    </div>
  );
}
