import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const FN_MSG = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/engagement-message-send`;

interface Props {
  engagementId: string;
  engagementTitle: string;
}

interface Message {
  id: string;
  sender_type: string;
  body: string;
  created_at: string;
}

export default function EngagementThreadButton({ engagementId, engagementTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("engagement_messages")
      .select("id, sender_type, body, created_at")
      .eq("engagement_id", engagementId)
      .order("created_at", { ascending: true });
    setMessages(data || []);
    // Mark as read by staff
    const now = new Date().toISOString();
    await (supabase as any)
      .from("engagement_messages")
      .update({ read_by_staff_at: now })
      .eq("engagement_id", engagementId)
      .is("read_by_staff_at", null);
    setLoading(false);
  }, [engagementId]);

  useEffect(() => {
    if (open) loadMessages();
  }, [open, loadMessages]);

  async function send() {
    if (!composer.trim()) return;
    setSending(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(FN_MSG, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ engagement_id: engagementId, body: composer.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setComposer("");
      loadMessages();
      toast.success("Message sent");
    } catch (e: any) {
      toast.error(e.message || "Could not send");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
          <MessageSquare className="h-3 w-3 mr-1" /> Thread
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif">Engagement Thread — {engagementTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="max-h-[420px] overflow-y-auto space-y-2 border rounded-md p-3 bg-muted/30">
            {loading ? (
              <div className="text-sm text-muted-foreground text-center py-6">Loading…</div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No messages yet.</div>
            ) : messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender_type === "staff" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  m.sender_type === "staff"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border"
                }`}>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={`text-[10px] mt-1 opacity-70`}>
                    {m.sender_type === "staff" ? "You" : m.sender_type === "pro" ? "Pro" : m.sender_type} · {format(new Date(m.created_at), "PP p")}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Textarea
            rows={3}
            placeholder="Write a message to the professional… (PII Shield blocks SIN, account numbers, balances)"
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
          />
          <div className="flex justify-end">
            <Button onClick={send} disabled={sending || !composer.trim()}>
              {sending ? "Sending…" : "Send via Gmail relay"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
