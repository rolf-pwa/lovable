import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Crown, Search, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface FamilyRow {
  id: string;
  name: string;
  fee_tier: string | null;
  total_family_assets: number | null;
  vfo_enabled: boolean;
  vfo_enrolled_at: string | null;
}

const AdminVfo = () => {
  const [rows, setRows] = useState<FamilyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("families")
      .select("id, name, fee_tier, total_family_assets, vfo_enabled, vfo_enrolled_at")
      .order("vfo_enabled", { ascending: false })
      .order("name");
    if (error) {
      toast({ title: "Failed to load families", description: error.message, variant: "destructive" });
    } else {
      setRows((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (row: FamilyRow, next: boolean) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("families")
      .update({
        vfo_enabled: next,
        vfo_enrolled_at: next ? new Date().toISOString() : null,
      } as any)
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, vfo_enabled: next, vfo_enrolled_at: next ? new Date().toISOString() : null } : r));
    toast({ title: next ? "Enrolled in VFO" : "Removed from VFO", description: row.name });
  };

  const filtered = rows.filter((r) => r.name?.toLowerCase().includes(query.toLowerCase()));
  const enrolledCount = rows.filter((r) => r.vfo_enabled).length;

  const fmt = (n: number | null) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl text-foreground flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Virtual Family Office Roster
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Designate families that receive the premium VFO experience.
            </p>
          </div>
          <Badge variant="outline" className="border-amber-500/40 text-amber-600">
            {enrolledCount} enrolled
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Families</CardTitle>
            <div className="relative max-w-sm mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search families..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No families found.</p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((row) => (
                  <div key={row.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link to={`/families/${row.id}`} className="text-sm font-medium text-foreground hover:underline truncate">
                          {row.name}
                        </Link>
                        {row.vfo_enabled && (
                          <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]">
                            VFO
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmt(row.total_family_assets)} · {row.fee_tier || "—"}
                        {row.vfo_enrolled_at && (
                          <> · enrolled {new Date(row.vfo_enrolled_at).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {savingId === row.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      <Switch
                        checked={row.vfo_enabled}
                        onCheckedChange={(v) => toggle(row, v)}
                        disabled={savingId === row.id}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">How clients reach the VFO view</p>
            <p>
              Once a family is enrolled, any member with a valid portal token can access the premium view at{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded">/vfo/&lt;token&gt;</code>. The same magic-link minting flow applies.
            </p>
            <p className="flex items-center gap-1">
              Preview the route format <ExternalLink className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminVfo;
