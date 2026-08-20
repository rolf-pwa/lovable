import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Crown, ArrowRight, Users } from "lucide-react";
import { toast } from "sonner";
import ProPortalShell, { FN, proFetch } from "@/modules/pro/components/ProPortalShell";
import ProTasksPanel from "@/modules/pro/components/ProTasksPanel";

const PRO_TYPE_LABELS: Record<string, string> = {
  lawyer: "Legal Counsel", accountant: "Tax & Accounting", insurance: "Insurance",
  estate: "Estate Planner", philanthropy: "Philanthropic Advisor", banker: "Private Banker",
  other: "Advisor",
};

interface Family {
  id: string;
  name: string;
  households: { id: string; label: string; contacts: any[] }[];
  loose_contacts: any[];
}

export default function ProPortal() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cached = localStorage.getItem("pro_portal_profile");
      if (cached) setProfile(JSON.parse(cached));
      const res = await fetch(FN.workspace, proFetch({ action: "tree" }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setFamilies(data.families || []);
    } catch (e: any) {
      toast.error(e.message || "Could not load your families");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const firmTitle = profile?.firm || profile?.full_name || "Professional Portal";
  const subtitle = profile
    ? `${profile.full_name}${profile.professional_type ? ` · ${PRO_TYPE_LABELS[profile.professional_type] || profile.professional_type}` : ""}`
    : "Concierge Workspace";

  const totalHh = families.reduce((s, f) => s + f.households.length, 0);
  const totalContacts = families.reduce((s, f) => s + f.loose_contacts.length + f.households.reduce((a, h) => a + h.contacts.length, 0), 0);

  return (
    <ProPortalShell
      firmTitle={firmTitle}
      subtitle={subtitle}
      stats={[
        { label: "Families", value: families.length },
        { label: "Households", value: totalHh },
        { label: "Contacts", value: totalContacts },
      ]}
    >
      {loading ? (
        <div className="p-16 text-center text-muted-foreground">Loading your families…</div>
      ) : families.length === 0 ? (
        <Card className="border-accent/15">
          <CardContent className="p-12 text-center space-y-2">
            <Crown className="h-8 w-8 text-accent mx-auto" />
            <p className="text-foreground font-serif">No active engagements</p>
            <p className="text-sm text-muted-foreground">
              Your ProsperWise contact will let you know when work is shared.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <ProTasksPanel scopeType="portfolio" title="All Active Tasks" />
          </div>

          <aside className="space-y-5">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-serif text-lg text-foreground">Families You Serve</h2>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                {families.length}
              </span>
            </div>
            <div className="space-y-3">
              {families.map((fam) => {
                const contactCount = fam.loose_contacts.length + fam.households.reduce((a, h) => a + h.contacts.length, 0);
                return (
                  <button
                    key={fam.id}
                    onClick={() => navigate(`/pro-portal/family/${fam.id}`)}
                    className="text-left group w-full"
                  >
                    <Card className="border-accent/20 hover:border-accent/40 transition-colors overflow-hidden">
                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                          <Crown className="h-4 w-4 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-serif text-sm text-foreground truncate group-hover:text-accent transition-colors">
                            {fam.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Users className="h-3 w-3 shrink-0" />
                            {fam.households.length} household{fam.households.length !== 1 ? "s" : ""} · {contactCount} contact{contactCount !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </ProPortalShell>
  );
}
