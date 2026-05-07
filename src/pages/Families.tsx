import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  TreesIcon,
  ChevronRight,
  ChevronDown,
  Home,
  User,
  Plus,
  Search,
  Crown,
  TrendingDown,
  Shield,
  Baby,
  Trash2,
  Unlink,
  ArrowRightLeft,
  Scissors,
  Cross,
  MoveRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { DecouplerWizard } from "@/components/DecouplerWizard";
import { FamilyRollup } from "@/components/FamilyRollup";
import { InlineEdit } from "@/components/InlineEdit";

interface Individual {
  id: string;
  first_name: string;
  last_name: string | null;
  family_role: string;
  is_minor: boolean;
  email: string | null;
}

interface Household {
  id: string;
  label: string;
  address: string | null;
  individuals: Individual[];
}

interface Family {
  id: string;
  name: string;
  fee_tier: string;
  fee_tier_discount_pct: number;
  total_family_assets: number;
  annual_savings: number;
  charter_document_url: string | null;
  households: Household[];
}

const ROLE_ICONS: Record<string, typeof Crown> = {
  head_of_family: Crown,
  spouse: Shield,
  beneficiary: User,
  minor: Baby,
};

const ROLE_LABELS: Record<string, string> = {
  head_of_family: "Head of Family",
  spouse: "Spouse",
  beneficiary: "Beneficiary",
  minor: "Minor",
};

const TIER_COLORS: Record<string, string> = {
  sovereign: "bg-muted text-muted-foreground",
  legacy: "bg-accent/20 text-accent border-accent/30",
  dynasty: "bg-primary/20 text-primary border-primary/30",
};

const TIER_LABELS: Record<string, string> = {
  sovereign: "Sovereign Tier",
  legacy: "Legacy Tier — 15% Discount",
  dynasty: "Dynasty Tier — 25% Discount",
};

