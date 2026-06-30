import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Crown, ShieldCheck, Calendar, CheckSquare, Landmark, FolderLock, ClipboardList, MessageCircle, ScrollText, Megaphone } from "lucide-react";
import { PortalTerritory } from "@/components/portal/PortalTerritory";
import { PortalHoldingTank } from "@/components/portal/PortalHoldingTank";
import { PortalRequests } from "@/components/portal/PortalRequests";
import { PortalMeetings } from "@/components/portal/PortalMeetings";
import { PortalCharter } from "@/components/portal/PortalCharter";
import { PortalTasks } from "@/components/portal/PortalTasks";
import { PortalVault } from "@/components/portal/PortalVault";
import { PortalUpdates } from "@/components/portal/PortalUpdates";
import prosperwiseLogo from "@/assets/prosperwise-logo.png";

const ROLE_LABELS: Record<string, string> = {
  head_of_family: "Head of Family",
  head_of_household: "Head of Household",
  spouse: "Spouse",
  beneficiary: "Beneficiary",
  minor: "Minor",
};

const VfoPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("tasks");

  useEffect(() => {
    if (!token) {
      setError("Missing access token.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: res, error: err } = await supabase.functions.invoke("portal-validate", {
          body: { token },
        });
        if (err) throw err;
        if (!res || (res as any).error) throw new Error((res as any)?.error || "Invalid link");
        setData(res);
      } catch (e: any) {
        setError(e?.message || "Unable to load your Family Office.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

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

  const { contact, family, household, household_members = [], vineyard_accounts = [], storehouses = [], holding_tank = [], household_holding_tank = [], family_holding_tank = [], portal_requests = [], meetings = [], charter, corporations = [] } = data;

  // Gate: family must be VFO-enrolled
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

  const memberName = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
  const householdLabel = household?.label ? `${household.label} Household` : null;
  const familyName = family?.name || "Family";

  // Compute Total Family AUM
  const familyMemberIds = new Set<string>();
  let famVineyardTotal = 0;
  let famStorehouseTotal = 0;
  if (data.hierarchy?.households) {
    data.hierarchy.households.forEach((hh: any) => {
      (hh.members || []).forEach((m: any) => {
        familyMemberIds.add(m.id);
        famVineyardTotal += (m.vineyard_accounts || []).reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
        famStorehouseTotal += (m.storehouses || []).reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
      });
    });
  } else {
    famVineyardTotal = vineyard_accounts.reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
    famStorehouseTotal = storehouses.reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
  }
  const famHoldingTotal = (family_holding_tank.length ? family_holding_tank : household_holding_tank.length ? household_holding_tank : holding_tank)
    .reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0);
  const totalAum = famVineyardTotal + famStorehouseTotal + famHoldingTotal;

  const fmt = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

  const householdCount = data.hierarchy?.households?.length ?? (household ? 1 : 0);
  const memberCount = data.hierarchy?.households
    ? data.hierarchy.households.reduce((s: number, hh: any) => s + (hh.members?.length || 0), 0)
    : household_members.length + 1;

  const hasHoldingTank = holding_tank.length > 0 || household_holding_tank.length > 0 || family_holding_tank.length > 0;
  const displayHolding = family_holding_tank.length ? family_holding_tank : household_holding_tank.length ? household_holding_tank : holding_tank;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Premium Header */}
      <header className="border-b border-amber-500/20 bg-gradient-to-b from-[#0a0d12] to-[#05070a]">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <img src={prosperwiseLogo} alt="" className="h-10 w-10 opacity-90" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.25em] text-amber-500/80">Virtual Family Office</span>
                </div>
                <h1 className="font-serif text-3xl md:text-4xl text-foreground leading-tight mt-1 truncate">
                  {familyName}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {householdLabel && <span>{householdLabel}</span>}
                  {householdLabel && memberName && <span className="mx-2 text-amber-500/40">·</span>}
                  {memberName && (
                    <span>
                      {memberName}
                      {contact.family_role ? ` · ${ROLE_LABELS[contact.family_role] || contact.family_role}` : ""}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 border-l border-amber-500/15 pl-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Family AUM</p>
                <p className="font-serif text-2xl text-foreground">{fmt(totalAum)}</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Households</p>
                <p className="font-serif text-2xl text-foreground">{householdCount}</p>
              </div>
              <div className="hidden md:block">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Members</p>
                <p className="font-serif text-2xl text-foreground">{memberCount}</p>
              </div>
            </div>
          </div>
          {/* Gold rule */}
          <div className="mt-6 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
        </div>
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full bg-muted/30 border border-amber-500/15 flex-wrap h-auto">
                <TabsTrigger value="tasks" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                  <CheckSquare className="h-4 w-4" />
                  Action Items
                </TabsTrigger>
                <TabsTrigger value="meetings" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                  <Calendar className="h-4 w-4" />
                  Meetings
                </TabsTrigger>
                <TabsTrigger value="financials" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                  <Landmark className="h-4 w-4" />
                  Financials
                </TabsTrigger>
                <TabsTrigger value="vault" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                  <FolderLock className="h-4 w-4" />
                  Documents
                </TabsTrigger>
                <TabsTrigger value="requests" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                  <ClipboardList className="h-4 w-4" />
                  Requests
                </TabsTrigger>
                <TabsTrigger value="updates" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                  <Megaphone className="h-4 w-4" />
                  Updates
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tasks" className="mt-4">
                <PortalTasks portalToken={token!} clientName={memberName} contactId={contact.id} />
              </TabsContent>

              <TabsContent value="meetings" className="mt-4">
                <PortalMeetings meetings={meetings} />
              </TabsContent>

              <TabsContent value="financials" className="mt-4 space-y-4">
                {hasHoldingTank && <PortalHoldingTank accounts={displayHolding} />}
                <PortalTerritory
                  vineyardAccounts={vineyard_accounts}
                  storehouses={storehouses}
                  contact={contact}
                  family={family}
                  household={household}
                  householdMembers={household_members}
                  scopeLabel="Family Office"
                  portalToken={token!}
                  corporations={corporations}
                />
              </TabsContent>

              <TabsContent value="vault" className="mt-4">
                <PortalVault portalToken={token!} householdId={household?.id} />
              </TabsContent>

              <TabsContent value="requests" className="mt-4">
                <PortalRequests
                  requests={portal_requests}
                  contactId={contact.id}
                  contactName={memberName}
                  portalToken={token!}
                />
              </TabsContent>

              <TabsContent value="updates" className="mt-4">
                <PortalUpdates
                  governanceStatus={contact.governance_status ?? ""}
                  contactId={contact.id}
                  householdId={contact.household_id}
                  portalToken={token!}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <Card className="border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-500" />
                  <h3 className="font-serif text-sm text-foreground">Your Concierge</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your dedicated advisory team is one message away. Open a private request anytime.
                </p>
                <Button
                  variant="outline"
                  className="w-full border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                  onClick={() => setTab("requests")}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Contact Concierge
                </Button>
              </CardContent>
            </Card>

            {charter && (
              <Card className="border-border/60">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <ScrollText className="h-4 w-4 text-amber-500" />
                    <h3 className="font-serif text-sm text-foreground">Sovereignty Charter</h3>
                  </div>
                  <PortalCharter charterUrl={(charter as any).charter_document_url || null} />
                </CardContent>
              </Card>
            )}

            <div className="text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 pt-2">
              ProsperWise · Private Family Office
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default VfoPortal;
