import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, X, ArrowRightLeft, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


const SCOPE_LABELS: Record<string, string> = {
  private: "Private",
  household_shared: "Household",
  family_shared: "Family",
};

const SCOPE_COLORS: Record<string, string> = {
  private: "border-muted-foreground/30 text-muted-foreground",
  household_shared: "border-accent/30 text-accent",
  family_shared: "border-primary/30 text-primary",
};

const SCOPE_OPTIONS = ["private", "household_shared", "family_shared"] as const;

export interface AssetAccount {
  id: string;
  name: string;
  type: string;
  currentValue: number | null;
  targetValue?: number | null;
  notes?: string | null;
  visibilityScope: string;
  charterAlignment?: string;
  /** Source table for move operations */
  sourceTable: "vineyard_accounts" | "storehouses";
}

export interface MoveTarget {
  label: string;
  key: string;
}

interface AssetContainerProps {
  title: string;
  icon?: React.ReactNode;
  accounts: AssetAccount[];
  moveTargets: MoveTarget[];
  containerKey: string;
  contactId: string;
  isPlaceholder?: boolean;
  onRefresh: () => void;
  onAddAccount?: () => void;
  onMoveAccount?: (account: AssetAccount, targetKey: string) => Promise<void>;
  showAddForm?: boolean;
  addFormContent?: React.ReactNode;
  onConfigurePlaceholder?: () => void;
}

export function AssetContainer({
  title,
  icon,
  accounts,
  moveTargets,
  containerKey,
  contactId,
  isPlaceholder = false,
  onRefresh,
  onMoveAccount,
  showAddForm,
  addFormContent,
  onAddAccount,
  onConfigurePlaceholder,
}: AssetContainerProps) {
  const total = accounts.reduce((sum, a) => sum + (Number(a.currentValue) || 0), 0);
  const totalTarget = accounts.reduce((sum, a) => sum + (Number(a.targetValue) || 0), 0);
  const totalPct = totalTarget > 0 ? Math.min((total / totalTarget) * 100, 100) : 0;

  const updateVisibilityScope = async (
    table: "vineyard_accounts" | "storehouses",
    recordId: string,
    newScope: string
  ) => {
    const { error } = await supabase
      .from(table as any)
      .update({ visibility_scope: newScope } as any)
      .eq("id", recordId);
    if (error) {
      toast.error("Failed to update visibility.");
    } else {
      toast.success(`Visibility set to ${SCOPE_LABELS[newScope]}.`);
      onRefresh();
    }
  };

  const deleteAccount = async (account: AssetAccount) => {
    const { error } = await supabase.from(account.sourceTable as any).delete().eq("id", account.id);
    if (error) {
      toast.error("Failed to remove account.");
    } else {
      toast.success("Account removed.");
      onRefresh();
    }
  };

  return (
    <div className={`rounded-lg border ${isPlaceholder ? "border-dashed border-muted-foreground/20 bg-muted/20" : "border-border bg-card"}`}>
      {/* Container Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          {icon}
          <h4 className="text-xs font-semibold uppercase tracking-wider">{title}</h4>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          ${total.toLocaleString()}
        </span>
      </div>

      {/* Container total progress (if targets exist) */}
      {totalTarget > 0 && (
        <div className="px-3 pt-2 space-y-1">
          <Progress value={totalPct} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{Math.round(totalPct)}% funded</span>
            <span>Target: ${totalTarget.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Account rows */}
      <div className="p-2 space-y-1">
        {isPlaceholder && accounts.length === 0 ? (
          <div className="flex items-center justify-between px-2 py-3">
            <span className="text-xs text-muted-foreground/60 italic">Not configured in charter</span>
            {onConfigurePlaceholder && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-[10px] text-muted-foreground"
                onClick={onConfigurePlaceholder}
              >
                <Plus className="mr-0.5 h-2.5 w-2.5" /> Configure
              </Button>
            )}
          </div>
        ) : (
          <>
            {accounts.map((acc) => (
              <AccountRow
                key={acc.id}
                acc={acc}
                moveTargets={moveTargets}
                onMoveAccount={onMoveAccount}
                updateVisibilityScope={updateVisibilityScope}
                deleteAccount={deleteAccount}
                onRefresh={onRefresh}
              />
            ))}
          </>
        )}


        {/* Add form / button */}
        {showAddForm && addFormContent}
        {!showAddForm && !isPlaceholder && onAddAccount && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full text-muted-foreground text-xs"
            onClick={onAddAccount}
          >
            <Plus className="mr-1 h-3 w-3" /> Add Account
          </Button>
        )}
      </div>
    </div>
  );
}
