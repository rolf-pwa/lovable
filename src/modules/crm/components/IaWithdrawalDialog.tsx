import { useEffect, useState } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Copy, FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buildIaWithdrawalUrl } from "@/shared/lib/adobeSign";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  accountNumber: string | null;
}

/** Prefills the iA Financial Group withdrawal Web Form from CRM data — only
 *  account number and name are stored values; amount/fund/instructions are
 *  transactional and entered fresh for each request. */
export function IaWithdrawalDialog({ open, onOpenChange, contactId, accountNumber }: Props) {
  const [loadingName, setLoadingName] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [fund, setFund] = useState("");
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setFund("");
    setInstructions("");
    setLoadingName(true);
    supabase
      .from("contacts")
      .select("full_name")
      .eq("id", contactId)
      .maybeSingle()
      .then(({ data }: any) => {
        setName(data?.full_name || "");
        setLoadingName(false);
      });
  }, [open, contactId]);

  const canGenerate = !!accountNumber && !!name.trim() && !!amount.trim();

  const openOrCopy = () => {
    const url = buildIaWithdrawalUrl({
      account: accountNumber || "",
      name,
      amount,
      fund,
      instructions,
    });
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      navigator.clipboard?.writeText(url);
      toast.success("Link copied — paste in a new tab");
    }
  };

  const copyLink = () => {
    const url = buildIaWithdrawalUrl({
      account: accountNumber || "",
      name,
      amount,
      fund,
      instructions,
    });
    navigator.clipboard?.writeText(url);
    toast.success("Link copied — paste it to send to the client");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request iA Withdrawal</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Account</Label>
              <Input value={accountNumber || "—"} disabled className="bg-muted/50" />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={loadingName ? "Loading…" : name || "—"}
                disabled
                className="bg-muted/50"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ia-amount">Amount</Label>
            <Input
              id="ia-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10000.00"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ia-fund">Fund</Label>
            <Input
              id="ia-fund"
              value={fund}
              onChange={(e) => setFund(e.target.value)}
              placeholder="e.g. GIF Balanced"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ia-instructions">Special instructions</Label>
            <Textarea
              id="ia-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="Optional"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Review the prefilled form before sending — fields left blank here are left blank on
            the form too.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" disabled={!canGenerate} onClick={openOrCopy}>
            {loadingName ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <FileSignature className="h-4 w-4 mr-1.5" />
            )}
            Open prefilled form
          </Button>
          <Button variant="outline" className="w-full" disabled={!canGenerate} onClick={copyLink}>
            <Copy className="h-4 w-4 mr-1.5" />
            Copy link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
