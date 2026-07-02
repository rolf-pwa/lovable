import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, ExternalLink, Home, User, TreesIcon } from "lucide-react";
import EngagementThreadButton from "@/components/EngagementThreadButton";
import { format } from "date-fns";

interface Props {
  scope: "family" | "household";
  scopeId: string;
  memberContactIds?: string[];
  householdIds?: string[]; // for family scope
  title?: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  invited: "bg-blue-100 text-blue-800 border-blue-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed: "bg-slate-100 text-slate-800 border-slate-200",
  archived: "bg-muted text-muted-foreground border-border",
  revoked: "bg-red-100 text-red-800 border-red-200",
};

const SCOPE_ICON = { family: TreesIcon, household: Home, contact: User } as const;

export function ProsPanel({ scope, scopeId, memberContactIds = [], householdIds = [], title = "Pros" }: Props) {
  const [loading, setLoading] = useState(true);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [pros, setPros] = useState<Record<string, any>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Build OR filter across relevant scopes
      const orParts: string[] = [`and(scope_type.eq.${scope},scope_id.eq.${scopeId})`];
      if (memberContactIds.length) {
        orParts.push(`and(scope_type.eq.contact,scope_id.in.(${memberContactIds.join(",")}))`);
      }
      if (scope === "family" && householdIds.length) {
        orParts.push(`and(scope_type.eq.household,scope_id.in.(${householdIds.join(",")}))`);
      }

      const { data: engs } = await (supabase as any)
        .from("professional_engagements")
        .select("*")
        .or(orParts.join(","))
        .order("created_at", { ascending: false });

      const list = engs || [];
      setEngagements(list);

      const proIds = Array.from(new Set(list.map((e: any) => e.professional_id)));
      if (proIds.length) {
        const { data: ps } = await (supabase as any)
          .from("professionals")
          .select("id, full_name, professional_type, firm, credentials, email, phone")
          .in("id", proIds);
        const map: Record<string, any> = {};
        (ps || []).forEach((p: any) => { map[p.id] = p; });
        setPros(map);
      } else {
        setPros({});
      }
      setLoading(false);
    })();
  }, [scope, scopeId, memberContactIds.join(","), householdIds.join(",")]);

  // Group by professional
  const grouped: Record<string, any[]> = {};
  engagements.forEach((e) => {
    if (!grouped[e.professional_id]) grouped[e.professional_id] = [];
    grouped[e.professional_id].push(e);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-serif flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-sanctuary-bronze" />
          {title}
          <Badge variant="outline" className="ml-2 text-[10px]">{Object.keys(grouped).length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : engagements.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No professionals linked yet. Add engagements from a{" "}
            <Link to="/professionals" className="underline">pro's profile</Link>.
          </p>
        ) : (
          Object.entries(grouped).map(([proId, engs]) => {
            const p = pros[proId];
            if (!p) return null;
            return (
              <div key={proId} className="rounded-md border border-border">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <Link
                    to={`/professionals/${proId}`}
                    className="flex items-center gap-2 font-medium text-sm hover:underline"
                  >
                    <Briefcase className="h-3.5 w-3.5 text-sanctuary-bronze" />
                    {p.full_name}
                    <span className="text-xs text-muted-foreground capitalize">
                      · {p.professional_type.replace("_", " ")}
                    </span>
                    {p.firm && <span className="text-xs text-muted-foreground">· {p.firm}</span>}
                    <ExternalLink className="h-3 w-3 text-muted-foreground ml-1" />
                  </Link>
                  <Badge variant="outline" className="text-[10px]">
                    {engs.length} engagement{engs.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <ul className="divide-y divide-border">
                  {engs.map((e) => {
                    const Icon = SCOPE_ICON[e.scope_type as keyof typeof SCOPE_ICON] || User;
                    return (
                      <li key={e.id} className="px-3 py-2 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{e.title}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            <Icon className="h-3 w-3" />
                            <span className="capitalize">{e.scope_type}</span>
                            <span>·</span>
                            <span className="uppercase">{e.pillar}</span>
                            <span>·</span>
                            <span>{format(new Date(e.created_at), "PP")}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[e.status] || ""}`}>
                          {e.status}
                        </Badge>
                        <EngagementThreadButton engagementId={e.id} engagementTitle={e.title} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
