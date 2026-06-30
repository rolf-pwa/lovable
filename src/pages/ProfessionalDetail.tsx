import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Plus, ArrowLeft, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

const PILLARS = [
  { value: "tax", label: "Tax" },
  { value: "legal", label: "Legal" },
  { value: "insurance", label: "Insurance" },
  { value: "estate", label: "Estate" },
  { value: "philanthropy", label: "Philanthropy" },
  { value: "governance", label: "Governance" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  invited: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  completed: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  archived: "bg-muted text-muted-foreground",
  revoked: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

export default function ProfessionalDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [pro, setPro] = useState<any>(null);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [scopes, setScopes] = useState<{ families: any[]; households: any[]; contacts: any[] }>({
    families: [], households: [], contacts: [],
  });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    pillar: "tax",
    scope_type: "household",
    scope_id: "",
  });

  async function load() {
    const [{ data: p }, { data: e }, { data: fams }, { data: hhs }, { data: cs }] = await Promise.all([
      (supabase as any).from("professionals").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("professional_engagements")
        .select("*").eq("professional_id", id).order("created_at", { ascending: false }),
      supabase.from("families").select("id, name").order("name"),
      supabase.from("households").select("id, label").order("label"),
      supabase.from("contacts").select("id, full_name").order("full_name").limit(500),
    ]);
    setPro(p);
    setEngagements(e || []);
    setScopes({ families: fams || [], households: hhs || [], contacts: cs || [] });
  }

  useEffect(() => { if (id) load(); }, [id]);

  async function togglePortal(enabled: boolean) {
    const { error } = await (supabase as any).from("professionals").update({ pro_portal_enabled: enabled }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(enabled ? "Pro Portal access enabled" : "Pro Portal access disabled");
    load();
  }

  async function createEngagement() {
    if (!form.title || !form.scope_id) {
      toast.error("Title and scope are required");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("professional_engagements").insert({
      professional_id: id,
      title: form.title,
      description: form.description,
      pillar: form.pillar,
      scope_type: form.scope_type,
      scope_id: form.scope_id,
      status: "draft",
      created_by: user?.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Engagement created");
    setOpen(false);
    setForm({ title: "", description: "", pillar: "tax", scope_type: "household", scope_id: "" });
    load();
  }

  async function updateStatus(engagementId: string, status: string) {
    const patch: any = { status };
    if (status === "active") patch.started_at = new Date().toISOString();
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await (supabase as any).from("professional_engagements").update(patch).eq("id", engagementId);
    if (error) { toast.error(error.message); return; }
    load();
  }

  const scopeOptions =
    form.scope_type === "family" ? scopes.families.map((f) => ({ id: f.id, label: f.name })) :
    form.scope_type === "household" ? scopes.households.map((h) => ({ id: h.id, label: h.label || "Household" })) :
    scopes.contacts.map((c) => ({ id: c.id, label: c.full_name }));

  if (!pro) {
    return <AppLayout><div className="p-8 text-muted-foreground">Loading…</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-8 space-y-6">
        <Link to="/professionals" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Professionals
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-serif flex items-center gap-3">
              <Briefcase className="h-7 w-7 text-primary" />
              {pro.full_name}
            </h1>
            <div className="text-muted-foreground mt-1 capitalize">
              {pro.professional_type.replace("_", " ")}
              {pro.firm && <> • {pro.firm}</>}
              {pro.credentials && <> • {pro.credentials}</>}
            </div>
            <div className="text-sm text-muted-foreground mt-1">{pro.email}{pro.phone && <> • {pro.phone}</>}</div>
          </div>
          <Card className="w-72">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Pro Portal Access</div>
                  <div className="text-xs text-muted-foreground">
                    {pro.pro_portal_enabled ? "Can log in via OTP" : "No portal access"}
                  </div>
                </div>
                <Switch checked={pro.pro_portal_enabled} onCheckedChange={togglePortal} />
              </div>
              {pro.last_login_at && (
                <div className="text-xs text-muted-foreground">
                  Last login: {format(new Date(pro.last_login_at), "PP")}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Engagements</CardTitle>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" />New Engagement</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Engagement</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Title *</label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. 2026 Tax Filing" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Pillar</label>
                      <Select value={form.pillar} onValueChange={(v) => setForm({ ...form, pillar: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PILLARS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Scope Type</label>
                      <Select value={form.scope_type} onValueChange={(v) => setForm({ ...form, scope_type: v, scope_id: "" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="family">Family</SelectItem>
                          <SelectItem value="household">Household</SelectItem>
                          <SelectItem value="contact">Contact</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Scope *</label>
                    <Select value={form.scope_id} onValueChange={(v) => setForm({ ...form, scope_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {scopeOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Description</label>
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={createEngagement} disabled={saving}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Pillar</th>
                  <th className="text-left px-4 py-3">Scope</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{e.title}</td>
                    <td className="px-4 py-3 capitalize">{e.pillar}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{e.scope_type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[e.status] || ""}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {format(new Date(e.created_at), "PP")}
                    </td>
                    <td className="px-4 py-3">
                      <Select value={e.status} onValueChange={(v) => updateStatus(e.id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["draft", "invited", "active", "completed", "archived", "revoked"].map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
                {engagements.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No engagements yet.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
