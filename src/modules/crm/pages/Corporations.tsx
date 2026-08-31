import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { AppLayout } from "@/shared/components/AppLayout";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { PageBreadcrumbs } from "@/shared/components/PageBreadcrumbs";
import { ListRow } from "@/shared/components/ListRow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Building2, Plus, Search, Users, DollarSign, ChevronRight, ChevronDown, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/shared/hooks/useAuth";

interface Corporation {
  id: string;
  name: string;
  corporation_type: string;
  jurisdiction: string | null;
  fiscal_year_end: string | null;
  shareholder_count: number;
  total_assets: number;
  children?: Corporation[];
  ownership_percentage?: number;
}

interface CorporateShareholder {
  parent_corporation_id: string;
  child_corporation_id: string;
  ownership_percentage: number;
}

const TYPE_LABELS: Record<string, string> = {
  opco: "Operating Co.",
  holdco: "Holding Co.",
  trust: "Trust",
  partnership: "Partnership",
  other: "Other",
};

const Corporations = () => {
  const { user } = useAuth();
  const [corps, setCorps] = useState<Corporation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("opco");
  const [newJurisdiction, setNewJurisdiction] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchCorps = useCallback(async () => {
    const { data: corpData } = await (supabase.from("corporations" as any) as any)
      .select("*")
      .order("name");

    if (!corpData) { setLoading(false); return; }

    const corpIds = (corpData as any[]).map((c: any) => c.id);
    
    const [shareholdersRes, assetsRes, corpShareholdersRes] = await Promise.all([
      corpIds.length > 0
        ? (supabase.from("shareholders" as any) as any).select("corporation_id").in("corporation_id", corpIds)
        : Promise.resolve({ data: [] }),
      corpIds.length > 0
        ? (supabase.from("corporate_vineyard_accounts" as any) as any).select("corporation_id, current_value").in("corporation_id", corpIds)
        : Promise.resolve({ data: [] }),
      corpIds.length > 0
        ? (supabase.from("corporate_shareholders" as any) as any).select("parent_corporation_id, child_corporation_id, ownership_percentage").in("parent_corporation_id", corpIds)
        : Promise.resolve({ data: [] }),
    ]);

    const shareholderCounts: Record<string, number> = {};
    ((shareholdersRes.data || []) as any[]).forEach((s: any) => {
      shareholderCounts[s.corporation_id] = (shareholderCounts[s.corporation_id] || 0) + 1;
    });

    const assetTotals: Record<string, number> = {};
    ((assetsRes.data || []) as any[]).forEach((a: any) => {
      assetTotals[a.corporation_id] = (assetTotals[a.corporation_id] || 0) + Number(a.current_value || 0);
    });

    const corpShareholderLinks = (corpShareholdersRes.data || []) as CorporateShareholder[];

    // Build a map of all corps
    const corpMap: Record<string, Corporation> = {};
    (corpData as any[]).forEach((c: any) => {
      corpMap[c.id] = {
        id: c.id,
        name: c.name,
        corporation_type: c.corporation_type,
        jurisdiction: c.jurisdiction,
        fiscal_year_end: c.fiscal_year_end,
        shareholder_count: shareholderCounts[c.id] || 0,
        total_assets: assetTotals[c.id] || 0,
      };
    });

    // Identify child IDs (corps that are subsidiaries of another corp)
    const childIds = new Set<string>();
    corpShareholderLinks.forEach((link) => {
      childIds.add(link.child_corporation_id);
      const parent = corpMap[link.parent_corporation_id];
      const child = corpMap[link.child_corporation_id];
      if (parent && child) {
        if (!parent.children) parent.children = [];
        parent.children.push({ ...child, ownership_percentage: link.ownership_percentage });
      }
    });

    // Top-level = corps that are NOT children of another corp
    const topLevel = Object.values(corpMap).filter((c) => !childIds.has(c.id));

    setCorps(topLevel);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCorps(); }, [fetchCorps]);

  const createCorp = async () => {
    if (!newName.trim() || !user) return;
    const { error } = await (supabase.from("corporations" as any) as any)
      .insert({
        name: newName.trim(),
        corporation_type: newType,
        jurisdiction: newJurisdiction.trim() || null,
        created_by: user.id,
      });
    if (error) {
      toast.error("Failed to create corporation.");
    } else {
      toast.success("Corporation created.");
      setNewName("");
      setNewType("opco");
      setNewJurisdiction("");
      setShowNew(false);
      fetchCorps();
    }
  };

  const filtered = corps.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
      c.children?.some((ch) => ch.name.toLowerCase().includes(q));
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Corporations" },
        ]} />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Corporations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {corps.length} corporate {corps.length === 1 ? "entity" : "entities"}
            </p>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Corporation
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search corporations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p>No corporations yet. Create one to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {filtered.map((corp) => {
                const hasChildren = !!corp.children?.length;
                const isExpanded = expanded[corp.id];
                return (
                  <div key={corp.id}>
                    <ListRow to={`/corporations/${corp.id}`}>
                      {hasChildren ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setExpanded((prev) => ({ ...prev, [corp.id]: !prev[corp.id] }));
                          }}
                          className="shrink-0 -ml-1 p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <Building2 className="h-4 w-4 shrink-0 text-accent" />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{corp.name}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {TYPE_LABELS[corp.corporation_type] || corp.corporation_type}
                      </Badge>
                      {corp.jurisdiction && (
                        <span className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground sm:inline">
                          {corp.jurisdiction}
                        </span>
                      )}
                      <span className="hidden w-24 shrink-0 items-center gap-1 text-xs text-muted-foreground md:flex">
                        <Users className="h-3.5 w-3.5" />
                        {corp.shareholder_count}
                      </span>
                      <span className="w-24 shrink-0 text-right text-xs font-medium text-foreground">
                        ${corp.total_assets.toLocaleString()}
                      </span>
                      {hasChildren && (
                        <span className="hidden shrink-0 items-center gap-1 text-[10px] text-muted-foreground lg:flex">
                          <GitBranch className="h-3 w-3" />
                          {corp.children!.length}
                        </span>
                      )}
                    </ListRow>
                    {isExpanded && corp.children?.map((child) => (
                      <ListRow key={child.id} to={`/corporations/${child.id}`} className="pl-9 bg-muted/20">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-accent/70" />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{child.name}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {TYPE_LABELS[child.corporation_type] || child.corporation_type}
                        </Badge>
                        {child.ownership_percentage != null && (
                          <span className="hidden w-20 shrink-0 text-xs font-medium text-accent/80 sm:inline">
                            {child.ownership_percentage}% owned
                          </span>
                        )}
                        <span className="w-24 shrink-0 text-right text-xs font-medium text-foreground">
                          ${child.total_assets.toLocaleString()}
                        </span>
                      </ListRow>
                    ))}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* New Corporation Dialog */}
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Corporation</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Smith Holdings Inc." />
              </div>
              <div>
                <label className="text-sm font-medium">Type</label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Jurisdiction</label>
                <Input value={newJurisdiction} onChange={(e) => setNewJurisdiction(e.target.value)} placeholder="e.g. Ontario, Canada" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button onClick={createCorp} disabled={!newName.trim()}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default Corporations;
