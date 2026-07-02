import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, ArrowRight, Users } from "lucide-react";
import { toast } from "sonner";
import ProPortalShell, { FN, proFetch } from "@/components/pro/ProPortalShell";
import ProTasksPanel from "@/components/pro/ProTasksPanel";

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
        <Card className="border-amber-500/15">
          <CardContent className="p-12 text-center space-y-2">
            <Crown className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-foreground font-serif">No active engagements</p>
            <p className="text-sm text-muted-foreground">
              Your ProsperWise contact will let you know when work is shared.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-serif text-lg text-foreground">Families You Serve</h2>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {families.length} {families.length === 1 ? "family" : "families"}
            </span>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {families.map((fam) => {
              const contactCount = fam.loose_contacts.length + fam.households.reduce((a, h) => a + h.contacts.length, 0);
              return (
                <button
                  key={fam.id}
                  onClick={() => navigate(`/pro-portal/family/${fam.id}`)}
                  className="text-left group"
                >
                  <Card className="border-amber-500/20 hover:border-amber-500/40 transition-colors overflow-hidden h-full">
                    <div className="px-5 py-4 flex items-center gap-3 border-b border-border/60">
                      <div className="h-11 w-11 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Crown className="h-5 w-5 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-serif text-lg text-foreground truncate group-hover:text-amber-500 transition-colors">
                          {fam.name}
                        </div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                          Enter workspace
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <CardContent className="p-0">
                      <div className="grid grid-cols-2 divide-x divide-border/60 border-b border-border/60">
                        <div className="px-5 py-3">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Households</div>
                          <div className="font-serif text-xl text-foreground">{fam.households.length}</div>
                        </div>
                        <div className="px-5 py-3">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Contacts</div>
                          <div className="font-serif text-xl text-foreground">{contactCount}</div>
                        </div>
                      </div>
                      <div className="px-5 py-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                          <Users className="h-3 w-3" /> Households you serve
                        </div>
                        <ul className="space-y-1">
                          {fam.households.slice(0, 3).map((h) => (
                            <li key={h.id} className="text-sm text-foreground/80 truncate">
                              · {h.label}
                            </li>
                          ))}
                          {fam.households.length > 3 && (
                            <li className="text-[11px] text-muted-foreground">+ {fam.households.length - 3} more</li>
                          )}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        </>
      )}
    </ProPortalShell>
  );
}
