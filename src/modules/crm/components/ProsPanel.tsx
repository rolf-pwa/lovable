import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Briefcase, ExternalLink, Home, User, TreesIcon, FolderOpen } from "lucide-react";
import LinkProDialog from "@/modules/crm/components/LinkProDialog";
import { ShareVaultFilesControl } from "@/modules/crm/components/ShareVaultFilesControl";
import { ProTasksButton } from "@/modules/crm/components/ProTasksButton";
import { format } from "date-fns";

interface Props {
  scope: "family" | "household";
  scopeId: string;
  memberContactIds?: string[];
  householdIds?: string[]; // for family scope
  title?: string;
}

const SCOPE_ICON = { family: TreesIcon, household: Home, contact: User } as const;

interface LinkInfo { name: string | null; drive_id: string | null }

export function ProsPanel({ scope, scopeId, memberContactIds = [], householdIds = [], title = "Pros" }: Props) {
  const [loading, setLoading] = useState(true);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [pros, setPros] = useState<Record<string, any>>({});
  const [links, setLinks] = useState<Record<string, LinkInfo>>({});

  const load = useCallback(async () => {
    setLoading(true);
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

    // What's actually shared, at a glance — no clicking through to find out.
    const linkIds = Array.from(new Set(list.map((e: any) => e.vault_share_link_id).filter(Boolean)));
    if (linkIds.length) {
      const { data: ls } = await (supabase as any)
        .from("vault_share_links")
        .select("id, name, drive_id")
        .in("id", linkIds);
      const map: Record<string, LinkInfo> = {};
      (ls || []).forEach((l: any) => { map[l.id] = { name: l.name, drive_id: l.drive_id }; });
      setLinks(map);
    } else {
      setLinks({});
    }
    setLoading(false);
  }, [scope, scopeId, memberContactIds.join(","), householdIds.join(",")]);

  useEffect(() => { load(); }, [load]);

  // Group by professional
  const grouped: Record<string, any[]> = {};
  engagements.forEach((e) => {
    if (!grouped[e.professional_id]) grouped[e.professional_id] = [];
    grouped[e.professional_id].push(e);
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-serif flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-sanctuary-bronze" />
          {title}
          <Badge variant="outline" className="ml-2 text-[10px]">{Object.keys(grouped).length}</Badge>
        </CardTitle>
        <LinkProDialog scopeType={scope} scopeId={scopeId} onLinked={load} />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : engagements.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No professionals linked yet. Use "Link a Pro" above to grant portal access
            scoped to this {scope}.
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
                    {engs.length} scope{engs.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <ul className="divide-y divide-border">
                  {engs.map((e) => {
                    const Icon = SCOPE_ICON[e.scope_type as keyof typeof SCOPE_ICON] || User;
                    const link = e.vault_share_link_id ? links[e.vault_share_link_id] : null;
                    return (
                      <li key={e.id} className="px-3 py-2 space-y-1.5">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <Icon className="h-3 w-3" />
                              <span className="capitalize">{e.scope_type} access</span>
                              <span>·</span>
                              <span>granted {format(new Date(e.created_at), "PP")}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                          <FolderOpen className="h-3 w-3 shrink-0" />
                          {link?.drive_id ? (
                            <a
                              href={`https://drive.google.com/drive/folders/${link.drive_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-accent hover:underline"
                            >
                              {link.name || "Untitled"}
                            </a>
                          ) : (
                            "Nothing shared"
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <ProTasksButton professionalId={proId} professionalName={p.full_name} />
                          {e.scope_type !== "family" && (
                            <ShareVaultFilesControl
                              engagement={e}
                              scopeType={e.scope_type}
                              scopeId={e.scope_id}
                              onChanged={load}
                              label={p.full_name}
                            />
                          )}
                        </div>
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
