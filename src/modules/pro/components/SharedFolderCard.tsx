import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { FolderOpen, Folder, FileText, Download, Eye, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { FN, proFetch } from "@/modules/pro/components/ProPortalShell";

interface Grant {
  scope_type: "folder" | "file";
  drive_id: string;
  permission: string;
  drive_name: string;
  mime_type: string | null;
}
interface DriveEntry { id: string; name: string }
interface DriveFile extends DriveEntry { mimeType: string; size: number | null }

function formatSize(n: number | null) {
  if (!n) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchStream(fileId: string, disposition: "inline" | "attachment") {
  const res = await fetch(`${FN.vault}?disposition=${disposition}`, proFetch({ action: "streamFile", fileId }));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.blob();
}

// Shows exactly what this professional has been granted for this household —
// via vault-service's "professional" actor kind (x-pro-session), never the
// household's full Vault tree. File grants render as a direct row; folder
// grants open a read-only breadcrumb browser scoped to that folder and
// everything under it.
export default function SharedFolderCard({ householdId }: { householdId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [browsing, setBrowsing] = useState<Grant | null>(null);
  const [path, setPath] = useState<DriveEntry[]>([]);
  const [folders, setFolders] = useState<DriveEntry[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: DriveEntry & { mime_type: string }; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) { setGrants([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(FN.vault, proFetch({ action: "listMyProfessionalGrants", householdId }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setGrants(data.grants || []);
    } catch (e: any) {
      toast.error(e.message || "Could not load shared files");
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => { load(); }, [load]);

  const loadFolder = async (folderId: string) => {
    setFolderLoading(true);
    try {
      const res = await fetch(FN.vault, proFetch({ action: "listFolder", folderId }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setFolders(data.folders || []);
      setFiles(data.files || []);
    } catch (e: any) {
      toast.error(e.message || "Could not load folder");
    } finally {
      setFolderLoading(false);
    }
  };

  const openGrant = (g: Grant) => {
    setBrowsing(g);
    setPath([{ id: g.drive_id, name: g.drive_name }]);
    loadFolder(g.drive_id);
  };

  const enterFolder = (folder: DriveEntry) => {
    setPath((p) => [...p, folder]);
    loadFolder(folder.id);
  };

  const goToCrumb = (index: number) => {
    const next = path.slice(0, index + 1);
    setPath(next);
    loadFolder(next[next.length - 1].id);
  };

  const download = async (file: DriveEntry & { mime_type?: string }) => {
    setDownloadingId(file.id);
    try {
      const blob = await fetchStream(file.id, "attachment");
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

  const openPreview = async (file: DriveEntry & { mime_type: string }) => {
    setPreviewLoading(true);
    setPreview({ file, url: "" });
    try {
      const blob = await fetchStream(file.id, "inline");
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

  const fileGrants = grants.filter((g) => g.scope_type === "file");
  const folderGrants = grants.filter((g) => g.scope_type === "folder");

  return (
    <>
      <Card className="border-accent/15">
        <CardHeader>
          <CardTitle className="text-base font-serif flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-accent" /> Shared Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing shared here yet.</p>
          ) : (
            <ul className="space-y-2">
              {folderGrants.map((g) => (
                <li key={g.drive_id}>
                  <button
                    onClick={() => openGrant(g)}
                    className="flex w-full items-center gap-2 text-sm border border-border/60 rounded-md px-3 py-2 bg-muted/30 hover:border-accent/40 transition-colors text-left"
                  >
                    <Folder className="h-4 w-4 text-accent shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{g.drive_name}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                </li>
              ))}
              {fileGrants.map((g) => (
                <li key={g.drive_id} className="flex items-center gap-2 text-sm border border-border/60 rounded-md px-3 py-2 bg-muted/30">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1 truncate">{g.drive_name}</div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => openPreview({ id: g.drive_id, name: g.drive_name, mime_type: g.mime_type || "" })} title="Preview">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" disabled={downloadingId === g.drive_id} onClick={() => download({ id: g.drive_id, name: g.drive_name })} title="Download">
                    {downloadingId === g.drive_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Folder browser — read-only, scoped to whatever folder was clicked and everything under it */}
      <Dialog open={!!browsing} onOpenChange={(o) => { if (!o) setBrowsing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">{browsing?.drive_name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            {path.map((p, i) => (
              <span key={p.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
                <button onClick={() => goToCrumb(i)} disabled={folderLoading} className={i === path.length - 1 ? "text-foreground font-medium" : "hover:text-foreground"}>
                  {p.name}
                </button>
              </span>
            ))}
          </div>
          {folderLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : folders.length === 0 && files.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Empty folder.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {folders.map((f) => (
                <button key={f.id} onClick={() => enterFolder(f)} className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-accent/40 transition-colors text-left">
                  <Folder className="h-4 w-4 text-accent shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{f.name}</div>
                    {formatSize(f.size) && <div className="text-[11px] text-muted-foreground">{formatSize(f.size)}</div>}
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => openPreview({ id: f.id, name: f.name, mime_type: f.mimeType })} title="Preview">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" disabled={downloadingId === f.id} onClick={() => download({ id: f.id, name: f.name })} title="Download">
                    {downloadingId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                <img src={preview.url} alt={preview.file.name} className="max-h-full max-w-full mx-auto object-contain" />
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
