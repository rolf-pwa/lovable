import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGmailMessages, useGoogleStatus } from "@/shared/hooks/useGoogle";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { Mail, ChevronDown, Loader2, Send, Eye, MousePointerClick } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface ContactEmailsProps {
  contactId: string;
  contactEmail: string | null;
  contactName: string;
}

interface TrackingRow {
  gmail_message_id: string | null;
  opened_at: string | null;
  contact_email_links: { clicked_at: string | null }[];
}

export function ContactEmails({ contactId, contactEmail, contactName }: ContactEmailsProps) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const { data: status } = useGoogleStatus();
  const query = contactEmail ? `from:${contactEmail} OR to:${contactEmail}` : undefined;
  const { data, isLoading, error } = useGmailMessages(query, !!contactEmail && status?.connected && open);

  const { data: tracking } = useQuery({
    queryKey: ["contact-emails", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_emails")
        .select("gmail_message_id, opened_at, contact_email_links(clicked_at)")
        .eq("contact_id", contactId);
      if (error) throw error;
      return (data || []) as TrackingRow[];
    },
    enabled: open,
  });
  const trackingByMessageId = new Map(
    (tracking || [])
      .filter((t) => t.gmail_message_id)
      .map((t) => [
        t.gmail_message_id as string,
        { opened_at: t.opened_at, clicked: t.contact_email_links.some((l) => l.clicked_at) },
      ]),
  );

  const count = data?.messages?.length || 0;

  const sendEmail = async () => {
    if (!subject.trim() || !draft.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-contact-email", {
        body: { contactId, subject: subject.trim(), body: draft.trim() },
      });
      // supabase-js raises FunctionsHttpError on non-2xx; parse the body so
      // PII Shield blocks (422) surface their real reason instead of a
      // generic "Send failed".
      if (error) {
        let parsed: any = null;
        try { parsed = await (error as any).context?.response?.json?.(); } catch {}
        if (parsed?.error === "PII Shield blocked") {
          toast.error(`PII Shield blocked: ${parsed.reason}`, {
            description: "Rephrase without account numbers, SIN, or health terms.",
          });
          return;
        }
        throw new Error(parsed?.error || error.message);
      }
      if (!data?.sent) throw new Error(data?.error || "Send failed");
      toast.success("Email sent");
      setSubject("");
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["gmail-messages", query] });
      queryClient.invalidateQueries({ queryKey: ["contact-emails", contactId] });
    } catch (err: any) {
      toast.error(`Send failed: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:opacity-80">
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
          <Mail className="h-4 w-4 text-amber-500" />
          <h3 className="font-serif text-base">Email History</h3>
          {open && count > 0 && (
            <Badge variant="outline" className="text-[10px] ml-1">{count}</Badge>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 border-t border-border pt-3 space-y-3">
          {!contactEmail ? (
            <p className="text-sm text-muted-foreground">No email address on file.</p>
          ) : !status?.connected ? (
            <p className="text-sm text-muted-foreground">
              Connect Google on the Dashboard to see emails.
            </p>
          ) : (
            <>
              {isLoading ? (
                <p className="text-sm text-muted-foreground animate-pulse">Loading emails...</p>
              ) : error ? (
                <p className="text-sm text-destructive">Failed to load emails.</p>
              ) : !data?.messages?.length ? (
                <p className="text-sm text-muted-foreground">No emails found with this contact.</p>
              ) : (
                <ul className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {data.messages.slice(0, 10).map((msg: any) => {
                    const parsedDate = msg.date ? new Date(msg.date) : null;
                    const track = trackingByMessageId.get(msg.id);
                    return (
                      <li key={msg.id}>
                        <a
                          href={`https://mail.google.com/mail/u/0/#all/${msg.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-md border-b border-border/50 pb-3 last:border-0 last:pb-0 transition-colors hover:bg-muted/50 -mx-1 px-1"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {msg.subject || "(No subject)"}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {msg.from}
                              </p>
                              {msg.snippet && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/70">
                                  {msg.snippet}
                                </p>
                              )}
                              {track && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] gap-1 ${track.opened_at ? "border-emerald-500/40 text-emerald-600" : "text-muted-foreground"}`}
                                  >
                                    <Eye className="h-2.5 w-2.5" />
                                    {track.opened_at
                                      ? `Opened ${formatDistanceToNow(new Date(track.opened_at), { addSuffix: true })}`
                                      : "Not yet opened"}
                                  </Badge>
                                  {track.clicked && (
                                    <Badge variant="outline" className="text-[9px] gap-1 border-amber-500/40 text-amber-600">
                                      <MousePointerClick className="h-2.5 w-2.5" />
                                      Clicked
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {parsedDate && !isNaN(parsedDate.getTime())
                                ? format(parsedDate, "MMM d")
                                : ""}
                            </span>
                          </div>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Composer at bottom, matching QuoCommunications' pattern */}
              <div className="space-y-2 border-t border-border pt-3">
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  disabled={!contactEmail || sending}
                  className="text-sm"
                />
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={contactEmail ? `Email ${contactName} · ${contactEmail}` : "Contact has no email address"}
                  disabled={!contactEmail || sending}
                  className="min-h-[80px] text-sm"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground">
                    🛡️ PII Shield active · Opens &amp; clicks are tracked
                  </p>
                  <Button
                    onClick={sendEmail}
                    disabled={!subject.trim() || !draft.trim() || !contactEmail || sending}
                    size="sm"
                  >
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
