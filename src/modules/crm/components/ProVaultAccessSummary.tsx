import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { FolderLock, Loader2 } from "lucide-react";

// Read-only summary of what a linked professional has been granted in the
// household's Vault, plus a deep link into Vault.tsx's own share dialog for
// actually managing it. Vault access is household-scoped (via
// vault_collaborators/vault_collaborator_grants), not per-engagement, so
// this replaces the old ShareVaultFilesControl (which wrote a single
// replaceable link onto one engagement row) rather than editing in place.
export function ProVaultAccessSummary({
  scopeType,
  scopeId,
  professionalId,
  label,
}: {
  scopeType: "contact" | "household" | "family";
  scopeId: string;
  professionalId: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [grantCount, setGrantCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Same household-resolution rule ShareVaultFilesControl used —
      // vault access needs exactly one household to browse from.
      let hhId: string | null = scopeType === "household" ? scopeId : null;
      if (scopeType === "contact") {
        const { data } = await supabase.from("contacts").select("household_id").eq("id", scopeId).maybeSingle();
        hhId = (data as any)?.household_id ?? null;
      }
      if (cancelled) return;
      setHouseholdId(hhId);
      if (!hhId) { setLoading(false); return; }

      const { data: collab } = await (supabase as any)
        .from("vault_collaborators")
        .select("id")
        .eq("household_id", hhId)
        .eq("professional_id", professionalId)
        .is("revoked_at", null)
        .maybeSingle();
      if (cancelled) return;
      if (!collab) { setGrantCount(0); setLoading(false); return; }

      const { count } = await (supabase as any)
        .from("vault_collaborator_grants")
        .select("id", { count: "exact", head: true })
        .eq("collaborator_id", collab.id)
        .is("revoked_at", null);
      if (cancelled) return;
      setGrantCount(count ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [scopeType, scopeId, professionalId]);

  if (scopeType === "family") {
    return (
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled title="Share a folder at the household or contact level instead">
        <FolderLock className="h-3 w-3 mr-1" />
        Vault Access
      </Button>
    );
  }

  if (loading) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  }

  if (!householdId) {
    return <span className="text-xs text-muted-foreground italic">No household to share from</span>;
  }

  return (
    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
      <Link to={`/vault/household/${householdId}?shareProfessionalId=${professionalId}`} title={label ? `Manage Vault access for ${label}` : undefined}>
        <FolderLock className="h-3 w-3 mr-1" />
        {grantCount > 0 ? (
          <>
            Vault Access <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{grantCount}</Badge>
          </>
        ) : (
          "Grant Vault Access"
        )}
      </Link>
    </Button>
  );
}