const Families = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [families, setFamilies] = useState<Family[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [openFamilies, setOpenFamilies] = useState<Set<string>>(new Set());
  const [openHouseholds, setOpenHouseholds] = useState<Set<string>>(new Set());
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [showNewHousehold, setShowNewHousehold] = useState<string | null>(null);
  const [newHouseholdLabel, setNewHouseholdLabel] = useState("");
  const [addIndividualTarget, setAddIndividualTarget] = useState<{ familyId: string; householdId: string } | null>(null);
  const [unlinkedContacts, setUnlinkedContacts] = useState<{ id: string; first_name: string; last_name: string | null; email: string | null }[]>([]);
  const [individualSearch, setIndividualSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("beneficiary");
  const [reassignTarget, setReassignTarget] = useState<{ contactId: string; contactName: string; currentFamilyId: string; currentHouseholdId: string } | null>(null);
  const [reassignFamilyId, setReassignFamilyId] = useState<string>("");
  const [reassignHouseholdId, setReassignHouseholdId] = useState<string>("");
  const [availableHouseholds, setAvailableHouseholds] = useState<{ id: string; label: string }[]>([]);
  const [decouplerTarget, setDecouplerTarget] = useState<{ contactId: string; contactName: string; familyId: string; familyName: string } | null>(null);
  const [moveHouseholdTarget, setMoveHouseholdTarget] = useState<{ householdId: string; householdLabel: string; currentFamilyId: string } | null>(null);
  const [moveDestinationFamilyId, setMoveDestinationFamilyId] = useState<string>("");
  const [moveNewFamilyName, setMoveNewFamilyName] = useState("");
  const [moveCreateNew, setMoveCreateNew] = useState(false);

  const fetchFamilies = useCallback(async () => {
    // Fetch families
    const { data: familyData } = await supabase
      .from("families" as any)
      .select("*")
      .order("name");

    if (!familyData) {
      setLoading(false);
      return;
    }

    // Fetch households
    const familyIds = (familyData as any[]).map((f: any) => f.id);
    const { data: householdData } = await supabase
      .from("households" as any)
      .select("*")
      .in("family_id", familyIds)
      .order("label");

    // Fetch individuals (contacts with family_id)
    const { data: contactData } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, family_role, is_minor, email, household_id, family_id")
      .in("family_id", familyIds);

    // Build tree
    const tree: Family[] = (familyData as any[]).map((f: any) => {
      const familyHouseholds = ((householdData as any[]) || [])
        .filter((h: any) => h.family_id === f.id)
        .map((h: any) => ({
          ...h,
          individuals: ((contactData as any[]) || []).filter(
            (c: any) => c.household_id === h.id
          ),
        }))
        .sort((a: any, b: any) => {
          const aHasHead = a.individuals.some((i: any) => i.family_role === "head_of_family");
          const bHasHead = b.individuals.some((i: any) => i.family_role === "head_of_family");
          if (aHasHead && !bHasHead) return -1;
          if (!aHasHead && bHasHead) return 1;
          return a.label.localeCompare(b.label);
        });

      return {
        ...f,
        households: familyHouseholds,
      };
    });

    setFamilies(tree);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  const toggleFamily = (id: string) => {
    setOpenFamilies((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleHousehold = (id: string) => {
    setOpenHouseholds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const createFamily = async () => {
    if (!newFamilyName.trim() || !user) return;
    const { error } = await supabase
      .from("families" as any)
      .insert({ name: newFamilyName.trim(), created_by: user.id } as any);
    if (error) {
      toast.error("Failed to create family.");
    } else {
      toast.success("Family created.");
      setNewFamilyName("");
      setShowNewFamily(false);
      fetchFamilies();
    }
  };

  const createHousehold = async (familyId: string) => {
    if (!newHouseholdLabel.trim()) return;
    const { error } = await supabase
      .from("households" as any)
      .insert({ family_id: familyId, label: newHouseholdLabel.trim() } as any);
    if (error) {
      toast.error("Failed to create household.");
    } else {
      toast.success("Household created.");
      setNewHouseholdLabel("");
      setShowNewHousehold(null);
      fetchFamilies();
    }
  };

  const deleteFamily = async (familyId: string) => {
    // Unlink contacts first (SET NULL via FK), then delete cascades households
    const { error } = await supabase.from("families" as any).delete().eq("id", familyId);
    if (error) {
      toast.error("Failed to delete family.");
    } else {
      toast.success("Family deleted.");
      fetchFamilies();
    }
  };

  const deleteHousehold = async (householdId: string) => {
    const { error } = await supabase.from("households" as any).delete().eq("id", householdId);
    if (error) {
      toast.error("Failed to delete household.");
    } else {
      toast.success("Household deleted.");
      fetchFamilies();
    }
  };

  const openAddIndividual = async (familyId: string, householdId: string) => {
    setAddIndividualTarget({ familyId, householdId });
    setIndividualSearch("");
    setSelectedRole("beneficiary");
    // Fetch contacts not already in this family
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, email, family_id")
      .order("first_name");
    setUnlinkedContacts(
      (data || []).filter((c: any) => !c.family_id || c.family_id !== familyId)
    );
  };

  const recalcTier = async (familyId: string) => {
    try {
      await supabase.functions.invoke("calculate-family-fee-tier", {
        body: { familyId },
      });
    } catch { /* silent */ }
  };

  const linkIndividual = async (contactId: string) => {
    if (!addIndividualTarget) return;
    const { error } = await supabase
      .from("contacts")
      .update({
        family_id: addIndividualTarget.familyId,
        household_id: addIndividualTarget.householdId,
        family_role: selectedRole,
      } as any)
      .eq("id", contactId);
    if (error) {
      toast.error("Failed to add individual.");
    } else {
      toast.success("Individual added to household.");
      setAddIndividualTarget(null);
      await recalcTier(addIndividualTarget.familyId);
      fetchFamilies();
    }
  };

  const createAndLinkIndividual = async (name: string) => {
    if (!addIndividualTarget || !user) return;
    const parts = name.trim().split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";
    const { data, error: createErr } = await supabase
      .from("contacts")
      .insert({
        full_name: name.trim(),
        first_name: firstName,
        last_name: lastName,
        created_by: user.id,
        family_id: addIndividualTarget.familyId,
        household_id: addIndividualTarget.householdId,
        family_role: selectedRole,
      } as any)
      .select("id")
      .single();
    if (createErr || !data) {
      toast.error("Failed to create contact.");
    } else {
      toast.success(`${name.trim()} created and added.`);
      setAddIndividualTarget(null);
      await recalcTier(addIndividualTarget.familyId);
      fetchFamilies();
    }
  };

  const unlinkIndividual = async (contactId: string, familyId: string) => {
    const { error } = await supabase
      .from("contacts")
      .update({ family_id: null, household_id: null, family_role: "head_of_family" } as any)
      .eq("id", contactId);
    if (error) {
      toast.error("Failed to unlink individual.");
    } else {
      toast.success("Individual removed from household.");
      await recalcTier(familyId);
      fetchFamilies();
    }
  };

  const markDeceased = async (contactId: string, firstName: string, lastName: string | null) => {
    const estateName = `The Estate of — ${firstName} ${lastName || ""}`.trim();
    const { error } = await supabase
      .from("contacts")
      .update({ first_name: estateName, last_name: null, full_name: estateName } as any)
      .eq("id", contactId);
    if (error) {
      toast.error("Failed to update contact record.");
    } else {
      toast.success("Contact updated to estate record.");
      fetchFamilies();
    }
  };

  const openReassign = async (individual: Individual, currentFamilyId: string, currentHouseholdId: string) => {
    setReassignTarget({
      contactId: individual.id,
      contactName: `${individual.first_name} ${individual.last_name || ""}`.trim(),
      currentFamilyId,
      currentHouseholdId,
    });
    setReassignFamilyId(currentFamilyId);
    // Load households for the current family
    const { data } = await supabase
      .from("households" as any)
      .select("id, label")
      .eq("family_id", currentFamilyId)
      .order("label");
    setAvailableHouseholds((data as any[]) || []);
    setReassignHouseholdId("");
  };

  const handleReassignFamilyChange = async (familyId: string) => {
    setReassignFamilyId(familyId);
    setReassignHouseholdId("");
    const { data } = await supabase
      .from("households" as any)
      .select("id, label")
      .eq("family_id", familyId)
      .order("label");
    setAvailableHouseholds((data as any[]) || []);
  };

  const reassignIndividual = async () => {
    if (!reassignTarget || !reassignFamilyId || !reassignHouseholdId) return;
    const { error } = await supabase
      .from("contacts")
      .update({
        family_id: reassignFamilyId,
        household_id: reassignHouseholdId,
      } as any)
      .eq("id", reassignTarget.contactId);
    if (error) {
      toast.error("Failed to reassign individual.");
    } else {
      toast.success("Individual reassigned.");
      const affectedFamilies = new Set([reassignTarget.currentFamilyId, reassignFamilyId]);
      await Promise.all(Array.from(affectedFamilies).map(recalcTier));
      setReassignTarget(null);
      fetchFamilies();
    }
  };

  const moveHouseholdToFamily = async () => {
    if (!moveHouseholdTarget || !user) return;
    let targetFamilyId = moveDestinationFamilyId;

    // Create new family if needed
    if (moveCreateNew) {
      if (!moveNewFamilyName.trim()) return;
      const { data: newFamily, error: createErr } = await supabase
        .from("families" as any)
        .insert({ name: moveNewFamilyName.trim(), created_by: user.id } as any)
        .select("id")
        .single();
      if (createErr || !newFamily) {
        toast.error("Failed to create new family.");
        return;
      }
      targetFamilyId = (newFamily as any).id;
    }

    if (!targetFamilyId || targetFamilyId === moveHouseholdTarget.currentFamilyId) return;

    // Move the household to the new family
    const { error: hhErr } = await supabase
      .from("households" as any)
      .update({ family_id: targetFamilyId } as any)
      .eq("id", moveHouseholdTarget.householdId);
    if (hhErr) {
      toast.error("Failed to move household.");
      return;
    }

    // Update all contacts in this household to the new family
    const { error: contactErr } = await supabase
      .from("contacts")
      .update({ family_id: targetFamilyId } as any)
      .eq("household_id", moveHouseholdTarget.householdId);
    if (contactErr) {
      toast.error("Household moved but failed to update contacts.");
    }

    toast.success("Household moved successfully.");
    // Recalculate both families
    await Promise.all([
      recalcTier(moveHouseholdTarget.currentFamilyId),
      recalcTier(targetFamilyId),
    ]);
    setMoveHouseholdTarget(null);
    setMoveDestinationFamilyId("");
    setMoveNewFamilyName("");
    setMoveCreateNew(false);
    fetchFamilies();
  };

  const updateFamilyName = async (familyId: string, newName: string) => {
    const { error } = await supabase.from("families" as any).update({ name: newName } as any).eq("id", familyId);
    if (error) { toast.error("Failed to update family name."); }
    else { toast.success("Family name updated."); fetchFamilies(); }
  };

  const updateHouseholdField = async (householdId: string, field: "label" | "address", value: string) => {
    const { error } = await supabase.from("households" as any).update({ [field]: value } as any).eq("id", householdId);
    if (error) { toast.error(`Failed to update household ${field}.`); }
    else { toast.success(`Household ${field} updated.`); fetchFamilies(); }
  };

  const filtered = families.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageBreadcrumbs items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Family Tree" },
        ]} />
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Family Tree</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Family → Household → Individual Hierarchy — {families.length} families
            </p>
          </div>
          <Button
            onClick={() => setShowNewFamily(true)}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Family
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search families..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tree View */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading families...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <TreesIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">
                {search ? "No families match your search." : "No families yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((family) => {
              const isOpen = openFamilies.has(family.id);
              return (
                <Card key={family.id} className="overflow-hidden">
                  <Collapsible open={isOpen} onOpenChange={() => toggleFamily(family.id)}>
                    {/* Family Level */}
                    <CollapsibleTrigger asChild>
                      <button className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                          <TreesIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <InlineEdit
                            value={family.name}
                            onSave={(v) => updateFamilyName(family.id, v)}
                            className="font-semibold"
                          />
                          <p className="text-xs text-muted-foreground">
                            {family.households.length} household{family.households.length !== 1 ? "s" : ""} ·{" "}
                            {family.households.reduce((sum, h) => sum + h.individuals.length, 0)} individuals
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {family.total_family_assets > 0 && (
                            <span className="text-sm font-medium text-muted-foreground">
                              ${Number(family.total_family_assets).toLocaleString()}
                            </span>
                          )}
                          <Badge className={TIER_COLORS[family.fee_tier] || ""}>
                            {TIER_LABELS[family.fee_tier] || family.fee_tier}
                          </Badge>
                          {family.annual_savings > 0 && (
                            <Badge variant="outline" className="text-xs border-accent/30 text-accent">
                              <TrendingDown className="mr-1 h-3 w-3" />
                              ${Number(family.annual_savings).toLocaleString()} saved
                            </Badge>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Family</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete "{family.name}" and all its households. Individuals will be unlinked but not deleted. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteFamily(family.id)}
                                >
                                  Delete Family
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="border-t border-border">
                        {family.households.map((household) => {
                          const hhOpen = openHouseholds.has(household.id);
                          return (
                            <Collapsible
                              key={household.id}
                              open={hhOpen}
                              onOpenChange={() => toggleHousehold(household.id)}
                            >
                              {/* Household Level */}
                              <CollapsibleTrigger asChild>
                                <button className="flex w-full items-center gap-3 py-3 pl-12 pr-4 text-left transition-colors hover:bg-muted/20">
                                  {hhOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  )}
                                  <Home className="h-4 w-4 text-accent shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <InlineEdit
                                      value={household.label}
                                      onSave={(v) => updateHouseholdField(household.id, "label", v)}
                                      className="text-sm font-medium"
                                      suffix=" Household"
                                    />
                                    <InlineEdit
                                      value={household.address || ""}
                                      onSave={(v) => updateHouseholdField(household.id, "address", v)}
                                      className="text-xs text-muted-foreground"
                                      placeholder="Add address..."
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {household.individuals.length} member{household.individuals.length !== 1 ? "s" : ""}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMoveHouseholdTarget({
                                        householdId: household.id,
                                        householdLabel: household.label,
                                        currentFamilyId: family.id,
                                      });
                                      setMoveDestinationFamilyId("");
                                      setMoveNewFamilyName("");
                                      setMoveCreateNew(false);
                                    }}
                                    title="Move household to another family"
                                    className="p-1 rounded-md text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                                  >
                                    <MoveRight className="h-3.5 w-3.5" />
                                  </button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <button
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Household</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will permanently delete the "{household.label}" household. Individuals will be unlinked but not deleted.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          onClick={() => deleteHousehold(household.id)}
                                        >
                                          Delete Household
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </button>
                              </CollapsibleTrigger>

                              <CollapsibleContent>
                                {/* Individual Level */}
                                <div className="space-y-0.5">
                                  {[...household.individuals].sort((a, b) => {
                                    const order: Record<string, number> = { head_of_family: 0, head_of_household: 1, spouse: 2, beneficiary: 3, minor: 4 };
                                    return (order[a.family_role] ?? 4) - (order[b.family_role] ?? 4);
                                  }).map((individual) => {
                                    const RoleIcon = ROLE_ICONS[individual.family_role] || User;
                                    return (
                                      <div
                                        key={individual.id}
                                        className="flex items-center gap-3 py-2.5 pl-20 pr-4 transition-colors hover:bg-muted/30"
                                      >
                                        <RoleIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <Link
                                          to={`/contacts/${individual.id}`}
                                          className="flex-1 min-w-0"
                                        >
                                          <p className="text-sm hover:underline">
                                            {individual.first_name} {individual.last_name}
                                          </p>
                                          {individual.email && (
                                            <p className="text-xs text-muted-foreground truncate">{individual.email}</p>
                                          )}
                                        </Link>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <Badge variant="outline" className="text-[10px]">
                                            {ROLE_LABELS[individual.family_role] || individual.family_role}
                                          </Badge>
                                          {individual.is_minor && (
                                            <Badge variant="secondary" className="text-[10px]">
                                              Minor
                                            </Badge>
                                          )}
                                          <button
                                            onClick={() => openReassign(individual, family.id, household.id)}
                                            title="Reassign to another household"
                                            className="p-1 rounded-md text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                                          >
                                            <ArrowRightLeft className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            onClick={() =>
                                              setDecouplerTarget({
                                                contactId: individual.id,
                                                contactName: `${individual.first_name} ${individual.last_name || ""}`.trim(),
                                                familyId: family.id,
                                                familyName: family.name,
                                              })
                                            }
                                            title="Decoupler Protocol"
                                            className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                          >
                                            <Scissors className="h-3.5 w-3.5" />
                                          </button>
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <button
                                                title="Mark as deceased (Estate)"
                                                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                              >
                                                <Cross className="h-3.5 w-3.5" />
                                              </button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>Mark as Deceased</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  This will rename the contact record to "The Estate of — {individual.first_name} {individual.last_name}". The individual will remain in their household. This cannot be undone.
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                  onClick={() => markDeceased(individual.id, individual.first_name, individual.last_name)}
                                                >
                                                  Confirm
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <button
                                                title="Remove from household"
                                                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                              >
                                                <Unlink className="h-3.5 w-3.5" />
                                              </button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>Remove Individual</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  This will remove {individual.first_name} {individual.last_name} from this household and family. The contact record will not be deleted.
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                  onClick={() => unlinkIndividual(individual.id, family.id)}
                                                >
                                                  Remove
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {household.individuals.length === 0 && (
                                    <p className="py-2 pl-20 text-xs text-muted-foreground">
                                      No members in this household.
                                    </p>
                                  )}
                                  {/* Add Individual Button */}
                                  <button
                                    onClick={() => openAddIndividual(family.id, household.id)}
                                    className="flex w-full items-center gap-2 py-2 pl-20 pr-4 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/20"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Add Individual
                                  </button>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}

                        {/* Add Household Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowNewHousehold(family.id);
                          }}
                          className="flex w-full items-center gap-2 py-2.5 pl-12 pr-4 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/20"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Household
                        </button>

                        {/* Financial Rollup */}
                        <FamilyRollup
                          familyId={family.id}
                          familyName={family.name}
                          feeTier={family.fee_tier}
                          totalAssets={family.total_family_assets}
                          annualSavings={family.annual_savings}
                          discountPct={family.fee_tier_discount_pct}
                          onRecalculated={fetchFamilies}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* New Family Dialog */}
      <Dialog open={showNewFamily} onOpenChange={setShowNewFamily}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Family</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Family name (e.g. The Richardson Family)"
            value={newFamilyName}
            onChange={(e) => setNewFamilyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFamily()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFamily(false)}>
              Cancel
            </Button>
            <Button onClick={createFamily} className="bg-accent text-accent-foreground hover:bg-accent/90">
              Create Family
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Household Dialog */}
      <Dialog open={!!showNewHousehold} onOpenChange={() => setShowNewHousehold(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Household</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Household label (e.g. Secondary, Lake House)"
            value={newHouseholdLabel}
            onChange={(e) => setNewHouseholdLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && showNewHousehold && createHousehold(showNewHousehold)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewHousehold(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => showNewHousehold && createHousehold(showNewHousehold)}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Add Household
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Individual Dialog */}
      <Dialog open={!!addIndividualTarget} onOpenChange={() => setAddIndividualTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Individual to Household</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search existing contacts..."
                value={individualSearch}
                onChange={(e) => setIndividualSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="head_of_family">Head of Family</option>
                <option value="head_of_household">Head of Household</option>
                <option value="spouse">Spouse</option>
                <option value="beneficiary">Beneficiary</option>
                <option value="minor">Minor</option>
              </select>
            </div>
            <div className="max-h-[240px] overflow-y-auto rounded-md border">
              {unlinkedContacts
                .filter((c) => {
                  const name = `${c.first_name} ${c.last_name || ""}`.toLowerCase();
                  return name.includes(individualSearch.toLowerCase());
                })
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => linkIndividual(c.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 border-b last:border-b-0"
                  >
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.first_name} {c.last_name}</p>
                      {c.email && (
                        <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                      )}
                    </div>
                  </button>
                ))}
              {individualSearch.trim().length >= 2 && (
                <button
                  onClick={() => createAndLinkIndividual(individualSearch)}
                  className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-sm text-primary transition-colors hover:bg-muted/50"
                >
                  <Plus className="h-4 w-4" />
                  Create "{individualSearch.trim()}"
                </button>
              )}
              {unlinkedContacts.filter((c) =>
                `${c.first_name} ${c.last_name || ""}`.toLowerCase().includes(individualSearch.toLowerCase())
              ).length === 0 && !individualSearch.trim() && (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  No unlinked contacts found. Type a name to create one.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reassign Individual Dialog */}
      <Dialog open={!!reassignTarget} onOpenChange={() => setReassignTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign {reassignTarget?.contactName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Family</label>
              <Select value={reassignFamilyId} onValueChange={handleReassignFamilyChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select family" />
                </SelectTrigger>
                <SelectContent>
                  {families.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Household</label>
              <Select value={reassignHouseholdId} onValueChange={setReassignHouseholdId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select household" />
                </SelectTrigger>
                <SelectContent>
                  {availableHouseholds.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.label} Household
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reassignFamilyId && availableHouseholds.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">No households in this family.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={reassignIndividual}
              disabled={!reassignHouseholdId || (reassignHouseholdId === reassignTarget?.currentHouseholdId && reassignFamilyId === reassignTarget?.currentFamilyId)}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Household Dialog */}
      <Dialog open={!!moveHouseholdTarget} onOpenChange={() => setMoveHouseholdTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move "{moveHouseholdTarget?.householdLabel}" Household</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="move-create-new"
                checked={moveCreateNew}
                onChange={(e) => {
                  setMoveCreateNew(e.target.checked);
                  if (e.target.checked) setMoveDestinationFamilyId("");
                }}
                className="rounded border-border"
              />
              <label htmlFor="move-create-new" className="text-sm">Create a new family</label>
            </div>

            {moveCreateNew ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground">New Family Name</label>
                <Input
                  placeholder="e.g. The Richardson Family"
                  value={moveNewFamilyName}
                  onChange={(e) => setMoveNewFamilyName(e.target.value)}
                  className="mt-1"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Destination Family</label>
                <Select value={moveDestinationFamilyId} onValueChange={setMoveDestinationFamilyId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select family" />
                  </SelectTrigger>
                  <SelectContent>
                    {families
                      .filter((f) => f.id !== moveHouseholdTarget?.currentFamilyId)
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveHouseholdTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={moveHouseholdToFamily}
              disabled={moveCreateNew ? !moveNewFamilyName.trim() : !moveDestinationFamilyId}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <MoveRight className="mr-2 h-4 w-4" />
              Move Household
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decoupler Protocol Wizard */}
      {user && (
        <DecouplerWizard
          target={decouplerTarget}
          families={families.map((f) => ({ id: f.id, name: f.name }))}
          userId={user.id}
          onClose={() => setDecouplerTarget(null)}
          onComplete={() => {
            setDecouplerTarget(null);
            fetchFamilies();
          }}
        />
      )}
    </AppLayout>
  );
};

export default Families;
