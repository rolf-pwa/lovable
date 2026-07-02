import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Briefcase, LogOut, FileText, MessageSquare, ChevronLeft, Download,
  Crown, Users, ChevronRight, ArrowRight, Landmark,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const FN_ENG = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pro-portal-engagements`;
const FN_OTP = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pro-portal-otp`;
const FN_MSG = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/engagement-message-send`;
const APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Engagement {
  id: string;
  title: string;
  pillar: string;
  scope_type: string;
  scope_id: string;
  scope_label?: string;
  family_id?: string | null;
  status: string;
  created_at: string;
  unread_count?: number;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  last_message_sender?: string | null;
}
interface Collaborator {
  id: string; full_name: string; firm: string | null; professional_type: string;
}
interface FamilyGroup {
  id: string;
  name: string;
  engagements: Engagement[];
  collaborators: Collaborator[];
}
interface Message {
  id: string; sender_type: string; body: string; created_at: string;
}
interface Profile {
  id: string; email: string; full_name: string; firm: string | null; professional_type: string;
}

const PILLAR_COLORS: Record<string, string> = {
  tax: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  legal: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
  insurance: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  estate: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  philanthropy: "bg-pink-500/10 text-pink-300 border-pink-500/20",
  governance: "bg-slate-500/10 text-slate-300 border-slate-500/20",
  other: "bg-slate-500/10 text-slate-300 border-slate-500/20",
};

const PRO_TYPE_LABELS: Record<string, string> = {
  lawyer: "Legal Counsel",
  accountant: "Tax & Accounting",
  insurance: "Insurance",
  estate: "Estate Planner",
  philanthropy: "Philanthropic Advisor",
  banker: "Private Banker",
  other: "Advisor",
};

export default function ProPortal() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [families, setFamilies] = useState<FamilyGroup[]>([]);
  const [unaffiliated, setUnaffiliated] = useState<Engagement[]>([]);
  const [selected, setSelected] = useState<Engagement | null>(null);
  const [detail, setDetail] = useState<{ files: any[]; messages: Message[] } | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const idleTimer = useRef<number | null>(null);

  const session = typeof window !== "undefined" ? localStorage.getItem("pro_portal_session") : null;

  const fetchOpts = useCallback(
    (body: any) => ({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: APIKEY,
        "x-pro-session": session || "",
      },
      body: JSON.stringify(body),
    }),
    [session],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(FN_OTP, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: APIKEY },
        body: JSON.stringify({ action: "logout", session_token: session }),
      });
    } catch {/* noop */}
    localStorage.removeItem("pro_portal_session");
    localStorage.removeItem("pro_portal_expires");
    localStorage.removeItem("pro_portal_profile");
    navigate("/pro-portal/login", { replace: true });
  }, [navigate, session]);

  useEffect(() => {
    const reset = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        toast("Signed out due to inactivity");
        logout();
      }, 5 * 60 * 1000);
    };
    const events = ["mousemove", "keydown", "click", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [logout]);

  const loadList = useCallback(async () => {
    const res = await fetch(FN_ENG, fetchOpts({ action: "list" }));
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    setEngagements(data.engagements || []);
    setFamilies(data.families || []);
    setUnaffiliated(data.unaffiliated || []);
    // Auto-expand all families by default
    setExpandedFamilies(new Set((data.families || []).map((f: FamilyGroup) => f.id)));
    setLoading(false);
  }, [fetchOpts, logout]);

  useEffect(() => {
    if (!session) { navigate("/pro-portal/login", { replace: true }); return; }
    const cached = localStorage.getItem("pro_portal_profile");
    if (cached) { try { setProfile(JSON.parse(cached)); } catch {/* noop */} }
    loadList();
  }, [session, navigate, loadList]);

  async function openEngagement(e: Engagement) {
    setSelected(e);
    setDetail(null);
    const res = await fetch(FN_ENG, fetchOpts({ action: "get", engagement_id: e.id }));
    if (!res.ok) { toast.error("Could not load engagement"); return; }
    const data = await res.json();
    setDetail({ files: data.files || [], messages: data.messages || [] });
    setEngagements((prev) => prev.map((x) => x.id === e.id ? { ...x, unread_count: 0 } : x));
    setFamilies((prev) => prev.map((f) => ({
      ...f,
      engagements: f.engagements.map((x) => x.id === e.id ? { ...x, unread_count: 0 } : x),
    })));
  }

  async function sendMessage() {
    if (!selected || !composer.trim()) return;
    setSending(true);
    try {
      const res = await fetch(FN_MSG, fetchOpts({ engagement_id: selected.id, body: composer.trim() }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setComposer("");
      const r = await fetch(FN_ENG, fetchOpts({ action: "get", engagement_id: selected.id }));
      const d = await r.json();
      setDetail({ files: d.files || [], messages: d.messages || [] });
    } catch (e: any) {
      toast.error(e.message || "Message blocked");
    } finally {
      setSending(false);
    }
  }

  const toggleFamily = (id: string) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Active threads across ALL work (sidebar) — sort by last activity
  const activeThreads = useMemo(() => {
    return [...engagements]
      .filter((e) => e.status !== "completed")
      .sort((a, b) => {
        const at = a.last_message_at || a.created_at;
        const bt = b.last_message_at || b.created_at;
        return new Date(bt).getTime() - new Date(at).getTime();
      })
      .slice(0, 10);
  }, [engagements]);

  const totalUnread = useMemo(
    () => engagements.reduce((s, e) => s + (e.unread_count || 0), 0),
    [engagements],
  );

  // ── Header ──
  const firmTitle = profile?.firm || profile?.full_name || "Professional Portal";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-amber-500/10 bg-gradient-to-b from-slate-950 to-background">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Briefcase className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <h1 className="font-serif text-xl text-foreground truncate">
                {firmTitle} <span className="text-amber-500/80">· Concierge Workspace</span>
              </h1>
              {profile && (
                <p className="text-xs text-muted-foreground truncate">
                  {profile.full_name}
                  {profile.professional_type ? ` · ${PRO_TYPE_LABELS[profile.professional_type] || profile.professional_type}` : ""}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-muted-foreground hover:text-foreground hover:bg-white/5 shrink-0"
          >
            <LogOut className="h-4 w-4 mr-1.5" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {selected ? (
          <>
            <button
              onClick={() => { setSelected(null); setDetail(null); }}
              className="text-xs uppercase tracking-wider text-muted-foreground hover:text-amber-500 transition-colors flex items-center gap-1 mb-5"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back to families
            </button>

            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-5">
                <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-transparent">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="font-serif text-foreground truncate">{selected.title}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {selected.scope_label || selected.scope_type} · {selected.status}
                        </p>
                      </div>
                      <Badge variant="outline" className={PILLAR_COLORS[selected.pillar] || ""}>
                        {selected.pillar}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>

                <Card className="border-amber-500/15">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-foreground font-serif">
                      <MessageSquare className="h-4 w-4 text-amber-500" /> Conversation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="max-h-[460px] overflow-y-auto space-y-3 pr-1">
                      {(detail?.messages.length ?? 0) === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-6">No messages yet.</div>
                      ) : detail!.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex ${m.sender_type === "pro" ? "justify-end" : "justify-start"}`}
                        >
                          <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            m.sender_type === "pro"
                              ? "bg-amber-500/15 border border-amber-500/25 text-foreground"
                              : "bg-white/[0.03] border border-white/5 text-foreground"
                          }`}>
                            <div className="whitespace-pre-wrap break-words">{m.body}</div>
                            <div className="text-[10px] mt-1 text-muted-foreground">
                              {m.sender_type === "pro" ? "You" : m.sender_type === "staff" ? "ProsperWise" : m.sender_type} · {format(new Date(m.created_at), "PP p")}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2 border-t border-white/5 pt-3">
                      <Textarea
                        rows={3}
                        placeholder="Write a reply… (avoid SIN, account numbers, balances)"
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        className="bg-white/[0.02] border-white/10"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={sendMessage}
                          disabled={sending || !composer.trim()}
                          className="bg-amber-500 hover:bg-amber-600 text-slate-950"
                        >
                          {sending ? "Sending…" : "Send"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <aside className="space-y-4">
                <Card className="border-amber-500/15">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-foreground font-serif">
                      <FileText className="h-4 w-4 text-amber-500" /> Shared Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!detail ? (
                      <div className="text-sm text-muted-foreground">Loading…</div>
                    ) : detail.files.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No documents shared yet.</div>
                    ) : (
                      <ul className="space-y-2">
                        {detail.files.map((f: any) => (
                          <li key={f.id} className="flex items-center justify-between text-sm border border-white/5 rounded px-3 py-2">
                            <span className="truncate">{f.name}</span>
                            <Button size="sm" variant="ghost" disabled>
                              <Download className="h-3 w-3" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-3">
                      Download links activate once secure proxy is enabled.
                    </p>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </>
        ) : loading ? (
          <div className="p-16 text-center text-muted-foreground">Loading your families…</div>
        ) : families.length === 0 && unaffiliated.length === 0 ? (
          <Card className="border-amber-500/15">
            <CardContent className="p-12 text-center space-y-2">
              <Crown className="h-8 w-8 text-amber-500 mx-auto" />
              <p className="text-foreground font-serif">No active engagements</p>
              <p className="text-sm text-muted-foreground">
                Your ProsperWise contact will let you know when work is shared.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* ── MAIN: Families the pro serves ── */}
            <div className="lg:col-span-2 space-y-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-lg text-foreground">Families You Serve</h2>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  {families.length} {families.length === 1 ? "family" : "families"}
                </span>
              </div>

              {families.map((fam) => {
                const expanded = expandedFamilies.has(fam.id);
                const famUnread = fam.engagements.reduce((s, e) => s + (e.unread_count || 0), 0);
                return (
                  <Card key={fam.id} className="border-amber-500/15 overflow-hidden">
                    <button
                      onClick={() => toggleFamily(fam.id)}
                      className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-amber-500/[0.03] transition-colors border-b border-white/5"
                    >
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Crown className="h-4 w-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-serif text-foreground truncate">{fam.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {fam.engagements.length} engagement{fam.engagements.length !== 1 ? "s" : ""}
                          {fam.collaborators.length > 0 && (
                            <> · {fam.collaborators.length} collaborator{fam.collaborators.length !== 1 ? "s" : ""}</>
                          )}
                        </div>
                      </div>
                      {famUnread > 0 && (
                        <span className="bg-amber-500 text-slate-950 text-xs font-medium rounded-full px-2 py-0.5">
                          {famUnread}
                        </span>
                      )}
                      <ChevronRight
                        className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                    </button>
                    {expanded && (
                      <ul className="divide-y divide-white/5">
                        {fam.engagements.map((e) => (
                          <li key={e.id}>
                            <button
                              onClick={() => openEngagement(e)}
                              className="w-full text-left px-5 py-3.5 hover:bg-amber-500/[0.03] transition flex items-center justify-between gap-4 group"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground truncate">{e.title}</span>
                                  <Badge variant="outline" className={`text-[10px] ${PILLAR_COLORS[e.pillar] || ""}`}>
                                    {e.pillar}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1 truncate">
                                  {e.scope_label || e.scope_type}
                                  {e.last_message_at && (
                                    <> · {formatDistanceToNow(new Date(e.last_message_at), { addSuffix: true })}</>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {(e.unread_count || 0) > 0 && (
                                  <span className="bg-amber-500 text-slate-950 text-[10px] font-medium rounded-full px-1.5 py-0.5">
                                    {e.unread_count}
                                  </span>
                                )}
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{e.status}</span>
                                <ArrowRight className="h-3.5 w-3.5 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              })}

              {unaffiliated.length > 0 && (
                <Card className="border-white/10">
                  <CardHeader>
                    <CardTitle className="text-base font-serif text-foreground flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-muted-foreground" /> Other Engagements
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-white/5">
                      {unaffiliated.map((e) => (
                        <li key={e.id}>
                          <button
                            onClick={() => openEngagement(e)}
                            className="w-full text-left px-5 py-3.5 hover:bg-white/[0.02] transition flex items-center justify-between gap-4"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-foreground truncate">{e.title}</div>
                              <div className="text-xs text-muted-foreground mt-1">{e.scope_label || e.scope_type}</div>
                            </div>
                            {(e.unread_count || 0) > 0 && (
                              <span className="bg-amber-500 text-slate-950 text-[10px] rounded-full px-1.5 py-0.5">
                                {e.unread_count}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── SIDEBAR ── */}
            <aside className="space-y-5">
              {/* Active threads across all work */}
              <Card className="border-amber-500/15">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-serif text-foreground flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-amber-500" /> Active Threads
                    </CardTitle>
                    {totalUnread > 0 && (
                      <span className="bg-amber-500 text-slate-950 text-[10px] font-medium rounded-full px-2 py-0.5">
                        {totalUnread} unread
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {activeThreads.length === 0 ? (
                    <div className="px-5 pb-5 text-sm text-muted-foreground">No active conversations.</div>
                  ) : (
                    <ul className="divide-y divide-white/5">
                      {activeThreads.map((e) => (
                        <li key={e.id}>
                          <button
                            onClick={() => openEngagement(e)}
                            className="w-full text-left px-5 py-3 hover:bg-amber-500/[0.03] transition"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-foreground truncate">{e.title}</span>
                              {(e.unread_count || 0) > 0 && (
                                <span className="bg-amber-500 text-slate-950 text-[10px] rounded-full px-1.5 py-0.5 shrink-0">
                                  {e.unread_count}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {e.scope_label}
                              {e.last_message_at && (
                                <> · {formatDistanceToNow(new Date(e.last_message_at), { addSuffix: true })}</>
                              )}
                            </div>
                            {e.last_message_preview && (
                              <div className="text-[11px] text-muted-foreground/80 truncate mt-1 italic">
                                "{e.last_message_preview}"
                              </div>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Collaborators per family */}
              <Card className="border-amber-500/15">
                <CardHeader>
                  <CardTitle className="text-base font-serif text-foreground flex items-center gap-2">
                    <Users className="h-4 w-4 text-amber-500" /> Collaborators
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {families.every((f) => f.collaborators.length === 0) ? (
                    <p className="text-sm text-muted-foreground">
                      No other professionals are linked to your families yet.
                    </p>
                  ) : (
                    families
                      .filter((f) => f.collaborators.length > 0)
                      .map((f) => (
                        <div key={f.id}>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                            {f.name}
                          </div>
                          <ul className="space-y-2">
                            {f.collaborators.map((c) => (
                              <li key={`${f.id}-${c.id}`} className="flex items-start gap-2.5 border border-white/5 rounded-md px-3 py-2 bg-white/[0.015]">
                                <div className="h-7 w-7 rounded-full bg-amber-500/10 flex items-center justify-center text-[11px] text-amber-500 font-medium shrink-0">
                                  {c.full_name?.split(" ").map((n) => n[0]).slice(0, 2).join("") || "?"}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-foreground truncate">{c.full_name}</div>
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {c.firm ? `${c.firm} · ` : ""}{PRO_TYPE_LABELS[c.professional_type] || c.professional_type}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                  )}
                  <p className="text-[11px] text-muted-foreground pt-2 border-t border-white/5">
                    Direct pro-to-pro messaging routes through ProsperWise. Contact your ProsperWise concierge to open a joint thread.
                  </p>
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
