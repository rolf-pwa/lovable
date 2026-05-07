import { useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  Loader2,
  Download,
  Eye,
  UserPlus,
  ShieldCheck,
  Trash2,
  Copy,
  Share2,
  Plus,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

type DriveFolder = { id: string; name: string; modifiedTime?: string };
type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime?: string;
};
type ShareTarget = { driveId: string; name: string; isFolder: boolean };

const FUNCTIONS_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/vault-service`;

function formatSize(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function callVault(action: string, payload: Record<string, unknown> = {}) {
  const { data: sess } = await supabase.auth.getSession();
  const res = await fetch(FUNCTIONS_URL, {
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

function FolderNode({
  folderId,
  name,
  depth,
  householdId,
  onPreview,
  onShare,
}: {
  folderId: string;
  name: string;
  depth: number;
  householdId?: string;
  onPreview: (file: DriveFile) => void;
  onShare: (target: ShareTarget) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [visMap, setVisMap] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  const loadVisibility = async (ids: string[]) => {
    if (!ids.length) return;
    const { data } = await supabase
      .from("vault_files")
      .select("drive_id, client_visible")
      .in("drive_id", ids);
    const m: Record<string, boolean> = {};
    (data ?? []).forEach((r: any) => (m[r.drive_id] = r.client_visible));
    setVisMap(m);
  };

  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      setLoading(true);
      try {
        const json = await callVault("listFolder", { folderId });
        setFolders(json.folders ?? []);
        setFiles(json.files ?? []);
        await loadVisibility((json.files ?? []).map((f: DriveFile) => f.id));
        setLoaded(true);
      } catch (e: any) {
        toast.error(`Vault: ${e.message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, loaded, folderId]);

  const toggleVisibility = async (file: DriveFile, next: boolean) => {
    try {
      await callVault("setVisibility", { fileId: file.id, householdId, clientVisible: next });
      setVisMap((m) => ({ ...m, [file.id]: next }));
      toast.success(next ? "Visible to household" : "Hidden from household");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const isShoebox =
    depth > 0 && (name?.toLowerCase().includes("shoebox") ?? false);

  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : 16 }}>
      <div
        className={`flex items-center gap-2 py-1.5 group ${
          isShoebox ? "bg-amber-500/10 border-l-2 border-amber-500 pl-1.5 rounded-sm" : ""
        }`}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left hover:text-amber-500 flex-1"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Folder className={`h-4 w-4 ${isShoebox ? "text-amber-400" : "text-amber-500"}`} />
          <span className={`font-serif ${isShoebox ? "text-amber-400 font-semibold" : ""}`}>{name}</span>
          {isShoebox && (
            <Badge variant="outline" className="ml-1 text-[10px] border-amber-500/50 text-amber-500">
              Client Uploads
            </Badge>
          )}
          {loading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
        </button>
        {householdId && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 opacity-0 group-hover:opacity-100"
            title="Share folder with collaborator"
            onClick={() => onShare({ driveId: folderId, name, isFolder: true })}
          >
            <Share2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {open && (
        <div className="border-l border-border ml-2 pl-2">
          {folders.map((f) => (
            <FolderNode
              key={f.id}
              folderId={f.id}
              name={f.name}
              depth={depth + 1}
              householdId={householdId}
              onPreview={onPreview}
              onShare={onShare}
            />
          ))}
          {files.map((f) => {
            const visible = visMap[f.id] === true;
            return (
              <div key={f.id} className="flex items-center gap-2 py-1.5 text-sm group">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{f.name}</span>
                {householdId && (
                  <span className="flex items-center gap-1.5 mr-2" title="Visible to client">
                    <ShieldCheck className={`h-3.5 w-3.5 ${visible ? "text-amber-500" : "text-muted-foreground/40"}`} />
                    <Switch checked={visible} onCheckedChange={(v) => toggleVisibility(f, v)} />
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onPreview(f)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => downloadFile(f)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {householdId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 opacity-0 group-hover:opacity-100"
                    title="Share file with collaborator"
                    onClick={() => onShare({ driveId: f.id, name: f.name, isFolder: false })}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
          {loaded && folders.length === 0 && files.length === 0 && (
            <div className="text-xs text-muted-foreground py-1 italic">Empty</div>
          )}
        </div>
      )}
    </div>
  );
}

async function fetchStream(fileId: string, disposition: "inline" | "attachment") {
  const { data: sess } = await supabase.auth.getSession();
  const res = await fetch(`${FUNCTIONS_URL}?disposition=${disposition}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ action: "streamFile", fileId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.blob();
}

async function downloadFile(file: DriveFile) {
  try {
    const blob = await fetchStream(file.id, "attachment");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    toast.error(e.message);
  }
}

type Collaborator = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  invited_at: string;
  revoked_at: string | null;
};

type Grant = {
  id: string;
  scope_type: "folder" | "file";
  drive_id: string;
  drive_name?: string;
  permission: "view" | "upload";
  expires_at: string | null;
  revoked_at: string | null;
};

function GrantsList({ collaboratorId }: { collaboratorId: string }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await callVault("listGrants", { collaboratorId });
      setGrants(res.grants ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, [collaboratorId]);

  const updateGrant = async (grantId: string, patch: Record<string, unknown>) => {
    try {
      await callVault("updateGrant", { grantId, ...patch });
      toast.success("Grant updated");
      await refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="text-xs text-muted-foreground py-2">Loading grants…</div>;
  if (!grants.length) return <div className="text-xs text-muted-foreground py-2 italic">No grants — collaborator can't see anything yet. Click a Share icon on a folder/file above.</div>;

  return (
    <div className="space-y-1.5 mt-2">
      {grants.map((g) => {
        const expired = g.expires_at && new Date(g.expires_at) <= new Date();
        const active = !g.revoked_at && !expired;
        return (
          <div key={g.id} className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
            <Badge variant="outline" className="capitalize text-[10px]">{g.scope_type}</Badge>
            <Badge variant={g.permission === "upload" ? "default" : "secondary"} className="capitalize text-[10px]">{g.permission}</Badge>
            <span className="flex-1 truncate font-mono">{g.drive_name ?? g.drive_id}</span>
            <span className="text-muted-foreground">
              {g.revoked_at ? "revoked" : g.expires_at ? `exp ${new Date(g.expires_at).toLocaleDateString()}` : "no expiry"}
            </span>
            {active && (
              <>
                <Button size="sm" variant="ghost" className="h-6 px-1.5" title="Extend +30 days" onClick={() => updateGrant(g.id, { expires_at: new Date(Date.now() + 30 * 86400000).toISOString() })}>+30d</Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5" title="Remove expiry" onClick={() => updateGrant(g.id, { expires_at: null })}>∞</Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5" title="Toggle permission" onClick={() => updateGrant(g.id, { permission: g.permission === "view" ? "upload" : "view" })}>{g.permission === "view" ? "→upload" : "→view"}</Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive" title="Revoke" onClick={() => updateGrant(g.id, { revoke: true })}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CollaboratorsPanel({
  householdId,
  rootId,
  shareTarget,
  onShareHandled,
}: {
  householdId: string;
  rootId: string;
  shareTarget: ShareTarget | null;
  onShareHandled: () => void;
}) {
  const [list, setList] = useState<Collaborator[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [form, setForm] = useState({ email: "", fullName: "", role: "lawyer" });
  const [grantForm, setGrantForm] = useState({ collaboratorId: "", permission: "view", expiresInDays: "30" });
  const [issued, setIssued] = useState<{ token: string; code: string; name: string } | null>(null);

  const refresh = async () => {
    const { data } = await supabase
      .from("vault_collaborators")
      .select("id, email, full_name, role, invited_at, revoked_at")
      .eq("household_id", householdId)
      .order("invited_at", { ascending: false });
    setList((data ?? []) as Collaborator[]);
  };
  useEffect(() => { if (householdId) refresh(); }, [householdId]);

  // When a share request comes in from the file tree, open share dialog
  useEffect(() => {
    if (shareTarget) {
      setGrantForm({ collaboratorId: list[0]?.id ?? "", permission: "view", expiresInDays: "30" });
      setShareOpen(true);
    }
  }, [shareTarget]);

  const computeExpiry = (days: string) => {
    const n = Number(days);
    if (!n || n <= 0) return null;
    return new Date(Date.now() + n * 86400000).toISOString();
  };

  const invite = async () => {
    try {
      const res = await callVault("inviteCollaborator", {
        householdId,
        email: form.email,
        fullName: form.fullName,
        role: form.role,
        grants: [],
      });
      setIssued({ token: res.magicToken, code: res.unlockCode, name: form.fullName });
      toast.success("Collaborator invited");
      await refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const revoke = async (id: string) => {
    try {
      await callVault("revokeCollaborator", { collaboratorId: id });
      toast.success("Access revoked");
      await refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const reissue = async (c: Collaborator) => {
    try {
      const res = await callVault("reissueGuestToken", { collaboratorId: c.id });
      setIssued({ token: res.magicToken, code: res.unlockCode, name: c.full_name });
      setInviteOpen(true);
    } catch (e: any) { toast.error(e.message); }
  };

  const submitShare = async () => {
    if (!shareTarget || !grantForm.collaboratorId) return;
    try {
      await callVault("addGrant", {
        collaboratorId: grantForm.collaboratorId,
        scope_type: shareTarget.isFolder ? "folder" : "file",
        drive_id: shareTarget.driveId,
        permission: grantForm.permission,
        expires_at: computeExpiry(grantForm.expiresInDays),
      });
      toast.success(`Shared with ${list.find((c) => c.id === grantForm.collaboratorId)?.full_name}`);
      setShareOpen(false);
      onShareHandled();
    } catch (e: any) { toast.error(e.message); }
  };

  const guestUrl = (token: string) => `${window.location.origin}/vault/guest/${token}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-serif">Collaborators</CardTitle>
        <Button size="sm" onClick={() => { setIssued(null); setForm({ email: "", fullName: "", role: "lawyer" }); setInviteOpen(true); }}>
          <UserPlus className="h-4 w-4 mr-1" /> Invite
        </Button>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No collaborators yet. Invite one, then click the Share icon on any folder or file above.</p>
        ) : (
          <div className="space-y-2">
            {list.map((c) => (
              <div key={c.id} className="border rounded p-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="capitalize">{c.role}</Badge>
                  <button className="flex-1 text-left" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                    <div className="font-medium">{c.full_name}</div>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </button>
                  {c.revoked_at ? (
                    <Badge variant="secondary">Revoked</Badge>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" title="Reissue magic link" onClick={() => reissue(c)}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Revoke all access" onClick={() => revoke(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
                {expandedId === c.id && !c.revoked_at && <GrantsList collaboratorId={c.id} />}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Invite dialog (also reused for displaying reissued tokens) */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">{issued ? "Magic link" : "Invite collaborator"}</DialogTitle>
          </DialogHeader>
          {!issued ? (
            <div className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lawyer">Lawyer</SelectItem>
                    <SelectItem value="accountant">Accountant</SelectItem>
                    <SelectItem value="executor">Executor</SelectItem>
                    <SelectItem value="poa">Power of Attorney</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                After inviting, click the Share icon on any folder or file to grant access. Each grant has its own permission and expiry.
              </p>
              <Button onClick={invite} className="w-full">Invite & generate link</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">Send these to <strong>{issued.name}</strong> via your normal secure channel.</p>
              <div>
                <Label>Magic link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={guestUrl(issued.token)} />
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(guestUrl(issued.token)); toast.success("Copied"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Unlock code (required on first open)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={issued.code} className="font-mono text-lg tracking-widest" />
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(issued.code); toast.success("Copied"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Link valid 24 hours. After unlock, session is bound to their browser.</p>
              <Button onClick={() => setInviteOpen(false)} className="w-full">Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share dialog (per folder/file) */}
      <Dialog open={shareOpen} onOpenChange={(o) => { setShareOpen(o); if (!o) onShareHandled(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">
              Share {shareTarget?.isFolder ? "folder" : "file"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm bg-muted/40 rounded p-2 truncate">{shareTarget?.name}</div>
            {list.filter((c) => !c.revoked_at).length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Invite a collaborator first.</p>
            ) : (
              <>
                <div>
                  <Label>Collaborator</Label>
                  <Select value={grantForm.collaboratorId} onValueChange={(v) => setGrantForm({ ...grantForm, collaboratorId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>
                      {list.filter((c) => !c.revoked_at).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name} ({c.role})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Permission</Label>
                    <Select value={grantForm.permission} onValueChange={(v) => setGrantForm({ ...grantForm, permission: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">View only</SelectItem>
                        {shareTarget?.isFolder && <SelectItem value="upload">View + upload</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Expires in (days)</Label>
                    <Input type="number" min={0} value={grantForm.expiresInDays} onChange={(e) => setGrantForm({ ...grantForm, expiresInDays: e.target.value })} />
                    <p className="text-[10px] text-muted-foreground mt-1">0 or empty = no expiry</p>
                  </div>
                </div>
                <Button onClick={submitShare} className="w-full" disabled={!grantForm.collaboratorId}>Grant access</Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function VaultView({ forcedHouseholdId, embedded = false }: { forcedHouseholdId?: string; embedded?: boolean }) {
  const params = useParams<{ householdId?: string; contactId?: string }>();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [householdLabel, setHouseholdLabel] = useState<string>("");
  const [familyName, setFamilyName] = useState<string>("");
  const [memberNames, setMemberNames] = useState<string[]>([]);
  const [rootId, setRootId] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [preview, setPreview] = useState<{ file: DriveFile; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  // Resolve household: from URL, or from a contactId (legacy URL → redirect)
  useEffect(() => {
    (async () => {
      const hh = forcedHouseholdId ?? params.householdId;
      if (!hh && params.contactId) {
        const { data: c } = await supabase
          .from("contacts")
          .select("household_id, vault_root_folder_id, google_drive_url")
          .eq("id", params.contactId)
          .maybeSingle();
        if (c?.household_id) {
          setRedirectTo(`/vault/household/${c.household_id}`);
          return;
        }
        const fallbackId = c?.google_drive_url?.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1];
        const id = c?.vault_root_folder_id ?? fallbackId ?? "";
        if (id) { setRootId(id); setInput(id); }
        return;
      }
      if (!hh) return;

      const { data: row } = await supabase
        .from("households")
        .select("id, label, vault_root_folder_id, families(name)")
        .eq("id", hh)
        .maybeSingle();
      const { data: members } = await supabase
        .from("contacts")
        .select("first_name, last_name, google_drive_url")
        .eq("household_id", hh)
        .order("family_role");

      setHouseholdId(hh);
      setHouseholdLabel(row?.label ?? "");
      setFamilyName((row as any)?.families?.name ?? "");
      setMemberNames((members ?? []).map((m: any) => `${m.first_name} ${m.last_name ?? ""}`.trim()));
      const id = row?.vault_root_folder_id ?? "";
      if (id) {
        setRootId(id);
        setInput(id);
      } else {
        // Pre-populate from any household member's Google Drive URL
        const driveUrl = (members ?? [])
          .map((m: any) => m.google_drive_url)
          .find((u: string | null) => !!u);
        if (driveUrl) setInput(driveUrl);
      }
    })();
  }, [params.householdId, params.contactId, forcedHouseholdId]);

  

  const provision = async () => {
    if (!householdId) {
      toast.error("Open this vault from a household.");
      return;
    }
    const raw = input.trim();
    const parentFolderId = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ?? raw;
    if (!parentFolderId) {
      toast.error("Enter a Drive folder URL or ID first.");
      return;
    }
    try {
      const res = await callVault("provisionVault", { householdId, parentFolderId });
      toast.success("Vault provisioned");
      setRootId(res.folderId);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const openPreview = async (file: DriveFile) => {
    setPreviewLoading(true);
    setPreview({ file, url: "" });
    try {
      const blob = await fetchStream(file.id, "inline");
      const url = URL.createObjectURL(blob);
      setPreview({ file, url });
    } catch (e: any) {
      toast.error(e.message);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewable = useMemo(() => {
    if (!preview) return false;
    const mt = preview.file.mimeType;
    return (
      mt === "application/pdf" ||
      mt.startsWith("image/") ||
      mt.startsWith("text/") ||
      mt.includes("vnd.google-apps.document") ||
      mt.includes("vnd.google-apps.presentation")
    );
  }, [preview]);

  const heading = familyName
    ? `${familyName}${householdLabel && householdLabel !== "Primary" ? ` — ${householdLabel}` : ""}`
    : "Household Vault";

  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const body = (
    <div className={embedded ? "space-y-6" : "container max-w-5xl mx-auto py-8 space-y-6"}>
      {!embedded && (
        <div>
          <h1 className="text-3xl font-serif">The Vault</h1>
          <p className="text-muted-foreground">
            {heading}
            {memberNames.length > 0 && (
              <span className="block text-xs mt-1">Shared by: {memberNames.join(" • ")}</span>
            )}
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vault root folder</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2 items-center">
          <Input
            placeholder="Drive folder URL or ID"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button
            onClick={() => {
              const m = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
              setRootId(m ? m[1] : input.trim());
            }}
          >
            Load
          </Button>
          {householdId && (
            <Button variant="outline" onClick={provision}>
              Provision
            </Button>
          )}
        </CardContent>
      </Card>

      {rootId && (
        <Card>
          <CardContent className="pt-6">
            <FolderNode
              folderId={rootId}
              name={heading}
              depth={0}
              householdId={householdId ?? undefined}
              onPreview={openPreview}
              onShare={setShareTarget}
            />
          </CardContent>
        </Card>
      )}

      {householdId && rootId && (
        <CollaboratorsPanel
          householdId={householdId}
          rootId={rootId}
          shareTarget={shareTarget}
          onShareHandled={() => setShareTarget(null)}
        />
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
            {previewLoading || !preview?.url ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : previewable ? (
              preview.file.mimeType.startsWith("image/") ? (
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
                <Button onClick={() => preview && downloadFile(preview.file)}>
                  <Download className="h-4 w-4 mr-2" /> Download
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  return body;
}

export default function Vault() {
  return <VaultView />;
}
