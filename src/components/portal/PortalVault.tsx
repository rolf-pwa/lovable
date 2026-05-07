import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Folder,
  FileText,
  Download,
  Eye,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Home,
  Upload,
  Inbox,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

interface VaultEntry {
  id: string;
  name: string;
  modifiedTime?: string;
  mimeType?: string;
  size?: number | null;
}

interface Crumb {
  id: string;
  name: string;
}

interface Props {
  portalToken: string;
  householdId: string | null;
}

const PDF_MIMES = new Set(["application/pdf"]);

function formatSize(bytes?: number | null): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortalVault({ portalToken, householdId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<VaultEntry[]>([]);
  const [files, setFiles] = useState<VaultEntry[]>([]);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [shoeboxId, setShoeboxId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const callVault = useCallback(
    async (action: string, payload: Record<string, any> = {}) => {
      const res = await fetch(`${FUNCTIONS_URL}/vault-service`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal-token": portalToken,
        },
        body: JSON.stringify({ action, ...payload }),
      });
      return res;
    },
    [portalToken],
  );

  const loadFolder = useCallback(
    async (folder: Crumb, replaceCrumbs?: Crumb[]) => {
      setLoading(true);
      setError(null);
      try {
        const res = await callVault("listFolder", { folderId: folder.id });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Failed to load");
        }
        const data = await res.json();
        setFolders(data.folders || []);
        setFiles(data.files || []);
        if (replaceCrumbs) setCrumbs(replaceCrumbs);
      } catch (e: any) {
        setError(e.message || "Failed to load vault");
      } finally {
        setLoading(false);
      }
    },
    [callVault],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rootRes = await callVault("getRoot");
        if (!rootRes.ok) {
          if (cancelled) return;
          setError("not_provisioned");
          setLoading(false);
          return;
        }
        const root = await rootRes.json();
        if (cancelled) return;
        const rootCrumb: Crumb = { id: root.rootFolderId, name: root.rootName || "Vault" };
        await loadFolder(rootCrumb, [rootCrumb]);
        // Resolve (or create) the shoebox so uploads always have a target
        try {
          const sbRes = await callVault("ensureShoebox");
          if (sbRes.ok) {
            const sb = await sbRes.json();
            if (!cancelled) setShoeboxId(sb.folderId);
          }
        } catch {
          /* shoebox best-effort */
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e.message || "Failed to open vault");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callVault, loadFolder, householdId]);

  const enterFolder = (folder: VaultEntry) => {
    const next = [...crumbs, { id: folder.id, name: folder.name }];
    loadFolder({ id: folder.id, name: folder.name }, next);
  };

  const goToCrumb = (idx: number) => {
    const trimmed = crumbs.slice(0, idx + 1);
    loadFolder(trimmed[trimmed.length - 1], trimmed);
  };

  const streamFile = async (file: VaultEntry, disposition: "inline" | "attachment") => {
    setBusyFileId(file.id);
    try {
      const url = `${FUNCTIONS_URL}/vault-service?disposition=${disposition}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal-token": portalToken,
        },
        body: JSON.stringify({ action: "streamFile", fileId: file.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Download failed");
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      if (disposition === "attachment") {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(blobUrl, "_blank", "noopener,noreferrer");
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (e: any) {
      toast({
        title: "Could not open file",
        description: e.message || "Please try again or ask your Personal CFO.",
        variant: "destructive",
      });
    } finally {
      setBusyFileId(null);
    }
  };

  if (!householdId) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Your vault becomes available once your household is set up.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading && folders.length === 0 && files.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error === "not_provisioned") {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Your secure vault has not been activated yet.
          </p>
          <p className="text-xs text-muted-foreground">
            Your Personal CFO will set this up for your household.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-destructive">Unable to load your vault. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <ShieldCheck className="h-4 w-4 text-accent shrink-0" />
            {crumbs.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {i === crumbs.length - 1 ? (
                  <span className="font-serif text-foreground truncate max-w-[260px]">{c.name}</span>
                ) : (
                  <button
                    onClick={() => goToCrumb(i)}
                    className="text-muted-foreground hover:text-accent transition-colors truncate max-w-[200px]"
                  >
                    {i === 0 ? <Home className="h-3.5 w-3.5 inline" /> : c.name}
                  </button>
                )}
              </div>
            ))}
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
          </div>
        </CardContent>
      </Card>

      {isEmpty ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Folder className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {crumbs.length === 1
                ? "Your Personal CFO has not shared any documents yet."
                : "This folder is empty."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => enterFolder(f)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <Folder className="h-4 w-4 text-accent shrink-0" />
                <span className="text-sm flex-1 truncate">{f.name}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
            {files.map((f) => {
              const canPreview = PDF_MIMES.has(f.mimeType || "") || (f.mimeType || "").startsWith("image/");
              const isBusy = busyFileId === f.id;
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{f.name}</div>
                    {f.size != null && (
                      <div className="text-[11px] text-muted-foreground">{formatSize(f.size)}</div>
                    )}
                  </div>
                  {canPreview && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => streamFile(f, "inline")}
                      className="h-8 gap-1"
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">View</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => streamFile(f, "attachment")}
                    className="h-8 gap-1"
                  >
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
