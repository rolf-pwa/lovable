import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { supabase } from "@/shared/integrations/supabase/client";
import { draftSovereigntyCharter, type DraftCharterPayload } from "@/shared/lib/charter";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";

interface Props {
  contactId: string;
}

export function GenerateCharterDraftButton({ contactId }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hasExistingDraft, setHasExistingDraft] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("sovereignty_charters")
        .select("id, draft_status")
        .eq("contact_id", contactId)
        .maybeSingle();

      if (existing && existing.draft_status !== "draft") {
        setHasExistingDraft(true);
        setConfirmOpen(true);
        setLoading(false);
        return;
      }

      await runGeneration();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to start generation");
      setLoading(false);
    }
  };

  const runGeneration = async () => {
    setLoading(true);
    try {
      const { data: sources, error: sourcesErr } = await supabase
        .from("sovereignty_charter_sources")
        .select("*")
        .eq("contact_id", contactId)
        .order("sort_order");

      if (sourcesErr) throw sourcesErr;

      if (!sources || sources.length === 0) {
        toast.error("No charter sources found. Add an audit, transcript, or note on the Sovereignty Charter page first.");
        navigate(`/sovereignty-charter/contact/${contactId}`);
        return;
      }

      const payload: DraftCharterPayload = {
        contactId,
        sources: sources.map((s) => ({
          sourceKind: s.source_kind as DraftCharterPayload["sources"][number]["sourceKind"],
          title: s.title,
          inputMode: s.input_mode as DraftCharterPayload["sources"][number]["inputMode"],
          contentText: s.content_text ?? s.extracted_text ?? undefined,
          sourceUrl: s.source_url ?? undefined,
          storagePath: s.storage_path ?? undefined,
          fileName: s.file_name ?? undefined,
          mimeType: s.mime_type ?? undefined,
          importOrigin: s.import_origin,
          externalFileId: s.external_file_id ?? undefined,
          externalModifiedAt: s.external_modified_at ?? undefined,
          externalFolderId: s.external_folder_id ?? undefined,
        })),
      };

      toast.loading("Generating charter draft...", { id: "charter-draft" });
      const result = await draftSovereigntyCharter(payload);
      const docUrl = (result as any)?.diagnostics?.googleDocUrl as string | null | undefined;
      const docError = (result as any)?.diagnostics?.googleDocError as string | null | undefined;
      if (docUrl) {
        toast.success("Charter draft generated — Google Doc created", {
          id: "charter-draft",
          action: { label: "Open Doc", onClick: () => window.open(docUrl, "_blank", "noopener,noreferrer") },
        });
      } else {
        toast.success(docError ? `Charter draft generated (Doc skipped: ${docError})` : "Charter draft generated", { id: "charter-draft" });
      }
      navigate(`/sovereignty-charter/contact/${contactId}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to generate charter draft", {
        id: "charter-draft",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={handleClick} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        Generate Charter Draft
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite existing charter?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasExistingDraft
                ? "A generated or ratified charter already exists for this contact. Generating a new draft will overwrite the current content. This action cannot be undone."
                : "Generate a new draft from the existing charter sources?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runGeneration}>
              Generate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
