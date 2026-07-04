import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import {
  Loader2, Crown, ShieldCheck, Calendar, CheckSquare, Landmark, FolderLock,
  ClipboardList, MessageCircle, ScrollText, Megaphone, Home, Users, ChevronLeft,
  ChevronDown, ChevronRight, ArrowRight, Building2,
} from "lucide-react";
import { PortalTerritory } from "@/components/portal/PortalTerritory";
import { PortalHoldingTank } from "@/components/portal/PortalHoldingTank";
import { PortalRequests } from "@/components/portal/PortalRequests";
import { PortalMeetings } from "@/components/portal/PortalMeetings";
import { PortalCharter } from "@/components/portal/PortalCharter";
import { PortalTasks } from "@/components/portal/PortalTasks";
import { PortalVault } from "@/components/portal/PortalVault";
import { PortalUpdates } from "@/components/portal/PortalUpdates";
import { PortalGeorgiaChat } from "@/components/portal/PortalGeorgiaChat";
import { PortalYourTeam } from "@/components/portal/PortalYourTeam";
import { PortalProfessionals } from "@/components/portal/PortalProfessionals";
import { PortalDynamicLinks } from "@/components/portal/PortalDynamicLinks";

import { Briefcase } from "lucide-react";
import prosperwiseLogo from "@/assets/prosperwise-logo.png";

const ROLE_LABELS: Record<string, string> = {
  head_of_family: "Head of Family",
  head_of_household: "Head of Household",
  spouse: "Spouse",
  beneficiary: "Beneficiary",
  minor: "Minor",
};

type ViewLevel = "family" | "household" | "individual";
interface DrilldownState { level: ViewLevel; householdId?: string; memberId?: string; }

const fmt = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

const VfoPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("tasks");
  const [drilldown, setDrilldown] = useState<DrilldownState>({ level: "individual" });
  const [expandedCorps, setExpandedCorps] = useState<Set<string>>(new Set());
  const [georgiaOpen, setGeorgiaOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);


  useEffect(() => {
    if (!token) { setError("Missing access token."); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: res, error: err } = await supabase.functions.invoke("portal-validate", { body: { token } });
        if (cancelled) return;
        if (err) throw err;
        if (!res || (res as any).error) throw new Error((res as any)?.error || "Invalid link");
        setData(res);
        // Default landing: family if available, otherwise household, otherwise individual
        const lvl = (res as any).hierarchy?.level;
        if (lvl === "family") setDrilldown({ level: "family" });
        else if (lvl === "household") setDrilldown({ level: "household", householdId: (res as any).household?.id });
        else setDrilldown({ level: "individual" });
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Unable to load your Family Office.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const refreshData = async () => {
    if (!token) return;
    try {
      const resp = await supabase.functions.invoke("portal-validate", { body: { token } });
      if (!resp.error && !resp.data?.error) setData(resp.data);
    } catch {}
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-amber-500/20 bg-card">
          <CardContent className="p-8 text-center space-y-3">
            <Crown className="h-8 w-8 text-amber-500 mx-auto" />
            <h1 className="font-serif text-xl text-foreground">Family Office unavailable</h1>
            <p className="text-sm text-muted-foreground">{error || "Please contact your advisor."}</p>
            {token && (
              <Button variant="outline" asChild>
                <Link to={`/portal/${token}`}>Open standard portal</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const {
    contact, family, household, household_members = [],
    vineyard_accounts = [], storehouses = [],
    holding_tank = [], household_holding_tank = [], family_holding_tank = [],
    portal_requests = [], meetings = [], charter, corporations = [], hierarchy,
    professionals = [], engagements = [], insurance_policies = [],
  } = data;

  if (!family?.vfo_enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-amber-500/20 bg-card">
          <CardContent className="p-8 text-center space-y-3">
            <Crown className="h-8 w-8 text-amber-500 mx-auto" />
            <h1 className="font-serif text-xl text-foreground">Not yet enrolled</h1>
            <p className="text-sm text-muted-foreground">
              The Virtual Family Office is reserved for select families. Your advisor can enable it for your household.
            </p>
            <Button variant="outline" asChild>
              <Link to={`/portal/${token}`}>Continue to your portal</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const familyName = family?.name || "Family";
  const hierarchyLevel = hierarchy?.level || "individual";
  const portalToken = token!;

  const currentHousehold = drilldown.householdId
    ? hierarchy?.households?.find((h: any) => h.id === drilldown.householdId)
    : null;
  const currentMember = drilldown.memberId
    ? (currentHousehold?.members || hierarchy?.members || []).find((m: any) => m.id === drilldown.memberId)
    : null;

  // ── Family AUM (all assets across hierarchy) ──
  let famVineyard = 0, famStorehouse = 0;
  if (hierarchy?.households) {
    hierarchy.households.forEach((hh: any) => {
      (hh.members || []).forEach((m: any) => {
        famVineyard += (m.vineyard_accounts || []).reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
        famStorehouse += (m.storehouses || []).reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
      });
    });
  } else {
    famVineyard = vineyard_accounts.reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
    famStorehouse = storehouses.reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
  }
  const famHolding = (family_holding_tank.length ? family_holding_tank
    : household_holding_tank.length ? household_holding_tank : holding_tank)
    .reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
  const totalAum = famVineyard + famStorehouse + famHolding;

  const householdCount = hierarchy?.households?.length ?? (household ? 1 : 0);
  const memberCount = hierarchy?.households
    ? hierarchy.households.reduce((s: number, hh: any) => s + (hh.members?.length || 0), 0)
    : household_members.length + 1;

  // ── Aggregate scoped assets ──
  const aggregateAssetsAtLevel = (level: "family" | "household", householdId?: string) => {
    const v: any[] = [], s: any[] = [];
    if (level === "family") {
      (hierarchy?.households || []).forEach((hh: any) => {
        (hh.members || []).forEach((m: any) => {
          (m.vineyard_accounts || []).filter((a: any) => a.visibility_scope === "family_shared").forEach((a: any) => v.push(a));
          (m.storehouses || []).filter((a: any) => a.visibility_scope === "family_shared").forEach((a: any) => s.push(a));
        });
      });
    } else {
      const members = householdId
        ? (hierarchy?.households?.find((h: any) => h.id === householdId)?.members || [])
        : (hierarchy?.members || []);
      const selfInMembers = members.some((m: any) => m.id === contact.id);
      if (!selfInMembers) {
        vineyard_accounts.filter((a: any) => a.visibility_scope === "household_shared" || a.visibility_scope === "family_shared").forEach((a: any) => v.push(a));
        storehouses.filter((a: any) => a.visibility_scope === "household_shared" || a.visibility_scope === "family_shared").forEach((a: any) => s.push(a));
      }
      members.forEach((m: any) => {
        (m.vineyard_accounts || []).filter((a: any) => a.visibility_scope === "household_shared" || a.visibility_scope === "family_shared").forEach((a: any) => v.push(a));
        (m.storehouses || []).filter((a: any) => a.visibility_scope === "household_shared" || a.visibility_scope === "family_shared").forEach((a: any) => s.push(a));
      });
    }
    return { vineyard: v, storehouses: s };
  };

  // ── Header subtitle ──
  const subtitle = (() => {
    if (drilldown.level === "family") return "Family Overview";
    if (drilldown.level === "household") {
      const label = currentHousehold?.label || household?.label || "";
      return label ? `${label} Household` : "Household";
    }
    const m = currentMember || contact;
    const name = `${m.first_name || ""} ${m.last_name || ""}`.trim();
    return `${name}${m.family_role ? ` · ${ROLE_LABELS[m.family_role] || m.family_role}` : ""}`;
  })();

  // ── Breadcrumb ──
  const renderBreadcrumb = () => {
    const crumbs: Array<{ label: string; onClick?: () => void }> = [];
    if (hierarchyLevel === "family") {
      crumbs.push({
        label: familyName,
        onClick: drilldown.level !== "family" ? () => setDrilldown({ level: "family" }) : undefined,
      });
    }
    if (drilldown.level === "household" || drilldown.level === "individual") {
      const label = currentHousehold?.label || household?.label;
      if (label) {
        crumbs.push({
          label: `${label} Household`,
          onClick: drilldown.level === "individual"
            ? () => setDrilldown({ level: "household", householdId: drilldown.householdId || household?.id })
            : undefined,
        });
      }
    }
    if (drilldown.level === "individual") {
      const m = currentMember || contact;
      crumbs.push({ label: `${m.first_name || ""} ${m.last_name || ""}`.trim() });
    }
    if (crumbs.length <= 1) return null;
    return (
      <nav aria-label="breadcrumb" className="mb-5 flex items-center gap-2 text-xs">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3 w-3 text-amber-500/40" />}
              {last || !c.onClick ? (
                <span className="text-foreground font-medium tracking-wide">{c.label}</span>
              ) : (
                <button
                  onClick={c.onClick}
                  className="text-muted-foreground hover:text-amber-500 transition-colors uppercase tracking-wider"
                >
                  {c.label}
                </button>
              )}
            </div>
          );
        })}
      </nav>
    );
  };

  // ── Family View ──
  const renderFamilyView = () => {
    const households = hierarchy?.households || [];
    const fa = aggregateAssetsAtLevel("family");
    const totalShared = fa.vineyard.reduce((s, a: any) => s + (Number(a.current_value) || 0), 0)
      + fa.storehouses.reduce((s, a: any) => s + (Number(a.current_value) || 0), 0);

    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-transparent">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                  <Crown className="h-5 w-5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h2 className="font-serif text-lg text-foreground">{familyName}</h2>
                  <p className="text-xs text-muted-foreground">
                    {households.length} household{households.length !== 1 ? "s" : ""} · {memberCount} members
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Family-Shared</p>
                  <p className="font-serif text-xl text-amber-500">{fmt(totalShared)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {households.map((hh: any) => {
              const hhTotal = (hh.members || []).reduce((sum: number, m: any) => {
                return sum
                  + (m.vineyard_accounts || []).reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0)
                  + (m.storehouses || []).reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
              }, 0);
              return (
                <button
                  key={hh.id}
                  onClick={() => setDrilldown({ level: "household", householdId: hh.id })}
                  className="text-left rounded-lg border border-amber-500/15 bg-card p-5 hover:border-amber-500/40 hover:bg-amber-500/[0.03] transition-colors group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Home className="h-4 w-4 text-amber-500" />
                      <h3 className="font-serif text-foreground">{hh.label} Household</h3>
                    </div>
                    <ArrowRight className="h-4 w-4 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {hh.address && <p className="text-xs text-muted-foreground mb-3">{hh.address}</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {(hh.members || []).length} member{(hh.members || []).length !== 1 ? "s" : ""}
                    </span>
                    <span className="font-serif text-foreground">{fmt(hhTotal)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(hh.members || []).slice(0, 5).map((m: any) => (
                      <span key={m.id} className="rounded-full bg-amber-500/5 border border-amber-500/15 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {m.first_name}
                      </span>
                    ))}
                    {(hh.members || []).length > 5 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        +{(hh.members || []).length - 5}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4">
          {family_holding_tank.length > 0 && <PortalHoldingTank accounts={family_holding_tank} />}
          <PortalTerritory
            vineyardAccounts={fa.vineyard}
            storehouses={fa.storehouses}
            insurancePolicies={insurance_policies}
            contact={contact}
            family={family}
            household={null}
            householdMembers={[]}
            scopeLabel="Family Shared"
            portalToken={portalToken}
            onScopeChange={refreshData}
          />
          <PortalYourTeam professionals={professionals} engagements={engagements} />
        </aside>
      </div>
    );
  };

  // ── Household View ──
  const renderHouseholdView = () => {
    const members = currentHousehold?.members || hierarchy?.members || [];
    const hhLabel = currentHousehold?.label || household?.label || "Household";
    const hhAssets = aggregateAssetsAtLevel("household", drilldown.householdId);

    const orderedMembers = [
      { ...contact, _isSelf: true },
      ...members.filter((m: any) => m.id !== contact.id).map((m: any) => ({ ...m, _isSelf: false })),
    ].sort((a: any, b: any) => {
      const order: Record<string, number> = { head_of_family: 0, head_of_household: 1, spouse: 2, beneficiary: 3, minor: 4 };
      return (order[a.family_role] ?? 4) - (order[b.family_role] ?? 4);
    });

    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-transparent">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <Home className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h2 className="font-serif text-lg text-foreground">{hhLabel} Household</h2>
                <p className="text-xs text-muted-foreground">{orderedMembers.length} member{orderedMembers.length !== 1 ? "s" : ""}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {orderedMembers.map((m: any) => {
              const isSelf = m._isSelf;
              const mVineyard = isSelf ? vineyard_accounts : (m.vineyard_accounts || []);
              const mStorehouses = isSelf ? storehouses : (m.storehouses || []);
              const mTotal = mVineyard.reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0)
                + mStorehouses.reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
              return (
                <button
                  key={m.id}
                  onClick={() => setDrilldown({ level: "individual", householdId: drilldown.householdId, memberId: isSelf ? undefined : m.id })}
                  className={`text-left rounded-lg p-4 transition-colors group ${
                    isSelf
                      ? "border border-amber-500/40 bg-amber-500/[0.06] hover:bg-amber-500/[0.1]"
                      : "border border-amber-500/15 bg-card hover:border-amber-500/40 hover:bg-amber-500/[0.03]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isSelf ? "bg-amber-500/20" : "bg-muted"}`}>
                        {isSelf ? <img src={prosperwiseLogo} alt="" className="h-4 w-4" /> : <Users className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.first_name} {m.last_name || ""}</p>
                        <p className="text-xs text-muted-foreground">
                          {ROLE_LABELS[m.family_role] || m.family_role}{isSelf ? " · You" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-serif text-foreground">{fmt(mTotal)}</span>
                      <ArrowRight className="h-4 w-4 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {corporations.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-amber-500/70" />
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Corporate Entities</h3>
              </div>
              {corporations.map((corp: any) => {
                const TYPE_LABELS: Record<string, string> = { opco: "Operating Co", holdco: "Holding Co", trust: "Trust", partnership: "Partnership", other: "Entity" };
                const isExpanded = expandedCorps.has(corp.id);
                return (
                  <button
                    key={corp.id}
                    onClick={() => setExpandedCorps(prev => { const n = new Set(prev); n.has(corp.id) ? n.delete(corp.id) : n.add(corp.id); return n; })}
                    className="w-full text-left rounded-lg border border-amber-500/15 bg-card p-4 space-y-2 hover:border-amber-500/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
                          <Building2 className="h-4 w-4 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{corp.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {TYPE_LABELS[corp.corporation_type] || corp.corporation_type}
                            {corp.jurisdiction ? ` · ${corp.jurisdiction}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-foreground">{fmt(corp.total_assets || 0)}</span>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                    {isExpanded && (corp.vineyard_accounts || []).length > 0 && (
                      <div className="pl-11 space-y-1 border-t border-amber-500/10 pt-2">
                        {corp.vineyard_accounts.map((acc: any) => (
                          <div key={acc.id} className="flex items-center justify-between text-xs">
                            <span className="text-foreground/80">{acc.account_name}</span>
                            <span className="font-medium text-foreground">{fmt(Number(acc.current_value) || 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {household_holding_tank.length > 0 && <PortalHoldingTank accounts={household_holding_tank} />}
          <PortalTerritory
            vineyardAccounts={hhAssets.vineyard}
            storehouses={hhAssets.storehouses}
            insurancePolicies={insurance_policies}
            contact={contact}
            family={family}
            household={currentHousehold || household}
            householdMembers={[]}
            scopeLabel="Household Shared"
            portalToken={portalToken}
            onScopeChange={refreshData}
            corporations={corporations}
          />
          <PortalYourTeam professionals={professionals} engagements={engagements} />
        </aside>
      </div>
    );
  };

  // ── Individual View ──
  const renderIndividualView = () => {
    const isSelf = !currentMember;
    const ind = isSelf
      ? { vineyardAccounts: vineyard_accounts, memberStorehouses: storehouses, name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim() }
      : { vineyardAccounts: currentMember.vineyard_accounts || [], memberStorehouses: currentMember.storehouses || [], name: `${currentMember.first_name || ""} ${currentMember.last_name || ""}`.trim() };
    const hasHolding = isSelf && holding_tank.length > 0;
    const hasTerritory = (ind.vineyardAccounts.length + ind.memberStorehouses.length) > 0;
    const hasFinancials = hasHolding || hasTerritory;

    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full bg-muted/30 border border-amber-500/15 flex-wrap h-auto">
              <TabsTrigger value="tasks" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                <CheckSquare className="h-4 w-4" />Action Items
              </TabsTrigger>
              <TabsTrigger value="meetings" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                <Calendar className="h-4 w-4" />Meetings
              </TabsTrigger>
              {hasFinancials && (
                <TabsTrigger value="financials" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                  <Landmark className="h-4 w-4" />Financials
                </TabsTrigger>
              )}
              {isSelf && (
                <TabsTrigger value="vault" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                  <FolderLock className="h-4 w-4" />Documents
                </TabsTrigger>
              )}
              {professionals.length > 0 && (
                <TabsTrigger value="team" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                  <Briefcase className="h-4 w-4" />Professionals
                </TabsTrigger>
              )}
              <TabsTrigger value="updates" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                <Megaphone className="h-4 w-4" />Updates
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="mt-4">
              {isSelf ? (
                <PortalTasks portalToken={portalToken} clientName={ind.name} contactId={contact.id} />
              ) : (
                <div className="rounded-lg border border-amber-500/15 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                  Task view is only available on your own profile.
                </div>
              )}
            </TabsContent>

            <TabsContent value="meetings" className="mt-4">
              <PortalMeetings meetings={meetings} />
            </TabsContent>

            {hasFinancials && (
              <TabsContent value="financials" className="mt-4 space-y-4">
                {hasHolding && <PortalHoldingTank accounts={holding_tank} defaultCollapsed />}
                {hasTerritory && (
                  <PortalTerritory
                    vineyardAccounts={ind.vineyardAccounts}
                    storehouses={ind.memberStorehouses}
                    insurancePolicies={insurance_policies}
                    contact={isSelf ? contact : currentMember}
                    family={family}
                    household={household}
                    householdMembers={household_members}
                    scopeLabel={isSelf ? "My Territory" : `${currentMember?.first_name || ""}'s Territory`}
                    portalToken={portalToken}
                    onScopeChange={refreshData}
                    corporations={corporations}
                    section="all"
                    defaultCollapsed
                  />
                )}
              </TabsContent>
            )}

            {isSelf && (
              <TabsContent value="vault" className="mt-4">
                <PortalVault portalToken={portalToken} householdId={household?.id} />
              </TabsContent>
            )}


            <TabsContent value="updates" className="mt-4">
              <PortalUpdates
                governanceStatus={contact.governance_status ?? ""}
                contactId={contact.id}
                householdId={contact.household_id}
                portalToken={portalToken}
              />
            </TabsContent>

            {professionals.length > 0 && (
              <TabsContent value="team" className="mt-4">
                <PortalProfessionals professionals={professionals} engagements={engagements} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        <aside className="space-y-4">
          <Card className="border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-500" />
                <h3 className="font-serif text-sm text-foreground">Your Concierge</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Chat with Georgia for instant help, or open a private request for your advisory team.
              </p>
              <Button
                className="w-full bg-amber-500 text-amber-950 hover:bg-amber-400"
                onClick={() => setGeorgiaOpen(true)}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Ask Georgia
              </Button>
              <Button
                variant="outline"
                className="w-full border-amber-500/30 text-amber-600 hover:bg-amber-500/10 justify-between"
                onClick={() => setRequestsOpen(true)}
              >
                <span className="flex items-center">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Requests
                </span>
                {(() => {
                  const openCount = (portal_requests || []).filter((r: any) => r.status !== "resolved").length;
                  return openCount > 0 ? (
                    <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 border-amber-500/30">{openCount} open</Badge>
                  ) : null;
                })()}
              </Button>
            </CardContent>
          </Card>


          {isSelf && <PortalDynamicLinks />}


          <PortalYourTeam
            professionals={professionals}
            engagements={engagements}
            onSelect={professionals.length > 0 ? () => setTab("team") : undefined}
          />
        </aside>
      </div>
    );
  };

  const renderContent = () => {
    if (drilldown.level === "family" && hierarchyLevel === "family") return renderFamilyView();
    if (drilldown.level === "household") return renderHouseholdView();
    return renderIndividualView();
  };

  // ── Up-level back affordance ──
  const upLevel = () => {
    if (drilldown.level === "individual" && (drilldown.householdId || household)) {
      setDrilldown({ level: "household", householdId: drilldown.householdId || household?.id });
    } else if (drilldown.level === "household" && hierarchyLevel === "family") {
      setDrilldown({ level: "family" });
    }
  };
  const canUp =
    (drilldown.level === "individual" && (drilldown.householdId || household)) ||
    (drilldown.level === "household" && hierarchyLevel === "family");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Premium Header */}
      <header className="border-b border-primary-foreground/10 bg-primary">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <img src={prosperwiseLogo} alt="" className="h-10 w-10 opacity-90" />
              <div className="min-w-0">
                <h1 className="font-serif text-3xl md:text-4xl text-primary-foreground leading-tight truncate">
                  {familyName} Family Office
                </h1>
                <p className="text-sm text-primary-foreground/70 mt-1">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-6 border-l border-primary-foreground/15 pl-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-primary-foreground/60">Total Family AUM</p>
                <p className="font-serif text-2xl text-primary-foreground">{fmt(totalAum)}</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] uppercase tracking-wider text-primary-foreground/60">Households</p>
                <p className="font-serif text-2xl text-primary-foreground">{householdCount}</p>
              </div>
              <div className="hidden md:block">
                <p className="text-[10px] uppercase tracking-wider text-primary-foreground/60">Members</p>
                <p className="font-serif text-2xl text-primary-foreground">{memberCount}</p>
              </div>
            </div>
          </div>
          <div className="mt-6 h-px bg-gradient-to-r from-transparent via-primary-foreground/30 to-transparent" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-4 mb-1">
          {renderBreadcrumb()}
          {canUp && (
            <button
              onClick={upLevel}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-500 transition-colors mb-5"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}
        </div>
        {renderContent()}

        <div className="text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60 pt-12 pb-2">
          ProsperWise · Private Family Office
        </div>
      </main>

      <PortalGeorgiaChat
        open={georgiaOpen}
        onOpenChange={setGeorgiaOpen}
        contactName={`${contact?.first_name || ""} ${contact?.last_name || ""}`.trim()}
        contactId={contact?.id}
        portalToken={portalToken}
        onRequestSubmitted={refreshData}
      />

      <Dialog open={requestsOpen} onOpenChange={setRequestsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-500" />
              Your Requests
            </DialogTitle>
          </DialogHeader>
          <PortalRequests
            requests={portal_requests}
            contactId={contact.id}
            contactName={`${contact.first_name || ""} ${contact.last_name || ""}`.trim()}
            portalToken={portalToken}
            onUpdate={refreshData}
          />
        </DialogContent>
      </Dialog>
    </div>

  );
};

export default VfoPortal;
