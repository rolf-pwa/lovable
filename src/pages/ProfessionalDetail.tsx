import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, ArrowLeft, Briefcase, Mail, Phone, Building2,
  TreesIcon, Home, User, ChevronDown, ChevronRight, Loader2, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import EngagementThreadButton from "@/components/EngagementThreadButton";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";

const PILLARS = [
  { value: "tax", label: "Tax" },
  { value: "legal", label: "Legal" },
  { value: "insurance", label: "Insurance" },
  { value: "estate", label: "Estate" },
  { value: "philanthropy", label: "Philanthropy" },
  { value: "governance", label: "Governance" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  invited: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  completed: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  archived: "bg-muted text-muted-foreground",
  revoked: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

const SCOPE_ICON = { family: TreesIcon, household: Home, contact: User } as const;
const SCOPE_LABEL = { family: "Family", household: "Household", contact: "Individual" } as const;
const SCOPE_PATH = { family: "/families", household: "/households", contact: "/contacts" } as const;

export default function ProfessionalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pro, setPro] = useState<any>(null);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [scopeNames, setScopeNames] = useState<Record<string, string>>({});
  const [scopes, setScopes] = useState<{ families: any[]; households: any[]; contacts: any[] }>({
    families: [], households: [], contacts: [],
  });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [viewPortalLoading, setViewPortalLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    pillar: "tax",
    scope_type: "household",
    scope_id: "",
  });

  const handleViewProPortal = async () => {
    if (!pro?.pro_portal_enabled) {
      toast.error("Pro Portal access is not enabled for this professional.");
      return;
    }
    setViewPortalLoading(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("pro-portal-otp", {
        body: { action: "staff_impersonate", professional_id: pro.id },
      });
      if (error || !data?.session_token) {
        throw new Error(error?.message || data?.error || "Failed to start preview session");
      }
      // Seed pro portal session in localStorage, then open portal.
      localStorage.setItem("pro_portal_session", data.session_token);
      localStorage.setItem("pro_portal_expires", data.session_expires_at);
      localStorage.setItem("pro_portal_profile", JSON.stringify(data.professional));
      const url = `${window.location.origin}/pro-portal`;
      const newWindow = window.open(url, "_blank");
      if (!newWindow) window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || "Unable to open Pro Portal preview");
    } finally {
      setViewPortalLoading(false);
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: p }, { data: e }, { data: fams }, { data: hhs }, { data: cs }] = await Promise.all([
      (supabase as any).from("professionals").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("professional_engagements")
        .select("*").eq("professional_id", id).order("created_at", { ascending: false }),
      supabase.from("families").select("id, name").order("name"),
      supabase.from("households").select("id, label").order("label"),
      supabase.from("contacts").select("id, full_name").order("full_name").limit(500),
    ]);
    setPro(p);
    setEngagements(e || []);
    setScopes({ families: fams || [], households: hhs || [], contacts: cs || [] });

    // Resolve names for referenced scopes
    const map: Record<string, string> = {};
    (fams || []).forEach((f: any) => { map[`family:${f.id}`] = `${f.name} Family`; });
    (hhs || []).forEach((h: any) => { map[`household:${h.id}`] = h.label || "Household"; });
    (cs || []).forEach((c: any) => { map[`contact:${c.id}`] = c.full_name; });
    setScopeNames(map);

    // Open all scope-type groups by default
    setOpenGroups(new Set(["family", "household", "contact"]));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function togglePortal(enabled: boolean) {
    const { error } = await (supabase as any).from("professionals").update({ pro_portal_enabled: enabled }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(enabled ? "Pro Portal access enabled" : "Pro Portal access disabled");
    load();
  }

  async function createEngagement() {
    if (!form.title || !form.scope_id) {
      toast.error("Title and scope are required");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("professional_engagements").insert({
      professional_id: id,
      title: form.title,
      description: form.description,
      pillar: form.pillar,
      scope_type: form.scope_type,
      scope_id: form.scope_id,
      status: "draft",
      created_by: user?.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Engagement created");
    setOpen(false);
    setForm({ title: "", description: "", pillar: "tax", scope_type: "household", scope_id: "" });
    load();
  }

  async function updateStatus(engagementId: string, status: string) {
    const patch: any = { status };
    if (status === "active") patch.started_at = new Date().toISOString();
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await (supabase as any).from("professional_engagements").update(patch).eq("id", engagementId);
    if (error) { toast.error(error.message); return; }
    load();
  }

  const scopeOptions =
    form.scope_type === "family" ? scopes.families.map((f) => ({ id: f.id, label: f.name })) :
    form.scope_type === "household" ? scopes.households.map((h) => ({ id: h.id, label: h.label || "Household" })) :
    scopes.contacts.map((c) => ({ id: c.id, label: c.full_name }));

  // Directory: group engagements by scope_type -> scope_id
  const directory = useMemo(() => {
    const byType: Record<string, Record<string, any[]>> = { family: {}, household: {}, contact: {} };
    engagements.forEach((e) => {
      const t = e.scope_type as keyof typeof byType;
      if (!byType[t]) byType[t] = {};
      if (!byType[t][e.scope_id]) byType[t][e.scope_id] = [];
      byType[t][e.scope_id].push(e);
    });
    return byType;
  }, [engagements]);

  const toggleGroup = (k: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const activeCount = engagements.filter((e) => e.status === "active").length;
  const completedCount = engagements.filter((e) => e.status === "completed").length;

  if (loading) {
    return <AppLayout><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppLayout>;
  }

  if (!pro) {
    return (
      <AppLayout>
        <div className="text-center py-24">
          <p className="text-muted-foreground">Professional not found.</p>
          <Button variant="link" onClick={() => navigate("/professionals")}>Back to Pros</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-8 space-y-6">
        <PageBreadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Pros", href: "/professionals" },
            { label: pro.full_name },
          ]}
        />

        {/* Header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/professionals")}
                  className="shrink-0 -ml-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-16 w-16 shrink-0 rounded-full bg-sanctuary-green text-sanctuary-bronze flex items-center justify-center">
                  <Briefcase className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold truncate">{pro.full_name}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {pro.professional_type.replace("_", " ")}
                    </Badge>
                    {pro.credentials && (
                      <Badge variant="outline" className="text-[10px] uppercase">{pro.credentials}</Badge>
                    )}
                    {pro.firm && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {pro.firm}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    {pro.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {pro.email}</span>}
                    {pro.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {pro.phone}</span>}
                  </div>
                </div>
              </div>
              <Button
                className="bg-sanctuary-green text-sanctuary-bronze hover:bg-sanctuary-green/90 gap-1.5 shrink-0"
                onClick={handleViewProPortal}
                disabled={viewPortalLoading || !pro?.pro_portal_enabled}
                title={pro?.pro_portal_enabled ? "Open Pro Portal login" : "Pro Portal not enabled"}
              >
                {viewPortalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                View Pro Portal
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Active</p>
                <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Completed</p>
                <p className="text-2xl font-bold">{completedCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total</p>
                <p className="text-2xl font-bold">{engagements.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-6 items-start">
          {/* Sidebar */}
          <div className="w-80 shrink-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-serif">Pro Portal Access</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Login enabled</p>
                    <p className="text-xs text-muted-foreground">
                      {pro.pro_portal_enabled ? "Can sign in via OTP or Google" : "No portal access"}
                    </p>
                  </div>
                  <Switch checked={!!pro.pro_portal_enabled} onCheckedChange={togglePortal} />
                </div>
                {pro.last_login_at && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-3">
                    Last login: {format(new Date(pro.last_login_at), "PPp")}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-serif">Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {pro.email && (
                  <a href={`mailto:${pro.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                    <Mail className="h-3.5 w-3.5" /> {pro.email}
                  </a>
                )}
                {pro.phone && (
                  <a href={`tel:${pro.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                    <Phone className="h-3.5 w-3.5" /> {pro.phone}
                  </a>
                )}
                {pro.firm && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" /> {pro.firm}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Directory */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-serif">Client Directory</CardTitle>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-2" />New Engagement</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>New Engagement</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Title *</label>
                        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. 2026 Tax Filing" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Pillar</label>
                          <Select value={form.pillar} onValueChange={(v) => setForm({ ...form, pillar: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PILLARS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Scope Type</label>
                          <Select value={form.scope_type} onValueChange={(v) => setForm({ ...form, scope_type: v, scope_id: "" })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="family">Family</SelectItem>
                              <SelectItem value="household">Household</SelectItem>
                              <SelectItem value="contact">Contact</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Scope *</label>
                        <Select value={form.scope_id} onValueChange={(v) => setForm({ ...form, scope_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {scopeOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Description</label>
                        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                      <Button onClick={createEngagement} disabled={saving}>Create</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-3">
                {engagements.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No client engagements yet. Link this professional to a family, household, or individual.
                  </p>
                )}
                {(["family", "household", "contact"] as const).map((scopeType) => {
                  const group = directory[scopeType];
                  const entries = Object.entries(group);
                  if (entries.length === 0) return null;
                  const Icon = SCOPE_ICON[scopeType];
                  const isOpen = openGroups.has(scopeType);
                  return (
                    <Collapsible key={scopeType} open={isOpen} onOpenChange={() => toggleGroup(scopeType)}>
                      <CollapsibleTrigger className="w-full flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 hover:bg-muted/50">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <Icon className="h-4 w-4 text-sanctuary-bronze" />
                        <span className="text-sm font-medium">{SCOPE_LABEL[scopeType]}s</span>
                        <Badge variant="outline" className="ml-auto text-[10px]">{entries.length}</Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2 pl-2 space-y-2">
                        {entries.map(([scopeId, engs]) => {
                          const name = scopeNames[`${scopeType}:${scopeId}`] || "Unknown";
                          return (
                            <div key={scopeId} className="rounded-md border border-border">
                              <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                                <Link
                                  to={`${SCOPE_PATH[scopeType]}/${scopeId}`}
                                  className="text-sm font-medium hover:underline flex items-center gap-2"
                                >
                                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                  {name}
                                </Link>
                                <Badge variant="outline" className="text-[10px]">
                                  {engs.length} engagement{engs.length !== 1 ? "s" : ""}
                                </Badge>
                              </div>
                              <ul className="divide-y divide-border">
                                {engs.map((e) => (
                                  <li key={e.id} className="px-3 py-2 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium truncate">{e.title}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] uppercase text-muted-foreground">{e.pillar}</span>
                                        <span className="text-[10px] text-muted-foreground">·</span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {format(new Date(e.created_at), "PP")}
                                        </span>
                                      </div>
                                    </div>
                                    <Select value={e.status} onValueChange={(v) => updateStatus(e.id, v)}>
                                      <SelectTrigger className={`h-7 w-28 text-xs ${STATUS_COLORS[e.status] || ""}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {["draft", "invited", "active", "completed", "archived", "revoked"].map((s) => (
                                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <EngagementThreadButton engagementId={e.id} engagementTitle={e.title} />
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
