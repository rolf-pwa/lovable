import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  Loader2,
  Download,
  Eye,
  Shield,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import prosperwiseLogo from "@/assets/prosperwise-logo.png";

// Build auth headers if a staff session exists — lets logged-in staff
// bypass the guest unlock-code prompt for share links.
async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers["Authorization"] = `Bearer ${data.session.access_token}`;
  } catch { /* ignore */ }
  return headers;
}

type DriveFolder = { id: string; name: string };
type DriveFile = { id: string; name: string; mimeType: string; size: number | null };

const FUNCTIONS_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/vault-service`;

function formatSize(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Mode = "guest" | "share";

async function tokenCall(
  mode: Mode,
  token: string,
  unlockCode: string | null,
  action: string,
  payload: Record<string, unknown> = {},
) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(await buildAuthHeaders()) };
  if (mode === "guest") headers["x-vault-guest-token"] = token;
  else headers["x-vault-share-token"] = token;
  if (unlockCode) headers["x-vault-unlock-code"] = unlockCode;
  const res = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

async function tokenStream(
  mode: Mode,
  token: string,
  unlockCode: string | null,
  fileId: string,
  disposition: "inline" | "attachment",
) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(await buildAuthHeaders()) };
  if (mode === "guest") headers["x-vault-guest-token"] = token;
  else headers["x-vault-share-token"] = token;
  if (unlockCode) headers["x-vault-unlock-code"] = unlockCode;
  const res = await fetch(`${FUNCTIONS_URL}?disposition=${disposition}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "streamFile", fileId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.blob();
}

