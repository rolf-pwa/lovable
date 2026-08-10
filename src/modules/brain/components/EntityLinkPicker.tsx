import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/shared/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Link2, X, Loader2 } from "lucide-react";
import {
  BrainEntityType,
  getBrainEntityLinks,
  linkBrainEntity,
  unlinkBrainEntity,
} from "@/shared/lib/brain";

const ENTITY_TABLES: Record<BrainEntityType, { table: string; label: string; displayName: (row: any) => string }> = {
  contact: { table: "contacts", label: "Contact", displayName: (r) => `${r.first_name} ${r.last_name}` },
  family: { table: "families", label: "Family", displayName: (r) => r.name },
  household: { table: "households", label: "Household", displayName: (r) => r.label },
  corporation: { table: "corporations", label: "Corporation", displayName: (r) => r.name },
  professional: { table: "professionals", label: "Professional", displayName: (r) => r.full_name },
  lead: { table: "discovery_leads", label: "Lead", displayName: (r) => r.name || r.email },
};

export function EntityLinkPicker({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [entityType, setEntityType] = useState<BrainEntityType>("contact");
  const [search, setSearch] = useState("");

  const linksQuery = useQuery({
    queryKey: ["brain-entity-links", documentId],
    queryFn: () => getBrainEntityLinks(documentId),
  });

  const config = ENTITY_TABLES[entityType];

  const searchQuery = useQuery({
    queryKey: ["brain-entity-search", entityType, search],
    queryFn: async () => {
      if (search.trim().length < 2) return [];
      const { data, error } = await (supabase.from(config.table as any) as any)
        .select("*")
        .limit(10);
      if (error) throw error;
      const term = search.trim().toLowerCase();
      return (data || []).filter((row: any) => config.displayName(row)?.toLowerCase().includes(term));
    },
    enabled: open && search.trim().length >= 2,
  });

  const linkMutation = useMutation({
    mutationFn: (entityId: string) => linkBrainEntity(documentId, entityType, entityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brain-entity-links", documentId] });
      setSearch("");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message || "Could not link entity"),
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => unlinkBrainEntity(linkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brain-entity-links", documentId] }),
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {(linksQuery.data || []).map((link) => (
          <Badge key={link.id} variant="secondary" className="gap-1 pr-1">
            {ENTITY_TABLES[link.entity_type].label}
            <button
              onClick={() => unlinkMutation.mutate(link.id)}
              className="ml-1 rounded-full hover:bg-muted-foreground/20"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Link2 className="h-3.5 w-3.5" /> Link entity
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-2" align="start">
            <Select value={entityType} onValueChange={(v) => setEntityType(v as BrainEntityType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ENTITY_TABLES).map(([value, { label }]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={`Search ${config.label.toLowerCase()}s…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {searchQuery.isFetching && <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />}
              {(searchQuery.data || []).map((row: any) => (
                <button
                  key={row.id}
                  onClick={() => linkMutation.mutate(row.id)}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  {config.displayName(row) || "Untitled"}
                </button>
              ))}
              {!searchQuery.isFetching && search.trim().length >= 2 && !(searchQuery.data || []).length && (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
