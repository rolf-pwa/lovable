import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, ExternalLink, Loader2, Check } from "lucide-react";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  governanceStatus: string;
  contactId: string;
  householdId: string | null;
  portalToken: string;
}

interface Update {
  id: string;
  title: string;
  url: string;
  target_governance_status: string;
  target_contact_ids: string[];
  target_household_ids: string[];
  created_at: string;
}

export function PortalUpdates({ governanceStatus, contactId, householdId, portalToken }: Props) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [updatesRes, readsRes] = await Promise.all([
        supabase.functions.invoke("portal-track", {
          body: { action: "get_updates", contact_id: contactId, portal_token: portalToken },
        }).then(r => ({ data: r.data?.data || [] })),
        supabase.functions.invoke("portal-track", {
          body: { action: "get_reads", contact_id: contactId, portal_token: portalToken },
        }).then(r => ({ data: r.data?.data || [] })),
      ]);

      const allUpdates = ((updatesRes.data as any[]) || []).filter((u) => {
        const tContactIds: string[] = u.target_contact_ids || [];
        const tHouseholdIds: string[] = u.target_household_ids || [];
        if (tContactIds.length > 0) return tContactIds.includes(contactId);
        if (tHouseholdIds.length > 0) return householdId ? tHouseholdIds.includes(householdId) : false;
        return u.target_governance_status === "all" || u.target_governance_status === governanceStatus;
      });
      setUpdates(allUpdates);

      const readSet = new Set<string>(
        ((readsRes.data as any[]) || []).map((r: any) => r.update_id)
      );
      setReadIds(readSet);
      setLoading(false);
    })();
  }, [governanceStatus, contactId, portalToken]);

  const markAsRead = async (updateId: string) => {
    if (readIds.has(updateId)) return;
    setReadIds((prev) => new Set(prev).add(updateId));
    await supabase.functions.invoke("portal-track", {
      body: { action: "record_update_read", contact_id: contactId, update_id: updateId, portal_token: portalToken },
    });
  };

  const unreadUpdates = updates.filter((u) => !readIds.has(u.id));
  const readUpdates = updates.filter((u) => readIds.has(u.id));

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Megaphone className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold text-foreground font-serif">No Updates</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          There are no new updates at this time.
        </p>
      </div>
    );
  }

  const renderUpdateCard = (u: Update, isRead: boolean) => (
    <a
      key={u.id}
      href={u.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => markAsRead(u.id)}
      className={`w-full flex items-center justify-between gap-3 rounded-lg bg-card border border-border p-4 hover:bg-muted/50 transition-colors text-left group ${isRead ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${isRead ? "bg-muted border-border" : "bg-accent/10 border-accent/20"}`}>
          {isRead ? (
            <Check className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Megaphone className="h-4 w-4 text-accent" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{u.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(u.created_at), "MMM d, yyyy")}
          </p>
        </div>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </a>
  );

  return (
    <div className="space-y-3">
      {unreadUpdates.length > 0 && (
        <div className="space-y-2">
          {unreadUpdates.map((u) => renderUpdateCard(u, false))}
        </div>
      )}

      {unreadUpdates.length === 0 && readUpdates.length > 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Check className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">All caught up!</p>
        </div>
      )}

      {readUpdates.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors py-2">
            Read ({readUpdates.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            {readUpdates.map((u) => renderUpdateCard(u, true))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/** Returns count of unread updates for badge use */
export function useUnreadUpdateCount(governanceStatus: string, contactId: string, householdId?: string | null, portalToken?: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!contactId) return;
    (async () => {
      const [updatesRes, readsRes] = await Promise.all([
        supabase.functions.invoke("portal-track", {
          body: { action: "get_updates", contact_id: contactId, portal_token: portalToken },
        }).then(r => ({ data: r.data?.data || [] })),
        supabase.functions.invoke("portal-track", {
          body: { action: "get_reads", contact_id: contactId, portal_token: portalToken },
        }).then(r => ({ data: r.data?.data || [] })),
      ]);

      const filtered = ((updatesRes.data as any[]) || []).filter((u) => {
        const tContactIds: string[] = u.target_contact_ids || [];
        const tHouseholdIds: string[] = u.target_household_ids || [];
        if (tContactIds.length > 0) return tContactIds.includes(contactId);
        if (tHouseholdIds.length > 0) return householdId ? tHouseholdIds.includes(householdId) : false;
        return u.target_governance_status === "all" || u.target_governance_status === governanceStatus;
      });
      const readSet = new Set(((readsRes.data as any[]) || []).map((r: any) => r.update_id));
      setCount(filtered.filter((u) => !readSet.has(u.id)).length);
    })();
  }, [governanceStatus, contactId, householdId]);

  return count;
}
