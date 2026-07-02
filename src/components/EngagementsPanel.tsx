import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, ExternalLink } from "lucide-react";
import EngagementThreadButton from "./EngagementThreadButton";

interface Props {
  scopeType: "contact" | "household" | "family";
  scopeId: string;
  title?: string;
}

interface EngagementRow {
  id: string;
  title: string;
  pillar: string | null;
  status: string;
  professional_id: string;
  professional?: {
    id: string;
    full_name: string;
    firm: string | null;
    professional_type: string | null;
  } | null;
}

export default function EngagementsPanel({ scopeType, scopeId, title = "Professional Engagements" }: Props) {
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("professional_engagements")
        .select("id, title, pillar, status, professional_id, professional:professionals(id, full_name, firm, professional_type)")
        .eq("scope_type", scopeType)
        .eq("scope_id", scopeId)
        .order("created_at", { ascending: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, [scopeType, scopeId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-serif flex items-center gap-2">
          <Briefcase className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No professionals linked to this {scopeType} yet. Link one from the Professionals directory.
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.professional?.full_name || "Unknown pro"}
                    {r.professional?.firm ? ` · ${r.professional.firm}` : ""}
                    {r.pillar ? ` · ${r.pillar}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px] capitalize">{r.status}</Badge>
                  <EngagementThreadButton engagementId={r.id} engagementTitle={r.title} />
                  {r.professional?.id && (
                    <Link
                      to={`/professionals/${r.professional.id}`}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
