import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, X, Plus, Search, Bell, BellOff, Trash2 } from "lucide-react";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { StatementUpload } from "@/components/StatementUpload";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

interface LinkedMember {
  relationship_id?: string;
  contact_id: string;
  display_name: string;
  relationship_label: string;
  isNew?: boolean;
}

const ContactForm = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [statementFiles, setStatementFiles] = useState<File[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [emailNotifEnabled, setEmailNotifEnabled] = useState(true);

  const [form, setForm] = useState({
    first_name: searchParams.get("first_name") || "",
    last_name: searchParams.get("last_name") || "",
    email: "",
    phone: "",
    address: "",
    family_role: "head_of_family" as "head_of_family" | "spouse" | "beneficiary" | "minor" | "head_of_household",
    governance_status: "stabilization" as "stabilization" | "sovereign" | "none" | "core",
    fiduciary_entity: "pws" as "pws" | "pwa",
    lawyer_name: "",
    lawyer_firm: "",
    accountant_name: "",
    accountant_firm: "",
    executor_name: "",
    executor_firm: "",
    poa_name: "",
    poa_firm: "",
    vineyard_ebitda: "",
    vineyard_operating_income: "",
    vineyard_balance_sheet_summary: "",
    quiet_period_start_date: "",
    
    asana_url: "",
    ia_financial_url: "",
    just_wealth_url: "",
    google_drive_url: "",
    charter_url: "",
  });

  // Household member linking
  const [householdMembers, setHouseholdMembers] = useState<LinkedMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberLabel, setMemberLabel] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; first_name: string; last_name: string | null }[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Search contacts for household linking
  const searchContacts = useCallback(async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      .neq("id", id || "")
      .limit(5);
    setSearchResults(data || []);
    setShowResults(true);
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => searchContacts(memberSearch), 300);
    return () => clearTimeout(timer);
  }, [memberSearch, searchContacts]);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const [contactRes, householdRes] = await Promise.all([
        supabase.from("contacts").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("household_relationships")
          .select("id, member_contact_id, relationship_label, contact:contacts!household_relationships_member_contact_id_fkey(id, first_name, last_name)")
          .eq("contact_id", id),
      ]);
      const data = contactRes.data;
      if (!data) return;
      setForm({
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        email: data.email || "",
        phone: data.phone || "",
        address: data.address || "",
        family_role: (data.family_role as any) || "head_of_family",
        governance_status: data.governance_status as any,
        fiduciary_entity: data.fiduciary_entity as any,
        lawyer_name: data.lawyer_name || "",
        lawyer_firm: data.lawyer_firm || "",
        accountant_name: data.accountant_name || "",
        accountant_firm: data.accountant_firm || "",
        executor_name: (data as any).executor_name || "",
        executor_firm: (data as any).executor_firm || "",
        poa_name: (data as any).poa_name || "",
        poa_firm: (data as any).poa_firm || "",
        vineyard_ebitda: data.vineyard_ebitda?.toString() || "",
        vineyard_operating_income: data.vineyard_operating_income?.toString() || "",
        vineyard_balance_sheet_summary: data.vineyard_balance_sheet_summary || "",
        quiet_period_start_date: data.quiet_period_start_date || "",
        
        asana_url: data.asana_url || "",
        ia_financial_url: data.ia_financial_url || "",
        just_wealth_url: (data as any).just_wealth_url || "",
        google_drive_url: data.google_drive_url || "",
        charter_url: (data as any).charter_url || "",
      });
      setEmailNotifEnabled(data.email_notifications_enabled !== false);
      setHouseholdMembers(
        (householdRes.data || []).map((r: any) => ({
          relationship_id: r.id,
          contact_id: r.member_contact_id,
          display_name: `${r.contact?.first_name || ""} ${r.contact?.last_name || ""}`.trim() || "Unknown",
          relationship_label: r.relationship_label || "",
        }))
      );
    }
    load();
  }, [id]);

  function addExistingMember(contact: { id: string; first_name: string; last_name: string | null }) {
    if (householdMembers.some((m) => m.contact_id === contact.id)) {
      toast.error("Already added.");
      return;
    }
    setHouseholdMembers((prev) => [
      ...prev,
      { contact_id: contact.id, display_name: `${contact.first_name} ${contact.last_name || ""}`.trim(), relationship_label: memberLabel },
    ]);
    setMemberSearch("");
    setMemberLabel("");
    setShowResults(false);
  }

  async function addNewMember(name: string) {
    if (!user) return;
    setHouseholdMembers((prev) => [
      ...prev,
      { contact_id: "", display_name: name, relationship_label: memberLabel, isNew: true },
    ]);
    setMemberSearch("");
    setMemberLabel("");
    setShowResults(false);
  }

  function removeMember(index: number) {
    setHouseholdMembers((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveHouseholdMembers(contactId: string) {
    // Delete existing relationships
    await supabase.from("household_relationships").delete().eq("contact_id", contactId);

    for (const member of householdMembers) {
      let memberId = member.contact_id;

      // Create new contact if needed
      if (member.isNew || !memberId) {
        const nameParts = member.display_name.split(" ");
        const { data } = await supabase
          .from("contacts")
          .insert({ full_name: member.display_name, first_name: nameParts[0] || "", last_name: nameParts.slice(1).join(" ") || "", created_by: user!.id } as any)
          .select("id")
          .single();
        if (data) memberId = data.id;
        else continue;
      }

      await supabase.from("household_relationships").insert({
        contact_id: contactId,
        member_contact_id: memberId,
        relationship_label: member.relationship_label || null,
      });
    }
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) {
      toast.error("First name is required.");
      return;
    }

    setSaving(true);

    const payload: any = {
      full_name: `${form.first_name} ${form.last_name}`.trim(),
      first_name: form.first_name,
      last_name: form.last_name || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      family_role: form.family_role,
      governance_status: form.governance_status,
      fiduciary_entity: form.fiduciary_entity,
      lawyer_name: form.lawyer_name || null,
      lawyer_firm: form.lawyer_firm || null,
      accountant_name: form.accountant_name || null,
      accountant_firm: form.accountant_firm || null,
      executor_name: form.executor_name || null,
      executor_firm: form.executor_firm || null,
      poa_name: form.poa_name || null,
      poa_firm: form.poa_firm || null,
      vineyard_ebitda: form.vineyard_ebitda ? Number(form.vineyard_ebitda) : null,
      vineyard_operating_income: form.vineyard_operating_income
        ? Number(form.vineyard_operating_income)
        : null,
      vineyard_balance_sheet_summary:
        form.vineyard_balance_sheet_summary || null,
      quiet_period_start_date: form.quiet_period_start_date || null,
      sidedrawer_url: form.sidedrawer_url || null,
      asana_url: form.asana_url || null,
      ia_financial_url: form.ia_financial_url || null,
      just_wealth_url: form.just_wealth_url || null,
      google_drive_url: form.google_drive_url || null,
      charter_url: form.charter_url || null,
    };

    let contactId = id;

    if (isEdit) {
      const { error } = await supabase
        .from("contacts")
        .update(payload)
        .eq("id", id!);
      if (error) {
        toast.error("Failed to update contact.");
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ ...payload, created_by: user!.id })
        .select("id")
        .single();
      if (error || !data) {
        toast.error("Failed to create contact.");
        setSaving(false);
        return;
      }
      contactId = data.id;
    }

    // Save household relationships
    await saveHouseholdMembers(contactId!);

    // Upload statements and trigger ingestion for each file
    if (statementFiles.length > 0 && contactId) {
      setIsIngesting(true);
      const contactName = `${form.first_name} ${form.last_name}`.trim();

      for (const file of statementFiles) {
        try {
          const filePath = `${contactId}/${Date.now()}_${file.name}`;
          const { error: uploadErr } = await supabase.storage
            .from("statement-uploads")
            .upload(filePath, file, { contentType: "application/pdf" });

          if (uploadErr) {
            toast.error(`Upload failed for ${file.name}: ${uploadErr.message}`);
            continue;
          }

          const { data, error } = await supabase.functions.invoke("ingest-statement", {
            body: { contactId, householdId: null, filePath, contactName },
          });

          if (error) {
            toast.error(`Ingestion failed for ${file.name}`);
          } else {
            toast.success(
              `${file.name} — ${data?.accountsInserted || 0} accounts added to Holding Tank`
            );
          }
        } catch {
          toast.error(`Error processing ${file.name}`);
        }
      }
      setIsIngesting(false);
    }

    toast.success(isEdit ? "Contact updated." : "Contact created.");
    navigate(`/contacts/${contactId}`);
    setSaving(false);
  }

  return (
    <AppLayout>
      <form onSubmit={handleSubmit} className="space-y-6">
        <PageBreadcrumbs items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Contacts", href: "/contacts" },
          ...(isEdit && id ? [{ label: form.first_name || "Contact", href: `/contacts/${id}` }] : []),
          { label: isEdit ? "Edit" : "New Contact" },
        ]} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => navigate(isEdit ? `/contacts/${id}` : "/contacts")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">
              {isEdit ? "Edit Contact" : "New Contact"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isEdit && id && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title={emailNotifEnabled ? "Email notifications on" : "Email notifications off"}
                  onClick={async () => {
                    const newVal = !emailNotifEnabled;
                    const { error } = await supabase.from("contacts").update({ email_notifications_enabled: newVal }).eq("id", id);
                    if (error) { toast.error("Failed to update notifications."); return; }
                    setEmailNotifEnabled(newVal);
                    toast.success(newVal ? "Notifications enabled" : "Notifications disabled");
                  }}
                >
                  {emailNotifEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="icon" className="text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete contact</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {form.first_name} {form.last_name} and all associated relationships. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={async () => {
                          const { error } = await supabase.from("contacts").delete().eq("id", id);
                          if (error) { toast.error("Failed to delete contact."); }
                          else { toast.success("Contact deleted."); navigate("/contacts"); }
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : isEdit ? "Update Contact" : "Create Contact"}
            </Button>
          </div>
        </div>

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="family_role">Role</Label>
              <Select value={form.family_role} onValueChange={(v) => update("family_role", v)}>
                <SelectTrigger id="family_role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="head_of_family">Head of Family</SelectItem>
                  <SelectItem value="head_of_household">Head of Household</SelectItem>
                  <SelectItem value="spouse">Spouse</SelectItem>
                  <SelectItem value="beneficiary">Beneficiary</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Governance & Sovereignty */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Governance & Sovereignty</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Sovereignty Status</Label>
              <Select value={form.governance_status} onValueChange={(v) => update("governance_status", v)}>
                <SelectTrigger><SelectValue placeholder="Select status…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-muted-foreground">— None —</SelectItem>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="stabilization">Stabilization</SelectItem>
                  <SelectItem value="sovereign">Sovereign</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fiduciary Entity</Label>
              <Select value={form.fiduciary_entity} onValueChange={(v) => update("fiduciary_entity", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pws">PWS</SelectItem>
                  <SelectItem value="pwa">PWA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Professional Team */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Professional Team</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Lawyer Name</Label>
              <Input value={form.lawyer_name} onChange={(e) => update("lawyer_name", e.target.value)} />
            </div>
            <div>
              <Label>Lawyer Firm</Label>
              <Input value={form.lawyer_firm} onChange={(e) => update("lawyer_firm", e.target.value)} />
            </div>
            <div>
              <Label>Accountant Name</Label>
              <Input value={form.accountant_name} onChange={(e) => update("accountant_name", e.target.value)} />
            </div>
            <div>
              <Label>Accountant Firm</Label>
              <Input value={form.accountant_firm} onChange={(e) => update("accountant_firm", e.target.value)} />
            </div>
            <div>
              <Label>Executor Name</Label>
              <Input value={form.executor_name} onChange={(e) => update("executor_name", e.target.value)} />
            </div>
            <div>
              <Label>Executor Firm</Label>
              <Input value={form.executor_firm} onChange={(e) => update("executor_firm", e.target.value)} />
            </div>
            <div>
              <Label>Power of Attorney Name</Label>
              <Input value={form.poa_name} onChange={(e) => update("poa_name", e.target.value)} />
            </div>
            <div>
              <Label>Power of Attorney Firm</Label>
              <Input value={form.poa_firm} onChange={(e) => update("poa_firm", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Resources */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resources</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Asana URL</Label>
              <Input value={form.asana_url} onChange={(e) => update("asana_url", e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label>IA Financial URL</Label>
              <Input value={form.ia_financial_url} onChange={(e) => update("ia_financial_url", e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label>Just Wealth URL</Label>
              <Input value={form.just_wealth_url} onChange={(e) => update("just_wealth_url", e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label>Google Drive Folder URL</Label>
              <Input value={form.google_drive_url} onChange={(e) => update("google_drive_url", e.target.value)} placeholder="https://drive.google.com/..." />
            </div>
            <div>
              <Label>Charter Document URL</Label>
              <Input value={form.charter_url} onChange={(e) => update("charter_url", e.target.value)} placeholder="https://drive.google.com/... or future SideDrawer link" />
            </div>
          </CardContent>
        </Card>

        {/* Statement Upload */}
        <StatementUpload
          files={statementFiles}
          onFilesChange={setStatementFiles}
          isIngesting={isIngesting}
        />

        {/* Household Members */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Household Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Linked members list */}
            {householdMembers.length > 0 && (
              <div className="space-y-1">
                {householdMembers.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <span className="flex-1 text-sm font-medium">{m.display_name}</span>
                    {m.relationship_label && (
                      <Badge variant="secondary" className="text-xs">{m.relationship_label}</Badge>
                    )}
                    {m.isNew && (
                      <Badge variant="outline" className="text-xs">New contact</Badge>
                    )}
                    <button type="button" onClick={() => removeMember(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search / Add */}
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="relative sm:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search existing contacts..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  onFocus={() => memberSearch.length >= 2 && setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 200)}
                  className="pl-9"
                />
                {showResults && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                    {searchResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center px-3 py-2 text-sm hover:bg-muted"
                        onMouseDown={() => addExistingMember(c)}
                      >
                        {c.first_name} {c.last_name}
                      </button>
                    ))}
                    {memberSearch.length >= 2 && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 border-t px-3 py-2 text-sm text-sanctuary-bronze hover:bg-muted"
                        onMouseDown={() => addNewMember(memberSearch)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create "{memberSearch}" as new contact
                      </button>
                    )}
                  </div>
                )}
              </div>
              <Input
                placeholder="Relationship (e.g. Spouse)"
                value={memberLabel}
                onChange={(e) => setMemberLabel(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving} className="bg-sanctuary-bronze text-sanctuary-charcoal hover:bg-sanctuary-bronze/90">
            {saving ? "Saving..." : isEdit ? "Update Contact" : "Create Contact"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(isEdit ? `/contacts/${id}` : "/contacts")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </AppLayout>
  );
};

export default ContactForm;
