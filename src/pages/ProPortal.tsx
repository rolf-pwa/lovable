import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Briefcase, LogOut, FileText, MessageSquare, ChevronLeft, Download } from "lucide-react";
import { format } from "date-fns";

const FN_ENG = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pro-portal-engagements`;
const FN_OTP = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pro-portal-otp`;
const FN_MSG = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/engagement-message-send`;
const APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Engagement {
  id: string;
  title: string;
  pillar: string;
  scope_type: string;
  scope_label?: string;
  status: string;
  created_at: string;
  unread_count?: number;
}
interface Message {
  id: string; sender_type: string; body: string; created_at: string;
}
interface Profile {
  id: string; email: string; full_name: string; firm: string | null; professional_type: string;
}

const PILLAR_COLORS: Record<string, string> = {
  tax: "bg-emerald-100 text-emerald-800",
  legal: "bg-indigo-100 text-indigo-800",
  insurance: "bg-amber-100 text-amber-800",
  estate: "bg-purple-100 text-purple-800",
  philanthropy: "bg-pink-100 text-pink-800",
  governance: "bg-slate-200 text-slate-800",
  other: "bg-slate-100 text-slate-700",
};

export default function ProPortal() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [selected, setSelected] = useState<Engagement | null>(null);
  const [detail, setDetail] = useState<{ files: any[]; messages: Message[] } | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef<number | null>(null);

  const session = typeof window !== "undefined" ? localStorage.getItem("pro_portal_session") : null;

  // Auth headers
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

  // 5-min idle timeout (matches client portal)
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

  // Boot: validate session + load
  useEffect(() => {
    if (!session) { navigate("/pro-portal/login", { replace: true }); return; }
    const cached = localStorage.getItem("pro_portal_profile");
    if (cached) { try { setProfile(JSON.parse(cached)); } catch {/* noop */} }
    (async () => {
      const res = await fetch(FN_ENG, fetchOpts({ action: "list" }));
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      setEngagements(data.engagements || []);
      setLoading(false);
    })();
  }, [session, fetchOpts, navigate, logout]);

  async function openEngagement(e: Engagement) {
    setSelected(e);
    setDetail(null);
    const res = await fetch(FN_ENG, fetchOpts({ action: "get", engagement_id: e.id }));
    if (!res.ok) { toast.error("Could not load engagement"); return; }
    const data = await res.json();
    setDetail({ files: data.files || [], messages: data.messages || [] });
    // Optimistically zero out unread
    setEngagements((prev) => prev.map((x) => x.id === e.id ? { ...x, unread_count: 0 } : x));
  }

  async function sendMessage() {
    if (!selected || !composer.trim()) return;
    setSending(true);
    try {
      const res = await fetch(FN_MSG, fetchOpts({ engagement_id: selected.id, body: composer.trim() }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setComposer("");
      // Refresh thread
      const r = await fetch(FN_ENG, fetchOpts({ action: "get", engagement_id: selected.id }));
      const d = await r.json();
      setDetail({ files: d.files || [], messages: d.messages || [] });
    } catch (e: any) {
      toast.error(e.message || "Message blocked");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <div className="font-serif text-lg">ProsperWise Pro Portal</div>
              {profile && (
                <div className="text-xs text-slate-300">
                  {profile.full_name}{profile.firm ? ` · ${profile.firm}` : ""}
                </div>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-slate-200 hover:text-white hover:bg-white/10">
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!selected ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-slate-900">Your Engagements</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-10 text-center text-slate-500">Loading…</div>
              ) : engagements.length === 0 ? (
                <div className="p-10 text-center text-slate-500">
                  No active engagements. Your ProsperWise contact will let you know when work is shared.
                </div>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {engagements.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => openEngagement(e)}
                        className="w-full text-left px-5 py-4 hover:bg-slate-50 transition flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 truncate">{e.title}</span>
                            <Badge variant="outline" className={`text-xs ${PILLAR_COLORS[e.pillar] || ""}`}>
                              {e.pillar}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {e.scope_label || e.scope_type} · {format(new Date(e.created_at), "PP")}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {(e.unread_count || 0) > 0 && (
                            <span className="bg-amber-500 text-white text-xs rounded-full px-2 py-0.5">
                              {e.unread_count}
                            </span>
                          )}
                          <span className="text-xs uppercase tracking-wider text-slate-400">{e.status}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <button
              onClick={() => { setSelected(null); setDetail(null); }}
              className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4"
            >
              <ChevronLeft className="h-4 w-4" /> Back to engagements
            </button>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="font-serif text-slate-900">{selected.title}</CardTitle>
                      <Badge variant="outline" className={PILLAR_COLORS[selected.pillar] || ""}>
                        {selected.pillar}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500">
                      {selected.scope_label || selected.scope_type} · {selected.status}
                    </div>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                      <MessageSquare className="h-4 w-4" /> Conversation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
                      {(detail?.messages.length ?? 0) === 0 ? (
                        <div className="text-sm text-slate-500 text-center py-6">No messages yet.</div>
                      ) : detail!.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex ${m.sender_type === "pro" ? "justify-end" : "justify-start"}`}
                        >
                          <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            m.sender_type === "pro"
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-900"
                          }`}>
                            <div className="whitespace-pre-wrap break-words">{m.body}</div>
                            <div className={`text-[10px] mt-1 ${m.sender_type === "pro" ? "text-slate-300" : "text-slate-500"}`}>
                              {m.sender_type === "pro" ? "You" : m.sender_type === "staff" ? "ProsperWise" : m.sender_type} · {format(new Date(m.created_at), "PP p")}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2 border-t pt-3">
                      <Textarea
                        rows={3}
                        placeholder="Write a reply… (avoid SIN, account numbers, balances)"
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                      />
                      <div className="flex justify-end">
                        <Button onClick={sendMessage} disabled={sending || !composer.trim()}>
                          {sending ? "Sending…" : "Send"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                      <FileText className="h-4 w-4" /> Shared Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!detail ? (
                      <div className="text-sm text-slate-500">Loading…</div>
                    ) : detail.files.length === 0 ? (
                      <div className="text-sm text-slate-500">No documents shared yet.</div>
                    ) : (
                      <ul className="space-y-2">
                        {detail.files.map((f: any) => (
                          <li key={f.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                            <span className="truncate">{f.name}</span>
                            <Button size="sm" variant="ghost" disabled>
                              <Download className="h-3 w-3" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[11px] text-slate-400 mt-3">
                      Download links activate once secure proxy is enabled.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
