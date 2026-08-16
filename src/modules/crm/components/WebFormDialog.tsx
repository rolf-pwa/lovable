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
import { buildWebFormUrl } from "@/shared/lib/adobeSign";
import type { WebFormRecord } from "./WebFormEditorDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webform: WebFormRecord | null;
  contactId: string;
  accountNumber: string | null;
}

/** Runtime prefill dialog for any registered Web Form — resolves
 *  CRM-sourced fields (account number, client name) automatically and
 *  renders an input for everything else, then builds the prefilled URL. */
export function WebFormDialog({ open, onOpenChange, webform, contactId, accountNumber }: Props) {
  const [loadingName, setLoadingName] = useState(false);
  const [contactName, setContactName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !webform) return;
    setValues({});
    const needsName = webform.fields.some((f) => f.source === "contact_name");
    if (!needsName) return;
    setLoadingName(true);
    supabase
      .from("contacts")
      .select("full_name")
      .eq("id", contactId)
      .maybeSingle()
      .then(({ data }: any) => {
        setContactName(data?.full_name || "");
        setLoadingName(false);
      });
  }, [open, webform, contactId]);

  if (!webform) return null;

  const resolvedValue = (fieldName: string) => {
    const field = webform.fields.find((f) => f.field_name === fieldName);
    if (!field) return "";
    if (field.source === "account_number") return accountNumber || "";
    if (field.source === "contact_name") return contactName;
    return values[fieldName] || "";
  };

  const manualFields = webform.fields.filter((f) => f.source === "manual");
  const canGenerate = webform.fields
    .filter((f) => f.required)
    .every((f) => resolvedValue(f.field_name).trim().length > 0);

  const buildUrl = () => {
    const fields: Record<string, string> = {};
    for (const f of webform.fields) {
      fields[f.field_name] = resolvedValue(f.field_name);
    }
    return buildWebFormUrl(webform.widget_url, fields);
  };

  const openOrCopy = () => {
    const url = buildUrl();
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      navigator.clipboard?.writeText(url);
      toast.success("Link copied — paste in a new tab");
    }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(buildUrl());
    toast.success("Link copied — paste it to send to the client");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{webform.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {webform.fields.some((f) => f.source !== "manual") && (
            <div className="grid grid-cols-2 gap-3">
              {webform.fields
                .filter((f) => f.source !== "manual")
                .map((f) => (
                  <div key={f.field_name} className="space-y-1">
                    <Label>{f.label}</Label>
                    <Input
                      value={
                        f.source === "contact_name" && loadingName
                          ? "Loading…"
                          : resolvedValue(f.field_name) || "—"
                      }
                      disabled
                      className="bg-muted/50"
                    />
                  </div>
                ))}
            </div>
          )}

          {manualFields.map((f) => (
            <div key={f.field_name} className="space-y-1">
              <Label htmlFor={`wf-${f.field_name}`}>{f.label}</Label>
              {f.input_type === "textarea" ? (
                <Textarea
                  id={`wf-${f.field_name}`}
                  value={values[f.field_name] || ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.field_name]: e.target.value }))}
                  rows={3}
                  placeholder={f.required ? "" : "Optional"}
                />
              ) : (
                <Input
                  id={`wf-${f.field_name}`}
                  value={values[f.field_name] || ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.field_name]: e.target.value }))}
                  placeholder={f.required ? "" : "Optional"}
                />
              )}
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            Review the prefilled form before sending — fields left blank here are left blank on the form too.
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
