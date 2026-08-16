import { useEffect, useState } from "react";
import { AppLayout } from "@/shared/components/AppLayout";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Loader2, Plus, Pencil, RefreshCw, Trash2, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { WebFormEditorDialog, type WebFormRecord } from "../components/WebFormEditorDialog";

export default function WebForms() {
  const [webforms, setWebforms] = useState<WebFormRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WebFormRecord | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("adobe_webforms" as any)
      .select("*")
      .order("name") as any;
    setWebforms((data as WebFormRecord[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleActive = async (form: WebFormRecord) => {
    const { error } = await supabase
      .from("adobe_webforms" as any)
      .update({ is_active: !form.is_active } as any)
      .eq("id", form.id);
    if (error) {
      toast.error("Failed to update Web Form.");
      return;
    }
    toast.success(form.is_active ? "Web Form deactivated" : "Web Form activated");
    load();
  };

  const remove = async (form: WebFormRecord) => {
    if (!window.confirm(`Delete "${form.name}" permanently? This can't be undone.`)) return;
    const { error } = await supabase.from("adobe_webforms" as any).delete().eq("id", form.id);
    if (error) {
      toast.error("Failed to delete Web Form.");
      return;
    }
    toast.success(`${form.name} deleted`);
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl">Web Forms</h1>
            <p className="text-sm text-muted-foreground">
              Adobe Sign Web Forms with prefillable fields. Add a new form once here, and its button appears
              automatically on matching accounts — no engineering work per form.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Web Form
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registered Forms</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : webforms.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                No Web Forms yet. Add your first one — paste in the Adobe Web Form link and define its fields.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form</TableHead>
                    <TableHead>Custodian</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webforms.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          <FileSignature className="h-4 w-4 text-muted-foreground" />
                          {form.name}
                          {form.toe_gate_slug && (
                            <Badge variant="outline" className="text-[10px]">ToE: {form.toe_gate_slug}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{form.custodian || "Any"}</TableCell>
                      <TableCell className="text-muted-foreground">{form.fields.length}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            form.is_active
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground"
                          }
                        >
                          {form.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(form);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => toggleActive(form)}
                          >
                            {form.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete Web Form" onClick={() => remove(form)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <WebFormEditorDialog
        key={editing?.id || "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        webform={editing}
        onSaved={load}
      />
    </AppLayout>
  );
}
