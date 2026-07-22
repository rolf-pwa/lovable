import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  TreesIcon,
  Home,
  User,
  Crown,
  Shield,
  Baby,
  ChevronRight,
  ChevronDown,
  Loader2,
  ArrowLeft,
  Wallet,
  Grape,
  Landmark,
  Anchor,
  ExternalLink,
} from "lucide-react";
import { FamilyRollup } from "@/components/FamilyRollup";
import { ProsPanel } from "@/components/ProsPanel";
import { AddCompanyDialog } from "@/components/AddCompanyDialog";

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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const roleRank = (r: string | null | undefined) => {
  const v = (r || "").toLowerCase();
  if (v === "hof" || v === "head_of_family" || v.includes("head of family")) return 0;
  if (v === "hoh" || v === "head_of_household" || v.includes("head of household")) return 1;
  if (v === "spouse") return 2;
  if (v === "beneficiary") return 3;
  if (v === "minor") return 4;
  return 5;
};

const FamilyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState<any>(null);
  const [households, setHouseholds] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [vineyard, setVineyard] = useState<any[]>([]);
  const [storehouses, setStorehouses] = useState<any[]>([]);
  const [holdingTank, setHoldingTank] = useState<any[]>([]);
  const [insurancePolicies, setInsurancePolicies] = useState<any[]>([]);
  const [openHouseholds, setOpenHouseholds] = useState<Set<string>>(new Set());
  const [openSidebarHoldingTank, setOpenSidebarHoldingTank] = useState(false);
  const [openSidebarVineyard, setOpenSidebarVineyard] = useState(false);
  const [openSidebarStorehouses, setOpenSidebarStorehouses] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: fam } = await supabase
      .from("families")
      .select("*")
      .eq("id", id)
      .single();

    if (!fam) {
      setLoading(false);
      return;
    }
    setFamily(fam);

    const [{ data: hhs }, { data: cs }] = await Promise.all([
      supabase.from("households").select("*").eq("family_id", id).order("label"),
      supabase
        .from("contacts")
        .select("id, first_name, last_name, family_role, household_id, email, phone, is_minor, governance_status")
        .eq("family_id", id),
    ]);

    setHouseholds(hhs || []);
    setContacts(cs || []);
    // Open all households by default
    setOpenHouseholds(new Set((hhs || []).map((h: any) => h.id)));

    const memberIds = (cs || []).map((c: any) => c.id);
    if (memberIds.length > 0) {
      const [{ data: v }, { data: s }, { data: t }, { data: ins }] = await Promise.all([
        supabase.from("vineyard_accounts").select("id, contact_id, account_name, account_type, current_value, book_value").in("contact_id", memberIds),
        supabase.from("storehouses").select("id, contact_id, storehouse_number, label, current_value, book_value, asset_type").in("contact_id", memberIds),
        supabase.from("holding_tank").select("id, contact_id, account_name, account_type, current_value, book_value, custodian, expected_deposit_date").in("contact_id", memberIds).neq("status", "moved"),
        supabase.from("insurance_policies").select("id, contact_id, cash_value, coverage_amount, cash_value_storehouse_id, coverage_storehouse_id").in("contact_id", memberIds),
      ]);
      setVineyard(v || []);
      setStorehouses(s || []);
      setHoldingTank(t || []);
      setInsurancePolicies(ins || []);
    } else {
      setVineyard([]);
      setStorehouses([]);
      setHoldingTank([]);
      setInsurancePolicies([]);
    }

    setLoading(false);
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

  if (!family) {
    return (
      <AppLayout>
        <div className="text-center py-24">
          <p className="text-muted-foreground">Family not found.</p>
          <Button variant="link" onClick={() => navigate("/families")}>
            Back to Families
          </Button>
        </div>
      </AppLayout>
    );
  }

  const sumByContact = (rows: any[]) => {
    const map: Record<string, number> = {};
    rows.forEach((r) => {
      map[r.contact_id] = (map[r.contact_id] || 0) + (Number(r.current_value) || 0);
    });
    return map;
  };

  const vineyardByContact = sumByContact(vineyard);
  const storehouseByContact = sumByContact(storehouses.filter((s: any) => s.asset_type !== 'Primary Residence & Protected Legacy Accounts'));
  const holdingByContact = sumByContact(holdingTank);
  const insuranceCashByContact: Record<string, number> = {};
  insurancePolicies.forEach((p: any) => {
    if (!p.cash_value_storehouse_id) return;
    insuranceCashByContact[p.contact_id] = (insuranceCashByContact[p.contact_id] || 0) + (Number(p.cash_value) || 0);
  });

  const totalVineyard = vineyard.reduce((s, a) => s + (Number(a.current_value) || 0), 0);
  const totalStorehouses = storehouses
    .filter((s: any) => s.asset_type !== 'Primary Residence & Protected Legacy Accounts')
    .reduce((s, a) => s + (Number(a.current_value) || 0), 0);
  const insuranceCashInStorehouses = insurancePolicies
    .filter((p: any) => !!p.cash_value_storehouse_id)
    .reduce((s: number, p: any) => s + (Number(p.cash_value) || 0), 0);
  const totalHolding = holdingTank.reduce((s, a) => s + (Number(a.current_value) || 0), 0);
  const totalAUM = totalVineyard + totalStorehouses + insuranceCashInStorehouses + totalHolding;

  const storehouseBreakdown = [1, 2, 3, 4].map((num) => {
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
    return { num, count: shForNum.length, total: shTotal + cashTotal + coverageTotal };
  });
  const storehousesCount = storehouseBreakdown.reduce((s, r) => s + r.count, 0);
  const storehousesDisplayTotal = storehouseBreakdown.reduce((s, r) => s + r.total, 0);

  const toggleHousehold = (hid: string) => {
    setOpenHouseholds((prev) => {
      const next = new Set(prev);
      next.has(hid) ? next.delete(hid) : next.add(hid);
      return next;
    });
  };

  const contactsByHousehold = (hid: string) =>
    contacts
      .filter((c) => c.household_id === hid)
      .sort((a, b) => roleRank(a.family_role) - roleRank(b.family_role));

  const householdTotal = (hid: string) => {
    const mems = contactsByHousehold(hid).map((c) => c.id);
    let total = 0;
    mems.forEach((m) => {
      total += (vineyardByContact[m] || 0) + (storehouseByContact[m] || 0) + (holdingByContact[m] || 0) + (insuranceCashByContact[m] || 0);
    });
    return total;
  };

  const contactTotal = (cid: string) =>
    (vineyardByContact[cid] || 0) + (storehouseByContact[cid] || 0) + (holdingByContact[cid] || 0) + (insuranceCashByContact[cid] || 0);

  const storehouseName = (num: number) => {
    const names: Record<number, string> = {
      1: "Liquidity Reserve",
      2: "Strategic Reserve",
      3: "Philanthropic Trust",
      4: "Legacy Trust",
    };
    return names[num] || "Storehouse";
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Family Tree", href: "/families" },
            { label: `${family.name} Family` },
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
                  onClick={() => navigate("/families")}
                  className="shrink-0 -ml-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-16 w-16 shrink-0 rounded-full bg-sanctuary-green text-sanctuary-bronze flex items-center justify-center">
                  <TreesIcon className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold truncate">{family.name} Family</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {households.length} {households.length === 1 ? "Household" : "Households"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {contacts.length} {contacts.length === 1 ? "Individual" : "Individuals"}
                    </Badge>
                    {family.fee_tier && (
                      <Badge className="bg-sanctuary-bronze/20 text-sanctuary-bronze border-sanctuary-bronze/30 uppercase text-[10px]">
                        {family.fee_tier} Tier
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Total AUM */}
            <div className="mt-6 flex items-center gap-3">
              <Wallet className="h-4 w-4 text-sanctuary-bronze" />
              <span className="text-sm text-muted-foreground">Total Family AUM</span>
              <span className="text-lg font-bold text-sanctuary-bronze">{formatCurrency(totalAUM)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Fee tier rollup */}
        <FamilyRollup
          familyId={family.id}
          familyName={family.name}
          feeTier={family.fee_tier}
          totalAssets={Number(family.total_family_assets) || totalAUM}
          annualSavings={Number(family.annual_savings) || 0}
          discountPct={Number(family.fee_tier_discount_pct) || 0}
          onRecalculated={fetchData}
        />

        <div className="flex gap-6 items-start">
          {/* Sidebar */}
          <div className="w-80 shrink-0 space-y-4">
            {/* Holding Tank */}
            <Card className="border-amber-500/20">
              <CardHeader
                className="pb-2 cursor-pointer select-none"
                onClick={() => setOpenSidebarHoldingTank((o) => !o)}
              >
                <div className="flex items-center gap-3">
                  <Anchor className="h-5 w-5 text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-serif">Holding Tank</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {holdingTank.length} account{holdingTank.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-amber-600">{formatCurrency(totalHolding)}</p>
                  </div>
                  {openSidebarHoldingTank ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              </CardHeader>
              {openSidebarHoldingTank && (
                <CardContent className="space-y-2 pt-0">
                  {holdingTank.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">No accounts</p>
                  ) : (
                    holdingTank.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{account.account_name}</p>
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                            {account.account_type}
                          </Badge>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-sm font-semibold">{formatCurrency(account.current_value || 0)}</p>
                          {account.book_value != null && (
                            <p className="text-[10px] text-muted-foreground">
                              BOY: {formatCurrency(account.book_value)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              )}
            </Card>

            {/* Vineyard */}
            <Card>
              <CardHeader
                className="pb-2 cursor-pointer select-none"
                onClick={() => setOpenSidebarVineyard((o) => !o)}
              >
                <div className="flex items-center gap-3">
                  <Grape className="h-5 w-5 text-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-serif">The Vineyard</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {vineyard.length} account{vineyard.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold">{formatCurrency(totalVineyard)}</p>
                  </div>
                  {openSidebarVineyard ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              </CardHeader>
              {openSidebarVineyard && (
                <CardContent className="space-y-2 pt-0">
                  {vineyard.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">No accounts</p>
                  ) : (
                    vineyard.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{account.account_name}</p>
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                            {account.account_type}
                          </Badge>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-sm font-semibold">{formatCurrency(account.current_value || 0)}</p>
                          {account.book_value != null && (
                            <p className="text-[10px] text-muted-foreground">
                              BOY: {formatCurrency(account.book_value)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              )}
            </Card>

            {/* Storehouses */}
            <Card>
              <CardHeader
                className="pb-2 cursor-pointer select-none"
                onClick={() => setOpenSidebarStorehouses((o) => !o)}
              >
                <div className="flex items-center gap-3">
                  <Landmark className="h-5 w-5 text-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-serif">Storehouses</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {storehousesCount} account{storehousesCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold">{formatCurrency(storehousesDisplayTotal)}</p>
                  </div>
                  {openSidebarStorehouses ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              </CardHeader>
              {openSidebarStorehouses && (
                <CardContent className="space-y-2 pt-0">
                  {storehouseBreakdown.filter((r) => r.count > 0 || r.total > 0).map((r) => (
                    <div key={r.num} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
                      <span className="text-xs font-medium">{storehouseName(r.num)}</span>
                      <span className="text-sm font-semibold text-accent">{formatCurrency(r.total)}</span>
                    </div>
                  ))}
                  {storehouses.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">No accounts</p>
                  ) : (
                    storehouses.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{account.label}</p>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                              {storehouseName(account.storehouse_number)}
                            </Badge>
                            {account.asset_type && (
                              <span className="text-[10px] text-muted-foreground">{account.asset_type}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-sm font-semibold">{formatCurrency(account.current_value || 0)}</p>
                          {account.book_value != null && (
                            <p className="text-[10px] text-muted-foreground">
                              BOY: {formatCurrency(account.book_value)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              )}
            </Card>
          </div>

          {/* Main column — Households & Members */}
          <div className="flex-1 min-w-0">
            <Card>
              <CardHeader className="pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Home className="h-4 w-4 text-sanctuary-bronze" />
                  Households & Members
                </CardTitle>
                <AddCompanyDialog
                  members={contacts
                    .filter((c) => !c.is_minor)
                    .map((c) => {
                      const hh = households.find((h) => h.id === c.household_id);
                      return {
                        id: c.id,
                        name: `${c.first_name} ${c.last_name || ""}`.trim(),
                        sublabel: hh?.label,
                      };
                    })}
                  onCreated={fetchData}
                />
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {households.length === 0 ? (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">
                    No households in this family yet.
                  </p>
                ) : (
                  <div className="border-t border-border divide-y divide-border">
                    {households.map((hh) => {
                      const isOpen = openHouseholds.has(hh.id);
                      const members = contactsByHousehold(hh.id);
                      const hhTotal = householdTotal(hh.id);
                      return (
                        <Collapsible
                          key={hh.id}
                          open={isOpen}
                          onOpenChange={() => toggleHousehold(hh.id)}
                        >
                          <div className="flex items-center gap-2 px-6 py-3 hover:bg-muted/30">
                            <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left min-w-0">
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <Home className="h-4 w-4 text-sanctuary-bronze shrink-0" />
                              <span className="font-medium truncate">{hh.label}</span>
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {members.length} {members.length === 1 ? "member" : "members"}
                              </Badge>
                            </CollapsibleTrigger>
                            <span className="text-sm font-semibold text-sanctuary-bronze shrink-0">
                              {formatCurrency(hhTotal)}
                            </span>
                            <Button asChild variant="ghost" size="sm" className="shrink-0">
                              <Link to={`/households/${hh.id}`}>
                                Open <ExternalLink className="ml-1 h-3 w-3" />
                              </Link>
                            </Button>
                          </div>
                          <CollapsibleContent>
                            {members.length === 0 ? (
                              <p className="px-12 pb-4 text-xs text-muted-foreground">
                                No members assigned.
                              </p>
                            ) : (
                              <div className="pb-2">
                                {members.map((m) => {
                                  const Icon = ROLE_ICONS[m.family_role] || User;
                                  const cTotal = contactTotal(m.id);
                                  return (
                                    <div
                                      key={m.id}
                                      className="flex items-center gap-2 pl-14 pr-6 py-2 hover:bg-muted/20"
                                    >
                                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <Link
                                        to={`/contacts/${m.id}`}
                                        className="text-sm font-medium hover:underline truncate flex-1"
                                      >
                                        {m.first_name} {m.last_name || ""}
                                      </Link>
                                      {m.family_role && (
                                        <Badge variant="outline" className="text-[9px] uppercase">
                                          {ROLE_LABELS[m.family_role] || m.family_role}
                                        </Badge>
                                      )}
                                      <span className="text-xs text-muted-foreground shrink-0 w-32 text-right">
                                        {formatCurrency(cTotal)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Family Pros */}
        <ProsPanel
          scope="family"
          scopeId={family.id}
          memberContactIds={contacts.map((c: any) => c.id)}
          householdIds={households.map((h: any) => h.id)}
          title="Family Pros"
        />
      </div>
    </AppLayout>
  );
};

export default FamilyDetail;
