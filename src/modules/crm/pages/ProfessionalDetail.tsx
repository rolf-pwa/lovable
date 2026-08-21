import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { AppLayout } from "@/shared/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Plus, ArrowLeft, Briefcase, Mail, Phone, Building2,
  TreesIcon, Home, User, ChevronDown, ChevronRight, Loader2, Eye,
  ListTodo, FolderOpen, MessageSquare, X, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/shared/hooks/useAuth";
import { format } from "date-fns";
import EngagementThreadButton from "@/modules/crm/components/EngagementThreadButton";
import { ShareVaultFilesControl } from "@/modules/crm/components/EngagementsPanel";
import { PageBreadcrumbs } from "@/shared/components/PageBreadcrumbs";

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
  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [links, setLinks] = useState<Record<string, { name: string | null }>>({});
  const [form, setForm] = useState({
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
        .select("*").eq("professional_id", id).neq("status", "revoked").order("created_at", { ascending: false }),
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

    // What's actually shared with this pro, at a glance.
    const linkIds = Array.from(new Set((e || []).map((r: any) => r.vault_share_link_id).filter(Boolean)));
    if (linkIds.length) {
      const { data: ls } = await (supabase as any).from("vault_share_links").select("id, name").in("id", linkIds);
      const linkMap: Record<string, { name: string | null }> = {};
      (ls || []).forEach((l: any) => { linkMap[l.id] = { name: l.name }; });
      setLinks(linkMap);
    } else {
      setLinks({});
    }

    // Open all scope-type groups by default
    setOpenGroups(new Set(["family", "household", "contact"]));
    setLoading(false);
  }, [id]);

  const loadTasks = useCallback(async () => {
    if (!id) return;
    setTasksLoading(true);
    const res = await supabase.functions.invoke("asana-service", {
      body: { action: "getTaggedTasks", professional_id: id },
    });
    setTasks(res.error || res.data?.error ? [] : (res.data?.data || []));
    setTasksLoading(false);
  }, [id]);

  useEffect(() => { load(); loadTasks(); }, [load, loadTasks]);

  async function togglePortal(enabled: boolean) {
    const { error } = await (supabase as any).from("professionals").update({ pro_portal_enabled: enabled }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(enabled ? "Pro Portal access enabled" : "Pro Portal access disabled");
    load();
  }

  async function grantAccess() {
    if (!form.scope_id) {
      toast.error("Select a scope");
      return;
    }
    setSaving(true);
    const { data: existing } = await (supabase as any)
      .from("professional_engagements")
      .select("id")
      .eq("professional_id", id)
      .eq("scope_type", form.scope_type)
      .eq("scope_id", form.scope_id)
      .neq("status", "revoked")
      .maybeSingle();
    if (existing) {
      setSaving(false);
      toast.info("Already has access here.");
      setOpen(false);
      setForm({ scope_type: "household", scope_id: "" });
      load();
      return;
    }
    const { error } = await (supabase as any).from("professional_engagements").insert({
      professional_id: id,
      title: "Portal access",
      pillar: "other",
      scope_type: form.scope_type,
      scope_id: form.scope_id,
      status: "active",
      started_at: new Date().toISOString(),
      created_by: user?.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Access granted");
    setOpen(false);
    setForm({ scope_type: "household", scope_id: "" });
    load();
  }

  async function revokeAccess(engagementId: string) {
    const { error } = await (supabase as any)
      .from("professional_engagements")
      .update({ status: "revoked" })
      .eq("id", engagementId);
    if (error) { toast.error(error.message); return; }
    toast.success("Access revoked");
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

  const scopeCount = engagements.length;
  const sharedFolderCount = engagements.filter((e) => e.vault_share_link_id).length;
  const openTaskCount = tasks.filter((t) => !t.completed).length;

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
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Open Tasks</p>
                <p className="text-2xl font-bold text-emerald-600">{tasksLoading ? "–" : openTaskCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Shared Folders</p>
                <p className="text-2xl font-bold">{sharedFolderCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Scopes</p>
                <p className="text-2xl font-bold">{scopeCount}</p>
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
                <CardTitle className="text-lg font-serif">Access</CardTitle>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-2" />Grant Access</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Grant Access</DialogTitle></DialogHeader>
                    <div className="space-y-3">
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
                      <div>
                        <label className="text-xs text-muted-foreground">Scope *</label>
                        <Select value={form.scope_id} onValueChange={(v) => setForm({ ...form, scope_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {scopeOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                      <Button onClick={grantAccess} disabled={saving}>Grant</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-3">
                {engagements.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No access granted yet. Link this professional to a family, household, or individual.
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
                                <span className="text-[10px] text-muted-foreground">
                                  granted {format(new Date(engs[0].created_at), "PP")}
                                </span>
                              </div>
                              {(() => {
                                const e = engs[0]; // canonical grant for this scope
                                const link = e.vault_share_link_id ? links[e.vault_share_link_id] : null;
                                return (
                                  <div className="px-3 py-2 space-y-2">
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <FolderOpen className="h-3 w-3 shrink-0" />
                                      {link ? (
                                        <span className="truncate">
                                          Shared folder: <span className="text-foreground font-medium">{link.name || "Untitled"}</span>
                                        </span>
                                      ) : "Nothing shared"}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <EngagementThreadButton engagementId={e.id} engagementTitle={`${pro.full_name} — ${name}`} />
                                      {scopeType !== "family" && (
                                        <ShareVaultFilesControl
                                          engagement={e}
                                          scopeType={scopeType}
                                          scopeId={scopeId}
                                          onChanged={load}
                                          label={name}
                                        />
                                      )}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                        onClick={() => revokeAccess(e.id)}
                                      >
                                        <X className="h-3 w-3 mr-1" /> Revoke
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </CardContent>
            </Card>

            {/* Tasks — a new engagement is a new task tagged to this pro. */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-serif flex items-center gap-2">
                  <ListTodo className="h-4 w-4" /> Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
                ) : tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No tasks tagged to this pro yet. Tag them from a task on the relevant household or contact page.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {tasks.map((t) => (
                      <li key={t.gid} className="py-2 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${t.completed ? "line-through text-muted-foreground" : ""}`}>
                            {t.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            {t.memberships?.[0]?.section?.name && <span>{t.memberships[0].section.name}</span>}
                            {t.due_on && <span>· Due {format(new Date(t.due_on), "PP")}</span>}
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${t.completed ? "" : "bg-emerald-100 text-emerald-800 border-emerald-200"}`}>
                          {t.completed ? "Done" : "Open"}
                        </Badge>
                        <a
                          href={`https://app.asana.com/0/0/${t.gid}/f`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
