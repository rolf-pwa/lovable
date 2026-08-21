import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/components/ui/dialog";
import { Briefcase, ExternalLink, FolderOpen, Folder, FileText, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import LinkProDialog from "./LinkProDialog";
import { ProTasksButton } from "./ProTasksButton";

const VAULT_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vault-service`;

async function callVault(action: string, payload: Record<string, unknown> = {}) {
  const { data: sess } = await supabase.auth.getSession();
  const res = await fetch(VAULT_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

interface Props {
  scopeType: "contact" | "household" | "family";
  scopeId: string;
  title?: string;
}

interface EngagementRow {
  id: string;
  title: string;
  pillar: string | null;
  status: string;
  professional_id: string;
  vault_share_link_id: string | null;
  professional?: {
    id: string;
    full_name: string;
    firm: string | null;
    professional_type: string | null;
  } | null;
}

interface DriveEntry { id: string; name: string }
interface DriveFile extends DriveEntry { mimeType: string }

// Vault sharing is only meaningful when the engagement resolves to exactly
// one household — a family-scoped engagement can span several, so there's
// no single vault to browse from here. Browsing and sharing happen in this
// one dialog — no separate trip to the Vault page, no email prompt, no
// picking from a list of pre-existing links that may or may not match.
export function ShareVaultFilesControl({
  engagement,
  scopeType,
  scopeId,
  onChanged,
  label,
}: {
  engagement: EngagementRow;
  scopeType: "contact" | "household" | "family";
  scopeId: string;
  onChanged: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [path, setPath] = useState<DriveEntry[]>([]); // breadcrumb; [0] = vault root
  const [folders, setFolders] = useState<DriveEntry[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);

  const loadFolder = async (folderId: string) => {
    setLoading(true);
    try {
      const res = await callVault("listFolder", { folderId });
      setFolders(res.folders || []);
      setFiles(res.files || []);
    } catch (e: any) {
      toast.error(e.message || "Could not load folder");
    } finally {
      setLoading(false);
    }
  };

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    setPath([]);
    try {
      let hhId: string | null = scopeType === "household" ? scopeId : null;
      if (scopeType === "contact") {
        const { data } = await supabase.from("contacts").select("household_id").eq("id", scopeId).maybeSingle();
        hhId = (data as any)?.household_id || null;
      }
      setHouseholdId(hhId);
      if (!hhId) { setLoading(false); return; }
      const { data: hh } = await supabase
        .from("households")
        .select("label, vault_root_folder_id")
        .eq("id", hhId)
        .maybeSingle();
      const rootId = (hh as any)?.vault_root_folder_id;
      if (!rootId) { setLoading(false); return; }
      setPath([{ id: rootId, name: (hh as any)?.label || "Vault" }]);
      await loadFolder(rootId);
    } catch (e: any) {
      toast.error(e.message || "Could not load Vault");
      setLoading(false);
    }
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

  const share = async (item: DriveEntry) => {
    if (!householdId) return;
    setSharing(item.id);
    try {
      const res = await callVault("createShareLink", {
        householdId,
        scope_type: "folder",
        drive_id: item.id,
        permission: "view",
        link_type: "portal",
        name: item.name,
      });
      const { error } = await supabase
        .from("professional_engagements")
        .update({ vault_share_link_id: res.link.id } as any)
        .eq("id", engagement.id);
      if (error) throw error;
      toast.success(`"${item.name}" folder shared.`);
      onChanged();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to share.");
    } finally {
      setSharing(null);
    }
  };

  const clearSharing = async () => {
    setSharing("clear");
    try {
      const { error } = await supabase
        .from("professional_engagements")
        .update({ vault_share_link_id: null } as any)
        .eq("id", engagement.id);
      if (error) throw error;
      toast.success("Vault sharing removed.");
      onChanged();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update sharing.");
    } finally {
      setSharing(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={openDialog}
        disabled={scopeType === "family"}
        title={scopeType === "family" ? "Share a folder at the household or contact level instead" : undefined}
      >
        <FolderOpen className="h-3 w-3 mr-1" />
        {engagement.vault_share_link_id ? "Shared Folder" : "Share Folder"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share a Vault Folder{label ? ` — ${label}` : ""}</DialogTitle>
          </DialogHeader>
          {!householdId && !loading ? (
            <p className="text-sm text-muted-foreground py-4">
              Couldn't resolve a household for this engagement.
            </p>
          ) : path.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground py-4">
              This household doesn't have a Vault set up yet.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                {path.map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
                    <button
                      onClick={() => goToCrumb(i)}
                      disabled={loading || sharing !== null}
                      className={i === path.length - 1 ? "text-foreground font-medium" : "hover:text-foreground"}
                    >
                      {p.name}
                    </button>
                  </span>
                ))}
              </div>
              {loading ? (
                <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : folders.length === 0 && files.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Empty folder.</p>
              ) : (
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {folders.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-accent/40 transition-colors">
                      <button onClick={() => enterFolder(f)} disabled={sharing !== null} className="flex-1 flex items-center gap-2 text-left min-w-0">
                        <Folder className="h-4 w-4 text-accent shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </button>
                      <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" disabled={sharing !== null} onClick={() => share(f)}>
                        {sharing === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Share this folder"}
                      </Button>
                    </div>
                  ))}
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{f.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {engagement.vault_share_link_id && (
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={clearSharing} disabled={sharing !== null}>
                {sharing === "clear" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Remove sharing
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function EngagementsPanel({ scopeType, scopeId, title = "Professional Engagements" }: Props) {
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<Record<string, { name: string | null; drive_id: string | null }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("professional_engagements")
      .select("id, title, pillar, status, professional_id, vault_share_link_id, professional:professionals(id, full_name, firm, professional_type)")
      .eq("scope_type", scopeType)
      .eq("scope_id", scopeId)
      .order("created_at", { ascending: false });
    const list = data || [];
    setRows(list);

    // What's actually shared, at a glance.
    const linkIds = Array.from(new Set(list.map((r: any) => r.vault_share_link_id).filter(Boolean)));
    if (linkIds.length) {
      const { data: ls } = await (supabase as any)
        .from("vault_share_links")
        .select("id, name, drive_id")
        .in("id", linkIds);
      const map: Record<string, { name: string | null; drive_id: string | null }> = {};
      (ls || []).forEach((l: any) => { map[l.id] = { name: l.name, drive_id: l.drive_id }; });
      setLinks(map);
    } else {
      setLinks({});
    }
    setLoading(false);
  }, [scopeType, scopeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-serif flex items-center gap-2">
          <Briefcase className="h-4 w-4" /> {title}
        </CardTitle>
        <LinkProDialog scopeType={scopeType} scopeId={scopeId} onLinked={load} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No professionals linked to this {scopeType} yet. Use "Link a Pro" to grant portal
            visibility scoped strictly to this {scopeType}.
          </div>
        ) : (
          <ul className="divide-y">
            {/* One row per pro — a scope grant is on/off, not a list of tickets. */}
            {Object.values(
              rows.reduce((acc: Record<string, EngagementRow>, r) => {
                if (!acc[r.professional_id]) acc[r.professional_id] = r; // rows are newest-first
                return acc;
              }, {}),
            ).map((r) => {
              const link = r.vault_share_link_id ? links[r.vault_share_link_id] : null;
              const proName = r.professional?.full_name || "Unknown pro";
              return (
                <li key={r.professional_id} className="py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{proName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.professional?.firm}
                        {r.professional?.professional_type ? ` · ${r.professional.professional_type.replace("_", " ")}` : ""}
                      </div>
                    </div>
                    {r.professional?.id && (
                      <Link
                        to={`/professionals/${r.professional.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                    <FolderOpen className="h-3 w-3 shrink-0" />
                    {link?.drive_id ? (
                      <a
                        href={`https://drive.google.com/drive/folders/${link.drive_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-accent hover:underline"
                      >
                        {link.name || "Untitled"}
                      </a>
                    ) : (
                      "Nothing shared"
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ProTasksButton professionalId={r.professional_id} professionalName={proName} />
                    <ShareVaultFilesControl engagement={r} scopeType={scopeType} scopeId={scopeId} onChanged={load} label={proName} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
