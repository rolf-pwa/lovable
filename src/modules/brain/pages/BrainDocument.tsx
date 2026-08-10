import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppLayout } from "@/shared/components/AppLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Textarea } from "@/shared/components/ui/textarea";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import { ArrowLeft, Pin, PinOff, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { EntityLinkPicker } from "../components/EntityLinkPicker";
import { getBrainDocument, requestIndexing, updateBrainDocument } from "@/shared/lib/brain";

export default function BrainDocument() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data: doc, isLoading } = useQuery({
    queryKey: ["brain-document", id],
    queryFn: () => getBrainDocument(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (doc) {
      setTitle(doc.title);
      setBody(doc.body || "");
    }
  }, [doc?.id]);

  const saveMutation = useMutation({
    mutationFn: () => updateBrainDocument(id!, { title, body }),
    onSuccess: () => {
      toast.success("Saved — re-indexing");
      queryClient.invalidateQueries({ queryKey: ["brain-document", id] });
      queryClient.invalidateQueries({ queryKey: ["brain-documents"] });
    },
    onError: (e: any) => toast.error(e.message || "Could not save"),
  });

  const pinMutation = useMutation({
    mutationFn: () => updateBrainDocument(id!, { pinned: !doc?.pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brain-document", id] }),
  });

  const archiveMutation = useMutation({
    mutationFn: () => updateBrainDocument(id!, { is_active: false }),
    onSuccess: () => {
      toast.success("Removed from the Second Brain");
      navigate("/brain");
    },
  });

  const reindexMutation = useMutation({
    mutationFn: () => requestIndexing(id!),
    onSuccess: () => {
      toast.success("Re-indexing requested");
      queryClient.invalidateQueries({ queryKey: ["brain-document", id] });
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!doc) {
    return (
      <AppLayout>
        <p className="py-12 text-center text-sm text-muted-foreground">Document not found.</p>
      </AppLayout>
    );
  }

  const isManual = doc.source_system === "manual";
  const dirty = title !== doc.title || body !== (doc.body || "");

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/brain")}>
          <ArrowLeft className="h-4 w-4" /> Second Brain
        </Button>

        <Card>
          <CardContent className="space-y-4 p-5">
            {isManual ? (
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-medium" />
            ) : (
              <h1 className="text-lg font-medium text-foreground">{doc.title}</h1>
            )}

            {isManual ? (
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{doc.body}</p>
            )}

            {isManual && (
              <div className="flex justify-end">
                <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                  {saveMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
            )}

            <Separator />

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{doc.doc_type}</Badge>
              <span>·</span>
              <span>source: {doc.source_system}</span>
              <span>·</span>
              <span>status: {doc.index_status}</span>
              <span>·</span>
              <span>{doc.chunk_count} chunk{doc.chunk_count === 1 ? "" : "s"}</span>
              {doc.occurred_at && (
                <>
                  <span>·</span>
                  <span>{new Date(doc.occurred_at).toLocaleDateString()}</span>
                </>
              )}
            </div>

            <EntityLinkPicker documentId={doc.id} />

            <Separator />

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => pinMutation.mutate()}>
                {doc.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                {doc.pinned ? "Unpin" : "Pin"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={reindexMutation.isPending}
                onClick={() => reindexMutation.mutate()}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reindexMutation.isPending ? "animate-spin" : ""}`} />
                Re-index
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1.5 text-destructive hover:text-destructive"
                onClick={() => archiveMutation.mutate()}
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
