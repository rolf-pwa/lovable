import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronDown, ClipboardList, Phone, MessageSquare, Plus, Trash2, Pencil } from "lucide-react";

interface Props {
  contactId: string;
  contactName: string;
}

type Kind = "call" | "sms";
type Direction = "inbound" | "outbound";

interface Entry {
  id: string;
  kind: Kind;
  direction: Direction;
  occurred_at: string;
  duration_minutes: number | null;
  subject: string | null;
  body: string;
  logged_by: string;
  created_at: string;
}

function localDateTimeNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function ManualActivityLog({ contactId, contactName }: Props) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [saving, setSaving] = useState(false);

  // form state
  const [kind, setKind] = useState<Kind>("call");
  const [direction, setDirection] = useState<Direction>("outbound");
  const [occurredAt, setOccurredAt] = useState(localDateTimeNow());
  const [durationMinutes, setDurationMinutes] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const resetForm = () => {
    setEditing(null);
    setKind("call");
    setDirection("outbound");
    setOccurredAt(localDateTimeNow());
    setDurationMinutes("");
    setSubject("");
    setBody("");
  };

  const openNew = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (e: Entry) => {
    setEditing(e);
    setKind(e.kind);
    setDirection(e.direction);
    const d = new Date(e.occurred_at);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setOccurredAt(d.toISOString().slice(0, 16));
    setDurationMinutes(e.duration_minutes?.toString() ?? "");
    setSubject(e.subject ?? "");
    setBody(e.body);
    setDialogOpen(true);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("manual_activity_log")
      .select("*")
      .eq("contact_id", contactId)
      .order("occurred_at", { ascending: false });
    if (error) toast.error(`Load failed: ${error.message}`);
    setEntries((data as Entry[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  const save = async () => {
    if (!body.trim() && !subject.trim()) {
      toast.error("Add a subject or notes before saving");
      return;
    }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");

      const payload = {
        contact_id: contactId,
        kind,
        direction,
        occurred_at: new Date(occurredAt).toISOString(),
        duration_minutes: durationMinutes ? parseInt(durationMinutes, 10) : null,
        subject: subject.trim() || null,
        body: body.trim(),
        logged_by: userId,
      };

      if (editing) {
        const { error } = await supabase
          .from("manual_activity_log")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Activity updated");
      } else {
        const { error } = await supabase.from("manual_activity_log").insert(payload);
        if (error) throw error;
        toast.success("Activity logged");
      }
      setDialogOpen(false);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this activity entry?")) return;
    const { error } = await supabase.from("manual_activity_log").delete().eq("id", id);
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    toast.success("Deleted");
    load();
  };

  return (
    <Card className="p-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
            <ClipboardList className="h-4 w-4 text-amber-500" />
            <h3 className="font-serif text-base">Activity Log</h3>
            {entries.length > 0 && (
              <Badge variant="outline" className="text-[10px] ml-1">{entries.length}</Badge>
            )}
            <span className="text-[11px] text-muted-foreground ml-2">
              Manual log of calls &amp; texts outside Quo
            </span>
          </CollapsibleTrigger>
          {open && (
            <Button size="sm" variant="ghost" onClick={openNew} className="h-7 px-2 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" /> Log
            </Button>
          )}
        </div>

        <CollapsibleContent className="space-y-2 mt-3 border-t border-border pt-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && entries.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No manual entries yet. Use "Log" to record a call or message that happened outside Quo.
            </p>
          )}
          {entries.map((e) => (
            <div key={e.id} className="rounded-lg border border-border bg-card p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {e.kind === "call"
                    ? <Phone className="h-3 w-3 text-amber-500" />
                    : <MessageSquare className="h-3 w-3 text-amber-500" />}
                  <span className="capitalize">{e.direction} {e.kind}</span>
                  {e.duration_minutes != null && <span>· {e.duration_minutes}m</span>}
                  <span>· {new Date(e.occurred_at).toLocaleString()}</span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(e)} className="h-6 px-2">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(e.id)} className="h-6 px-2 text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {e.subject && <p className="font-medium">{e.subject}</p>}
              {e.body && <p className="whitespace-pre-wrap text-muted-foreground">{e.body}</p>}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit activity" : `Log activity · ${contactName}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Phone call</SelectItem>
                    <SelectItem value="sms">SMS / text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Direction</label>
                <Select value={direction} onValueChange={(v) => setDirection(v as Direction)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Outbound (I contacted them)</SelectItem>
                    <SelectItem value="inbound">Inbound (they contacted me)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">When</label>
                <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
              </div>
              {kind === "call" && (
                <div>
                  <label className="text-xs text-muted-foreground">Duration (minutes)</label>
                  <Input type="number" min="0" value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)} placeholder="e.g. 15" />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Subject (optional)</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Charter follow-up, Quarterly review prep" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                {kind === "sms" ? "Message body" : "Notes / summary"}
              </label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)}
                rows={5} placeholder={kind === "sms" ? "Paste or summarize the text exchange…" : "What was discussed, decisions, next steps…"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : (editing ? "Save changes" : "Log activity")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
