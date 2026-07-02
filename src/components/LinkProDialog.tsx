import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  scopeType: "family" | "household" | "contact";
  scopeId: string;
  scopeLabel?: string;
  onLinked?: () => void;
  buttonSize?: "sm" | "default";
  buttonVariant?: "default" | "outline" | "ghost";
  buttonLabel?: string;
}

const PILLARS = ["legal", "tax", "insurance", "estate", "banking", "investment", "other"];

export default function LinkProDialog({
  scopeType, scopeId, scopeLabel,
  onLinked, buttonSize = "sm", buttonVariant = "outline", buttonLabel = "Link a Pro",
}: Props) {
  const [open, setOpen] = useState(false);
  const [pros, setPros] = useState<any[]>([]);
  const [proId, setProId] = useState<string>("");
  const [pillar, setPillar] = useState<string>("legal");
  const [title, setTitle] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("professionals")
        .select("id, full_name, firm, professional_type")
        .order("full_name", { ascending: true });
      setPros(data || []);
    })();
  }, [open]);

  const submit = async () => {
    if (!proId) return toast.error("Select a professional");
    if (!title.trim()) return toast.error("Add an engagement title");
    setSaving(true);
    const { error } = await (supabase as any).from("professional_engagements").insert({
      professional_id: proId,
      scope_type: scopeType,
      scope_id: scopeId,
      pillar,
      title: title.trim(),
      status: "active",
      started_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `Pro linked at ${scopeType} scope${
        scopeType === "contact"
          ? " — visibility limited to this contact only"
          : scopeType === "household"
          ? " — visibility limited to this household"
          : " — visibility spans the entire family"
      }.`,
    );
    setOpen(false);
    setProId(""); setTitle(""); setPillar("legal");
    onLinked?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={buttonSize} variant={buttonVariant}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a Professional</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            Scope: <span className="font-medium capitalize">{scopeType}</span>
            {scopeLabel ? ` — ${scopeLabel}` : ""}. The pro will only see
            {scopeType === "contact"
              ? " this contact"
              : scopeType === "household"
              ? " this household and its members"
              : " everything in this family"} in their portal.
          </p>
          <div>
            <Label>Professional</Label>
            <Select value={proId} onValueChange={setProId}>
              <SelectTrigger><SelectValue placeholder="Select a pro…" /></SelectTrigger>
              <SelectContent>
                {pros.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}{p.firm ? ` · ${p.firm}` : ""}
                    {p.professional_type ? ` · ${p.professional_type.replace("_", " ")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Pillar</Label>
              <Select value={pillar} onValueChange={setPillar}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PILLARS.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Engagement title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Estate freeze review" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Link Pro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
