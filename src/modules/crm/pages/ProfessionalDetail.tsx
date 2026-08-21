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
  ArrowLeft, Briefcase, Mail, Phone, Building2,
  Home, User, ChevronDown, ChevronRight, Loader2, Eye, FolderOpen, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { PageBreadcrumbs } from "@/shared/components/PageBreadcrumbs";

// Directory only — pros are linked to households (or, rarely, a single
// contact) from that household/contact's own page. Family-level linking
// doesn't happen in practice, so it isn't a grouping here.
const SCOPE_ICON = { household: Home, contact: User } as const;
const SCOPE_LABEL = { household: "Household", contact: "Individual" } as const;
const SCOPE_PATH = { household: "/households", contact: "/contacts" } as const;

export default function ProfessionalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pro, setPro] = useState<any>(null);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [scopeNames, setScopeNames] = useState<Record<string, string>>({});
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [viewPortalLoading, setViewPortalLoading] = useState(false);
  const [links, setLinks] = useState<Record<string, { name: string | null; drive_id: string | null }>>({});

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
    const [{ data: p }, { data: e }, { data: hhs }, { data: cs }] = await Promise.all([
      (supabase as any).from("professionals").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("professional_engagements")
        .select("*").eq("professional_id", id).neq("status", "revoked").in("scope_type", ["household", "contact"])
        .order("created_at", { ascending: false }),
      supabase.from("households").select("id, label").order("label"),
      supabase.from("contacts").select("id, full_name").order("full_name").limit(500),
    ]);
    setPro(p);
    setEngagements(e || []);

    // Resolve names for referenced scopes
    const map: Record<string, string> = {};
    (hhs || []).forEach((h: any) => { map[`household:${h.id}`] = h.label || "Household"; });
    (cs || []).forEach((c: any) => { map[`contact:${c.id}`] = c.full_name; });
    setScopeNames(map);

    // What's actually shared with this pro, at a glance.
    const linkIds = Array.from(new Set((e || []).map((r: any) => r.vault_share_link_id).filter(Boolean)));
    if (linkIds.length) {
      const { data: ls } = await (supabase as any).from("vault_share_links").select("id, name, drive_id").in("id", linkIds);
      const linkMap: Record<string, { name: string | null; drive_id: string | null }> = {};
      (ls || []).forEach((l: any) => { linkMap[l.id] = { name: l.name, drive_id: l.drive_id }; });
      setLinks(linkMap);
    } else {
      setLinks({});
    }

    setOpenGroups(new Set(["household", "contact"]));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function togglePortal(enabled: boolean) {
    const { error } = await (supabase as any).from("professionals").update({ pro_portal_enabled: enabled }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(enabled ? "Pro Portal access enabled" : "Pro Portal access disabled");
    load();
  }

  // Directory: group engagements by scope_type -> scope_id
  const directory = useMemo(() => {
    const byType: Record<string, Record<string, any[]>> = { household: {}, contact: {} };
    engagements.forEach((e) => {
      const t = e.scope_type as keyof typeof byType;
      if (!byType[t]) return;
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

  const householdCount = engagements.length;
  const sharedFolderCount = engagements.filter((e) => e.vault_share_link_id).length;

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

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Access Granted</p>
                <p className="text-2xl font-bold">{householdCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Shared Folders</p>
                <p className="text-2xl font-bold">{sharedFolderCount}</p>
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
            {/* Directory — read-only. Access is granted/revoked and folders are
                shared from the household's own Pros tab, not from here. */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-serif">Households</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {engagements.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Not linked to any household yet. Use "Link a Pro" from a household's Pros tab.
                  </p>
                )}
                {(["household", "contact"] as const).map((scopeType) => {
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
                          const e = engs[0]; // canonical grant for this scope
                          const link = e.vault_share_link_id ? links[e.vault_share_link_id] : null;
                          return (
                            <Link
                              key={scopeId}
                              to={`${SCOPE_PATH[scopeType]}/${scopeId}`}
                              className="block rounded-md border border-border px-3 py-2 hover:border-accent/40 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium flex items-center gap-2">
                                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                  {name}
                                </span>
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              </div>
                              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                <FolderOpen className="h-3 w-3 shrink-0" />
                                {link ? (
                                  <span className="truncate">
                                    Shared folder: <span className="text-foreground font-medium">{link.name || "Untitled"}</span>
                                  </span>
                                ) : "Nothing shared"}
                              </div>
                            </Link>
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
