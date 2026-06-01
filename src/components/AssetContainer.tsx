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

const SCOPE_OPTIONS_LIST = SCOPE_OPTIONS;

interface SnapshotRow {
  id: string;
  snapshot_date: string;
  reporting_year: number;
  boy_value: number;
  ytd_value: number;
  current_harvest: number;
  current_value: number;
}

interface AccountRowProps {
  acc: AssetAccount;
  moveTargets: MoveTarget[];
  onMoveAccount?: (account: AssetAccount, targetKey: string) => Promise<void>;
  updateVisibilityScope: (table: "vineyard_accounts" | "storehouses", id: string, scope: string) => Promise<void>;
  deleteAccount: (account: AssetAccount) => Promise<void>;
  onRefresh: () => void;
}

function fmt(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function AccountRow({ acc, moveTargets, onMoveAccount, updateVisibilityScope, deleteAccount }: AccountRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const current = Number(acc.currentValue) || 0;
  const target = Number(acc.targetValue) || 0;

  useEffect(() => {
    if (!expanded || snapshots !== null) return;
    const fkColumn = acc.sourceTable === "vineyard_accounts" ? "vineyard_account_id" : "storehouse_id";
    setLoading(true);
    supabase
      .from("account_harvest_snapshots")
      .select("id, snapshot_date, reporting_year, boy_value, ytd_value, current_harvest, current_value")
      .eq(fkColumn, acc.id)
      .order("snapshot_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Failed to load history.");
          setSnapshots([]);
        } else {
          setSnapshots((data as SnapshotRow[]) || []);
        }
        setLoading(false);
      });
  }, [expanded, snapshots, acc.id, acc.sourceTable]);

  const latest = snapshots && snapshots.length > 0 ? snapshots[0] : null;
  const boy = latest ? Number(latest.boy_value) : 0;
  const ytd = latest ? Number(latest.ytd_value) : 0;
  const harvest = latest ? Number(latest.current_harvest) : 0;
  const marketCurrent = latest ? Number(latest.current_value) : current;
  const varianceYtdDollars = ytd - boy;
  const varianceCurrentDollars = marketCurrent - boy;

  return (
    <div className="group flex items-start gap-1">
      <div className="flex flex-1 flex-col gap-1 rounded-md bg-muted/40 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-between text-left w-full"
        >
          <div className="flex-1 min-w-0 flex items-center gap-1">
            <ChevronDown
              className={`h-3 w-3 text-muted-foreground transition-transform ${expanded ? "" : "-rotate-90"}`}
            />
            <span className="font-medium text-sm">{acc.name}</span>
            {acc.type && <span className="ml-1 text-[10px] text-muted-foreground">{acc.type}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium tabular-nums">${current.toLocaleString()}</span>
            {onMoveAccount && moveTargets.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <span
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
                  >
                    <ArrowRightLeft className="h-3 w-3" />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Move to…
                  </div>
                  {moveTargets.map((t) => (
                    <DropdownMenuItem key={t.key} onClick={() => onMoveAccount(acc, t.key)} className="text-xs">
                      {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </button>

        {acc.notes && <span className="text-[10px] text-muted-foreground italic">{acc.notes}</span>}

        {target > 0 && (
          <span className="text-[10px] text-muted-foreground">Target: ${target.toLocaleString()}</span>
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
            </div>
          )}
          <div className="flex items-center gap-1 ml-auto">
            {SCOPE_OPTIONS_LIST.map((scope) => (
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

        {expanded && (
          <div className="mt-2 pt-2 border-t border-border/50 space-y-3">
            {loading ? (
              <div className="text-[10px] text-muted-foreground">Loading history…</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded bg-background/60 px-2 py-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Beginning of Year</div>
                    <div className="font-semibold tabular-nums">{fmt(boy)}</div>
                  </div>
                  <div className="rounded bg-background/60 px-2 py-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">YTD Market</div>
                    <div className="font-semibold tabular-nums">{fmt(ytd)}</div>
                    <div
                      className={`text-[9px] tabular-nums ${
                        varianceYtdDollars >= 0 ? "text-green-600" : "text-destructive"
                      }`}
                    >
                      {varianceYtdDollars >= 0 ? "+" : ""}
                      {fmt(varianceYtdDollars)} vs BOY
                    </div>
                  </div>
                  <div className="rounded bg-background/60 px-2 py-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Current Market</div>
                    <div className="font-semibold tabular-nums">{fmt(marketCurrent)}</div>
                    <div
                      className={`text-[9px] tabular-nums ${
                        varianceCurrentDollars >= 0 ? "text-green-600" : "text-destructive"
                      }`}
                    >
                      {varianceCurrentDollars >= 0 ? "+" : ""}
                      {fmt(varianceCurrentDollars)} vs BOY
                    </div>
                  </div>
                  <div className="rounded bg-background/60 px-2 py-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">YTD Harvest</div>
                    <div className="font-semibold tabular-nums">{fmt(harvest)}</div>
                  </div>
                </div>

                <div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                    Historical Snapshots
                  </div>
                  {snapshots && snapshots.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px] tabular-nums">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border/50">
                            <th className="text-left py-1 pr-2 font-medium">Date</th>
                            <th className="text-right py-1 px-1 font-medium">BOY</th>
                            <th className="text-right py-1 px-1 font-medium">Market</th>
                            <th className="text-right py-1 px-1 font-medium">Harvest</th>
                            <th className="text-right py-1 pl-1 font-medium">Return $</th>
                            <th className="text-right py-1 pl-1 font-medium">Return %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshots.map((s) => {
                            const ret = Number(s.current_value) - Number(s.boy_value);
                            const pct = Number(s.boy_value) > 0 ? (ret / Number(s.boy_value)) * 100 : 0;
                            return (
                              <tr key={s.id} className="border-b border-border/30 last:border-0">
                                <td className="py-1 pr-2">{s.snapshot_date}</td>
                                <td className="text-right py-1 px-1">{fmt(Number(s.boy_value))}</td>
                                <td className="text-right py-1 px-1">{fmt(Number(s.current_value))}</td>
                                <td className="text-right py-1 px-1">{fmt(Number(s.current_harvest))}</td>
                                <td
                                  className={`text-right py-1 pl-1 ${
                                    ret >= 0 ? "text-green-600" : "text-destructive"
                                  }`}
                                >
                                  {ret >= 0 ? "+" : ""}
                                  {fmt(ret)}
                                </td>
                                <td
                                  className={`text-right py-1 pl-1 ${
                                    pct >= 0 ? "text-green-600" : "text-destructive"
                                  }`}
                                >
                                  {pct >= 0 ? "+" : ""}
                                  {pct.toFixed(2)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground italic">
                      No snapshots yet. Save one from the Performance Analyst.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => deleteAccount(acc)}
        className="mt-2 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

