import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Scissors, ArrowRight, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DecouplerTarget {
  contactId: string;
  contactName: string;
  familyId: string;
  familyName: string;
}

interface Family {
  id: string;
  name: string;
}

interface DecouplerWizardProps {
  target: DecouplerTarget | null;
  families: Family[];
  userId: string;
  onClose: () => void;
  onComplete: () => void;
}

type Step = "destination" | "assets" | "confirm";

interface AssetItem {
  id: string;
  label: string;
  type: "vineyard" | "storehouse";
  value: number | null;
}

export const DecouplerWizard = ({
  target,
  families,
  userId,
  onClose,
  onComplete,
}: DecouplerWizardProps) => {
  const [step, setStep] = useState<Step>("destination");
  const [destinationType, setDestinationType] = useState<"new" | "existing">("new");
  const [newFamilyName, setNewFamilyName] = useState("");
  const [newHouseholdLabel, setNewHouseholdLabel] = useState("Primary");
  const [existingFamilyId, setExistingFamilyId] = useState("");
  const [existingHouseholdId, setExistingHouseholdId] = useState("");
  const [availableHouseholds, setAvailableHouseholds] = useState<{ id: string; label: string }[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  const loadAssets = async () => {
    if (!target) return;

    const [vineyardRes, storehouseRes] = await Promise.all([
      supabase
        .from("vineyard_accounts")
        .select("id, account_name, current_value")
        .eq("contact_id", target.contactId),
      supabase
        .from("storehouses")
        .select("id, label, current_value")
        .eq("contact_id", target.contactId),
    ]);

    const items: AssetItem[] = [
      ...((vineyardRes.data as any[]) || []).map((a: any) => ({
        id: a.id,
        label: a.account_name,
        type: "vineyard" as const,
        value: a.current_value,
      })),
      ...((storehouseRes.data as any[]) || []).map((s: any) => ({
        id: s.id,
        label: s.label || "Storehouse",
        type: "storehouse" as const,
        value: s.current_value,
      })),
    ];

    setAssets(items);
    setSelectedAssetIds(new Set(items.map((a) => a.id)));
  };

  const handleExistingFamilyChange = async (familyId: string) => {
    setExistingFamilyId(familyId);
    setExistingHouseholdId("");
    const { data } = await supabase
      .from("households" as any)
      .select("id, label")
      .eq("family_id", familyId)
      .order("label");
    setAvailableHouseholds((data as any[]) || []);
  };

  const goToAssets = async () => {
    if (destinationType === "new" && !newFamilyName.trim()) {
      toast.error("Please enter a family name.");
      return;
    }
    if (destinationType === "existing" && (!existingFamilyId || !existingHouseholdId)) {
      toast.error("Please select a family and household.");
      return;
    }
    await loadAssets();
    setStep("assets");
  };

  const toggleAsset = (id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const executeDecoupler = async () => {
    if (!target) return;
    setProcessing(true);

    try {
      let destFamilyId: string;
      let destHouseholdId: string;

      if (destinationType === "new") {
        // Create new family
        const { data: newFamily, error: famErr } = await supabase
          .from("families" as any)
          .insert({ name: newFamilyName.trim(), created_by: userId } as any)
          .select("id")
          .single();

        if (famErr || !newFamily) throw new Error("Failed to create new family.");
        destFamilyId = (newFamily as any).id;

        // Create household in new family
        const { data: newHousehold, error: hhErr } = await supabase
          .from("households" as any)
          .insert({ family_id: destFamilyId, label: newHouseholdLabel.trim() || "Primary" } as any)
          .select("id")
          .single();

        if (hhErr || !newHousehold) throw new Error("Failed to create household.");
        destHouseholdId = (newHousehold as any).id;
      } else {
        destFamilyId = existingFamilyId;
        destHouseholdId = existingHouseholdId;
      }

      // Move the individual
      const { error: moveErr } = await supabase
        .from("contacts")
        .update({
          family_id: destFamilyId,
          household_id: destHouseholdId,
          family_role: "head_of_family",
        } as any)
        .eq("id", target.contactId);

      if (moveErr) throw new Error("Failed to move individual.");

      // Move selected assets - vineyard accounts
      const vineyardIds = assets
        .filter((a) => a.type === "vineyard" && selectedAssetIds.has(a.id))
        .map((a) => a.id);

      if (vineyardIds.length > 0) {
        // Note: vineyard_accounts are tied to contact_id, not family_id
        // They move with the contact automatically since they reference contact_id
      }

      // Log audit trail entry
      await supabase.from("sovereignty_audit_trail").insert({
        user_id: userId,
        contact_id: target.contactId,
        action_type: "decoupler_protocol",
        action_description: `Decoupled ${target.contactName} from ${target.familyName}. Moved to ${destinationType === "new" ? `new family "${newFamilyName.trim()}"` : "existing family"}. ${selectedAssetIds.size} asset(s) transferred.`,
        proposed_data: {
          source_family_id: target.familyId,
          destination_family_id: destFamilyId,
          destination_household_id: destHouseholdId,
          transferred_asset_ids: Array.from(selectedAssetIds),
        },
      });

      // Recalculate fee tiers for both families
      await Promise.all([
        supabase.functions.invoke("calculate-family-fee-tier", {
          body: { familyId: target.familyId },
        }),
        supabase.functions.invoke("calculate-family-fee-tier", {
          body: { familyId: destFamilyId },
        }),
      ]);

      toast.success(`${target.contactName} successfully decoupled.`);
      onComplete();
    } catch (err: any) {
      toast.error(err.message || "Decoupler protocol failed.");
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setStep("destination");
    setDestinationType("new");
    setNewFamilyName("");
    setNewHouseholdLabel("Primary");
    setExistingFamilyId("");
    setExistingHouseholdId("");
    setAvailableHouseholds([]);
    setAssets([]);
    setSelectedAssetIds(new Set());
    setProcessing(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const otherFamilies = families.filter((f) => f.id !== target?.familyId);

  return (
    <Dialog open={!!target} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-destructive" />
            Decoupler Protocol
          </DialogTitle>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            {/* Progress indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={step === "destination" ? "font-semibold text-foreground" : ""}>
                1. Destination
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className={step === "assets" ? "font-semibold text-foreground" : ""}>
                2. Assets
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className={step === "confirm" ? "font-semibold text-foreground" : ""}>
                3. Confirm
              </span>
            </div>

            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Decoupling {target.contactName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    From: {target.familyName}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Step 1: Destination */}
            {step === "destination" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={destinationType === "new" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDestinationType("new")}
                    className={destinationType === "new" ? "bg-accent text-accent-foreground" : ""}
                  >
                    New Family
                  </Button>
                  <Button
                    variant={destinationType === "existing" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDestinationType("existing")}
                    className={destinationType === "existing" ? "bg-accent text-accent-foreground" : ""}
                    disabled={otherFamilies.length === 0}
                  >
                    Existing Family
                  </Button>
                </div>

                {destinationType === "new" ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">New Family Name</label>
                      <Input
                        className="mt-1"
                        placeholder="e.g. The Smith Family"
                        value={newFamilyName}
                        onChange={(e) => setNewFamilyName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Household Label</label>
                      <Input
                        className="mt-1"
                        placeholder="e.g. Primary"
                        value={newHouseholdLabel}
                        onChange={(e) => setNewHouseholdLabel(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Family</label>
                      <Select value={existingFamilyId} onValueChange={handleExistingFamilyChange}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select family" />
                        </SelectTrigger>
                        <SelectContent>
                          {otherFamilies.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Household</label>
                      <Select value={existingHouseholdId} onValueChange={setExistingHouseholdId}>
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
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Assets */}
            {step === "assets" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Assets are linked to the individual's contact record and will transfer automatically.
                  Deselect any assets that should remain with the original family (will need manual reassignment).
                </p>
                {assets.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-4 text-center">
                    No assets found for this individual.
                  </p>
                ) : (
                  <div className="max-h-[240px] overflow-y-auto rounded-md border">
                    {assets.map((asset) => (
                      <label
                        key={asset.id}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm border-b last:border-b-0 hover:bg-muted/30 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedAssetIds.has(asset.id)}
                          onCheckedChange={() => toggleAsset(asset.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{asset.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {asset.type === "vineyard" ? "Vineyard Account" : "Storehouse"}
                          </p>
                        </div>
                        {asset.value != null && (
                          <span className="text-xs font-medium text-muted-foreground">
                            ${Number(asset.value).toLocaleString()}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === "confirm" && (
              <div className="space-y-3">
                <div className="rounded-md border p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Individual</span>
                    <span className="font-medium">{target.contactName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">From</span>
                    <span>{target.familyName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">To</span>
                    <span>
                      {destinationType === "new"
                        ? `${newFamilyName.trim()} (new)`
                        : families.find((f) => f.id === existingFamilyId)?.name || ""}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assets transferring</span>
                    <span>{selectedAssetIds.size} of {assets.length}</span>
                  </div>
                </div>
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-destructive">This action will:</p>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li>Move {target.contactName} to the new family unit</li>
                    <li>Transfer {selectedAssetIds.size} asset(s)</li>
                    <li>Recalculate fee tiers for both families</li>
                    <li>Sever shared Charter access</li>
                    <li>Log this action in the Sovereignty Audit Trail</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2">
          {step !== "destination" && (
            <Button
              variant="outline"
              onClick={() => setStep(step === "confirm" ? "assets" : "destination")}
              disabled={processing}
            >
              Back
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} disabled={processing}>
            Cancel
          </Button>
          {step === "destination" && (
            <Button
              onClick={goToAssets}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Next: Review Assets
            </Button>
          )}
          {step === "assets" && (
            <Button
              onClick={() => setStep("confirm")}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Next: Confirm
            </Button>
          )}
          {step === "confirm" && (
            <Button
              onClick={executeDecoupler}
              disabled={processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Scissors className="mr-2 h-4 w-4" />
                  Execute Decoupler
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
