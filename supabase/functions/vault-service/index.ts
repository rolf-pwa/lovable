// Vault Service — proxies Google Drive through Supabase with a strict
// per-contact ancestry firewall. Drive is invisible to clients and to
// invited collaborators (lawyers, accountants, etc.).
//
// Actor types:
//   - 'staff'        — authenticated Supabase user (CRM)
//   - 'client'       — portal session (Bearer = portal token from portal_tokens)
//   - 'collaborator' — guest session (Bearer = vault_guest_tokens.token + verified unlock_code)
//
// Every byte that leaves this function passes the firewall check:
//   ensureAccess(actor, fileOrFolderId)
// which verifies the file's ancestor chain contains the actor's allowed root(s).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const ALLOWED_ORIGINS = [
  "https://prosperwise.lovable.app",
  "https://app.prosperwise.ca",
  "https://id-preview--339dfc8f-3e82-4b05-8a36-a9f66fc58449.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-vault-guest-token, x-vault-unlock-code, x-vault-share-token, x-portal-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ───── Google token (firm Workspace ghost user) ─────
async function getValidGoogleToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("google_tokens")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.token_expiry) <= new Date(Date.now() + 60_000)) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: data.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokens = await res.json();
    if (tokens.error) {
      console.error("[Vault] token refresh failed", tokens);
      return null;
    }
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await supabaseAdmin
      .from("google_tokens")
      .update({ access_token: tokens.access_token, token_expiry: newExpiry })
      .eq("user_id", data.user_id);
    return tokens.access_token;
  }
  return data.access_token;
}

const GOOGLE_NATIVE = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
]);
function googleExportMime(mime: string) {
  if (mime === "application/vnd.google-apps.spreadsheet")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/pdf";
}

// ───── Actor resolution ─────
type Actor =
  | { kind: "staff"; userId: string }
  | { kind: "client"; contactId: string; householdId: string | null; vaultRootId: string }
  | {
      kind: "collaborator";
      collaboratorId: string;
      contactId: string;
      grants: Array<{ scope_type: string; drive_id: string; permission: string }>;
    }
  | {
      kind: "share_link";
      linkId: string;
      householdId: string;
      scopeDriveId: string;
      permission: "view" | "view_upload" | "view_upload_download";
    };

