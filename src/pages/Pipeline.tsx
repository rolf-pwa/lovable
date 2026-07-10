import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, DollarSign, TrendingUp, ShieldCheck, Pencil, Trash2, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface PipelineItem {
  id: string;
  contact_id: string;
  category: "pws_consulting" | "new_aum" | "insurance";
  status: "pending" | "in_process" | "completed";
  amount: number;
  aum_amount: number;
  insurance_coverage_amount: number;
  commission_amount: number;
  expected_close_date: string | null;
  notes: string | null;
  created_at: string;
  contact?: { id: string; full_name: string };
}

const CATEGORY_LABELS: Record<string, string> = {
  pws_consulting: "PWS Consulting Fees",
  new_aum: "New Investment Deposits (AUM)",
  insurance: "Insurance Sales",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_process: "In Process",
  completed: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-secondary text-secondary-foreground",
  in_process: "bg-accent text-accent-foreground",
  completed: "bg-primary text-primary-foreground",
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

export default function Pipeline() {
  const { user } = useAuth();
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [contacts, setContacts] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PipelineItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form state
  const [formContactId, setFormContactId] = useState("");
  const [formCategory, setFormCategory] = useState<string>("pws_consulting");
  const [formStatus, setFormStatus] = useState<string>("pending");
  const [formAmount, setFormAmount] = useState("");
  const [formAum, setFormAum] = useState("");
  const [formInsuranceCoverage, setFormInsuranceCoverage] = useState("");
  const [formCommission, setFormCommission] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: pipelineData }, { data: contactData }] = await Promise.all([
      supabase.from("business_pipeline" as any).select("*, contact:contacts(id, full_name)").order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, full_name").order("full_name"),
    ]);
    setItems((pipelineData as any) || []);
    setContacts(contactData || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setFormContactId("");
    setFormCategory("pws_consulting");
    setFormStatus("pending");
    setFormAmount("");
    setFormAum("");
    setFormInsuranceCoverage("");
    setFormCommission("");
    setFormDate("");
    setFormNotes("");
    setEditingItem(null);
  };

  const openEdit = (item: PipelineItem) => {
    setEditingItem(item);
    setFormContactId(item.contact_id);
    setFormCategory(item.category);
    setFormStatus(item.status);
    setFormAmount(String(item.amount));
    setFormAum(item.aum_amount ? String(item.aum_amount) : "");
    setFormInsuranceCoverage(item.insurance_coverage_amount ? String(item.insurance_coverage_amount) : "");
    setFormCommission(item.commission_amount ? String(item.commission_amount) : "");
    setFormDate(item.expected_close_date || "");
    setFormNotes(item.notes || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formContactId) {
      toast.error("Contact is required");
      return;
    }
    setSaving(true);
    const payload = {
      contact_id: formContactId,
      category: formCategory,
      status: formStatus,
      amount: formAmount ? Number(formAmount) : 0,
      aum_amount: Number(formAum) || 0,
      insurance_coverage_amount: Number(formInsuranceCoverage) || 0,
      commission_amount: Number(formCommission) || 0,
      expected_close_date: formDate || null,
      notes: formNotes || null,
    };

    if (editingItem) {
      const { error } = await (supabase.from("business_pipeline" as any) as any).update(payload).eq("id", editingItem.id);
      if (error) toast.error("Failed to update");
      else toast.success("Pipeline item updated");
    } else {
      const { error } = await (supabase.from("business_pipeline" as any) as any).insert({ ...payload, created_by: user?.id });
      if (error) toast.error("Failed to create");
      else toast.success("Pipeline item created");
    }
    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase.from("business_pipeline" as any) as any).delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else { toast.success("Deleted"); fetchData(); }
  };

  const filtered = items.filter((i) => {
    if (filterCategory !== "all" && i.category !== filterCategory) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    return true;
  });

  // Summary stats — split revenue (consulting + insurance) vs AUM
  const revenue = items.filter((i) => i.category === "pws_consulting" || i.category === "insurance");
  const aum = items.filter((i) => i.category === "new_aum");
  const sumByStatus = (arr: PipelineItem[], status: string) =>
    arr.filter((i) => i.status === status).reduce((s, i) => s + Number(i.amount), 0);
  const sumFieldByStatus = (arr: PipelineItem[], status: string, field: keyof PipelineItem) =>
    arr.filter((i) => i.status === status).reduce((s, i) => s + Number((i as any)[field] || 0), 0);

  const revenuePending = sumByStatus(revenue, "pending");
  const revenueInProcess = sumByStatus(revenue, "in_process");
  const revenueCompleted = sumByStatus(revenue, "completed");
  const totalActiveRevenue = revenuePending + revenueInProcess;

  // Consulting fees + Commissions across active revenue items
  const activeRevenueItems = revenue.filter((i) => i.status !== "completed");
  const consultingActive = activeRevenueItems.reduce((s, i) => s + Number(i.amount || 0), 0);
  const commissionsActive = activeRevenueItems.reduce((s, i) => s + Number(i.commission_amount || 0), 0);
  const totalRevenueValue = consultingActive + commissionsActive;

  const aumPending = sumByStatus(aum, "pending");
  const aumInProcess = sumByStatus(aum, "in_process");
  const aumCompleted = sumByStatus(aum, "completed");
  const totalActiveAum = aumPending + aumInProcess;

  // Insurance coverage totals
  const insuranceItems = items.filter((i) => i.category === "insurance");
  const insCoveragePending = sumFieldByStatus(insuranceItems, "pending", "insurance_coverage_amount");
  const insCoverageInProcess = sumFieldByStatus(insuranceItems, "in_process", "insurance_coverage_amount");
  const insCoverageCompleted = sumFieldByStatus(insuranceItems, "completed", "insurance_coverage_amount");
  const totalActiveInsCoverage = insCoveragePending + insCoverageInProcess;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground">New Business Pipeline</h1>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Opportunity</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingItem ? "Edit Opportunity" : "New Opportunity"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Contact</Label>
                  <Select value={formContactId} onValueChange={setFormContactId}>
                    <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
                    <SelectContent>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={formStatus} onValueChange={setFormStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Consulting Fee ($)</Label>
                  <Input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" />
                  <p className="text-xs text-muted-foreground mt-1">PWS consulting fee for this opportunity. Optional.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-md border border-border p-3 bg-muted/30">
                  <div>
                    <Label className="text-xs">AUM ($)</Label>
                    <Input type="number" value={formAum} onChange={(e) => setFormAum(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-xs">Insurance Coverage ($)</Label>
                    <Input type="number" value={formInsuranceCoverage} onChange={(e) => setFormInsuranceCoverage(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-xs">Commissions ($)</Label>
                    <Input type="number" value={formCommission} onChange={(e) => setFormCommission(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div>
                  <Label>Expected Close Date</Label>
                  <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional notes..." />
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingItem ? "Update" : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary cards — Revenue, AUM, Insurance Coverage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Revenue Pipeline: Consulting + Insurance */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <DollarSign className="h-4 w-4" />Revenue Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalRevenueValue)}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs">Consulting: {formatCurrency(consultingActive)}</Badge>
                <Badge variant="secondary" className="text-xs">Commissions: {formatCurrency(commissionsActive)}</Badge>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground pt-1 border-t border-border">
                <span>Pending: <strong className="text-foreground">{formatCurrency(revenuePending)}</strong></span>
                <span>In Process: <strong className="text-foreground">{formatCurrency(revenueInProcess)}</strong></span>
              </div>
              {revenueCompleted > 0 && (
                <p className="text-xs text-muted-foreground">Completed (fees): {formatCurrency(revenueCompleted)}</p>
              )}
            </CardContent>
          </Card>

          {/* AUM Deposits */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Landmark className="h-4 w-4" />New AUM Deposits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalActiveAum)}</p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>Pending: <strong className="text-foreground">{formatCurrency(aumPending)}</strong></span>
                <span>In Process: <strong className="text-foreground">{formatCurrency(aumInProcess)}</strong></span>
              </div>
              <p className="text-xs text-muted-foreground italic">Subject to AUM fees</p>
              {aumCompleted > 0 && (
                <p className="text-xs text-muted-foreground">Completed: {formatCurrency(aumCompleted)}</p>
              )}
            </CardContent>
          </Card>

          {/* Insurance Coverage */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />Insurance Coverage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalActiveInsCoverage)}</p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>Pending: <strong className="text-foreground">{formatCurrency(insCoveragePending)}</strong></span>
                <span>In Process: <strong className="text-foreground">{formatCurrency(insCoverageInProcess)}</strong></span>
              </div>
              <p className="text-xs text-muted-foreground italic">Face amount of pending policies</p>
              {insCoverageCompleted > 0 && (
                <p className="text-xs text-muted-foreground">Completed: {formatCurrency(insCoverageCompleted)}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No pipeline items found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Consulting Fee</TableHead>
                    <TableHead className="text-right">AUM</TableHead>
                    <TableHead className="text-right">Insurance Coverage</TableHead>
                    <TableHead className="text-right">Commissions</TableHead>
                    <TableHead>Expected Close</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link to={`/contacts/${item.contact_id}`} className="text-primary hover:underline font-medium">
                          {(item as any).contact?.full_name || "—"}
                        </Link>
                      </TableCell>
                      <TableCell>{CATEGORY_LABELS[item.category]}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(item.amount))}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{Number(item.aum_amount) ? formatCurrency(Number(item.aum_amount)) : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{Number(item.insurance_coverage_amount) ? formatCurrency(Number(item.insurance_coverage_amount)) : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{Number(item.commission_amount) ? formatCurrency(Number(item.commission_amount)) : "—"}</TableCell>
                      <TableCell>{item.expected_close_date || "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">{item.notes || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
