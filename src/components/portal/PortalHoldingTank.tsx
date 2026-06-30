import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Anchor, CalendarDays, ChevronDown, ChevronRight } from "lucide-react";

interface PortalHoldingTankProps {
  accounts: Array<{
    id: string;
    account_name: string;
    account_number: string | null;
    account_type: string;
    account_owner: string | null;
    custodian: string | null;
    book_value: number | null;
    current_value: number | null;
    notes: string | null;
    visibility_scope?: string;
    expected_deposit_date?: string | null;
  }>;
  defaultCollapsed?: boolean;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

export function PortalHoldingTank({ accounts, defaultCollapsed = false }: PortalHoldingTankProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  if (!accounts || accounts.length === 0) return null;

  const totalValue = accounts.reduce((sum, a) => sum + (a.current_value || 0), 0);

  return (
    <Card className="border-amber-500/20">
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <Anchor className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-lg font-serif">The Holding Tank</CardTitle>
            <p className="text-xs text-muted-foreground">Accounts awaiting Charter ratification</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-xl font-bold text-amber-600">{formatCurrency(totalValue)}</p>
              <Badge variant="secondary" className="text-[10px]">
                {accounts.length} account{accounts.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      {open && (
      <CardContent className="space-y-2">
        {accounts.map((account) => (
          <div key={account.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{account.account_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {account.custodian && (
                  <span className="text-[10px] text-muted-foreground">{account.custodian}</span>
                )}
                <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                  {account.account_type}
                </Badge>
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              {account.current_value != null && (
                <p className="text-sm font-semibold">{formatCurrency(account.current_value)}</p>
              )}
              {account.book_value != null && (
                <p className="text-[10px] text-muted-foreground">Beginning of Year: {formatCurrency(account.book_value)}</p>
              )}
              {account.expected_deposit_date && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                  <CalendarDays className="h-2.5 w-2.5" />
                  Expected: {new Date(account.expected_deposit_date + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
