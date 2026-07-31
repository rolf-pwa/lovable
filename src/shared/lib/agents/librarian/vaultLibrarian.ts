import type {
  AgentContext,
  ILibrarianProvider,
  LibrarianEntry,
} from "../types";

const VAULT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vault-service`;

async function callVault(portalToken: string, action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch(VAULT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-portal-token": portalToken },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error || `Vault request failed (${res.status})`);
  return data;
}

/** Document librarian backed by the Drive-backed `vault-service` edge function. */
export const vaultLibrarian: ILibrarianProvider = {
  id: "vault-service",

  async listFolder({ portalToken }: AgentContext, folderId?: string): Promise<LibrarianEntry[]> {
    const data = await callVault(portalToken, "list", folderId ? { folderId } : {});
    const items = (data?.files ?? data?.items ?? []) as Record<string, unknown>[];
    return items.map((f) => ({
      id: String(f.id ?? f.fileId ?? ""),
      name: String(f.name ?? "Untitled"),
      mimeType: (f.mimeType as string) ?? null,
      size: f.size != null ? Number(f.size) : null,
      modifiedAt: (f.modifiedTime as string) ?? (f.modifiedAt as string) ?? null,
      isFolder: String(f.mimeType ?? "").includes("folder"),
    }));
  },

  async getDownloadUrl({ portalToken }: AgentContext, fileId: string): Promise<string | null> {
    const data = await callVault(portalToken, "download", { fileId });
    return (data?.url as string) ?? null;
  },
};
