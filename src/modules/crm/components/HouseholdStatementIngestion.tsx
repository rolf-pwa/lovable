import { useState } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { StatementUpload } from "@/modules/crm/components/StatementUpload";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Member { id: string; first_name: string; last_name: string | null }

interface Props {
  householdId: string;
  members: Member[];
  onIngested?: () => void;
}

// Statements always belong to one person's account, but mail for a
// household usually arrives as one batch rather than pre-sorted by member —
// this is that one drop point, with a member picker instead of needing to
// already be on the right person's page.
export function HouseholdStatementIngestion({ householdId, members, onIngested }: Props) {
  const [contactId, setContactId] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);

  const handleIngest = async () => {
    if (!files.length || !contactId) return;
    const contact = members.find((m) => m.id === contactId);
    if (!contact) return;
    setIsIngesting(true);
    try {
      for (const file of files) {
        const filePath = `${contactId}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("statement-uploads").upload(filePath, file);
        if (upErr) { toast.error(`Upload failed: ${upErr.message}`); continue; }
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-statement`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            contactId,
            householdId,
            filePath,
            contactName: `${contact.first_name} ${contact.last_name || ""}`.trim(),
          }),
        });
        const result = await res.json();
        if (result.error) { toast.error(result.error); }
        else { toast.success(`Extracted ${result.accountsExtracted} account(s) from ${file.name}`); }
      }
      setFiles([]);
      onIngested?.();
    } catch (err: any) {
      toast.error(err.message || "Ingestion failed");
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Statement Ingestion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Belongs to</label>
          <Select value={contactId} onValueChange={setContactId}>
            <SelectTrigger><SelectValue placeholder="Select a household member…" /></SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.first_name} {m.last_name || ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <StatementUpload files={files} onFilesChange={setFiles} isIngesting={isIngesting} />
        {files.length > 0 && !isIngesting && (
          <Button onClick={handleIngest} disabled={!contactId} className="w-full">
            <FileUp className="h-4 w-4 mr-2" />
            Ingest {files.length} Statement{files.length !== 1 ? "s" : ""}
          </Button>
        )}
        {isIngesting && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI is parsing statements…
          </div>
        )}
      </CardContent>
    </Card>
  );
}
