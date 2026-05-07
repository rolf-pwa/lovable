import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, ArrowRight, Check, TreesIcon, FileText, Info, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type Lead = {
  id: string;
  first_name: string;
  email: string | null;
  phone: string | null;
  transition_type: string | null;
  sovereignty_status: string;
  anxiety_anchor: string | null;
  vision_summary: string | null;
  vineyard_summary: string | null;
  discovery_notes: string | null;
  created_at: string;
};

const ROLE_OPTIONS = [
  { value: "head_of_family", label: "Head of Family" },
  { value: "spouse", label: "Spouse" },
  { value: "beneficiary", label: "Beneficiary" },
];

export default function Leads() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [convertTarget, setConvertTarget] = useState<Lead | null>(null);
  const [familyName, setFamilyName] = useState("");
  const [householdLabel, setHouseholdLabel] = useState("Primary");
  const [role, setRole] = useState("head_of_family");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["discovery-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discovery_leads")
        .select("*")
        .not("sovereignty_status", "in", "(converted_to_contact,dismissed)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from("discovery_leads")
        .update({ sovereignty_status: "dismissed" })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discovery-leads"] });
      toast.success("Lead dismissed");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss lead");
    },
  });

  const openConvertDialog = (lead: Lead) => {
    setConvertTarget(lead);
    // Pre-fill family name from lead's first name
    setFamilyName(`The ${lead.first_name} Family`);
    setHouseholdLabel("Primary");
    setRole("head_of_family");
  };

  const recalcTier = async (familyId: string) => {
    try {
      await supabase.functions.invoke("calculate-family-fee-tier", {
        body: { familyId },
      });
    } catch {
      /* silent */
    }
  };

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!user || !convertTarget) throw new Error("Not authenticated");

      // 1. Create Family
      const { data: family, error: familyErr } = await supabase
        .from("families" as any)
        .insert({ name: familyName.trim(), created_by: user.id } as any)
        .select()
        .single();
      if (familyErr || !family) throw familyErr ?? new Error("Failed to create family");

      // 2. Create Household under Family
      const { data: household, error: hhErr } = await supabase
        .from("households" as any)
        .insert({
          family_id: (family as any).id,
          label: householdLabel.trim() || "Primary",
        } as any)
        .select()
        .single();
      if (hhErr || !household) throw hhErr ?? new Error("Failed to create household");

      // 3. Create Contact linked to Family + Household
      const nameParts = convertTarget.first_name.trim().split(" ");
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") || null;

      const { data: contact, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          first_name: firstName,
          last_name: lastName,
          full_name: convertTarget.first_name.trim(),
          email: convertTarget.email,
          phone: convertTarget.phone,
          governance_status: "stabilization",
          family_role: role as any,
          family_id: (family as any).id,
          household_id: (household as any).id,
          created_by: user.id,
        })
        .select()
        .single();
      if (contactErr || !contact) throw contactErr ?? new Error("Failed to create contact");

      // 4. Mark lead as converted (hide from queue)
      await supabase
        .from("discovery_leads")
        .update({ sovereignty_status: "converted_to_contact" })
        .eq("id", convertTarget.id);

      // 4b. Carry the Stabilization Map over to the new contact
      await supabase
        .from("stabilization_maps")
        .update({ contact_id: contact.id })
        .eq("lead_id", convertTarget.id);

      // 5. Trigger fee tier calculation
      await recalcTier((family as any).id);

      return contact;
    },
    onSuccess: (contact) => {
      queryClient.invalidateQueries({ queryKey: ["discovery-leads"] });
      setConvertTarget(null);
      toast.success("Lead converted — Family & Household initialized", {
        action: {
          label: "View Contact",
          onClick: () => navigate(`/contacts/${contact.id}`),
        },
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to convert lead");
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Discovery Leads" },
          ]}
        />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Discovery Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prospects from the Georgia Transition Assistant
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">What happens on conversion?</p>
            <p className="text-muted-foreground">
              <strong>Convert to Contact</strong> initializes a Family and Household in the
              Sovereignty Tree, creates a Contact record, carries over the Stabilization Map, and
              triggers fee tier calculation. <strong>Dismiss</strong> removes the lead from this
              queue without creating any records.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !leads?.length ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <UserPlus className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No pending discovery leads.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => (
              <Card key={lead.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-foreground">
                        {lead.first_name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {lead.email && <span>{lead.email}</span>}
                        {lead.phone && <span>{lead.phone}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px]">
                        {lead.transition_type?.replace(/_/g, " ") || "Discovery"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {lead.sovereignty_status?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </div>

                  {(lead.anxiety_anchor || lead.vision_summary || lead.vineyard_summary || lead.discovery_notes) && (
                    <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/30 p-3">
                      {lead.anxiety_anchor && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            Anxiety Anchor
                          </p>
                          <p className="text-sm text-foreground">{lead.anxiety_anchor}</p>
                        </div>
                      )}
                      {lead.vision_summary && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            Vision
                          </p>
                          <p className="text-sm text-foreground">{lead.vision_summary}</p>
                        </div>
                      )}
                      {lead.vineyard_summary && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            Vineyard Summary
                          </p>
                          <p className="text-sm text-foreground">{lead.vineyard_summary}</p>
                        </div>
                      )}
                      {lead.discovery_notes && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            Notes
                          </p>
                          <p className="text-sm text-foreground">{lead.discovery_notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(lead.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => dismissMutation.mutate(lead.id)}
                        disabled={dismissMutation.isPending}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/stabilization-map/lead/${lead.id}`)}
                      >
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        Stabilization Map
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openConvertDialog(lead)}
                      >
                        <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                        Convert to Contact
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Conversion Dialog */}
      <Dialog
        open={!!convertTarget}
        onOpenChange={(open) => { if (!open) setConvertTarget(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TreesIcon className="h-5 w-5 text-primary" />
              Initialize Family Structure
            </DialogTitle>
            <DialogDescription>
              Converting <strong>{convertTarget?.first_name}</strong> will create a Contact and
              initialize their Family &amp; Household in the Sovereignty Tree.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="familyName">Family Name</Label>
              <Input
                id="familyName"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="e.g. The Smith Family"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="householdLabel">Household Label</Label>
              <Input
                id="householdLabel"
                value={householdLabel}
                onChange={(e) => setHouseholdLabel(e.target.value)}
                placeholder="e.g. Primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role in Family</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending || !familyName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {convertMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Confirm & Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
