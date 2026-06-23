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
  const [openHouseholds, setOpenHouseholds] = useState<Set<string>>(new Set());

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
      const [{ data: v }, { data: s }, { data: t }] = await Promise.all([
        supabase.from("vineyard_accounts").select("contact_id, current_value").in("contact_id", memberIds),
        supabase.from("storehouses").select("contact_id, current_value").in("contact_id", memberIds),
        supabase.from("holding_tank").select("contact_id, current_value").in("contact_id", memberIds),
      ]);
      setVineyard(v || []);
      setStorehouses(s || []);
      setHoldingTank(t || []);
    } else {
      setVineyard([]);
      setStorehouses([]);
      setHoldingTank([]);
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
  const storehouseByContact = sumByContact(storehouses);
  const holdingByContact = sumByContact(holdingTank);

  const totalVineyard = vineyard.reduce((s, a) => s + (Number(a.current_value) || 0), 0);
  const totalStorehouses = storehouses.reduce((s, a) => s + (Number(a.current_value) || 0), 0);
  const totalHolding = holdingTank.reduce((s, a) => s + (Number(a.current_value) || 0), 0);
  const totalAUM = totalVineyard + totalStorehouses + totalHolding;

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
      total += (vineyardByContact[m] || 0) + (storehouseByContact[m] || 0) + (holdingByContact[m] || 0);
    });
    return total;
  };

  const contactTotal = (cid: string) =>
    (vineyardByContact[cid] || 0) + (storehouseByContact[cid] || 0) + (holdingByContact[cid] || 0);

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

            {/* AUM Tiles */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-card/50 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  Total Family AUM
                </div>
                <p className="mt-2 text-2xl font-bold text-sanctuary-bronze">
                  {formatCurrency(totalAUM)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Grape className="h-3.5 w-3.5" />
                  The Vineyard
                </div>
                <p className="mt-2 text-2xl font-bold">{formatCurrency(totalVineyard)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Landmark className="h-3.5 w-3.5" />
                  Storehouses
                </div>
                <p className="mt-2 text-2xl font-bold">{formatCurrency(totalStorehouses)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Anchor className="h-3.5 w-3.5" />
                  Holding Tank
                </div>
                <p className="mt-2 text-2xl font-bold text-amber-600">
                  {formatCurrency(totalHolding)}
                </p>
              </div>
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

        {/* Households + Individuals directory */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Home className="h-4 w-4 text-sanctuary-bronze" />
              Households & Members
            </CardTitle>
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
    </AppLayout>
  );
};

export default FamilyDetail;
