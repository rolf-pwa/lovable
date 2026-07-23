import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { Progress } from "@/components/ui/progress";
import { HouseholdTaskRollup } from "@/components/HouseholdTaskRollup";
import { HoldingTank } from "@/components/HoldingTank";
import { VaultView } from "@/pages/Vault";
import { CharterRatificationTile } from "@/components/CharterRatificationTile";
import EngagementsPanel from "@/components/EngagementsPanel";
import { ProsPanel } from "@/components/ProsPanel";
import { AddCompanyDialog } from "@/components/AddCompanyDialog";
import {
  Home,
  User,
  Crown,
  Shield,
  Baby,
  Loader2,
  Grape,
  Landmark,
  Castle,
  Sword,
  Wheat,
  Lock,
  ArrowLeft,
  MapPin,
  Building2,
  BarChart3,
  ChevronDown,
  ShieldCheck,
  ExternalLink,
  ListChecks,
  Users,
  Anchor,
  Briefcase,
} from "lucide-react";
import { ContactAnalytics } from "@/components/ContactAnalytics";

const ROLE_ICONS: Record<string, typeof Crown> = {
  head_of_family: Crown,
  head_of_household: Home,
  spouse: Shield,
  beneficiary: User,
  minor: Baby,
};

const ROLE_LABELS: Record<string, string> = {
  head_of_family: "Head of Family",
  head_of_household: "Head of Household",
  spouse: "Spouse",
  beneficiary: "Beneficiary",
  minor: "Minor",
};

const STOREHOUSE_CONFIG = [
  { num: 1, name: "Liquidity Reserve", icon: Castle },
  { num: 2, name: "Strategic Reserve", icon: Sword },
  { num: 3, name: "Philanthropic Trust", icon: Wheat },
  { num: 4, name: "Legacy Trust", icon: Lock },
];

