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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { extractWidgetUrl } from "@/shared/lib/adobeSign";

export type WebFormFieldSource = "account_number" | "contact_name" | "manual";

export interface WebFormFieldDef {
  field_name: string;
  label: string;
  source: WebFormFieldSource;
  input_type: "text" | "textarea";
  required: boolean;
}

export interface WebFormRecord {
  id: string;
  name: string;
  widget_url: string;
  custodian: string | null;
  fields: WebFormFieldDef[];
  is_active: boolean;
  toe_gate_slug: string | null;
}

const SOURCE_LABELS: Record<WebFormFieldSource, string> = {
  account_number: "Account number (from CRM)",
  contact_name: "Client name (from CRM)",
  manual: "Entered by staff each time",
};

const blankField = (): WebFormFieldDef => ({
  field_name: "",
  label: "",
  source: "manual",
  input_type: "text",
  required: false,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webform: WebFormRecord | null;
  onSaved: () => void;
}

/** Add/edit a Web Form registry entry — the fields list defines exactly
 *  which Adobe field names get prefilled from CRM data vs. asked of staff
 *  each time. Matches the field names configured in Adobe's own field
 *  editor exactly, case-sensitive. */
export function WebFormEditorDialog({ open, onOpenChange, webform, onSaved }: Props) {
  const [name, setName] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [custodian, setCustodian] = useState("");
  const [fields, setFields] = useState<WebFormFieldDef[]>([blankField()]);
  const [toeGateSlug, setToeGateSlug] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(webform?.name ?? "");
    setUrlInput(webform?.widget_url ?? "");
    setCustodian(webform?.custodian ?? "");
    setFields(webform?.fields?.length ? webform.fields : [blankField()]);
    setToeGateSlug(webform?.toe_gate_slug ?? "");
  }, [open, webform]);

  const updateField = (index: number, patch: Partial<WebFormFieldDef>) =>
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  const canSave =
    name.trim().length > 0 &&
    !!extractWidgetUrl(urlInput) &&
    fields.some((f) => f.field_name.trim() && f.label.trim());

  const save = async () => {
    const widgetUrl = extractWidgetUrl(urlInput);
    if (!widgetUrl) {
      toast.error("Couldn't find a Web Form URL in what you pasted — check it's the widget link or embed code.");
      return;
    }
    const cleanFields = fields
      .filter((f) => f.field_name.trim() && f.label.trim())
      .map((f) => ({ ...f, field_name: f.field_name.trim(), label: f.label.trim() }));
    if (cleanFields.length === 0) {
      toast.error("Add at least one field.");
      return;
    }

    setSaving(true);
    const trimmedToeSlug = toeGateSlug.trim() || null;
    const payload = {
      name: name.trim(),
      widget_url: widgetUrl,
      custodian: custodian.trim() || null,
      fields: cleanFields,
      toe_gate_slug: trimmedToeSlug,
    };
    const { error } = webform
      ? await supabase.from("adobe_webforms" as any).update(payload as any).eq("id", webform.id)
      : await supabase.from("adobe_webforms" as any).insert(payload as any);
    setSaving(false);

    if (error) {
      if (error.code === "23505" && trimmedToeSlug) {
        toast.error(`Another form already gates "${trimmedToeSlug}" — that slug can only have one ToE.`);
      } else {
        toast.error("Failed to save Web Form.");
      }
      return;
    }
    toast.success(webform ? "Web Form updated" : "Web Form added");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{webform ? "Edit Web Form" : "Add Web Form"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wf-name">Name</Label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. IA Policy Change Form"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-url">Web Form link or embed code</Label>
            <Input
              id="wf-url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste the widget URL, or the <iframe>/<script> embed code Adobe gives you"
            />
            <p className="text-xs text-muted-foreground">
              Any of these work as-is: the plain link, the iframe embed code, or the JavaScript embed code — paste
              whichever one Adobe shows you.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-custodian">Custodian (optional)</Label>
            <Input
              id="wf-custodian"
              value={custodian}
              onChange={(e) => setCustodian(e.target.value)}
              placeholder="e.g. iA Financial Group — leave blank to show on every account"
            />
            <p className="text-xs text-muted-foreground">
              Must match an account's custodian exactly for the button to appear there. Leave blank for a form
              that isn't tied to one custodian.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-toe-slug">Gates this /pay slug (optional)</Label>
            <Input
              id="wf-toe-slug"
              value={toeGateSlug}
              onChange={(e) => setToeGateSlug(e.target.value)}
              placeholder="e.g. sovereignty-audit-personal"
            />
            <p className="text-xs text-muted-foreground">
              If set, this form is shown at /toe/&lt;slug&gt; before the visitor reaches /pay/&lt;slug&gt; — must
              match the service's pay slug exactly. Each slug can only be gated by one form. Leave blank for a
              form that isn't a Terms of Engagement gate.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fields</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setFields((p) => [...p, blankField()])}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add field
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              One row per field on the form that has "Default value may come from URL" enabled in Adobe's field
              editor. Field name must match exactly, case-sensitive.
            </p>

            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Field name (in Adobe)</Label>
                    <Input
                      value={field.field_name}
                      onChange={(e) => updateField(index, { field_name: e.target.value })}
                      placeholder="e.g. Account"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Label (shown to staff)</Label>
                    <Input
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      placeholder="e.g. Account"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Value comes from</Label>
                    <Select
                      value={field.source}
                      onValueChange={(v) => updateField(index, { source: v as WebFormFieldSource })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(SOURCE_LABELS) as WebFormFieldSource[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {SOURCE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end justify-between gap-2 sm:col-span-3 sm:justify-start sm:gap-4">
                    {field.source === "manual" && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={field.input_type === "textarea"}
                          onCheckedChange={(v) => updateField(index, { input_type: v ? "textarea" : "text" })}
                        />
                        Multi-line
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={field.required}
                        onCheckedChange={(v) => updateField(index, { required: !!v })}
                      />
                      Required
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive ml-auto"
                      onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                      disabled={fields.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || saving} onClick={save}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {webform ? "Save changes" : "Add Web Form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
