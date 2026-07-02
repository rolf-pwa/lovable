import { useState } from "react";
import { useGmailMessages } from "@/hooks/useGoogle";
import { useGoogleStatus } from "@/hooks/useGoogle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mail, Send, ChevronDown } from "lucide-react";
import { format } from "date-fns";

interface ContactEmailsProps {
  contactEmail: string | null;
}

export function ContactEmails({ contactEmail }: ContactEmailsProps) {
  const [open, setOpen] = useState(false);
  const { data: status } = useGoogleStatus();
  const query = contactEmail ? `from:${contactEmail} OR to:${contactEmail}` : undefined;
  const { data, isLoading, error } = useGmailMessages(query, !!contactEmail && status?.connected && open);

  const count = data?.messages?.length || 0;

  return (
    <Card className="p-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
            <Mail className="h-4 w-4 text-amber-500" />
            <h3 className="font-serif text-base">Email History</h3>
            {open && count > 0 && (
              <Badge variant="outline" className="text-[10px] ml-1">{count}</Badge>
            )}
          </CollapsibleTrigger>
          {open && contactEmail && (
            <a href={`/mail?compose=1&to=${encodeURIComponent(contactEmail)}`}>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                <Send className="mr-1 h-3 w-3" />
                Compose
              </Button>
            </a>
          )}
        </div>

        <CollapsibleContent className="mt-3 border-t border-border pt-3">
          {!contactEmail ? (
            <p className="text-sm text-muted-foreground">No email address on file.</p>
          ) : !status?.connected ? (
            <p className="text-sm text-muted-foreground">
              Connect Google on the Dashboard to see emails.
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground animate-pulse">Loading emails...</p>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load emails.</p>
          ) : !data?.messages?.length ? (
            <p className="text-sm text-muted-foreground">No emails found with this contact.</p>
          ) : (
            <ul className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {data.messages.slice(0, 10).map((msg: any) => {
                const parsedDate = msg.date ? new Date(msg.date) : null;
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
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
