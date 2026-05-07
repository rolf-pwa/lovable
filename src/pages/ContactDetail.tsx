import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, Bell, BellOff, Trash2, Clock, AlertCircle, Shield, 
  ExternalLink, Bot, Grape, FileUp, Loader2, Building2, Users, Plus, X,
  Folder, FolderOpen, CheckSquare, ShieldCheck, Landmark, ChevronDown, ListChecks,
  Mail, Phone, MapPin, Home, Calendar
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format, differenceInDays, addDays } from "date-fns";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { ContactMerge } from "@/components/ContactMerge";
import { PortalMagicLinkButton } from "@/components/portal/PortalMagicLinkButton";
import { ContactTaskList } from "@/components/ContactTaskList";
import { ContactRequests } from "@/components/ContactRequests";
import { ContactCalendar } from "@/components/ContactCalendar";
import { ContactEmails } from "@/components/ContactEmails";
import QuoCommunications from "@/components/QuoCommunications";
import { SovereigntyAssistant } from "@/components/SovereigntyAssistant";
import { AuditTrail } from "@/components/AuditTrail";
import { StatementUpload } from "@/components/StatementUpload";
import { HoldingTank } from "@/components/HoldingTank";
import { AssetContainer, type MoveTarget } from "@/components/AssetContainer";
import { ProfessionalLinker } from "@/components/ProfessionalLinker";
import { StabilizationMapButton } from "@/components/StabilizationMapButton";
import { QuarterlySystemReviewButton } from "@/components/QuarterlySystemReviewButton";
import { SovereigntyCharterButton } from "@/components/SovereigntyCharterButton";
import { GenerateCharterDraftButton } from "@/components/GenerateCharterDraftButton";
import { VaultView } from "@/pages/Vault";
import { dialViaQuo } from "@/lib/quo-dial";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, 
  AlertDialogTitle, AlertDialogTrigger 
} from "@/components/ui/alert-dialog";

const STOREHOUSE_NAMES = ["The Keep", "The Armoury", "The Granary", "The Vault"];

interface Storehouse {
  id: string;
  storehouse_number: number;
  label: string;
  asset_type: string | null;
  risk_cap: string | null;
  charter_alignment: string;
  notes: string | null;
  visibility_scope: string;
  current_value: number | null;
  target_value: number | null;
  book_value: number | null;
}

interface HouseholdMember {
  id: string;
  first_name: string;
  last_name: string | null;
  family_role: string;
}

interface VineyardAccount {
  id: string;
  account_name: string;
  account_number?: string | null;
  account_type: string;
  book_value: number | null;
  current_value: number | null;
  notes: string | null;
  visibility_scope: string;
}

interface HarvestSnapshot {
  id: string;
  snapshot_date: string;
  reporting_year: number;
  boy_value: number;
  current_harvest: number;
  current_value: number;
  notes: string | null;
  vineyard_account_id: string | null;
  storehouse_id: string | null;
}

interface HarvestDraft {
  id?: string;
  snapshot_date: string;
  boy_value: string;
  current_harvest: string;
  current_value: string;
  notes: string;
}

const formatCurrency = (value: number | null | undefined) =>
  value == null || Number.isNaN(value)
    ? "—"
    : new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);

const toInputValue = (value: number | null | undefined) =>
  value == null || Number.isNaN(value) ? "" : String(value);

const parseMoney = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const getHarvestKey = (kind: "vineyard" | "storehouse", id: string) => `${kind}:${id}`;

const ContactDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<any>(null);
  const [storehouses, setStorehouses] = useState<Storehouse[]>([]);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [householdLabel, setHouseholdLabel] = useState<string | null>(null);
  const [householdVaultRootId, setHouseholdVaultRootId] = useState<string | null>(null);
  const [vineyardAccounts, setVineyardAccounts] = useState<VineyardAccount[]>([]);
  const [professionalContacts, setProfessionalContacts] = useState<Record<string, { id: string; full_name: string } | null>>({});
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("Portfolio");
  const [newAccountValue, setNewAccountValue] = useState("");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statementFiles, setStatementFiles] = useState<File[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [harvestSnapshots, setHarvestSnapshots] = useState<HarvestSnapshot[]>([]);
  const [harvestDrafts, setHarvestDrafts] = useState<Record<string, HarvestDraft>>({});
  const [savingHarvestKey, setSavingHarvestKey] = useState<string | null>(null);
  const [corporateStakes, setCorporateStakes] = useState<Array<{
    corporation_id: string;
    corporation_name: string;
    corporation_type: string;
    ownership_percentage: number;
    share_class: string | null;
    role_title: string | null;
    total_assets: number;
    pro_rata: number;
    subsidiaries: Array<{
      child_id: string;
      child_name: string;
      child_type: string;
      parent_ownership_pct: number;
      child_total_assets: number;
      indirect_pro_rata: number;
    }>;
  }>>([]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [contactRes, storehouseRes, , , accountsRes, harvestRes] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", id).maybeSingle(),
      supabase.from("storehouses").select("*").eq("contact_id", id).order("storehouse_number"),
      Promise.resolve({ data: [] }),
      supabase.from("family_relationships").select("id, member_contact_id, relationship_label, contact:contacts!family_relationships_member_contact_id_fkey(id, first_name, last_name)").eq("contact_id", id),
      supabase.from("vineyard_accounts" as any).select("*").eq("contact_id", id).order("created_at"),
      supabase.from("account_harvest_snapshots").select("*").eq("contact_id", id).order("snapshot_date", { ascending: false }),
    ]);
    setContact(contactRes.data);
    setStorehouses(storehouseRes.data || []);
    setVineyardAccounts((accountsRes.data as any) || []);
    setHarvestSnapshots((harvestRes.data as any) || []);

    if (contactRes.data?.household_id) {
      const { data: hhMembers } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, family_role")
        .eq("household_id", contactRes.data.household_id)
        .neq("id", id)
        .order("first_name");
      setHouseholdMembers((hhMembers as any) || []);
    } else {
      setHouseholdMembers([]);
    }

    if (contactRes.data?.family_id) {
      const { data: fam } = await supabase.from("families").select("name").eq("id", contactRes.data.family_id).maybeSingle();
      setFamilyName(fam?.name || null);
    }
    if (contactRes.data?.household_id) {
      const { data: hh } = await supabase.from("households").select("label, vault_root_folder_id").eq("id", contactRes.data.household_id).maybeSingle();
      setHouseholdLabel(hh?.label || null);
      setHouseholdVaultRootId((hh as any)?.vault_root_folder_id || null);
    }

    const names = [contactRes.data?.lawyer_name, contactRes.data?.accountant_name, contactRes.data?.executor_name, contactRes.data?.poa_name].filter(Boolean) as string[];
    if (names.length > 0) {
      const { data: matchedContacts } = await supabase.from("contacts").select("id, first_name, last_name, full_name").in("full_name", names);
      const map: Record<string, { id: string; full_name: string } | null> = {};
      names.forEach((name) => {
        const match = matchedContacts?.find((c) => c.full_name === name) || null;
        map[name] = match ? { id: match.id, full_name: match.full_name } : null;
      });
      setProfessionalContacts(map);
    }

    const { data: shareholdings } = await supabase.from("shareholders").select("corporation_id, ownership_percentage, share_class, role_title").eq("contact_id", id).eq("is_active", true);
    if (shareholdings && shareholdings.length > 0) {
      const corpIds = shareholdings.map((s) => s.corporation_id);
      const [corpsRes, assetsRes, subsRes] = await Promise.all([
        supabase.from("corporations").select("id, name, corporation_type").in("id", corpIds),
        supabase.from("corporate_vineyard_accounts").select("corporation_id, current_value").in("corporation_id", corpIds),
        supabase.from("corporate_shareholders").select("parent_corporation_id, child_corporation_id, ownership_percentage").in("parent_corporation_id", corpIds),
      ]);
      const childIds = (subsRes.data || []).map((s) => s.child_corporation_id);
      let childCorps: any[] = [];
      let childAssets: any[] = [];
      if (childIds.length > 0) {
        const [cc, ca] = await Promise.all([
          supabase.from("corporations").select("id, name, corporation_type").in("id", childIds),
          supabase.from("corporate_vineyard_accounts").select("corporation_id, current_value").in("corporation_id", childIds),
        ]);
        childCorps = cc.data || [];
        childAssets = ca.data || [];
      }
      const stakes = shareholdings.map((sh) => {
        const corp = (corpsRes.data || []).find((c) => c.id === sh.corporation_id);
        const totalAssets = (assetsRes.data || []).filter((a) => a.corporation_id === sh.corporation_id).reduce((sum, a) => sum + (Number(a.current_value) || 0), 0);
        const proRata = totalAssets * (sh.ownership_percentage / 100);
        const subs = (subsRes.data || []).filter((s) => s.parent_corporation_id === sh.corporation_id).map((s) => {
          const child = childCorps.find((c: any) => c.id === s.child_corporation_id);
          const childTotal = childAssets.filter((a: any) => a.corporation_id === s.child_corporation_id).reduce((sum: number, a: any) => sum + (Number(a.current_value) || 0), 0);
          const indirectPct = (sh.ownership_percentage / 100) * (s.ownership_percentage / 100);
          return { child_id: s.child_corporation_id, child_name: child?.name || "Unknown", child_type: child?.corporation_type || "other", parent_ownership_pct: s.ownership_percentage, child_total_assets: childTotal, indirect_pro_rata: childTotal * indirectPct };
        });
        return { corporation_id: sh.corporation_id, corporation_name: corp?.name || "Unknown", corporation_type: corp?.corporation_type || "other", ownership_percentage: sh.ownership_percentage, share_class: sh.share_class, role_title: sh.role_title, total_assets: totalAssets, pro_rata: proRata, subsidiaries: subs };
      });
      setCorporateStakes(stakes);
    } else {
      setCorporateStakes([]);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const latestByKey = harvestSnapshots.reduce<Record<string, HarvestSnapshot>>((acc, snapshot) => {
      const key = snapshot.vineyard_account_id
        ? getHarvestKey("vineyard", snapshot.vineyard_account_id)
        : snapshot.storehouse_id
          ? getHarvestKey("storehouse", snapshot.storehouse_id)
          : null;

      if (!key) return acc;

      const current = acc[key];
      if (!current || new Date(snapshot.snapshot_date) > new Date(current.snapshot_date)) {
        acc[key] = snapshot;
      }
      return acc;
    }, {});

    const today = new Date().toISOString().slice(0, 10);
    const nextDrafts: Record<string, HarvestDraft> = {};

    vineyardAccounts.forEach((account) => {
      const key = getHarvestKey("vineyard", account.id);
      const snapshot = latestByKey[key];
      nextDrafts[key] = {
        id: snapshot?.id,
        snapshot_date: snapshot?.snapshot_date ?? today,
        boy_value: toInputValue(snapshot?.boy_value ?? account.book_value),
        current_harvest: toInputValue(snapshot?.current_harvest),
        current_value: toInputValue(snapshot?.current_value ?? account.current_value),
        notes: snapshot?.notes ?? "",
      };
    });

    storehouses.forEach((storehouse) => {
      const key = getHarvestKey("storehouse", storehouse.id);
      const snapshot = latestByKey[key];
      nextDrafts[key] = {
        id: snapshot?.id,
        snapshot_date: snapshot?.snapshot_date ?? today,
        boy_value: toInputValue(snapshot?.boy_value ?? storehouse.book_value),
        current_harvest: toInputValue(snapshot?.current_harvest),
        current_value: toInputValue(snapshot?.current_value ?? storehouse.current_value),
        notes: snapshot?.notes ?? "",
      };
    });

    setHarvestDrafts(nextDrafts);
  }, [harvestSnapshots, vineyardAccounts, storehouses]);

  const handleIngestStatements = async () => {
    if (!statementFiles.length || !contact) return;
    setIsIngesting(true);
    try {
      for (const file of statementFiles) {
        const filePath = `${id}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("statement-uploads").upload(filePath, file);
        if (upErr) { toast.error(`Upload failed: ${upErr.message}`); continue; }
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-statement`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ contactId: id, householdId: contact.household_id, filePath, contactName: contact.full_name }),
        });
        const result = await res.json();
        if (result.error) { toast.error(result.error); }
        else { toast.success(`Extracted ${result.accountsExtracted} account(s) from ${file.name}`); }
      }
      setStatementFiles([]);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Ingestion failed");
    } finally {
      setIsIngesting(false);
    }
  };

  const updateHarvestDraft = (key: string, field: keyof HarvestDraft, value: string) => {
    setHarvestDrafts((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const saveHarvestSnapshot = async (
    key: string,
    account: { id: string; name: string; kind: "vineyard" | "storehouse" }
  ) => {
    const draft = harvestDrafts[key];
    if (!draft) return;

    const boyValue = parseMoney(draft.boy_value) ?? 0;
    const currentValue = parseMoney(draft.current_value) ?? 0;
    const calculatedHarvest = currentValue - boyValue;
    const currentHarvest = parseMoney(draft.current_harvest) ?? calculatedHarvest;

    const payload = {
      contact_id: id!,
      snapshot_date: draft.snapshot_date,
      boy_value: boyValue,
      ytd_value: currentValue,
      current_harvest: currentHarvest,
      current_value: currentValue,
      notes: draft.notes.trim() || null,
      vineyard_account_id: account.kind === "vineyard" ? account.id : null,
      storehouse_id: account.kind === "storehouse" ? account.id : null,
    };

    setSavingHarvestKey(key);
    try {
      if (draft.id) {
        const { error } = await supabase
          .from("account_harvest_snapshots")
          .update(payload)
          .eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("account_harvest_snapshots").insert(payload);
        if (error) throw error;
      }

      const sourceTable = account.kind === "vineyard" ? "vineyard_accounts" : "storehouses";
      const { error: sourceError } = await supabase
        .from(sourceTable as any)
        .update({
          book_value: boyValue,
          current_value: currentValue,
        } as any)
        .eq("id", account.id);
      if (sourceError) throw sourceError;

      toast.success(`${account.name} harvest tracking saved.`);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Failed to save harvest tracking.");
    } finally {
      setSavingHarvestKey(null);
    }
  };

  if (loading) {
    return (<AppLayout><p className="text-muted-foreground">Loading...</p></AppLayout>);
  }
  if (!contact) {
    return (<AppLayout><p className="text-muted-foreground">Contact not found.</p></AppLayout>);
  }

  const isStabilization = contact.governance_status === "stabilization";
  const quietStart = contact.quiet_period_start_date ? new Date(contact.quiet_period_start_date) : null;
  const quietEnd = quietStart ? addDays(quietStart, 90) : null;
  const daysElapsed = quietStart ? Math.min(differenceInDays(new Date(), quietStart), 90) : 0;
  const daysLeft = quietEnd ? Math.max(differenceInDays(quietEnd, new Date()), 0) : null;
  const progressPct = quietStart ? Math.min((daysElapsed / 90) * 100, 100) : 0;

  const resourceLinks = [
    { label: "Google Drive", url: contact.google_drive_url, icon: FolderOpen },
    { label: "Asana", url: contact.asana_url, icon: CheckSquare },
    { label: "IA Financial", url: contact.ia_financial_url, icon: ShieldCheck },
    { label: "Just Wealth", url: (contact as any).just_wealth_url, icon: Landmark },
  ];

  const PHASES = [
    { num: 1, label: "Discovery" },
    { num: 2, label: "Charter Drafting" },
    { num: 3, label: "Quiet Period" },
    { num: 4, label: "Ratification" },
    { num: 5, label: "Sovereign" },
  ];


  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs items={[
          { label: "Dashboard", href: "/dashboard" },
          ...(familyName ? [{ label: familyName, href: "/families" }] : []),
          ...(householdLabel && contact.household_id ? [{ label: householdLabel, href: `/households/${contact.household_id}` }] : []),
          { label: "Contacts", href: "/contacts" },
          { label: `${contact.first_name} ${contact.last_name || ""}`.trim() },
        ]} />
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/contacts")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{contact.first_name} {contact.last_name}</h1>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="text-xs uppercase">
                  {contact.fiduciary_entity}
                </Badge>
                {contact.governance_status !== "none" && (
                  <Badge
                    className={
                      isStabilization
                         ? "bg-sanctuary-green/20 text-sanctuary-green border-sanctuary-green/30"
                         : "bg-sanctuary-bronze/20 text-sanctuary-bronze border-sanctuary-bronze/30"
                    }
                  >
                    {isStabilization ? "Stabilization Phase" : "Sovereign Phase"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2" />

        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Quiet Period Timer */}
            {isStabilization && quietStart && (
               <Card className="border-sanctuary-green/30">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Clock className="h-5 w-5 text-sanctuary-green" />
                    <h3 className="font-semibold">Quiet Period</h3>
                    <Badge className="ml-auto bg-sanctuary-green/10 text-sanctuary-green border-sanctuary-green/20">
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Zero Sales Pressure
                    </Badge>
                  </div>
                  <Progress value={progressPct} className="mb-3 h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Started {format(quietStart, "MMM d, yyyy")}</span>
                    <span className="font-medium text-foreground">
                      {daysLeft !== null && daysLeft > 0
                        ? `${daysLeft} days remaining`
                        : "Quiet Period Complete"}
                    </span>
                    <span>Ends {quietEnd && format(quietEnd, "MMM d, yyyy")}</span>
                  </div>
                  {daysLeft === 0 && (
                    <div className="mt-4 rounded-md bg-sanctuary-bronze/10 p-3 text-center text-sm text-sanctuary-bronze">
                      <Shield className="mr-1 inline h-4 w-4" />
                      Ready for Charter Ratification
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Main Tabs */}
            <Tabs defaultValue="comms" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="comms" className="flex-1">Communications</TabsTrigger>
                <TabsTrigger value="vault" className="flex-1">
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  Vault
                </TabsTrigger>
                <TabsTrigger value="actions" className="flex-1">
                  <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                  Action Items
                </TabsTrigger>
                <TabsTrigger value="vineyard" className="flex-1">
                  <Grape className="mr-1.5 h-3.5 w-3.5" />
                  The Vineyard
                </TabsTrigger>
              </TabsList>

              {/* Communications Tab — Messaging first, above the fold */}
              <TabsContent value="comms" className="space-y-6 mt-4">
                <QuoCommunications
                  contactId={contact.id}
                  contactPhone={contact.phone}
                  contactName={`${contact.first_name} ${contact.last_name || ""}`.trim()}
                />
                <ContactEmails contactEmail={contact.email} />
              </TabsContent>

              {/* Vault Tab */}
              <TabsContent value="vault" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-accent" />
                    Household document vault — manage visibility and share with collaborators.
                  </div>
                  {householdVaultRootId ? (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`https://drive.google.com/drive/folders/${householdVaultRootId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Open in Drive
                      </a>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/vault/${contact.id}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Open Full Page
                      </Link>
                    </Button>
                  )}
                </div>
                {contact.household_id ? (
                  <VaultView forcedHouseholdId={contact.household_id} embedded />
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                      This contact is not assigned to a household yet.
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Action Items Tab */}
              <TabsContent value="actions" className="space-y-6 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">AI Workbench</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <SovereigntyCharterButton contactId={id!} />
                    <GenerateCharterDraftButton contactId={id!} />
                    <StabilizationMapButton contactId={id!} />
                    <QuarterlySystemReviewButton contactId={id!} />
                  </CardContent>
                </Card>
                <ContactTaskList asanaUrl={contact.asana_url} contactId={contact.id} householdMembers={householdMembers} />
                <ContactCalendar contactEmail={contact.email} contactName={contact.full_name} />
                <ContactRequests contactId={id!} />
                <AuditTrail contactId={id!} />
              </TabsContent>

              {/* The Vineyard Tab */}
              <TabsContent value="vineyard" className="space-y-4 mt-4">
                {/* Statement Upload */}
                <StatementUpload
                  files={statementFiles}
                  onFilesChange={setStatementFiles}
                  isIngesting={isIngesting}
                />
                {statementFiles.length > 0 && !isIngesting && (
                  <Button onClick={handleIngestStatements} className="w-full">
                    <FileUp className="h-4 w-4 mr-2" />
                    Ingest {statementFiles.length} Statement{statementFiles.length !== 1 ? "s" : ""}
                  </Button>
                )}
                {isIngesting && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI is parsing statements…
                  </div>
                )}

                {/* Holding Tank */}
                <HoldingTank contactId={id!} onAccountMoved={() => fetchData()} />

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Annual Harvest Tracking</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Quarterly statement uploads can prefill these values. You can review and override BOY, Harvest, and current values here.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {vineyardAccounts.length === 0 && storehouses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No Vineyard or Storehouse accounts available yet.</p>
                    ) : (
                      <>
                        {vineyardAccounts.map((account) => {
                          const key = getHarvestKey("vineyard", account.id);
                          const draft = harvestDrafts[key];
                          const boy = parseMoney(draft?.boy_value ?? "") ?? account.book_value ?? 0;
                          const current = parseMoney(draft?.current_value ?? "") ?? account.current_value ?? 0;
                          const harvest = parseMoney(draft?.current_harvest ?? "") ?? (current - boy);

                          return (
                            <div key={account.id} className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">{account.account_name}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <Badge variant="outline">Vineyard</Badge>
                                    <span>{account.account_type}</span>
                                    {account.account_number && <span>Acct #{account.account_number}</span>}
                                  </div>
                                </div>
                                <div className="text-right text-xs text-muted-foreground">
                                  <p>Calculated Harvest</p>
                                  <p className="text-sm font-semibold text-foreground">{formatCurrency(harvest)}</p>
                                </div>
                              </div>

                              <div className="grid gap-3 md:grid-cols-3">
                                <Input type="date" value={draft?.snapshot_date ?? ""} onChange={(e) => updateHarvestDraft(key, "snapshot_date", e.target.value)} />
                                <Input type="number" placeholder="BOY" value={draft?.boy_value ?? ""} onChange={(e) => updateHarvestDraft(key, "boy_value", e.target.value)} />
                                <Input type="number" placeholder="Current Value" value={draft?.current_value ?? ""} onChange={(e) => updateHarvestDraft(key, "current_value", e.target.value)} />
                              </div>

                              <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
                                <Input type="number" placeholder="Current Harvest" value={draft?.current_harvest ?? ""} onChange={(e) => updateHarvestDraft(key, "current_harvest", e.target.value)} />
                                <Textarea className="min-h-[44px]" placeholder="Notes" value={draft?.notes ?? ""} onChange={(e) => updateHarvestDraft(key, "notes", e.target.value)} />
                                <Button
                                  onClick={() => saveHarvestSnapshot(key, { id: account.id, name: account.account_name, kind: "vineyard" })}
                                  disabled={savingHarvestKey === key || !(draft?.snapshot_date)}
                                >
                                  {savingHarvestKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                                </Button>
                              </div>
                            </div>
                          );
                        })}

                        {storehouses.map((storehouse) => {
                          const key = getHarvestKey("storehouse", storehouse.id);
                          const draft = harvestDrafts[key];
                          const boy = parseMoney(draft?.boy_value ?? "") ?? storehouse.book_value ?? 0;
                          const current = parseMoney(draft?.current_value ?? "") ?? storehouse.current_value ?? 0;
                          const harvest = parseMoney(draft?.current_harvest ?? "") ?? (current - boy);
                          const label = storehouse.asset_type || storehouse.label || STOREHOUSE_NAMES[storehouse.storehouse_number - 1];

                          return (
                            <div key={storehouse.id} className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">{label}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <Badge variant="outline">{STOREHOUSE_NAMES[storehouse.storehouse_number - 1]}</Badge>
                                    {storehouse.risk_cap && <span>{storehouse.risk_cap}</span>}
                                  </div>
                                </div>
                                <div className="text-right text-xs text-muted-foreground">
                                  <p>Calculated Harvest</p>
                                  <p className="text-sm font-semibold text-foreground">{formatCurrency(harvest)}</p>
                                </div>
                              </div>

                              <div className="grid gap-3 md:grid-cols-3">
                                <Input type="date" value={draft?.snapshot_date ?? ""} onChange={(e) => updateHarvestDraft(key, "snapshot_date", e.target.value)} />
                                <Input type="number" placeholder="BOY" value={draft?.boy_value ?? ""} onChange={(e) => updateHarvestDraft(key, "boy_value", e.target.value)} />
                                <Input type="number" placeholder="Current Value" value={draft?.current_value ?? ""} onChange={(e) => updateHarvestDraft(key, "current_value", e.target.value)} />
                              </div>

                              <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
                                <Input type="number" placeholder="Current Harvest" value={draft?.current_harvest ?? ""} onChange={(e) => updateHarvestDraft(key, "current_harvest", e.target.value)} />
                                <Textarea className="min-h-[44px]" placeholder="Notes" value={draft?.notes ?? ""} onChange={(e) => updateHarvestDraft(key, "notes", e.target.value)} />
                                <Button
                                  onClick={() => saveHarvestSnapshot(key, { id: storehouse.id, name: label, kind: "storehouse" })}
                                  disabled={savingHarvestKey === key || !(draft?.snapshot_date)}
                                >
                                  {savingHarvestKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* The Vineyard Accounts */}
                <AssetContainer
                  title="The Vineyard"
                  icon={<Grape className="h-3.5 w-3.5 text-sanctuary-green" />}
                  containerKey="vineyard"
                  contactId={id!}
                  accounts={vineyardAccounts.map((acc) => ({
                    id: acc.id,
                    name: acc.account_name,
                    type: acc.account_type,
                    currentValue: acc.current_value,
                    notes: acc.notes,
                    visibilityScope: acc.visibility_scope,
                    sourceTable: "vineyard_accounts" as const,
                  }))}
                  moveTargets={[
                    { label: "The Keep", key: "storehouse-1" },
                    { label: "The Armoury", key: "storehouse-2" },
                    { label: "The Granary", key: "storehouse-3" },
                    { label: "The Vault", key: "storehouse-4" },
                  ]}
                  onMoveAccount={async (account, targetKey) => {
                    const storehouseNum = parseInt(targetKey.split("-")[1]);
                    const { error: insertErr } = await supabase.from("storehouses").insert({
                      contact_id: id,
                      storehouse_number: storehouseNum,
                      label: account.name,
                      current_value: account.currentValue,
                      notes: account.notes,
                      visibility_scope: account.visibilityScope,
                    } as any);
                    if (insertErr) { toast.error("Failed to move account."); return; }
                    await supabase.from("vineyard_accounts" as any).delete().eq("id", account.id);
                    toast.success(`Moved "${account.name}" to ${STOREHOUSE_NAMES[storehouseNum - 1]}.`);
                    fetchData();
                  }}
                  onRefresh={fetchData}
                  showAddForm={showAddAccount}
                  onAddAccount={() => setShowAddAccount(true)}
                  addFormContent={
                    <div className="mt-2 space-y-2 rounded-md border p-3">
                      <Input
                        placeholder="Account name (e.g. Fidelity Portfolio)"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <select
                          value={newAccountType}
                          onChange={(e) => setNewAccountType(e.target.value)}
                          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                        >
                          <option value="Portfolio">Portfolio</option>
                          <option value="Business Venture">Business Venture</option>
                          <option value="Real Estate">Real Estate</option>
                          <option value="Insurance">Insurance</option>
                          <option value="Retirement">Retirement</option>
                          <option value="Other">Other</option>
                        </select>
                        <Input
                          type="number"
                          placeholder="Value ($)"
                          value={newAccountValue}
                          onChange={(e) => setNewAccountValue(e.target.value)}
                          className="w-28"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={!newAccountName.trim()}
                          onClick={async () => {
                            const { error } = await supabase.from("vineyard_accounts" as any).insert({
                              contact_id: id,
                              account_name: newAccountName.trim(),
                              account_type: newAccountType,
                              current_value: newAccountValue ? Number(newAccountValue) : null,
                            } as any);
                            if (error) {
                              toast.error("Failed to add account.");
                            } else {
                              toast.success("Account added.");
                              setNewAccountName("");
                              setNewAccountType("Portfolio");
                              setNewAccountValue("");
                              setShowAddAccount(false);
                              fetchData();
                            }
                          }}
                        >
                          Add
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowAddAccount(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  }
                />

                {/* Corporate Stakes */}
                {corporateStakes.length > 0 && (
                  <div className="rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-sanctuary-bronze" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider">Corporate Holdings</h4>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        ${corporateStakes.reduce((sum, s) => {
                          const indirect = s.subsidiaries.reduce((si: any, sub: any) => si + sub.indirect_pro_rata, 0);
                          return sum + s.pro_rata + indirect;
                        }, 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="p-2 space-y-1">
                      {corporateStakes.map((stake) => {
                        const totalIndirect = stake.subsidiaries.reduce((s: any, sub: any) => s + sub.indirect_pro_rata, 0);
                        const totalStake = stake.pro_rata + totalIndirect;
                        return (
                          <div key={stake.corporation_id} className="rounded-md bg-muted/40 px-3 py-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Link
                                to={`/corporations/${stake.corporation_id}`}
                                className="font-medium text-sm hover:underline flex items-center gap-1.5"
                              >
                                {stake.corporation_name}
                                <Badge variant="outline" className="text-[9px] uppercase">{stake.corporation_type}</Badge>
                              </Link>
                              <span className="text-xs font-medium tabular-nums">${totalStake.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>{stake.ownership_percentage}% {stake.share_class || "Common"}</span>
                              {stake.role_title && <span>· {stake.role_title}</span>}
                              <span className="ml-auto">Direct: ${stake.pro_rata.toLocaleString()}</span>
                            </div>
                            {stake.subsidiaries.map((sub: any) => (
                              <div key={sub.child_id} className="flex justify-between text-[10px] pl-3 border-l-2 border-border">
                                <Link to={`/corporations/${sub.child_id}`} className="text-muted-foreground hover:underline">
                                  via {sub.child_name} ({stake.ownership_percentage}% × {sub.parent_ownership_pct}%)
                                </Link>
                                <span className="font-medium">${sub.indirect_pro_rata.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Storehouse Containers */}
                {[1, 2, 3, 4].map((num) => {
                  const accounts = storehouses.filter((s) => s.storehouse_number === num);
                  const isPlaceholder = accounts.length === 0;
                  const storehouseName = STOREHOUSE_NAMES[num - 1];
                  const otherTargets = [
                    { label: "The Vineyard", key: "vineyard" },
                    ...[1, 2, 3, 4]
                      .filter((n) => n !== num)
                      .map((n) => ({ label: STOREHOUSE_NAMES[n - 1], key: `storehouse-${n}` })),
                  ];
                  return (
                    <AssetContainer
                      key={num}
                      title={storehouseName}
                      icon={
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${isPlaceholder ? "bg-muted text-muted-foreground" : "bg-sanctuary-bronze/20 text-sanctuary-bronze"}`}>
                          {num}
                        </span>
                      }
                      containerKey={`storehouse-${num}`}
                      contactId={id!}
                      isPlaceholder={isPlaceholder}
                      accounts={accounts.map((sh) => ({
                        id: sh.id,
                        name: sh.asset_type || sh.label || "Account",
                        type: "",
                        currentValue: sh.current_value,
                        targetValue: sh.target_value,
                        notes: sh.notes,
                        visibilityScope: sh.visibility_scope,
                        charterAlignment: sh.charter_alignment,
                        sourceTable: "storehouses" as const,
                      }))}
                      moveTargets={otherTargets}
                      onMoveAccount={async (account, targetKey) => {
                        if (targetKey === "vineyard") {
                          const { error: insertErr } = await supabase.from("vineyard_accounts" as any).insert({
                            contact_id: id,
                            account_name: account.name,
                            account_type: account.type || "Portfolio",
                            current_value: account.currentValue,
                            notes: account.notes,
                            visibility_scope: account.visibilityScope,
                          } as any);
                          if (insertErr) { toast.error("Failed to move account."); return; }
                          await supabase.from("storehouses").delete().eq("id", account.id);
                          toast.success(`Moved "${account.name}" to The Vineyard.`);
                        } else {
                          const targetNum = parseInt(targetKey.split("-")[1]);
                          const { error } = await supabase
                            .from("storehouses")
                            .update({ storehouse_number: targetNum } as any)
                            .eq("id", account.id);
                          if (error) { toast.error("Failed to move account."); return; }
                          toast.success(`Moved "${account.name}" to ${STOREHOUSE_NAMES[targetNum - 1]}.`);
                        }
                        fetchData();
                      }}
                      onRefresh={fetchData}
                      onAddAccount={async () => {
                        const { error } = await supabase.from("storehouses").insert({
                          contact_id: id,
                          storehouse_number: num,
                          label: "",
                        } as any);
                        if (error) {
                          toast.error("Failed to add account.");
                        } else {
                          toast.success("Account added.");
                          fetchData();
                        }
                      }}
                      onConfigurePlaceholder={async () => {
                        const { error } = await supabase.from("storehouses").insert({
                          contact_id: id,
                          storehouse_number: num,
                          label: storehouseName,
                        } as any);
                        if (error) {
                          toast.error("Failed to create storehouse.");
                        } else {
                          toast.success("Storehouse created.");
                          fetchData();
                        }
                      }}
                    />
                  );
                })}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-4">
            {/* AI Assistant */}
            <Collapsible defaultOpen={false}>
              <Card>
                <CollapsibleTrigger className="w-full group">
                  <CardHeader className="flex flex-row items-center justify-between py-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bot className="h-4 w-4 text-sanctuary-bronze" />
                      AI Assistant
                    </CardTitle>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <SovereigntyAssistant
                      variant="embedded"
                      contactId={id}
                      contactContext={{
                        id: contact.id,
                        name: `${contact.first_name} ${contact.last_name || ""}`.trim(),
                        email: contact.email,
                        phone: contact.phone,
                        governance_status: contact.governance_status,
                        fiduciary_entity: contact.fiduciary_entity,
                        vineyard_ebitda: contact.vineyard_ebitda,
                        vineyard_operating_income: contact.vineyard_operating_income,
                        vineyard_balance_sheet_summary: contact.vineyard_balance_sheet_summary,
                        storehouses: storehouses.map((s) => ({
                          number: s.storehouse_number,
                          label: s.label,
                          asset_type: s.asset_type,
                          risk_cap: s.risk_cap,
                          charter_alignment: s.charter_alignment,
                        })),
                        quiet_period_start_date: contact.quiet_period_start_date,
                        asana_url: contact.asana_url,
                        google_drive_url: contact.google_drive_url,
                      }}
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Family > Household > Members (nested collapsibles) */}
            {(familyName || householdLabel || householdMembers.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-sanctuary-bronze" />
                    Family
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {familyName && contact.family_id ? (
                    <Collapsible defaultOpen={false}>
                      <div className="flex items-center gap-1">
                        <CollapsibleTrigger className="group flex flex-1 items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                          <span className="flex-1 text-left">{familyName}</span>
                        </CollapsibleTrigger>
                        <Link
                          to="/families"
                          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Open Families"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                      <CollapsibleContent className="pl-4 pt-2 space-y-2">
                        {householdLabel && contact.household_id ? (
                          <Collapsible defaultOpen={false}>
                            <div className="flex items-center gap-1">
                              <CollapsibleTrigger className="group flex flex-1 items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                                <Home className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="flex-1 text-left">{householdLabel}</span>
                              </CollapsibleTrigger>
                              <Link
                                to={`/households/${contact.household_id}`}
                                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                title="Open Household"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                            <CollapsibleContent className="pl-4 pt-2">
                              {householdMembers.length > 0 ? (
                                <ul className="space-y-1 text-sm">
                                  {householdMembers.map((hm) => (
                                    <li key={hm.id}>
                                      <Link
                                        to={`/contacts/${hm.id}`}
                                        className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 transition-colors hover:bg-muted"
                                      >
                                        <span className="font-medium">{`${hm.first_name} ${hm.last_name || ""}`.trim()}</span>
                                        <span className="text-xs text-muted-foreground capitalize">{hm.family_role.replace(/_/g, " ")}</span>
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-muted-foreground">No other household members.</p>
                              )}
                            </CollapsibleContent>
                          </Collapsible>
                        ) : (
                          <p className="text-xs text-muted-foreground px-3">No household linked.</p>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <p className="text-sm text-muted-foreground">No family linked.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Contact Info */}
            <Card>
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="flex w-full items-center justify-between p-6 hover:opacity-80 group">
                  <CardTitle className="text-base">Contact Info</CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
              <CardContent className="space-y-2 text-sm">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:underline">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium break-all">{contact.email}</span>
                  </a>
                )}
                {contact.phone && (
                  <button
                    type="button"
                    onClick={() => dialViaQuo(contact.phone!)}
                    title="Call via Quo"
                    className="flex items-center gap-2 hover:underline text-left"
                  >
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">{contact.phone}</span>
                  </button>
                )}
                {contact.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="font-medium">{contact.address}</span>
                  </div>
                )}
                {resourceLinks.some((l) => l.url) && (
                  <div className="pt-2 mt-2 border-t border-border/50 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Apps</p>
                    {resourceLinks.filter((l) => l.url).map((link) => {
                      const Icon = link.icon;
                      return (
                        <a
                          key={link.label}
                          href={link.url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{link.label}</span>
                        </a>
                      );
                    })}
                  </div>
                )}
                {!contact.email && !contact.phone && !contact.address && (
                  <p className="text-muted-foreground">No contact info on file.</p>
                )}
                <div className="pt-2 mt-2 border-t border-border/50 space-y-2">
                  <PortalMagicLinkButton contactId={id!} />
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => navigate(`/contacts/${id}/edit`)}
                      className="text-left text-xs font-medium text-muted-foreground hover:text-foreground hover:underline transition-colors"
                    >
                      Edit Contact
                    </button>
                    <ContactMerge
                      contactId={id!}
                      contactName={`${contact.first_name} ${contact.last_name || ""}`.trim()}
                      onMerged={fetchData}
                      trigger={
                        <button
                          type="button"
                          className="text-left text-xs font-medium text-muted-foreground hover:text-foreground hover:underline transition-colors"
                        >
                          Merge Contact
                        </button>
                      }
                    />
                  </div>
                </div>
              </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Professional Team */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Professional Team</CardTitle>
              </CardHeader>
              <CardContent>
                {[
                  { role: "Lawyer", name: contact.lawyer_name, firm: contact.lawyer_firm },
                  { role: "Accountant", name: contact.accountant_name, firm: contact.accountant_firm },
                  { role: "Executor", name: contact.executor_name, firm: contact.executor_firm },
                  { role: "Power of Attorney", name: contact.poa_name, firm: contact.poa_firm },
                ].filter(({ name }) => name).length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {[
                      { role: "Lawyer", nameCol: "lawyer_name", firmCol: "lawyer_firm", name: contact.lawyer_name, firm: contact.lawyer_firm },
                      { role: "Accountant", nameCol: "accountant_name", firmCol: "accountant_firm", name: contact.accountant_name, firm: contact.accountant_firm },
                      { role: "Executor", nameCol: "executor_name", firmCol: "executor_firm", name: contact.executor_name, firm: contact.executor_firm },
                      { role: "Power of Attorney", nameCol: "poa_name", firmCol: "poa_firm", name: contact.poa_name, firm: contact.poa_firm },
                    ].map(({ role, nameCol, firmCol, name, firm }) => {
                      if (!name) return null;
                      const matched = professionalContacts[name];
                      return (
                        <li key={role} className="flex items-center gap-1">
                          <Link
                            to={matched ? `/contacts/${matched.id}` : `/contacts/new?full_name=${encodeURIComponent(name)}`}
                            className="flex flex-1 items-center justify-between rounded-md bg-muted/50 px-3 py-2 transition-colors hover:bg-muted"
                          >
                            <span className="font-medium flex items-center gap-1">
                              {name}{firm ? ` — ${firm}` : ""}
                              {!matched && <Plus className="h-3 w-3" />}
                            </span>
                            <span className="text-xs text-muted-foreground">{role}</span>
                          </Link>
                          <button
                            onClick={async () => {
                              await supabase.from("contacts").update({ [nameCol]: null, [firmCol]: null }).eq("id", id!);
                              toast.success(`${role} removed.`);
                              fetchData();
                            }}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No professionals linked.
                  </p>
                )}
                <ProfessionalLinker contactId={id!} contact={contact} onLinked={fetchData} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ContactDetail;
