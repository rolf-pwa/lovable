import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Briefcase, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type Pro = {
  id: string;
  full_name: string;
  email: string;
  firm: string | null;
  professional_type: string;
  pro_portal_enabled: boolean;
  last_login_at: string | null;
};

const TYPES = [
  { value: "lawyer", label: "Lawyer" },
  { value: "accountant", label: "Accountant" },
  { value: "insurance_broker", label: "Insurance Broker" },
  { value: "executor", label: "Executor" },
  { value: "poa", label: "Power of Attorney" },
  { value: "financial_planner", label: "Financial Planner" },
  { value: "other", label: "Other" },
];

export default function Professionals() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Pro[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    firm: "",
    professional_type: "lawyer",
    credentials: "",
    phone: "",
  });

  async function load() {
    const { data, error } = await (supabase as any)
      .from("professionals")
      .select("id, full_name, email, firm, professional_type, pro_portal_enabled, last_login_at")
      .order("full_name");
    if (error) {
      toast.error("Failed to load professionals");
      return;
    }
    setRows(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!form.full_name || !form.email) {
      toast.error("Name and email are required");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("professionals").insert({
      ...form,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Professional added");
    setOpen(false);
    setForm({ full_name: "", email: "", firm: "", professional_type: "lawyer", credentials: "", phone: "" });
    load();
  }

  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.professional_type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.full_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.firm || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
              <Briefcase className="h-7 w-7 text-primary" />
              Professional Network
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Outside legal, tax, insurance, and estate professionals supporting your families.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Professional
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Professional</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Full Name *</label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Email *</label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Type</label>
                  <Select value={form.professional_type} onValueChange={(v) => setForm({ ...form, professional_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Firm</label>
                  <Input value={form.firm} onChange={(e) => setForm({ ...form, firm: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Credentials</label>
                    <Input value={form.credentials} onChange={(e) => setForm({ ...form, credentials: e.target.value })} placeholder="CPA, CA" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Phone</label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={create} disabled={saving}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, email, firm..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Firm</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Portal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link to={`/professionals/${r.id}`} className="font-medium text-primary hover:underline">
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize">{r.professional_type.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.firm || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.pro_portal_enabled ? "default" : "outline"}>
                        {r.pro_portal_enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      No professionals yet. Add your first one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
