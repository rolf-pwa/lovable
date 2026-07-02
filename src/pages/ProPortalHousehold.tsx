import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ShieldCheck, FileText, Mail, Phone } from "lucide-react";
import ProPortalShell, { FN, proFetch } from "@/components/pro/ProPortalShell";
import ProTasksPanel from "@/components/pro/ProTasksPanel";
import { format } from "date-fns";
import { toast } from "sonner";

interface Grant { id: string; drive_id: string; permission: string; granted_at: string; expires_at: string | null }
interface Governance { charter: any | null; latest_review: any | null }

export default function ProPortalHousehold() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const cached = localStorage.getItem("pro_portal_profile");
      if (cached) setProfile(JSON.parse(cached));
      const res = await fetch(FN.workspace, proFetch({ action: "household", household_id: id }));
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setData(d);
    } catch (e: any) {
      toast.error(e.message || "Could not load household");
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const governance: Governance | null = data?.governance || null;
  const vault: Grant[] = data?.vault || [];
  const members: any[] = data?.members || [];

  return (
    <ProPortalShell
      firmTitle={data?.household?.label || "Household"}
      subtitle={data?.family?.name ? `${data.family.name} Family` : "Family"}
      crumbs={[
        { label: "Portal", to: "/pro-portal" },
        { label: data?.family?.name || "Family", to: data?.family?.id ? `/pro-portal/family/${data.family.id}` : undefined },
        { label: data?.household?.label || "Household" },
      ]}
      stats={[
        { label: "Members", value: members.length },
        { label: "Charter", value: (governance?.charter ? "Ratified" : "Pending") },
        { label: "Vault Grants", value: vault.length },
      ]}
    >
      {!data ? (
        <div className="p-16 text-center text-muted-foreground">Loading household…</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <Card className="border-amber-500/20">
              <CardHeader>
                <CardTitle className="font-serif text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-amber-500" /> Household Members
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {members.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No members you're assigned to.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {members.map((m) => (
                      <li key={m.id}>
                        <button
                          onClick={() => navigate(`/pro-portal/contact/${m.id}`)}
                          className="w-full text-left px-4 py-3 hover:bg-amber-500/[0.03] transition"
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="font-medium text-foreground">{m.full_name || `${m.first_name || ""} ${m.last_name || ""}`.trim()}</div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
                                {m.email && (<span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{m.email}</span>)}
                                {m.phone && (<span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{m.phone}</span>)}
                              </div>
                            </div>
                            {m.family_role && (
                              <Badge variant="outline" className="text-[10px]">{m.family_role.replace(/_/g, " ")}</Badge>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <ProTasksPanel scopeType="household" scopeId={id!} />
          </div>

          <aside className="space-y-5">
            <Card className="border-amber-500/15">
              <CardHeader>
                <CardTitle className="text-base font-serif flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-500" /> Sovereignty Charter
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!governance?.charter ? (
                  <p className="text-sm text-muted-foreground">No charter on file for this household yet.</p>
                ) : (
                  <div>
                    <div className="text-sm text-foreground font-medium">{governance.charter.title || "Sovereignty Charter"}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Last updated {format(new Date(governance.charter.updated_at), "PP")}
                    </div>
                  </div>
                )}
                {governance?.latest_review && (
                  <div className="pt-3 border-t border-border/60">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Latest Governance Review</div>
                    <div className="text-sm text-foreground mt-1">
                      Period ending {format(new Date(governance.latest_review.period_end), "PP")}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                      Status: {governance.latest_review.status}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-amber-500/15">
              <CardHeader>
                <CardTitle className="text-base font-serif flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" /> Shared Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vault.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No vault access granted to you at this scope.</p>
                ) : (
                  <ul className="space-y-2">
                    {vault.map((g) => (
                      <li key={g.id} className="text-sm border border-border/60 rounded-md px-3 py-2 bg-muted/30">
                        <div className="text-foreground truncate">{g.drive_id}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {g.permission} · granted {format(new Date(g.granted_at), "PP")}
                          {g.expires_at && ` · expires ${format(new Date(g.expires_at), "PP")}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-muted-foreground mt-3">
                  Secure download proxy activates in the next release.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </ProPortalShell>
  );
}