async function resolveActor(req: Request): Promise<Actor | null> {
  // 1. Collaborator guest token (highest specificity — checked first)
  const guestToken = req.headers.get("x-vault-guest-token");
  const unlockCode = req.headers.get("x-vault-unlock-code");
  if (guestToken) {
    const { data: tokenRow } = await supabaseAdmin
      .from("vault_guest_tokens")
      .select("*, vault_collaborators(id, contact_id, revoked_at)")
      .eq("token", guestToken)
      .maybeSingle();
    if (!tokenRow || tokenRow.revoked) return null;
    if (new Date(tokenRow.expires_at) <= new Date()) return null;
    if (tokenRow.vault_collaborators?.revoked_at) return null;
    // Require unlock code on first use; afterwards bound to user_agent
    const ua = req.headers.get("User-Agent") ?? "";
    if (!tokenRow.unlock_verified_at) {
      if (!unlockCode || unlockCode !== tokenRow.unlock_code) return null;
      await supabaseAdmin
        .from("vault_guest_tokens")
        .update({ unlock_verified_at: new Date().toISOString(), bound_user_agent: ua })
        .eq("id", tokenRow.id);
    } else if (tokenRow.bound_user_agent && tokenRow.bound_user_agent !== ua) {
      return null;
    }
    const { data: grants } = await supabaseAdmin
      .from("vault_collaborator_grants")
      .select("scope_type, drive_id, permission, expires_at, revoked_at")
      .eq("collaborator_id", tokenRow.vault_collaborators.id);
    const active = (grants ?? []).filter(
      (g) => !g.revoked_at && new Date(g.expires_at) > new Date(),
    );
    return {
      kind: "collaborator",
      collaboratorId: tokenRow.vault_collaborators.id,
      contactId: tokenRow.vault_collaborators.contact_id,
      grants: active,
    };
  }

  // 2. Share-link guest token (vault_share_links)
  const shareToken = req.headers.get("x-vault-share-token");
  if (shareToken) {
    const { data: link } = await supabaseAdmin
      .from("vault_share_links")
      .select("*")
      .eq("token", shareToken)
      .maybeSingle();
    if (!link || link.revoked_at) return null;
    if (link.expires_at && new Date(link.expires_at) <= new Date()) return null;
    if (typeof link.max_uses === "number" && link.use_count >= link.max_uses) return null;
    const ua = req.headers.get("User-Agent") ?? "";
    if (link.link_type === "guest") {
      const provided = req.headers.get("x-vault-unlock-code");
      if (link.unlock_code) {
        if (!provided || provided !== link.unlock_code) return null;
      }
      if (link.bound_user_agent && link.bound_user_agent !== ua) return null;
      if (!link.bound_user_agent) {
        await supabaseAdmin
          .from("vault_share_links")
          .update({ bound_user_agent: ua, last_accessed_at: new Date().toISOString() })
          .eq("id", link.id);
      }
    }
    return {
      kind: "share_link",
      linkId: link.id,
      householdId: link.household_id,
      scopeDriveId: link.drive_id,
      permission: link.permission,
    };
  }

  // 3. Portal client session (x-portal-token = portal_tokens.token)
  const portalToken = req.headers.get("x-portal-token");
  if (portalToken) {
    const { data: tok } = await supabaseAdmin
      .from("portal_tokens")
      .select("contact_id, expires_at, revoked")
      .eq("token", portalToken)
      .maybeSingle();
    if (!tok || tok.revoked || new Date(tok.expires_at) <= new Date()) return null;
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("household_id, vault_root_folder_id, households(vault_root_folder_id)")
      .eq("id", tok.contact_id)
      .maybeSingle();
    const vaultRootId = (contact as any)?.households?.vault_root_folder_id ?? contact?.vault_root_folder_id;
    if (!vaultRootId) return null;
    return { kind: "client", contactId: tok.contact_id, householdId: contact?.household_id ?? null, vaultRootId };
  }

  // 4. Staff JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    if (data?.user) return { kind: "staff", userId: data.user.id };
  }
  return null;
}