function FolderNode({
  mode,
  token,
  unlockCode,
  folderId,
  name,
  depth,
  canUpload,
  onPreview,
  onUploaded,
}: {
  mode: Mode;
  token: string;
  unlockCode: string | null;
  folderId: string;
  name: string;
  depth: number;
  canUpload: boolean;
  onPreview: (f: DriveFile) => void;
  onUploaded?: () => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const j = await tokenCall(mode, token, unlockCode, "listFolder", { folderId });
        setFolders(j.folders ?? []);
        setFiles(j.files ?? []);
        setLoaded(true);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, folderId, token, unlockCode, mode, reloadKey]);

  const dl = async (f: DriveFile) => {
    try {
      const blob = await tokenStream(mode, token, unlockCode, f.id, "attachment");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    try {
      for (const f of Array.from(fileList)) {
        const buf = new Uint8Array(await f.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)) as any);
        }
        await tokenCall(mode, token, unlockCode, "uploadFile", {
          folderId,
          fileName: f.name,
          mimeType: f.type || "application/octet-stream",
          base64: btoa(bin),
        });
      }
      toast.success("Uploaded");
      setReloadKey((k) => k + 1);
      onUploaded?.();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : 16 }}>
      <div className="flex items-center gap-2 py-1.5">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-left hover:text-amber-500 flex-1">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Folder className="h-4 w-4 text-amber-500" />
          <span className="font-serif">{name}</span>
          {loading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
        </button>
        {canUpload && open && (
          <label className="cursor-pointer">
            <input type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
            <span className="inline-flex items-center gap-1 text-xs text-amber-500 hover:underline">
              <Upload className="h-3 w-3" /> Upload
            </span>
          </label>
        )}
      </div>
      {open && (
        <div className="border-l border-border ml-2 pl-2">
          {folders.map((f) => (
            <FolderNode
              key={f.id}
              mode={mode}
              token={token}
              unlockCode={unlockCode}
              folderId={f.id}
              name={f.name}
              depth={depth + 1}
              canUpload={canUpload}
              onPreview={onPreview}
              onUploaded={onUploaded}
            />
          ))}
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 py-1.5 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onPreview(f)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => dl(f)}>
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {loaded && folders.length === 0 && files.length === 0 && (
            <div className="text-xs text-muted-foreground py-1 italic">Empty</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VaultGuest() {
  const { token: rawToken = "" } = useParams<{ token: string }>();
  // Strip anything pasted after the token (e.g. "...token Unlock code: 123456")
  const token = (rawToken.match(/^[a-f0-9]+/i)?.[0] ?? rawToken).trim();
  const location = useLocation();
  const mode: Mode = location.pathname.includes("/vault/share/") ? "share" : "guest";

  const [unlockCode, setUnlockCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [needsCode, setNeedsCode] = useState(mode === "guest"); // share decides via resolve
  const [roots, setRoots] = useState<{ id: string; name: string }[]>([]);
  const [scope, setScope] = useState<{ drive_id: string; name: string | null; mime_type: string | null; scope_type: "folder" | "file" } | null>(null);
  const [permission, setPermission] = useState<"view" | "view_upload" | "view_upload_download">("view");
  const [preview, setPreview] = useState<{ file: DriveFile; url: string } | null>(null);
  const [collaboratorName, setCollaboratorName] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);

  // For share mode, immediately attempt to resolve so we know whether unlock_code is needed
  useEffect(() => {
    if (mode !== "share" || unlocked) return;
    (async () => {
      try {
        const authHeaders = await buildAuthHeaders();
        const r = await fetch(FUNCTIONS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ action: "resolveShareLink", token }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "invalid_link");
        if (j.needs_unlock_code) {
          setNeedsCode(true);
          return;
        }
        setScope(j.scope);
        setPermission(j.permission);
        setClientName(j.client_name ?? null);
        setNeedsCode(false);
        setUnlocked(true);
      } catch (e: any) {
        toast.error(e.message);
      }
    })();
  }, [mode, token, unlocked]);

  const verify = async () => {
    setVerifying(true);
    try {
      if (mode === "share") {
        const authHeaders = await buildAuthHeaders();
        const r = await fetch(FUNCTIONS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ action: "resolveShareLink", token, unlock_code: unlockCode }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "verification_failed");
        if (j.needs_unlock_code) throw new Error("Incorrect unlock code");
        setScope(j.scope);
        setPermission(j.permission);
        setUnlocked(true);
        toast.success("Access granted");
        return;
      }
      // guest mode (legacy collaborator)
      const r = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-vault-guest-token": token, "x-vault-unlock-code": unlockCode },
        body: JSON.stringify({ action: "myGrants" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "verification_failed");
      setRoots(j.roots ?? []);
      setUnlocked(true);
      toast.success("Access granted");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setVerifying(false);
    }
  };

  const openPreview = async (file: DriveFile) => {
    setPreview({ file, url: "" });
    try {
      const blob = await tokenStream(mode, token, unlockCode || null, file.id, "inline");
      setPreview({ file, url: URL.createObjectURL(blob) });
    } catch (e: any) {
      toast.error(e.message);
      setPreview(null);
    }
  };

  const directDownload = async (file: DriveFile) => {
    try {
      const blob = await tokenStream(mode, token, unlockCode || null, file.id, "attachment");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const previewable = useMemo(() => {
    if (!preview) return false;
    const mt = preview.file.mimeType;
    return mt === "application/pdf" || mt.startsWith("image/") || mt.startsWith("text/") || mt.includes("vnd.google-apps");
  }, [preview]);

  const canUpload = permission === "view_upload" || permission === "view_upload_download";

  if (!unlocked && needsCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              <CardTitle className="font-serif">Secure Document Access</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit unlock code from your invite to continue.
            </p>
            <div>
              <Label>Unlock code</Label>
              <Input
                value={unlockCode}
                onChange={(e) => setUnlockCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                className="font-mono text-lg tracking-widest text-center"
                placeholder="••••••"
              />
            </div>
            <Button onClick={verify} disabled={unlockCode.length !== 6 || verifying} className="w-full">
              {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Unlock
            </Button>
            <p className="text-xs text-muted-foreground">All access is logged.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-serif">Shared Documents</h1>
        <p className="text-sm text-muted-foreground">Access via ProsperWise · all activity is audited</p>
      </div>

      {mode === "share" && scope ? (
        scope.scope_type === "folder" ? (
          <Card>
            <CardContent className="pt-6">
              <FolderNode
                mode="share"
                token={token}
                unlockCode={unlockCode || null}
                folderId={scope.drive_id}
                name={scope.name ?? "Shared folder"}
                depth={0}
                canUpload={canUpload}
                onPreview={openPreview}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 truncate font-serif">{scope.name}</span>
              <Button size="sm" variant="outline" onClick={() => openPreview({ id: scope.drive_id, name: scope.name ?? "file", mimeType: scope.mime_type ?? "", size: null })}>
                <Eye className="h-4 w-4 mr-1" /> View
              </Button>
              {permission === "view_upload_download" && (
                <Button size="sm" onClick={() => directDownload({ id: scope.drive_id, name: scope.name ?? "file", mimeType: scope.mime_type ?? "", size: null })}>
                  <Download className="h-4 w-4 mr-1" /> Download
                </Button>
              )}
            </CardContent>
          </Card>
        )
      ) : roots.length === 0 ? (
        <p className="text-muted-foreground italic">No active grants.</p>
      ) : (
        roots.map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-6">
              <FolderNode
                mode="guest"
                token={token}
                unlockCode={null}
                folderId={r.id}
                name={r.name}
                depth={0}
                canUpload={false}
                onPreview={openPreview}
              />
            </CardContent>
          </Card>
        ))
      )}

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
            {!preview?.url ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : previewable ? (
              preview.file.mimeType.startsWith("image/") ? (
                <img src={preview.url} alt={preview.file.name} className="max-h-full max-w-full mx-auto object-contain" />
              ) : (
                <iframe src={preview.url} className="w-full h-full" title={preview.file.name} />
              )
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">Preview not available.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