const TYPE_LABELS: Record<string, string> = {
  opco: "OpCo",
  holdco: "HoldCo",
  trust: "Trust",
  partnership: "Partnership",
  other: "Entity",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const HouseholdDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [household, setHousehold] = useState<any>(null);
  const [familyName, setFamilyName] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [vineyardAccounts, setVineyardAccounts] = useState<any[]>([]);
  const [storehouses, setStorehouses] = useState<any[]>([]);
  const [corporations, setCorporations] = useState<any[]>([]);
  const [holdingTank, setHoldingTank] = useState<any[]>([]);
  const [insurancePolicies, setInsurancePolicies] = useState<any[]>([]);

  // Guard against setState after unmount when fetchData reruns via mutation callbacks.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchData = useCallback(async () => {
    if (!id) return;

    const { data: hh } = await supabase
      .from("households")
      .select("*")
      .eq("id", id)
      .single();

    if (!mountedRef.current) return;
    if (!hh) {
      setLoading(false);
      return;
    }

    setHousehold(hh);

    const [
      { data: family },
      { data: contacts },
    ] = await Promise.all([
      supabase.from("families").select("name").eq("id", hh.family_id).single(),
      supabase.from("contacts").select("id, first_name, last_name, family_role, email, phone, address, governance_status, is_minor, asana_url, lawyer_name, lawyer_firm, accountant_name, accountant_firm, executor_name, executor_firm, poa_name, poa_firm").eq("household_id", id),
    ]);
    if (!mountedRef.current) return;

    setFamilyName(family?.name || "Unknown");
    const roleRank = (r: string | null | undefined) => {
      const v = (r || "").toLowerCase();
      if (v === "hof" || v === "head_of_family" || v.includes("head of family")) return 0;
      if (v === "hoh" || v === "head_of_household" || v.includes("head of household")) return 1;
      return 2;
    };
    const sorted = [...(contacts || [])].sort((a: any, b: any) => roleRank(a.family_role) - roleRank(b.family_role));
    setMembers(sorted);

    const memberIds = (contacts || []).map((c: any) => c.id);
    if (memberIds.length > 0) {
      const [{ data: vine }, { data: store }, { data: shareholders }, { data: tank }] = await Promise.all([
        supabase.from("vineyard_accounts").select("*").in("contact_id", memberIds),
        supabase.from("storehouses").select("*").in("contact_id", memberIds),
        supabase.from("shareholders").select("contact_id, corporation_id, ownership_percentage, share_class, role_title").in("contact_id", memberIds).eq("is_active", true),
        supabase.from("holding_tank").select("contact_id, current_value").in("contact_id", memberIds).neq("status", "moved"),
      ]);
      if (!mountedRef.current) return;
      setVineyardAccounts(vine || []);
      setStorehouses(store || []);
      setHoldingTank(tank || []);

      let corpIds: string[] = [];
      if (shareholders && shareholders.length > 0) {
        corpIds = [...new Set(shareholders.map((s: any) => s.corporation_id))];
        const [{ data: corps }, { data: corpVineyard }] = await Promise.all([
          supabase.from("corporations").select("id, name, corporation_type, jurisdiction").in("id", corpIds),
          supabase.from("corporate_vineyard_accounts").select("*").in("corporation_id", corpIds),
        ]);
        if (!mountedRef.current) return;

        const enrichedCorps = (corps || []).map((corp: any) => ({
          ...corp,
          shareholders: shareholders.filter((s: any) => s.corporation_id === corp.id),
          vineyard_accounts: (corpVineyard || []).filter((v: any) => v.corporation_id === corp.id),
          total_assets: (corpVineyard || [])
            .filter((v: any) => v.corporation_id === corp.id)
            .reduce((sum: number, v: any) => sum + (Number(v.current_value) || 0), 0),
        }));
        setCorporations(enrichedCorps);
      }

      // Insurance policies for members + related corporations
      const { data: ins } = await (supabase.from("insurance_policies" as any) as any)
        .select("*")
        .or(`contact_id.in.(${memberIds.join(",")})${corpIds.length ? `,corporation_id.in.(${corpIds.join(",")})` : ""}`);
      if (!mountedRef.current) return;
      setInsurancePolicies((ins as any[]) || []);
    }


    if (mountedRef.current) setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!household) {
    return (
      <AppLayout>
        <div className="text-center py-24">
          <p className="text-muted-foreground">Household not found.</p>
          <Button variant="link" onClick={() => navigate("/households")}>Back to Households</Button>
        </div>
      </AppLayout>
    );
  }

  const totalVineyard = vineyardAccounts.reduce(
    (sum, a) => sum + (Number(a.current_value) || 0),
    0
  );
  const insuranceForStorehouse = (storehouseId: string) =>
    insurancePolicies.reduce((sum, p) => {
      let add = 0;
      if (p.cash_value_storehouse_id === storehouseId) add += Number(p.cash_value) || 0;
      return sum + add;
    }, 0);
  const totalInsuranceInStorehouses = storehouses.reduce(
    (sum, s) => sum + insuranceForStorehouse(s.id),
    0
  );
  const totalStorehouses =
    storehouses
      .filter((s: any) => s.asset_type !== 'Primary Residence & Protected Legacy Accounts')
      .reduce((sum, s) => sum + (Number(s.current_value) || 0), 0) +
    totalInsuranceInStorehouses;
  const totalCorpAssets = corporations.reduce(
    (sum, c) => sum + (c.total_assets || 0),
    0
  );
  const totalHoldingTank = holdingTank.reduce(
    (sum, h) => sum + (Number(h.current_value) || 0),
    0
  );

  // Group vineyard by type
  const byType: Record<string, { accounts: any[]; total: number }> = {};
  vineyardAccounts.forEach((a) => {
    const t = a.account_type || "Other";
    if (!byType[t]) byType[t] = { accounts: [], total: 0 };
    byType[t].accounts.push(a);
    byType[t].total += Number(a.current_value) || 0;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Households", href: "/households" },
            { label: household.label },
          ]}
        />

        {/* Header Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/households")}
                  className="shrink-0 -ml-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-16 w-16 shrink-0 rounded-full bg-sanctuary-green text-sanctuary-bronze flex items-center justify-center">
                  <Home className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold truncate">{household.label}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Link
                      to={household.family_id ? `/families/${household.family_id}` : "/families"}
                      className="flex items-center gap-1.5 text-sm text-sanctuary-bronze hover:underline"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {familyName} Family
                    </Link>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {household.fiduciary_entity}
                    </Badge>
                    {household.governance_status !== "none" && (
                      <Badge
                        className={
                          household.governance_status === "stabilization"
                            ? "bg-sanctuary-green/20 text-sanctuary-green border-sanctuary-green/30"
                            : "bg-sanctuary-bronze/20 text-sanctuary-bronze border-sanctuary-bronze/30"
                        }
                      >
                        {household.governance_status === "stabilization"
                          ? "Stabilization Phase"
                          : household.governance_status === "sovereign"
                            ? "Sovereign Phase"
                            : "Core"}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-2 mr-2">
                  <Label htmlFor="hof-visible" className="text-xs text-muted-foreground cursor-pointer">
                    HoF Visible
                  </Label>
                  <Switch
                    id="hof-visible"
                    checked={household.hof_visible ?? true}
                    onCheckedChange={async (checked) => {
                      await supabase.from("households").update({ hof_visible: checked }).eq("id", household.id);
                      setHousehold({ ...household, hof_visible: checked });
                    }}
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      More Actions
                      <ChevronDown className="ml-1.5 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem asChild>
                      <Link to={`/vault/household/${id}`}>
                        <ShieldCheck className="mr-2 h-4 w-4" /> Open Vault
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to={`/workbench?household=${id}`}>
                        <BarChart3 className="mr-2 h-4 w-4" /> Cashflow Analyst
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Info grid */}
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Address</p>
                {household.address ? (
                  <div className="flex items-start gap-2 text-sm font-medium">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span>{household.address}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Governance Status</p>
                <Select
                  value={household.governance_status || "stabilization"}
                  onValueChange={async (v) => {
                    await supabase.from("households").update({ governance_status: v as any }).eq("id", household.id);
                    const memberIds = members.map((m: any) => m.id);
                    if (memberIds.length > 0) {
                      await supabase.from("contacts").update({ governance_status: v as any }).in("id", memberIds);
                    }
                    setHousehold({ ...household, governance_status: v });
                    toast.success("Governance status updated for household");
                  }}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    <SelectItem value="core">Core</SelectItem>
                    <SelectItem value="stabilization">Stabilization Phase</SelectItem>
                    <SelectItem value="sovereign">Sovereign Phase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fiduciary Entity</p>
                <Select
                  value={household.fiduciary_entity || "pws"}
                  onValueChange={async (v) => {
                    await supabase.from("households").update({ fiduciary_entity: v as any }).eq("id", household.id);
                    const memberIds = members.map((m: any) => m.id);
                    if (memberIds.length > 0) {
                      await supabase.from("contacts").update({ fiduciary_entity: v as any }).in("id", memberIds);
                    }
                    setHousehold({ ...household, fiduciary_entity: v });
                    toast.success("Fiduciary entity updated for household");
                  }}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pws">PWS — Strategy / Architect</SelectItem>
                    <SelectItem value="pwa">PWA — Advisors / Builder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Quiet Period Start</p>
                <Input
                  type="date"
                  value={household.quiet_period_start_date || ""}
                  onChange={async (e) => {
                    const val = e.target.value || null;
                    await supabase.from("households").update({ quiet_period_start_date: val }).eq("id", household.id);
                    const memberIds = members.map((m: any) => m.id);
                    if (memberIds.length > 0) {
                      await supabase.from("contacts").update({ quiet_period_start_date: val }).in("id", memberIds);
                    }
                    setHousehold({ ...household, quiet_period_start_date: val });
                    toast.success("Quiet period updated for household");
                  }}
                  className="h-8"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
            <TabsTrigger value="vault" className="flex-1">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              Vault
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex-1">
              <ListChecks className="mr-1.5 h-3.5 w-3.5" />
              Action Items
            </TabsTrigger>
            <TabsTrigger value="vineyard" className="flex-1">
              <Grape className="mr-1.5 h-3.5 w-3.5" />
              The Vineyard
            </TabsTrigger>
            <TabsTrigger value="pros" className="flex-1">
              <Briefcase className="mr-1.5 h-3.5 w-3.5" />
              Pros
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex-1">
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {/* Household Registered Members Directory */}
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Members Directory</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    {members.length === 0 ? (
                      <p className="px-6 pb-6 text-sm text-muted-foreground">No members in this household.</p>
                    ) : (
                      <div className="overflow-x-auto border-t border-border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                              <th className="text-left font-medium px-6 py-3">Member Name</th>
                              <th className="text-left font-medium px-3 py-3">Email</th>
                              <th className="text-left font-medium px-3 py-3">Contact Phone</th>
                              <th className="text-right font-medium px-3 py-3">Holding Tank</th>
                              <th className="text-right font-medium px-3 py-3">Vineyard</th>
                              <th className="text-right font-medium px-6 py-3">Storehouses</th>
                            </tr>
                          </thead>
                          <tbody>
                            {members.map((m) => {
                              const initials = `${(m.first_name?.[0] || "").toUpperCase()}${(m.last_name?.[0] || "").toUpperCase()}` || "—";
                              const tankTotal = holdingTank
                                .filter((t) => t.contact_id === m.id)
                                .reduce((s, t) => s + (Number(t.current_value) || 0), 0);
                              const vineTotal = vineyardAccounts
                                .filter((v) => v.contact_id === m.id)
                                .reduce((s, v) => s + (Number(v.current_value) || 0), 0);
                              const storeTotal = storehouses
                                .filter((s) => s.contact_id === m.id && s.asset_type !== 'Primary Residence & Protected Legacy Accounts')
                                .reduce((sum, s) => sum + (Number(s.current_value) || 0), 0);
                              return (
                                <tr
                                  key={m.id}
                                  onClick={() => navigate(`/contacts/${m.id}`)}
                                  className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                                >
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="h-8 w-8 shrink-0 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[11px] font-medium">
                                        {initials}
                                      </div>
                                      <span className="font-semibold text-foreground truncate">
                                        {m.first_name} {m.last_name || ""}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-4 text-foreground/80">{m.email || "—"}</td>
                                  <td className="px-3 py-4 text-foreground/80">{m.phone || "—"}</td>
                                  <td className="px-3 py-4 text-right font-medium text-foreground">
                                    {formatCurrency(tankTotal)}
                                  </td>
                                  <td className="px-3 py-4 text-right font-medium text-primary">
                                    {formatCurrency(vineTotal)}
                                  </td>
                                  <td className="px-6 py-4 text-right font-medium text-accent">
                                    {formatCurrency(storeTotal)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Corporations Directory */}
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">Corporations Directory</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {corporations.length} entit{corporations.length === 1 ? "y" : "ies"} · {formatCurrency(totalCorpAssets)}
                        </p>
                      </div>
                      <AddCompanyDialog
                        members={members
                          .filter((m: any) => !m.is_minor)
                          .map((m: any) => ({
                            id: m.id,
                            name: `${m.first_name} ${m.last_name || ""}`.trim(),
                          }))}
                        existingCorpIds={corporations.map((c: any) => c.id)}
                        onCreated={fetchData}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    {corporations.length === 0 ? (
                      <p className="px-6 pb-6 text-sm text-muted-foreground">
                        No corporate entities linked to this household yet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto border-t border-border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                              <th className="text-left font-medium px-6 py-3">Entity</th>
                              <th className="text-left font-medium px-3 py-3">Type</th>
                              <th className="text-left font-medium px-3 py-3">Jurisdiction</th>
                              <th className="text-left font-medium px-3 py-3">Shareholders</th>
                              <th className="text-right font-medium px-6 py-3">Assets</th>
                            </tr>
                          </thead>
                          <tbody>
                            {corporations.map((corp: any) => {
                              const shareholderNames = (corp.shareholders || [])
                                .map((sh: any) => {
                                  const member = members.find((m: any) => m.id === sh.contact_id);
                                  const name = member ? `${member.first_name} ${member.last_name || ""}`.trim() : "Member";
                                  return `${name} (${sh.ownership_percentage}%)`;
                                })
                                .join(", ");
                              return (
                                <tr
                                  key={corp.id}
                                  onClick={() => navigate(`/corporations/${corp.id}`)}
                                  className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                                >
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <Building2 className="h-4 w-4 text-primary" />
                                      </div>
                                      <span className="font-semibold text-foreground truncate">{corp.name}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-4">
                                    <Badge variant="outline" className="text-[9px] uppercase">
                                      {TYPE_LABELS[corp.corporation_type] || corp.corporation_type}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-4 text-foreground/80">{corp.jurisdiction || "—"}</td>
                                  <td className="px-3 py-4 text-foreground/80 truncate max-w-[240px]">
                                    {shareholderNames || "—"}
                                  </td>
                                  <td className="px-6 py-4 text-right font-medium text-foreground">
                                    {formatCurrency(corp.total_assets || 0)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>


              {/* Right rail: AUM Stats */}
              <div className="space-y-4">
                <CharterRatificationTile householdId={id} />
                <Card className="border-sanctuary-bronze/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm uppercase tracking-widest text-sanctuary-bronze">
                      Assets Under Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Household AUM</p>
                      <p className="text-3xl font-bold text-foreground">
                        {formatCurrency(totalVineyard + totalStorehouses + totalCorpAssets + totalHoldingTank)}
                      </p>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Grape className="h-3.5 w-3.5" /> Portfolio
                        </span>
                        <span className="font-semibold text-primary">{formatCurrency(totalVineyard)}</span>
                      </div>
                      {[
                        { num: 1, label: "Liquidity Reserve" },
                        { num: 2, label: "Strategic Reserve" },
                        { num: 3, label: "Philanthropic Trust" },
                        { num: 4, label: "Legacy Trust" },
                      ].map(({ num, label }) => {
                        const shForNum = storehouses.filter((s: any) => s.storehouse_number === num);
                        const shIds = new Set(shForNum.map((s: any) => s.id));
                        const isLegacy = num === 4;
                        const shTotal = shForNum
                          .filter((s: any) => isLegacy || s.asset_type !== 'Primary Residence & Protected Legacy Accounts')
                          .reduce((sum: number, s: any) => sum + (Number(s.current_value) || 0), 0);
                        const cashTotal = insurancePolicies
                          .filter((p: any) => p.cash_value_storehouse_id && shIds.has(p.cash_value_storehouse_id))
                          .reduce((sum: number, p: any) => sum + (Number(p.cash_value) || 0), 0);
                        const coverageTotal = isLegacy
                          ? insurancePolicies
                              .filter((p: any) => p.coverage_storehouse_id && shIds.has(p.coverage_storehouse_id))
                              .reduce((sum: number, p: any) => sum + (Number(p.coverage_amount) || 0), 0)
                          : 0;
                        const rowTotal = shTotal + cashTotal + coverageTotal;
                        if (rowTotal === 0 && shForNum.length === 0) return null;
                        return (
                          <div key={num} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Landmark className="h-3.5 w-3.5" /> {label}
                            </span>
                            <span className="font-semibold text-accent">{formatCurrency(rowTotal)}</span>
                          </div>
                        );
                      })}
                      {totalHoldingTank > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Anchor className="h-3.5 w-3.5" /> Holding Tank
                          </span>
                          <span className="font-semibold text-amber-600">{formatCurrency(totalHoldingTank)}</span>
                        </div>
                      )}
                      {corporations.length > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5" /> Corp Assets
                          </span>
                          <span className="font-semibold text-foreground">{formatCurrency(totalCorpAssets)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <User className="h-3.5 w-3.5" /> Members
                        </span>
                        <span className="font-semibold text-foreground">{members.length}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="py-4">
                    <Link
                      to={`/workbench?household=${id}`}
                      className="flex items-center gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors"
                    >
                      <BarChart3 className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Cashflow Analyst</p>
                        <p className="text-xs text-muted-foreground">Analyze the True Burn Rate</p>
                      </div>
                    </Link>
                  </CardContent>
                </Card>

                {/* Professional Team — household roll-up */}
                {(() => {
                  const rows: { member: any; role: string; name: string; firm: string | null }[] = [];
                  members.forEach((m: any) => {
                    [
                      { role: "Lawyer", name: m.lawyer_name, firm: m.lawyer_firm },
                      { role: "Accountant", name: m.accountant_name, firm: m.accountant_firm },
                      { role: "Executor", name: m.executor_name, firm: m.executor_firm },
                      { role: "Power of Attorney", name: m.poa_name, firm: m.poa_firm },
                    ].forEach((p) => {
                      if (p.name) rows.push({ member: m, role: p.role, name: p.name, firm: p.firm });
                    });
                  });
                  return (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Professional Team</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {rows.length > 0 ? (
                          <ul className="space-y-1.5 text-sm">
                            {rows.map((r, i) => (
                              <li key={i} className="rounded-md bg-muted/50 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium truncate">{r.name}{r.firm ? ` — ${r.firm}` : ""}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">{r.role}</span>
                                </div>
                                <Link
                                  to={`/contacts/${r.member.id}`}
                                  className="text-[11px] text-muted-foreground hover:underline"
                                >
                                  for {`${r.member.first_name} ${r.member.last_name || ""}`.trim()}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">No professionals linked.</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}
                <EngagementsPanel scopeType="household" scopeId={id!} title="Pro Engagements & Threads" />
              </div>
            </div>
          </TabsContent>


          {/* Vault */}
          <TabsContent value="vault" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-accent" />
                Household document vault — manage visibility and share with collaborators.
              </div>
              {household.vault_root_folder_id ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const url = `https://drive.google.com/drive/folders/${household.vault_root_folder_id}`;
                    const w = window.open(url, "_blank", "noopener,noreferrer");
                    if (!w) {
                      navigator.clipboard?.writeText(url);
                      toast.success("Drive link copied — paste in a new tab");
                    }
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open in Drive
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/vault/household/${id}`}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open Full Page
                  </Link>
                </Button>
              )}
            </div>
            <VaultView forcedHouseholdId={id!} embedded />
          </TabsContent>

          {/* Action Items */}
          <TabsContent value="actions" className="space-y-6 mt-4">
            <HouseholdTaskRollup members={members} />
            <HoldingTank householdId={id!} onAccountMoved={() => fetchData()} />
          </TabsContent>

          {/* Vineyard / Financials */}
          <TabsContent value="vineyard" className="space-y-6 mt-4">
            <HoldingTank householdId={id!} onAccountMoved={() => fetchData()} />

            {/* The Vineyard */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Grape className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-serif">The Vineyard</CardTitle>
                    <p className="text-xs text-muted-foreground">Total Asset Portfolio</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-2xl font-bold text-primary">{formatCurrency(totalVineyard)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(byType).length > 0 ? (
                  Object.entries(byType).map(([type, { accounts, total }]) => (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-foreground">{type}</h4>
                        <span className="text-sm font-semibold text-foreground">{formatCurrency(total)}</span>
                      </div>
                      {accounts.map((acc) => (
                        <div
                          key={acc.id}
                          className="rounded-lg bg-muted/50 px-4 py-2.5 border border-border"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground/80">{acc.account_name}</span>
                            <span className="text-sm font-medium text-foreground">
                              {formatCurrency(Number(acc.current_value) || 0)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No vineyard accounts configured.</p>
                )}
              </CardContent>
            </Card>

            {/* Corporate Holdings */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-serif">Corporate Holdings</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {corporations.length} entit{corporations.length === 1 ? "y" : "ies"}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(totalCorpAssets)}</p>
                    <AddCompanyDialog
                      members={members
                        .filter((m: any) => !m.is_minor)
                        .map((m: any) => ({
                          id: m.id,
                          name: `${m.first_name} ${m.last_name || ""}`.trim(),
                        }))}
                      existingCorpIds={corporations.map((c: any) => c.id)}
                      onCreated={fetchData}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {corporations.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No corporate entities linked to this household yet.
                  </p>
                )}
                  {corporations.map((corp: any) => (
                    <div key={corp.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/corporations/${corp.id}`}
                            className="text-sm font-medium text-foreground hover:underline flex items-center gap-1.5"
                          >
                            {corp.name}
                            <Badge variant="outline" className="text-[9px] uppercase">
                              {TYPE_LABELS[corp.corporation_type] || corp.corporation_type}
                            </Badge>
                          </Link>
                          {corp.jurisdiction && (
                            <span className="text-xs text-muted-foreground">· {corp.jurisdiction}</span>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {formatCurrency(corp.total_assets || 0)}
                        </span>
                      </div>
                      <div className="pl-6 space-y-0.5">
                        {corp.shareholders.map((sh: any) => {
                          const member = members.find((m: any) => m.id === sh.contact_id);
                          const name = member ? `${member.first_name} ${member.last_name || ""}`.trim() : "Member";
                          return (
                            <p key={sh.contact_id} className="text-xs text-muted-foreground">
                              {name} — {sh.ownership_percentage}% {sh.share_class || "Common"}
                              {sh.role_title ? ` · ${sh.role_title}` : ""}
                            </p>
                          );
                        })}
                      </div>
                      {(corp.vineyard_accounts || []).map((acc: any) => (
                        <div
                          key={acc.id}
                          className="rounded-lg bg-muted/50 px-4 py-2.5 border border-border"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground/80">{acc.account_name}</span>
                            <span className="text-sm font-medium text-foreground">
                              {formatCurrency(Number(acc.current_value) || 0)}
                            </span>
                          </div>
                        </div>
                      ))}
                      {(corp.vineyard_accounts || []).length === 0 && (
                        <p className="text-xs text-muted-foreground pl-6">No corporate accounts configured</p>
                      )}
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* The Storehouses */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                    <Landmark className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-serif">The Storehouses</CardTitle>
                    <p className="text-xs text-muted-foreground">Strategic Asset Allocation</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-2xl font-bold text-accent">{formatCurrency(totalStorehouses)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {STOREHOUSE_CONFIG.map(({ num, name, icon: Icon }) => {
                  const accounts = storehouses.filter((s) => s.storehouse_number === num);
                  const insuranceHere = accounts.reduce((sum, s) => sum + insuranceForStorehouse(s.id), 0);
                  const total = accounts.reduce((sum, s) => sum + (Number(s.current_value) || 0), 0) + insuranceHere;
                  const targetTotal = accounts.reduce((sum, s) => sum + (Number(s.target_value) || 0), 0);
                  const pct = targetTotal > 0 ? Math.min((total / targetTotal) * 100, 100) : 0;

                  return (
                    <div key={num} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-accent" />
                          <h4 className="text-sm font-medium text-foreground">{name}</h4>
                        </div>
                        <span className="text-sm font-semibold text-foreground">{formatCurrency(total)}</span>
                      </div>
                      {accounts.length > 0 ? (
                        <>
                          {targetTotal > 0 && (
                            <div className="space-y-1">
                              <Progress value={pct} className="h-1.5 bg-muted [&>div]:bg-accent" />
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{Math.round(pct)}% funded</span>
                                <span>Target: {formatCurrency(targetTotal)}</span>
                              </div>
                            </div>
                          )}
                          {accounts.map((acc: any) => (
                            <div
                              key={acc.id}
                              className="rounded-lg bg-muted/50 px-4 py-2.5 border border-border"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-foreground/80">
                                  {acc.label || acc.asset_type || acc.notes || "Account"}
                                </span>
                                <span className="text-sm font-medium text-foreground">
                                  {formatCurrency(Number(acc.current_value) || 0)}
                                </span>
                              </div>
                            </div>
                          ))}
                          {insurancePolicies
                            .filter((p) => accounts.some((a) => a.id === p.coverage_storehouse_id))
                            .map((p) => (
                              <div
                                key={`cov-${p.id}`}
                                className="rounded-lg bg-accent/5 px-4 py-2.5 border border-accent/30"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-foreground/80">
                                    🛡️ {p.carrier} — Coverage
                                    {p.policy_number ? ` #${p.policy_number}` : ""}
                                  </span>
                                  <span className="text-sm font-medium text-foreground">
                                    {formatCurrency(Number(p.coverage_amount) || 0)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          {insurancePolicies
                            .filter((p) => accounts.some((a) => a.id === p.cash_value_storehouse_id))
                            .map((p) => (
                              <div
                                key={`cv-${p.id}`}
                                className="rounded-lg bg-accent/5 px-4 py-2.5 border border-accent/30"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-foreground/80">
                                    🛡️ {p.carrier} — Cash Value
                                    {p.policy_number ? ` #${p.policy_number}` : ""}
                                  </span>
                                  <span className="text-sm font-medium text-foreground">
                                    {formatCurrency(Number(p.cash_value) || 0)}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground pl-6">No accounts configured</p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="space-y-6 mt-4">
            <ContactAnalytics contactIds={members.map((m) => m.id)} />
          </TabsContent>

          {/* Pros */}
          <TabsContent value="pros" className="space-y-6 mt-4">
            <ProsPanel
              scope="household"
              scopeId={id!}
              memberContactIds={members.map((m: any) => m.id)}
              title="Household Pros"
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default HouseholdDetail;
