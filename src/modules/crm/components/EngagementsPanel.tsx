import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/components/ui/dialog";
import { Briefcase, ExternalLink, FolderOpen, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import EngagementThreadButton from "./EngagementThreadButton";
import LinkProDialog from "./LinkProDialog";

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

interface VaultLink {
  id: string;
  scope_type: string;
  drive_id: string;
  permission: string;
  revoked_at: string | null;
  expires_at: string | null;
}

// Vault sharing is only meaningful when the engagement resolves to exactly
// one household — a family-scoped engagement can span several, so there's
// no single vault to pick a link from here.
function ShareVaultFilesControl({
  engagement,
  scopeType,
  scopeId,
  onChanged,
}: {
  engagement: EngagementRow;
  scopeType: "contact" | "household" | "family";
  scopeId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [links, setLinks] = useState<VaultLink[]>([]);

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    try {
      let hhId: string | null = scopeType === "household" ? scopeId : null;
      if (scopeType === "contact") {
        const { data } = await supabase.from("contacts").select("household_id").eq("id", scopeId).maybeSingle();
        hhId = (data as any)?.household_id || null;
      }
      setHouseholdId(hhId);
      if (hhId) {
        const res = await callVault("listShareLinks", { householdId: hhId });
        setLinks((res.links || []).filter((l: VaultLink) => !l.revoked_at));
      } else {
        setLinks([]);
      }
    } catch (e: any) {
      toast.error(e.message || "Could not load Vault links");
    } finally {
      setLoading(false);
    }
  };

  const attach = async (linkId: string | null) => {
    setSaving(linkId || "clear");
    try {
      const { error } = await supabase
        .from("professional_engagements")
        .update({ vault_share_link_id: linkId } as any)
        .eq("id", engagement.id);
      if (error) throw error;
      toast.success(linkId ? "Vault files shared with this engagement." : "Vault sharing removed.");
      onChanged();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update sharing.");
    } finally {
      setSaving(null);
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
        title={scopeType === "family" ? "Share files at the household or contact level instead" : undefined}
      >
        <FolderOpen className="h-3 w-3 mr-1" />
        {engagement.vault_share_link_id ? "Files Shared" : "Share Files"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share Vault Files — {engagement.title}</DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !householdId ? (
            <p className="text-sm text-muted-foreground py-4">
              Couldn't resolve a household for this engagement.
            </p>
          ) : links.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No Vault share links exist for this household yet. Open the Vault, browse to the
              folder or file you want to share, and use its share-link icon to create one — it'll
              show up here to attach.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {links.map((l) => {
                const isAttached = engagement.vault_share_link_id === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => attach(isAttached ? null : l.id)}
                    disabled={saving !== null}
                    className={`w-full flex items-center gap-2 text-left rounded-md border px-3 py-2 text-xs transition-colors ${
                      isAttached ? "border-accent bg-accent/[0.06]" : "border-border hover:border-accent/40"
                    }`}
                  >
                    <Badge variant="outline" className="capitalize text-[10px] shrink-0">{l.scope_type}</Badge>
                    <span className="flex-1 truncate font-mono">{l.drive_id}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{l.permission}</Badge>
                    {saving === l.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    ) : isAttached ? (
                      <X className="h-3.5 w-3.5 shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {engagement.vault_share_link_id && (
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => attach(null)} disabled={saving !== null}>
                {saving === "clear" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
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

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("professional_engagements")
      .select("id, title, pillar, status, professional_id, vault_share_link_id, professional:professionals(id, full_name, firm, professional_type)")
      .eq("scope_type", scopeType)
      .eq("scope_id", scopeId)
      .order("created_at", { ascending: false });
    setRows(data || []);
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
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.professional?.full_name || "Unknown pro"}
                    {r.professional?.firm ? ` · ${r.professional.firm}` : ""}
                    {r.pillar ? ` · ${r.pillar}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px] capitalize">{r.status}</Badge>
                  <EngagementThreadButton engagementId={r.id} engagementTitle={r.title} />
                  <ShareVaultFilesControl engagement={r} scopeType={scopeType} scopeId={scopeId} onChanged={load} />
                  {r.professional?.id && (
                    <Link
                      to={`/professionals/${r.professional.id}`}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