// ───── Firewall: confirm a Drive id is reachable from the actor's allowed roots ─────
async function getAncestors(driveId: string, accessToken: string): Promise<string[]> {
  // Try cache first
  const { data: cached } = await supabaseAdmin
    .from("vault_files")
    .select("ancestor_folder_ids, parent_folder_id")
    .eq("drive_id", driveId)
    .maybeSingle();
  if (cached?.ancestor_folder_ids?.length) return cached.ancestor_folder_ids;

  // Walk Drive (cap depth = 12)
  const chain: string[] = [];
  let current = driveId;
  for (let i = 0; i < 12; i++) {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${current}?fields=id,parents`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!r.ok) break;
    const j = await r.json();
    const parent = j.parents?.[0];
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

// Effective client capability: 'view' | 'upload' | 'manage'
const ROLE_CAP: Record<string, "view" | "upload" | "manage"> = {
  viewer: "view",
  contributor: "upload",
  manager: "manage",
};
function rank(c: "view" | "upload" | "manage") {
  return c === "view" ? 0 : c === "upload" ? 1 : 2;
}

async function effectiveClientPermission(
  contactId: string,
  chain: string[],
): Promise<"view" | "upload" | "manage"> {
  // Baseline role
  const { data: roleRow } = await supabaseAdmin
    .from("vault_contact_roles")
    .select("role")
    .eq("contact_id", contactId)
    .maybeSingle();
  let cap: "view" | "upload" | "manage" = ROLE_CAP[roleRow?.role ?? "viewer"] ?? "view";
  // Most specific (file > nearer folder > root) grant in chain
  const { data: grants } = await supabaseAdmin
    .from("vault_contact_grants")
    .select("scope_type, drive_id, permission, expires_at, revoked_at")
    .eq("contact_id", contactId)
    .in("drive_id", chain.length ? chain : ["__none__"]);
  const active = (grants ?? []).filter(
    (g) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > new Date()),
  );
  // Walk chain from most specific (driveId itself = chain[0]) outward
  for (const id of chain) {
    const match = active.find((g) => g.drive_id === id);
    if (match) {
      const grantCap = (match.permission as "view" | "upload" | "manage");
      if (rank(grantCap) > rank(cap)) cap = grantCap;
      break;
    }
  }
  return cap;
}

type Need = false | "upload" | "rename" | "delete" | "create_folder";

async function ensureAccess(
  actor: Actor,
  driveId: string,
  accessToken: string,
  need: Need = false,
): Promise<{ ok: boolean; reason?: string; cap?: string }> {
  if (actor.kind === "staff") return { ok: true, cap: "manage" };

  const ancestors = await getAncestors(driveId, accessToken);
  const chain = [driveId, ...ancestors];

  if (actor.kind === "client") {
    if (!chain.includes(actor.vaultRootId)) return { ok: false, reason: "outside_vault_root" };
    const cap = await effectiveClientPermission(actor.contactId, chain);

    // For files, check client_visible unless explicit grant covers
    if (!need) {
      const { data: row } = await supabaseAdmin
        .from("vault_files")
        .select("client_visible, is_folder")
        .eq("drive_id", driveId)
        .maybeSingle();
      if (row && row.is_folder === false && row.client_visible === false) {
        // Allow if any explicit grant exists in chain
        const { data: gr } = await supabaseAdmin
          .from("vault_contact_grants")
          .select("id")
          .eq("contact_id", actor.contactId)
          .in("drive_id", chain.length ? chain : ["__none__"])
          .is("revoked_at", null)
          .limit(1);
        if (!gr || gr.length === 0) return { ok: false, reason: "not_client_visible" };
      }
      return { ok: true, cap };
    }

    if (need === "upload") {
      if (rank(cap) >= 1) return { ok: true, cap };
      return { ok: false, reason: "client_no_upload" };
    }
    if (need === "create_folder") {
      if (cap === "manage") return { ok: true, cap };
      return { ok: false, reason: "client_no_create_folder" };
    }
    if (need === "rename" || need === "delete") {
      if (cap === "manage") return { ok: true, cap };
      if (cap === "upload") {
        const { data: f } = await supabaseAdmin
          .from("vault_files")
          .select("uploaded_by_contact_id")
          .eq("drive_id", driveId)
          .maybeSingle();
        if (f?.uploaded_by_contact_id === actor.contactId) return { ok: true, cap };
      }
      return { ok: false, reason: "client_can_modify_own_only" };
    }
    return { ok: false, reason: "unknown_need" };
  }

  if (actor.kind === "collaborator") {
    for (const g of actor.grants) {
      if (need && need !== "upload") continue; // collaborators: view + upload only
      if (need === "upload" && g.permission !== "upload") continue;
      if (chain.includes(g.drive_id)) return { ok: true };
    }
    return { ok: false, reason: "no_matching_grant" };
  }

  if (actor.kind === "share_link") {
    if (!chain.includes(actor.scopeDriveId)) return { ok: false, reason: "outside_share_scope" };
    if (!need) return { ok: true };
    if (need === "upload") {
      if (actor.permission === "view_upload" || actor.permission === "view_upload_download")
        return { ok: true };
      return { ok: false, reason: "share_link_no_upload" };
    }
    return { ok: false, reason: "share_link_no_modify" };
  }
  return { ok: false, reason: "unknown_actor" };
}

async function audit(
  actor: Actor | null,
  action: string,
  contactId: string | null,
  driveId: string | null,
  driveName: string | null,
  req: Request,
  metadata: Record<string, unknown> = {},
) {
  await supabaseAdmin.from("vault_audit_log").insert({
    contact_id: contactId,
    actor_type: actor?.kind ?? "anonymous",
    actor_id:
      actor?.kind === "staff"
        ? actor.userId
        : actor?.kind === "collaborator"
          ? actor.collaboratorId
          : actor?.kind === "share_link"
            ? actor.linkId
            : null,
    actor_label:
      actor?.kind === "client"
        ? `client:${actor.contactId}`
        : actor?.kind === "share_link"
          ? `share_link:${actor.linkId}`
          : actor?.kind ?? "anonymous",
    action,
    drive_id: driveId,
    drive_name: driveName,
    ip: req.headers.get("x-forwarded-for"),
    user_agent: req.headers.get("user-agent"),
    metadata,
  });
}

// ───── Drive helpers ─────
async function driveCreateFolder(name: string, parentId: string, accessToken: string) {
  const r = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,parents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!r.ok) throw new Error(`drive_create_folder_failed: ${await r.text()}`);
  return r.json();
}

async function driveListChildren(folderId: string, accessToken: string) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name,mimeType,size,modifiedTime,parents)");
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&orderBy=folder,name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!r.ok) throw new Error(`drive_list_failed: ${await r.text()}`);
  return (await r.json()).files ?? [];
}

function genUnlockCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─────────────────────────────────────────────────────────
serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  let action = url.searchParams.get("action") ?? "";
  let body: any = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
      action = body.action ?? action;
    } catch {
      /* empty */
    }
  }

  const actor = await resolveActor(req);
  if (!actor) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const accessToken = await getValidGoogleToken();
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "no_google_token" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    // ─── GET ROOT (client portal entry-point) ───
    if (action === "getRoot") {
      if (actor.kind !== "client")
        return new Response(JSON.stringify({ error: "client_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${actor.vaultRootId}?fields=id,name`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!r.ok) {
        return new Response(JSON.stringify({ error: "drive_meta_error" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const j = await r.json();
      return new Response(JSON.stringify({ rootFolderId: j.id, rootName: j.name }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── PROVISION VAULT (staff only) ───
    if (action === "provisionVault") {
      if (actor.kind !== "staff")
        return new Response(JSON.stringify({ error: "staff_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      const { householdId, contactId, parentFolderId } = body;
      if (!parentFolderId || (!householdId && !contactId))
        return new Response(JSON.stringify({ error: "householdId (or contactId) and parentFolderId required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

      // Resolve household
      let hhId = householdId as string | undefined;
      if (!hhId && contactId) {
        const { data: c } = await supabaseAdmin.from("contacts").select("household_id").eq("id", contactId).maybeSingle();
        hhId = c?.household_id ?? undefined;
      }
      if (!hhId)
        return new Response(JSON.stringify({ error: "contact_has_no_household" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

      const { data: hh } = await supabaseAdmin
        .from("households")
        .select("id, label, vault_root_folder_id, family_id, families(name)")
        .eq("id", hhId)
        .maybeSingle();
      if (!hh) return new Response(JSON.stringify({ error: "household_not_found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
      if (hh.vault_root_folder_id) {
        return new Response(JSON.stringify({ ok: true, folderId: hh.vault_root_folder_id, alreadyExists: true }), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      const familyName = (hh as any).families?.name ?? hh.label ?? "Household";
      const folderLabel = `ProsperWise Vault — ${familyName}${hh.label && hh.label !== "Primary" ? ` (${hh.label})` : ""}`;
      const root = await driveCreateFolder(folderLabel, parentFolderId, accessToken);

      const { data: tmpls } = await supabaseAdmin
        .from("vault_folder_templates")
        .select("display_name, position")
        .eq("is_active", true)
        .order("position");
      for (const t of tmpls ?? []) {
        await driveCreateFolder(t.display_name, root.id, accessToken);
      }

      await supabaseAdmin.from("households").update({ vault_root_folder_id: root.id }).eq("id", hhId);
      await audit(actor, "provision", contactId ?? null, root.id, root.name, req, { household_id: hhId });

      return new Response(JSON.stringify({ ok: true, folderId: root.id, householdId: hhId }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── ENSURE SHOEBOX (client or staff) ───
    // Finds-or-creates the "00 Shoebox (Client Uploads)" folder under the
    // household's vault root. Used by the portal uploader and by staff
    // backfill of already-provisioned vaults.
    if (action === "ensureShoebox") {
      let rootFolderId: string | null = null;
      if (actor.kind === "client") {
        rootFolderId = actor.vaultRootId;
      } else if (actor.kind === "staff") {
        const { householdId } = body;
        if (!householdId) {
          return new Response(JSON.stringify({ error: "householdId required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        }
        const { data: hh } = await supabaseAdmin
          .from("households")
          .select("vault_root_folder_id")
          .eq("id", householdId)
          .maybeSingle();
        rootFolderId = hh?.vault_root_folder_id ?? null;
      } else {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      }
      if (!rootFolderId) {
        return new Response(JSON.stringify({ error: "vault_not_provisioned" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const SHOEBOX_NAME = "00 Shoebox (Client Uploads)";
      const children = await driveListChildren(rootFolderId, accessToken);
      let shoebox = children.find(
        (c: any) =>
          c.mimeType === "application/vnd.google-apps.folder" &&
          (c.name === SHOEBOX_NAME || c.name?.toLowerCase().includes("shoebox")),
      );
      if (!shoebox) {
        shoebox = await driveCreateFolder(SHOEBOX_NAME, rootFolderId, accessToken);
      }
      return new Response(
        JSON.stringify({ folderId: shoebox.id, name: shoebox.name }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // ─── COLLABORATOR: list own grant roots (post-unlock) ───
    if (action === "myGrants") {
      if (actor.kind !== "collaborator")
        return new Response(JSON.stringify({ error: "collaborator_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      const ids = actor.grants.map((g) => g.drive_id);
      const roots: { id: string; name: string }[] = [];
      for (const id of ids) {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (r.ok) {
          const j = await r.json();
          roots.push({ id: j.id, name: j.name });
        }
      }
      return new Response(JSON.stringify({ roots }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── LIST FOLDER ───
    if (action === "listFolder") {
      const folderId = body.folderId ?? url.searchParams.get("folderId");
      if (!folderId)
        return new Response(JSON.stringify({ error: "folderId required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

      const access = await ensureAccess(actor, folderId, accessToken);
      if (!access.ok) {
        await audit(actor, "firewall_block", null, folderId, null, req, { reason: access.reason });
        return new Response(JSON.stringify({ error: "forbidden", reason: access.reason }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const files = await driveListChildren(folderId, accessToken);
      let folders = files.filter((f: any) => f.mimeType === "application/vnd.google-apps.folder");
      let docs = files.filter((f: any) => f.mimeType !== "application/vnd.google-apps.folder");

      // Client view: hide files not marked client_visible
      if (actor.kind === "client") {
        const ids = docs.map((d: any) => d.id);
        const { data: visRows } = await supabaseAdmin
          .from("vault_files")
          .select("drive_id, client_visible")
          .in("drive_id", ids.length ? ids : ["__none__"]);
        const visMap = new Map((visRows ?? []).map((r) => [r.drive_id, r.client_visible]));
        docs = docs.filter((d: any) => visMap.get(d.id) === true);
      }

      // Collaborator view: only files/folders inside one of their grants
      if (actor.kind === "collaborator") {
        const grantIds = new Set(actor.grants.map((g) => g.drive_id));
        const filterByGrant = async (item: any) => {
          if (grantIds.has(item.id)) return true;
          const anc = await getAncestors(item.id, accessToken);
          return [item.id, ...anc].some((id) => grantIds.has(id));
        };
        folders = (await Promise.all(folders.map(async (f: any) => ((await filterByGrant(f)) ? f : null)))).filter(Boolean);
        docs = (await Promise.all(docs.map(async (f: any) => ((await filterByGrant(f)) ? f : null)))).filter(Boolean);
      }

      // Share-link view: only files/folders inside the link's scope
      if (actor.kind === "share_link") {
        const scope = actor.scopeDriveId;
        const filterByScope = async (item: any) => {
          if (item.id === scope) return true;
          const anc = await getAncestors(item.id, accessToken);
          return [item.id, ...anc].includes(scope);
        };
        folders = (await Promise.all(folders.map(async (f: any) => ((await filterByScope(f)) ? f : null)))).filter(Boolean);
        docs = (await Promise.all(docs.map(async (f: any) => ((await filterByScope(f)) ? f : null)))).filter(Boolean);
      }

      await audit(actor, "list", null, folderId, null, req, { count: folders.length + docs.length });

      return new Response(
        JSON.stringify({
          folders: folders.map((f: any) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime })),
          files: docs.map((f: any) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size ? Number(f.size) : null,
            modifiedTime: f.modifiedTime,
          })),
        }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // ─── STREAM FILE ───
    if (action === "streamFile") {
      const fileId = body.fileId ?? url.searchParams.get("fileId");
      const disposition = url.searchParams.get("disposition") ?? "inline";
      if (!fileId)
        return new Response(JSON.stringify({ error: "fileId required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

      const access = await ensureAccess(actor, fileId, accessToken);
      if (!access.ok) {
        await audit(actor, "firewall_block", null, fileId, null, req, { reason: access.reason });
        return new Response(JSON.stringify({ error: "forbidden", reason: access.reason }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const meta = await metaRes.json();
      if (!metaRes.ok)
        return new Response(JSON.stringify({ error: "drive_meta_error", detail: meta }), { status: metaRes.status, headers: { ...cors, "Content-Type": "application/json" } });

      let downloadUrl: string;
      let outMime = meta.mimeType;
      let outName = meta.name;
      if (GOOGLE_NATIVE.has(meta.mimeType)) {
        outMime = googleExportMime(meta.mimeType);
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(outMime)}`;
        if (outMime === "application/pdf" && !outName.toLowerCase().endsWith(".pdf")) outName += ".pdf";
      } else {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      }
      const dlRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!dlRes.ok) {
        const text = await dlRes.text();
        return new Response(JSON.stringify({ error: "drive_download_error", detail: text }), { status: dlRes.status, headers: { ...cors, "Content-Type": "application/json" } });
      }

      await audit(actor, disposition === "attachment" ? "download" : "preview", null, fileId, outName, req);

      const headers: Record<string, string> = {
        ...cors,
        "Content-Type": outMime || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${(outName ?? "file").replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      };
      const len = dlRes.headers.get("Content-Length");
      if (len) headers["Content-Length"] = len;
      return new Response(dlRes.body, { status: 200, headers });
    }

    // ─── SET CLIENT VISIBILITY (staff only) ───
    if (action === "setVisibility") {
      if (actor.kind !== "staff")
        return new Response(JSON.stringify({ error: "staff_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      const { fileId, householdId, contactId, clientVisible } = body;
      const ancestors = await getAncestors(fileId, accessToken);
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,parents`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const meta = await metaRes.json();
      await supabaseAdmin
        .from("vault_files")
        .upsert({
          drive_id: fileId,
          household_id: householdId ?? null,
          contact_id: contactId ?? null,
          parent_folder_id: meta.parents?.[0] ?? null,
          ancestor_folder_ids: ancestors,
          name: meta.name,
          mime_type: meta.mimeType,
          is_folder: meta.mimeType === "application/vnd.google-apps.folder",
          size_bytes: meta.size ? Number(meta.size) : null,
          modified_at: meta.modifiedTime,
          client_visible: !!clientVisible,
          staff_reviewed: true,
        });
      await audit(actor, clientVisible ? "make_visible" : "hide", contactId ?? null, fileId, meta.name, req, { household_id: householdId });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── COLLABORATOR INVITE (staff only) ───
    if (action === "inviteCollaborator") {
      if (actor.kind !== "staff")
        return new Response(JSON.stringify({ error: "staff_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      const { householdId, contactId, email, fullName, role, grants } = body;
      // Resolve household: prefer explicit, fall back to contact's household
      let hhId = householdId as string | undefined;
      let cId = contactId as string | undefined;
      if (!hhId && cId) {
        const { data: c } = await supabaseAdmin.from("contacts").select("household_id").eq("id", cId).maybeSingle();
        hhId = c?.household_id ?? undefined;
      }
      if (!hhId)
        return new Response(JSON.stringify({ error: "household_required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

      const { data: collab, error: cErr } = await supabaseAdmin
        .from("vault_collaborators")
        .upsert(
          { household_id: hhId, contact_id: cId ?? null, email, full_name: fullName, role, invited_by: actor.userId, revoked_at: null },
          { onConflict: "household_id,email" },
        )
        .select()
        .single();
      if (cErr) throw cErr;
      for (const g of grants ?? []) {
        await supabaseAdmin.from("vault_collaborator_grants").insert({
          collaborator_id: collab.id,
          scope_type: g.scope_type,
          drive_id: g.drive_id,
          permission: g.permission ?? "view",
          expires_at: g.expires_at ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          granted_by: actor.userId,
        });
      }
      const code = genUnlockCode();
      const { data: tok } = await supabaseAdmin
        .from("vault_guest_tokens")
        .insert({ collaborator_id: collab.id, unlock_code: code })
        .select()
        .single();
      await audit(actor, "invite_collaborator", cId ?? null, null, null, req, { collaborator_id: collab.id, email, household_id: hhId });
      return new Response(JSON.stringify({ ok: true, collaborator: collab, magicToken: tok?.token, unlockCode: code }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── REVOKE COLLABORATOR (staff only) ───
    if (action === "revokeCollaborator") {
      if (actor.kind !== "staff")
        return new Response(JSON.stringify({ error: "staff_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      const { collaboratorId } = body;
      await supabaseAdmin.from("vault_collaborators").update({ revoked_at: new Date().toISOString() }).eq("id", collaboratorId);
      await supabaseAdmin.from("vault_guest_tokens").update({ revoked: true }).eq("collaborator_id", collaboratorId);
      await audit(actor, "revoke_collaborator", null, null, null, req, { collaborator_id: collaboratorId });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── UPLOAD (staff, collaborator-with-upload, or client → shoebox only) ───
    if (action === "uploadFile") {
      const { folderId, fileName, mimeType, base64, contactId } = body;

      const access = await ensureAccess(actor, folderId, accessToken, "upload");
      if (!access.ok) {
        await audit(actor, "firewall_block", contactId ?? null, folderId, fileName, req, { reason: access.reason });
        return new Response(JSON.stringify({ error: "forbidden", reason: access.reason }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const boundary = "----vault" + Math.random().toString(36).slice(2);
      const meta = JSON.stringify({ name: fileName, parents: [folderId], mimeType });
      const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
      const post = `\r\n--${boundary}--`;
      const bodyBytes = new Uint8Array(pre.length + binary.length + post.length);
      bodyBytes.set(new TextEncoder().encode(pre), 0);
      bodyBytes.set(binary, pre.length);
      bodyBytes.set(new TextEncoder().encode(post), pre.length + binary.length);
      const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body: bodyBytes,
      });
      if (!r.ok) throw new Error(`upload_failed: ${await r.text()}`);
      const created = await r.json();
      const uploaderContactId =
        contactId ??
        (actor.kind === "client" ? actor.contactId : actor.kind === "collaborator" ? actor.contactId : null);
      await supabaseAdmin.from("vault_files").insert({
        drive_id: created.id,
        contact_id: uploaderContactId,
        household_id:
          actor.kind === "client" ? actor.householdId :
          actor.kind === "share_link" ? actor.householdId : null,
        parent_folder_id: folderId,
        ancestor_folder_ids: [folderId, ...(await getAncestors(folderId, accessToken))],
        name: fileName,
        mime_type: mimeType,
        is_folder: false,
        client_visible: actor.kind === "staff",
        uploaded_by_collaborator_id: actor.kind === "collaborator" ? actor.collaboratorId : null,
        uploaded_by_contact_id: actor.kind === "client" ? actor.contactId : null,
        staff_reviewed: actor.kind === "staff",
      });
      // Bump share-link use count
      if (actor.kind === "share_link") {
        const { data: cur } = await supabaseAdmin
          .from("vault_share_links")
          .select("use_count")
          .eq("id", actor.linkId)
          .maybeSingle();
        await supabaseAdmin
          .from("vault_share_links")
          .update({ use_count: (cur?.use_count ?? 0) + 1, last_accessed_at: new Date().toISOString() })
          .eq("id", actor.linkId);
      }
      await audit(actor, "upload", uploaderContactId ?? null, created.id, fileName, req, { uploader: actor.kind });
      return new Response(JSON.stringify({ ok: true, fileId: created.id }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── LIST GRANTS for a collaborator (staff only) ───
    if (action === "listGrants") {
      if (actor.kind !== "staff")
        return new Response(JSON.stringify({ error: "staff_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      const { collaboratorId } = body;
      const { data: grants } = await supabaseAdmin
        .from("vault_collaborator_grants")
        .select("id, scope_type, drive_id, permission, expires_at, revoked_at, created_at")
        .eq("collaborator_id", collaboratorId)
        .order("created_at", { ascending: false });
      // Resolve display names from Drive (best-effort)
      const enriched = await Promise.all((grants ?? []).map(async (g) => {
        try {
          const r = await fetch(`https://www.googleapis.com/drive/v3/files/${g.drive_id}?fields=id,name`, { headers: { Authorization: `Bearer ${accessToken}` } });
          const j = r.ok ? await r.json() : null;
          return { ...g, drive_name: j?.name ?? g.drive_id };
        } catch { return { ...g, drive_name: g.drive_id }; }
      }));
      return new Response(JSON.stringify({ grants: enriched }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── ADD GRANT to existing collaborator (staff only) ───
    if (action === "addGrant") {
      if (actor.kind !== "staff")
        return new Response(JSON.stringify({ error: "staff_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      const { collaboratorId, scope_type, drive_id, permission, expires_at } = body;
      if (!collaboratorId || !scope_type || !drive_id)
        return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      const { data: g, error } = await supabaseAdmin.from("vault_collaborator_grants").insert({
        collaborator_id: collaboratorId,
        scope_type,
        drive_id,
        permission: permission ?? "view",
        expires_at: expires_at ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        granted_by: actor.userId,
      }).select().single();
      if (error) throw error;
      await audit(actor, "add_grant", null, drive_id, null, req, { collaborator_id: collaboratorId, scope_type, permission });
      return new Response(JSON.stringify({ ok: true, grant: g }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── REVOKE / UPDATE single grant (staff only) ───
    if (action === "updateGrant") {
      if (actor.kind !== "staff")
        return new Response(JSON.stringify({ error: "staff_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      const { grantId, revoke, expires_at, permission } = body;
      const patch: Record<string, unknown> = {};
      if (revoke === true) patch.revoked_at = new Date().toISOString();
      if (revoke === false) patch.revoked_at = null;
      if (expires_at !== undefined) patch.expires_at = expires_at; // null = no expiry
      if (permission) patch.permission = permission;
      await supabaseAdmin.from("vault_collaborator_grants").update(patch).eq("id", grantId);
      await audit(actor, "update_grant", null, null, null, req, { grantId, patch });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── REISSUE guest token for an existing collaborator (staff only) ───
    if (action === "reissueGuestToken") {
      if (actor.kind !== "staff")
        return new Response(JSON.stringify({ error: "staff_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      const { collaboratorId } = body;
      // Revoke previous tokens
      await supabaseAdmin.from("vault_guest_tokens").update({ revoked: true }).eq("collaborator_id", collaboratorId);
      const code = genUnlockCode();
      const { data: tok } = await supabaseAdmin.from("vault_guest_tokens").insert({ collaborator_id: collaboratorId, unlock_code: code }).select().single();
      await audit(actor, "reissue_guest_token", null, null, null, req, { collaborator_id: collaboratorId });
      return new Response(JSON.stringify({ ok: true, magicToken: tok?.token, unlockCode: code }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown_action", action }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[Vault] error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
