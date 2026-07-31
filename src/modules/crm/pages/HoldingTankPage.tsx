import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { AppLayout } from "@/shared/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Anchor, ArrowRight, Loader2, Users } from "lucide-react";
import { PageBreadcrumbs } from "@/shared/components/PageBreadcrumbs";

interface HoldingTankAccount {
  id: string;
  contact_id: string;
  household_id: string | null;
  account_name: string;
  account_number: string | null;
  account_type: string;
  account_owner: string | null;
  custodian: string | null;
  book_value: number | null;
  current_value: number | null;
  notes: string | null;
  source_file: string | null;
  status: string;
  created_at: string;
}

interface GroupedHousehold {
  household_id: string;
  household_label: string;
  contacts: Array<{
    contact_id: string;
    contact_name: string;
    accounts: HoldingTankAccount[];
    total_value: number;
  }>;
  total_value: number;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const HoldingTankPage = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupedHousehold[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: accounts } = await supabase
        .from("holding_tank")
        .select("*")
        .eq("status", "holding")
        .order("created_at", { ascending: false });

      if (!accounts?.length) { setGroups([]); setLoading(false); return; }

      const contactIds = [...new Set(accounts.map(a => a.contact_id))];
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, full_name, household_id")
        .in("id", contactIds);

      const householdIds = [...new Set((contacts || []).map(c => c.household_id).filter(Boolean))] as string[];
      let householdMap = new Map<string, string>();
      if (householdIds.length) {
        const { data: hh } = await supabase.from("households").select("id, label").in("id", householdIds);
        householdMap = new Map((hh || []).map(h => [h.id, h.label]));
      }

      const contactMap = new Map((contacts || []).map(c => [c.id, c]));

      // Group by household
      const hhGroups = new Map<string, GroupedHousehold>();
      const UNASSIGNED = "__unassigned__";

      for (const acc of accounts) {
        const c = contactMap.get(acc.contact_id);
        const hhId = c?.household_id || UNASSIGNED;
        const hhLabel = hhId === UNASSIGNED ? "Unassigned" : (householdMap.get(hhId) || "Unknown Household");

        if (!hhGroups.has(hhId)) {
          hhGroups.set(hhId, { household_id: hhId, household_label: hhLabel, contacts: [], total_value: 0 });
        }
        const group = hhGroups.get(hhId)!;

        let contactEntry = group.contacts.find(ce => ce.contact_id === acc.contact_id);
        if (!contactEntry) {
          contactEntry = { contact_id: acc.contact_id, contact_name: c?.full_name || "Unknown", accounts: [], total_value: 0 };
          group.contacts.push(contactEntry);
        }
        contactEntry.accounts.push(acc);
        contactEntry.total_value += Number(acc.current_value) || 0;
        group.total_value += Number(acc.current_value) || 0;
      }

      setGroups(Array.from(hhGroups.values()));
      setLoading(false);
    })();
  }, []);

  const totalAccounts = groups.reduce((s, g) => g.contacts.reduce((cs, c) => cs + c.accounts.length, s), 0);
  const totalValue = groups.reduce((s, g) => s + g.total_value, 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Holding Tank" }]} />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <Anchor className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold">The Holding Tank</h1>
              <p className="text-sm text-muted-foreground">Accounts awaiting Charter ratification</p>
            </div>
          </div>
          {totalAccounts > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-600">{fmt(totalValue)}</p>
              <Badge variant="secondary" className="text-xs">
                {totalAccounts} account{totalAccounts !== 1 ? "s" : ""} across {groups.length} household{groups.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Anchor className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No accounts in the Holding Tank.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Upload statements on a contact's detail page to stage accounts here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <Card key={g.household_id} className="border-amber-500/20">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base font-serif">{g.household_label}</CardTitle>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-amber-600">{fmt(g.total_value)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {g.contacts.length} member{g.contacts.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {g.contacts.map((contact) => (
                    <div key={contact.contact_id}>
                      <div className="flex items-center justify-between mb-1">
                        <button
                          className="text-sm font-semibold hover:underline text-left"
                          onClick={() => navigate(`/contacts/${contact.contact_id}`)}
                        >
                          {contact.contact_name}
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{fmt(contact.total_value)}</span>
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate(`/contacts/${contact.contact_id}`)}>
                            Ratify <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </div>
                      </div>
                      <div className="divide-y divide-border rounded-md border bg-muted/20">
                        {contact.accounts.map((acc) => (
                          <div key={acc.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{acc.account_name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{acc.account_type}</span>
                                {acc.custodian && <><span>·</span><span>{acc.custodian}</span></>}
                                {acc.account_number && <><span>·</span><span>#{acc.account_number}</span></>}
                                {(acc as any).expected_deposit_date && (
                                  <><span>·</span><span>Expected: {new Date((acc as any).expected_deposit_date + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</span></>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-semibold">{fmt(Number(acc.current_value) || 0)}</p>
                              {acc.book_value != null && (
                                <p className="text-[10px] text-muted-foreground">BOY: {fmt(Number(acc.book_value))}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default HoldingTankPage;
