import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Loader2, UserPlus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/shared/integrations/supabase/client";

export function NewLeadsWidget() {
  const { data: leads, isLoading, error } = useQuery({
    queryKey: ["discovery-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discovery_leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-sanctuary-bronze" />
          <Link to="/leads" className="hover:underline">New Leads</Link>
        </CardTitle>
        {leads && leads.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {leads.length}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load leads</p>
        ) : !leads?.length ? (
          <p className="text-sm text-muted-foreground">No new leads yet.</p>
        ) : (
          <div className="space-y-2">
            {leads.map((lead) => (
              <Link
                key={lead.id}
                to="/leads"
                className="block rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {lead.first_name}
                    </p>
                    {lead.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.email}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] shrink-0 whitespace-nowrap"
                  >
                    {lead.transition_type?.replace(/_/g, " ") || "Discovery"}
                  </Badge>
                </div>
                {lead.anxiety_anchor && (
                  <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                    {lead.anxiety_anchor}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(lead.created_at), {
                    addSuffix: true,
                  })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
