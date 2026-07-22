import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, Loader2 } from "lucide-react";

export type CompanyDialogMember = {
  id: string;
  name: string;
  sublabel?: string;
};

interface Props {
  members: CompanyDialogMember[];
  existingCorpIds?: string[];
  onCreated: () => void;
  triggerLabel?: string;
}

const CORP_TYPES = [
  { value: "opco", label: "OpCo" },
  { value: "holdco", label: "HoldCo" },
  { value: "trust", label: "Trust" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Other" },
];

export function AddCompanyDialog({
  members,
  existingCorpIds = [],
  onCreated,
  triggerLabel = "Add Company",
}: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"create" | "link">("create");
  const [saving, setSaving] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [corpType, setCorpType] = useState("holdco");
  const [jurisdiction, setJurisdiction] = useState("BC");

  // Shared
  const [memberId, setMemberId] = useState<string>("");
  const [ownership, setOwnership] = useState<string>("100");
  const [shareClass, setShareClass] = useState("Common");
  const [roleTitle, setRoleTitle] = useState("");

  // Link
  const [availableCorps, setAvailableCorps] = useState<any[]>([]);
  const [linkCorpId, setLinkCorpId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("corporations")
        .select("id, name, corporation_type, jurisdiction")
        .order("name");
      const filtered = (data || []).filter((c) => !existingCorpIds.includes(c.id));
      setAvailableCorps(filtered);
    })();
  }, [open, existingCorpIds]);

  const reset = () => {
    setName("");
    setCorpType("holdco");
    setJurisdiction("BC");
    setMemberId("");
    setOwnership("100");
    setShareClass("Common");
    setRoleTitle("");
    setLinkCorpId("");
    setTab("create");
  };

  const submit = async () => {
    if (!memberId) return toast.error("Select a shareholder");
    const pct = Number(ownership);
    if (isNaN(pct) || pct < 0 || pct > 100) return toast.error("Ownership must be 0–100");

    setSaving(true);
    try {
      let corpId = linkCorpId;
      if (tab === "create") {
        if (!name.trim()) throw new Error("Company name is required");
        const { data: corp, error } = await supabase
          .from("corporations")
          .insert({
            name: name.trim(),
            corporation_type: corpType as any,
            jurisdiction: jurisdiction || null,
            created_by: user?.id!,
          })
          .select("id")
          .single();
        if (error) throw error;
        corpId = corp.id;
      } else {
        if (!corpId) throw new Error("Select a company to link");
      }

      const { error: shErr } = await supabase.from("shareholders").insert({
        contact_id: memberId,
        corporation_id: corpId,
        ownership_percentage: pct,
        share_class: shareClass || "Common",
        role_title: roleTitle || null,
        is_active: true,
      });
      if (shErr) throw shErr;

      toast.success(tab === "create" ? "Company created and linked" : "Company linked");
      setOpen(false);
      reset();
      onCreated();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save company");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Add Company
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="create">Create New</TabsTrigger>
            <TabsTrigger value="link">Link Existing</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs">Company Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Holdings Ltd." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={corpType} onValueChange={setCorpType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CORP_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Jurisdiction</Label>
                <Input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="BC" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="link" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs">Company *</Label>
              <Select value={linkCorpId} onValueChange={setLinkCorpId}>
                <SelectTrigger><SelectValue placeholder="Select a company..." /></SelectTrigger>
                <SelectContent>
                  {availableCorps.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.jurisdiction ? `· ${c.jurisdiction}` : ""}
                    </SelectItem>
                  ))}
                  {availableCorps.length === 0 && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">No companies available.</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        <div className="border-t border-border pt-3 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Shareholder</p>
          <div>
            <Label className="text-xs">Member *</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger><SelectValue placeholder="Select member..." /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}{m.sublabel ? ` · ${m.sublabel}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Ownership %</Label>
              <Input type="number" min={0} max={100} value={ownership} onChange={(e) => setOwnership(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Share Class</Label>
              <Input value={shareClass} onChange={(e) => setShareClass(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Director" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {tab === "create" ? "Create & Link" : "Link Company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
