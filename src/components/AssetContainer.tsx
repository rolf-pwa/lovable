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
            {accounts.map((acc) => {
              const current = Number(acc.currentValue) || 0;
              const target = Number(acc.targetValue) || 0;
              const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;

              return (
                <div key={acc.id} className="group flex items-start gap-1">
                  <div className="flex flex-1 flex-col gap-1 rounded-md bg-muted/40 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{acc.name}</span>
                        {acc.type && (
                          <span className="ml-2 text-[10px] text-muted-foreground">{acc.type}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium tabular-nums">
                          ${current.toLocaleString()}
                        </span>
                        {/* Move dropdown */}
                        {onMoveAccount && moveTargets.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                                <ArrowRightLeft className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[160px]">
                              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Move to…
                              </div>
                              {moveTargets.map((t) => (
                                <DropdownMenuItem
                                  key={t.key}
                                  onClick={() => onMoveAccount(acc, t.key)}
                                  className="text-xs"
                                >
                                  {t.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {acc.notes && (
                      <span className="text-[10px] text-muted-foreground italic">{acc.notes}</span>
                    )}

                    {target > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        Target: ${target.toLocaleString()}
                      </span>
                    )}

                    <div className="flex items-center justify-between mt-0.5">
                      {acc.charterAlignment && (
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              acc.charterAlignment === "aligned"
                                ? "border-green-500/30 text-green-600"
                                : acc.charterAlignment === "misaligned"
                                ? "border-destructive/30 text-destructive"
                                : "border-amber-500/40 text-amber-600"
                            }`}
                          >
                            {acc.charterAlignment.replace("_", " ")}
                          </Badge>
                          {acc.charterAlignment === "pending_review" && (
                            <button
                              onClick={async () => {
                                const { error } = await supabase
                                  .from(acc.sourceTable as any)
                                  .update({ charter_alignment: "aligned" } as any)
                                  .eq("id", acc.id);
                                if (error) {
                                  toast.error("Failed to approve.");
                                } else {
                                  toast.success("Approved — marked as aligned.");
                                  onRefresh();
                                }
                              }}
                              className="rounded px-1.5 py-0.5 text-[9px] font-medium border border-green-500/40 text-green-700 hover:bg-green-500/10 transition-colors"
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1 ml-auto">
                        {SCOPE_OPTIONS.map((scope) => (
                          <button
                            key={scope}
                            onClick={() => updateVisibilityScope(acc.sourceTable, acc.id, scope)}
                            className={`rounded-full px-2 py-0.5 text-[9px] font-medium border transition-colors ${
                              acc.visibilityScope === scope
                                ? SCOPE_COLORS[scope] + " bg-background"
                                : "border-transparent text-muted-foreground/50 hover:text-muted-foreground"
                            }`}
                          >
                            {SCOPE_LABELS[scope]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteAccount(acc)}
                    className="mt-2 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
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
