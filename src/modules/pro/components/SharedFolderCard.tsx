import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { FolderOpen, FileText, Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FN, proFetch } from "@/modules/pro/components/ProPortalShell";

interface SharedFile { id: string; name: string; mime_type: string; size_bytes: number | null }

function formatSize(n: number | null) {
  if (!n) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function base64ToBlob(base64: string, mimeType: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

// Shows whatever's shared for this scope directly — no intermediate
// "engagement" to click through first.
export default function SharedFolderCard({ scopeType, scopeId }: { scopeType: "household" | "contact"; scopeId: string }) {
  const [loading, setLoading] = useState(true);
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: SharedFile; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const listRes = await fetch(FN.engagements, proFetch({ action: "list" }));
      const listData = await listRes.json();
      if (!listRes.ok) throw new Error(listData.error || "Failed");
      const match = (listData.engagements || []).find(
        (e: any) => e.scope_type === scopeType && e.scope_id === scopeId && e.vault_share_link_id,
      );
      if (!match) {
        setEngagementId(null);
        setFiles([]);
        return;
      }
      setEngagementId(match.id);
      const getRes = await fetch(FN.engagements, proFetch({ action: "get", engagement_id: match.id }));
      const getData = await getRes.json();
      if (!getRes.ok) throw new Error(getData.error || "Failed");
      setFolderName(getData.engagement?.scope_label || null);
      setFiles(getData.files || []);
    } catch (e: any) {
      toast.error(e.message || "Could not load shared folder");
    } finally {
      setLoading(false);
    }
  }, [scopeType, scopeId]);

  useEffect(() => { load(); }, [load]);

  const fetchFile = async (file: SharedFile) => {
    if (!engagementId) return null;
    const res = await fetch(FN.engagements, proFetch({ action: "downloadSharedFile", engagement_id: engagementId, file_id: file.id }));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    return base64ToBlob(data.base64, data.mimeType || file.mime_type);
  };

  const download = async (file: SharedFile) => {
    setDownloadingId(file.id);
    try {
      const blob = await fetchFile(file);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || "Could not download file");
    } finally {
      setDownloadingId(null);
    }
  };

  const openPreview = async (file: SharedFile) => {
    setPreviewLoading(true);
    setPreview({ file, url: "" });
    try {
      const blob = await fetchFile(file);
      if (!blob) { setPreview(null); return; }
      setPreview({ file, url: URL.createObjectURL(blob) });
    } catch (e: any) {
      toast.error(e.message || "Could not load preview");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewable = useMemo(() => {
    if (!preview) return false;
    const mt = preview.file.mime_type || "";
    return mt === "application/pdf" || mt.startsWith("image/") || mt.startsWith("text/");
  }, [preview]);

  return (
    <>
      <Card className="border-accent/15">
        <CardHeader>
          <CardTitle className="text-base font-serif flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-accent" /> Shared Folder
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !engagementId ? (
            <p className="text-sm text-muted-foreground">Nothing shared here yet.</p>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground">{folderName || "This folder"} is empty.</p>
          ) : (
            <ul className="space-y-2">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm border border-border/60 rounded-md px-3 py-2 bg-muted/30">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground truncate">{f.name}</div>
                    {formatSize(f.size_bytes) && (
                      <div className="text-[11px] text-muted-foreground">{formatSize(f.size_bytes)}</div>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => openPreview(f)}
                    title="Preview"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    disabled={downloadingId === f.id}
                    onClick={() => download(f)}
                    title="Download"
                  >
                    {downloadingId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!preview}
        onOpenChange={(o) => {
          if (!o) {
            if (preview?.url) URL.revokeObjectURL(preview.url);
            setPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-serif">{preview?.file.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-muted rounded">
            {previewLoading || !preview?.url ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : previewable ? (
              preview.file.mime_type.startsWith("image/") ? (
                <img
                  src={preview.url}
                  alt={preview.file.name}
                  className="max-h-full max-w-full mx-auto object-contain"
                />
              ) : (
                <iframe src={preview.url} className="w-full h-full" title={preview.file.name} />
              )
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <p>Preview not available for this file type.</p>
                <Button onClick={() => preview && download(preview.file)}>
                  <Download className="h-4 w-4 mr-2" /> Download
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
