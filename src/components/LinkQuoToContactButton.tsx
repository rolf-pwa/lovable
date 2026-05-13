import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link2, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** quo_calls.id OR quo_messages.id */
  quoCallId?: string;
  quoMessageId?: string;
  /** the contact this Quo record is already attached to (excluded from search) */
  excludeContactId?: string | null;
}

interface Hit {
  id: string;
  first_name: string;
  last_name: string | null;
}

export default function LinkQuoToContactButton({
  quoCallId,
  quoMessageId,
  excludeContactId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // load existing links so we can show ✓ and toggle off
  useEffect(() => {
    if (!open) return;
    (async () => {
      const filter = quoCallId
        ? { col: "quo_call_id", val: quoCallId }
        : { col: "quo_message_id", val: quoMessageId! };
      const { data } = await supabase
        .from("quo_activity_links")
        .select("contact_id")
        .eq(filter.col, filter.val);
      setLinkedIds(new Set((data || []).map((r: any) => r.contact_id)));
    })();
  }, [open, quoCallId, quoMessageId]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setHits([]); return; }
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .neq("id", excludeContactId || "00000000-0000-0000-0000-000000000000")
        .limit(8);
      setHits((data as Hit[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, excludeContactId]);

  const toggle = async (c: Hit) => {
    setSaving(true);
    try {
      if (linkedIds.has(c.id)) {
        const filter = quoCallId
          ? { col: "quo_call_id", val: quoCallId }
          : { col: "quo_message_id", val: quoMessageId! };
        const { error } = await supabase
          .from("quo_activity_links")
          .delete()
          .eq("contact_id", c.id)
          .eq(filter.col, filter.val);
        if (error) throw error;
        setLinkedIds((s) => { const n = new Set(s); n.delete(c.id); return n; });
        toast.success("Unlinked");
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user?.id) throw new Error("Not signed in");
        const { error } = await supabase.from("quo_activity_links").insert({
          contact_id: c.id,
          quo_call_id: quoCallId ?? null,
          quo_message_id: quoMessageId ?? null,
          linked_by: u.user.id,
        });
        if (error) throw error;
        setLinkedIds((s) => new Set(s).add(c.id));
        toast.success(`Linked to ${c.first_name} ${c.last_name ?? ""}`.trim());
      }
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-amber-500"
          title="Link to another contact's Activity Log"
        >
          <Link2 className="h-3 w-3 mr-1" />
          Link
          {linkedIds.size > 0 && (
            <span className="ml-1 text-amber-500">· {linkedIds.size}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <p className="text-[11px] text-muted-foreground px-1 mb-1">
          Surface this Quo record on another contact's Activity Log.
        </p>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contacts…"
          className="h-8 text-sm"
          autoFocus
        />
        <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
          {hits.length === 0 && q.length >= 2 && (
            <p className="text-xs text-muted-foreground px-1">No matches</p>
          )}
          {hits.map((c) => {
            const linked = linkedIds.has(c.id);
            return (
              <button
                key={c.id}
                disabled={saving}
                onClick={() => toggle(c)}
                className="w-full flex items-center justify-between text-left px-2 py-1 rounded hover:bg-muted text-sm"
              >
                <span>{c.first_name} {c.last_name ?? ""}</span>
                {linked && <Check className="h-3.5 w-3.5 text-amber-500" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
