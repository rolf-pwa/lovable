import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Inbox as InboxIcon, Send, Star, Archive, Trash2, RefreshCw, Search,
  Mail as MailIcon, FileText, AlertCircle, Reply, Forward, PenSquare,
  MailOpen, ChevronLeft, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  listGmailThreads, getGmailThread, modifyGmail, trashGmail,
  sendGmailMessage, getGmailProfile,
} from "@/lib/google-api";
import { useGoogleStatus } from "@/hooks/useGoogle";

const SYSTEM_LABELS = [
  { id: "INBOX", label: "Inbox", icon: InboxIcon },
  { id: "STARRED", label: "Starred", icon: Star },
  { id: "SENT", label: "Sent", icon: Send },
  { id: "DRAFT", label: "Drafts", icon: FileText },
  { id: "SPAM", label: "Spam", icon: AlertCircle },
  { id: "TRASH", label: "Trash", icon: Trash2 },
];

function stripName(addr: string) {
  const m = addr?.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || m[2], email: m[2] } : { name: addr, email: addr };
}

export default function Mail() {
  const { data: gStatus } = useGoogleStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const [activeLabel, setActiveLabel] = useState<string>(searchParams.get("label") || "INBOX");
  const [search, setSearch] = useState<string>(searchParams.get("q") || "");
  const [searchInput, setSearchInput] = useState<string>(searchParams.get("q") || "");
  const [selectedThread, setSelectedThread] = useState<string | null>(searchParams.get("thread"));
  const [composerOpen, setComposerOpen] = useState<boolean>(searchParams.get("compose") === "1");
  const [composerMode, setComposerMode] = useState<"new" | "reply" | "forward">("new");
  const [composeTo, setComposeTo] = useState<string>(searchParams.get("to") || "");
  const [composeSubject, setComposeSubject] = useState<string>("");
  const [composeBody, setComposeBody] = useState<string>("");
  const [composeThreadId, setComposeThreadId] = useState<string | undefined>();
  const [composeInReplyTo, setComposeInReplyTo] = useState<string | undefined>();
  const [composeReferences, setComposeReferences] = useState<string | undefined>();

  const buildQuery = () => {
    const parts: string[] = [];
    if (activeLabel && activeLabel !== "SEARCH") parts.push(`label:${activeLabel.toLowerCase()}`);
    if (search) parts.push(search);
    return parts.join(" ").trim();
  };

  const enabled = !!gStatus?.connected;

  const threadsQuery = useQuery({
    queryKey: ["gmail-threads", activeLabel, search],
    queryFn: () => listGmailThreads({
      labelIds: search ? undefined : activeLabel,
      q: search || undefined,
      maxResults: 40,
    }),
    enabled,
  });

  const threadQuery = useQuery({
    queryKey: ["gmail-thread", selectedThread],
    queryFn: () => getGmailThread(selectedThread!),
    enabled: enabled && !!selectedThread,
  });

  const profileQuery = useQuery({
    queryKey: ["gmail-profile"],
    queryFn: getGmailProfile,
    enabled,
    staleTime: 5 * 60_000,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["gmail-threads"] });
    if (selectedThread) qc.invalidateQueries({ queryKey: ["gmail-thread", selectedThread] });
  };

  // Auto-mark thread read when opened
  useEffect(() => {
    if (!threadQuery.data) return;
    const anyUnread = threadQuery.data.messages.some((m: any) => m.labelIds?.includes("UNREAD"));
    if (anyUnread && selectedThread) {
      modifyGmail({ threadId: selectedThread, removeLabelIds: ["UNREAD"] })
        .then(() => qc.invalidateQueries({ queryKey: ["gmail-threads"] }))
        .catch(() => {});
    }
  }, [threadQuery.data]);

  const trashMut = useMutation({
    mutationFn: (threadId: string) => trashGmail({ threadId }),
    onSuccess: () => {
      toast.success("Moved to Trash");
      setSelectedThread(null);
      refreshAll();
    },
    onError: (e: any) => toast.error(`Delete failed: ${e.message}`),
  });

  const archiveMut = useMutation({
    mutationFn: (threadId: string) =>
      modifyGmail({ threadId, removeLabelIds: ["INBOX"] }),
    onSuccess: () => { toast.success("Archived"); setSelectedThread(null); refreshAll(); },
    onError: (e: any) => toast.error(`Archive failed: ${e.message}`),
  });

  const toggleReadMut = useMutation({
    mutationFn: ({ threadId, unread }: { threadId: string; unread: boolean }) =>
      modifyGmail({ threadId, [unread ? "addLabelIds" : "removeLabelIds"]: ["UNREAD"] }),
    onSuccess: () => refreshAll(),
  });

  const toggleStarMut = useMutation({
    mutationFn: ({ threadId, starred }: { threadId: string; starred: boolean }) =>
      modifyGmail({ threadId, [starred ? "removeLabelIds" : "addLabelIds"]: ["STARRED"] }),
    onSuccess: () => refreshAll(),
  });

  const sendMut = useMutation({
    mutationFn: () => sendGmailMessage(composeTo, composeSubject, composeBody, {
      threadId: composeThreadId,
      inReplyTo: composeInReplyTo,
      references: composeReferences,
    }),
    onSuccess: () => {
      toast.success("Message sent");
      setComposerOpen(false);
      setComposeTo(""); setComposeSubject(""); setComposeBody("");
      setComposeThreadId(undefined); setComposeInReplyTo(undefined); setComposeReferences(undefined);
      refreshAll();
    },
    onError: (e: any) => toast.error(`Send failed: ${e.message}`),
  });

  const openCompose = () => {
    setComposerMode("new");
    setComposeTo(""); setComposeSubject(""); setComposeBody("");
    setComposeThreadId(undefined); setComposeInReplyTo(undefined); setComposeReferences(undefined);
    setComposerOpen(true);
  };

  const openReply = (all = false) => {
    if (!threadQuery.data) return;
    const msgs = threadQuery.data.messages;
    const last = msgs[msgs.length - 1];
    const fromParsed = stripName(last.headers.from);
    const toList = new Set<string>([fromParsed.email]);
    if (all) {
      last.headers.to?.split(",").forEach((a: string) => {
        const e = stripName(a).email;
        if (e && e !== profileQuery.data?.emailAddress) toList.add(e);
      });
    }
    setComposerMode("reply");
    setComposeTo(Array.from(toList).join(", "));
    const subj = last.headers.subject || "";
    setComposeSubject(subj.toLowerCase().startsWith("re:") ? subj : `Re: ${subj}`);
    setComposeBody(`<br><br><blockquote style="border-left:2px solid #ccc;padding-left:12px;color:#666;">On ${last.headers.date}, ${fromParsed.name} wrote:<br>${last.bodyHtml || last.bodyText.replace(/\n/g, "<br>")}</blockquote>`);
    setComposeThreadId(threadQuery.data.id);
    setComposeInReplyTo(last.headers.messageId);
    setComposeReferences(`${last.headers.references || ""} ${last.headers.messageId}`.trim());
    setComposerOpen(true);
  };

  const openForward = () => {
    if (!threadQuery.data) return;
    const msgs = threadQuery.data.messages;
    const last = msgs[msgs.length - 1];
    setComposerMode("forward");
    setComposeTo("");
    const subj = last.headers.subject || "";
    setComposeSubject(subj.toLowerCase().startsWith("fwd:") ? subj : `Fwd: ${subj}`);
    setComposeBody(`<br><br>---------- Forwarded message ----------<br>From: ${last.headers.from}<br>Date: ${last.headers.date}<br>Subject: ${last.headers.subject}<br>To: ${last.headers.to}<br><br>${last.bodyHtml || last.bodyText.replace(/\n/g, "<br>")}`);
    setComposeThreadId(undefined);
    setComposeInReplyTo(undefined);
    setComposeReferences(undefined);
    setComposerOpen(true);
  };

  if (!gStatus?.connected) {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto mt-20 text-center space-y-4">
          <MailIcon className="h-12 w-12 mx-auto text-amber-500" />
          <h1 className="text-2xl font-serif">Connect Google to use Mail</h1>
          <p className="text-sm text-muted-foreground">
            Go to the Dashboard and connect your Google account. Read + Send +
            Modify + Labels scopes are required for the in-app mailbox.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-8rem)] gap-4">
        {/* LEFT — labels + compose */}
        <div className="w-52 shrink-0 flex flex-col gap-2">
          <Button
            onClick={openCompose}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black gap-2"
          >
            <PenSquare className="h-4 w-4" /> Compose
          </Button>
          <Card className="flex-1 p-2">
            <nav className="space-y-0.5">
              {SYSTEM_LABELS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setActiveLabel(id); setSearch(""); setSearchInput(""); setSelectedThread(null); }}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-left transition-colors ${
                    activeLabel === id && !search
                      ? "bg-amber-500/10 text-amber-500 font-medium"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{label}</span>
                </button>
              ))}
            </nav>
          </Card>
          {profileQuery.data && (
            <p className="text-[10px] text-muted-foreground truncate px-1">
              {profileQuery.data.emailAddress}
            </p>
          )}
        </div>

        {/* MIDDLE — thread list */}
        <Card className={`${selectedThread ? "hidden lg:flex w-96" : "flex flex-1 lg:w-96"} flex-col shrink-0`}>
          <div className="p-3 border-b flex gap-2">
            <form
              className="flex-1 flex gap-2"
              onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setSelectedThread(null); }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search mail"
                  className="pl-7 h-8 text-sm"
                />
              </div>
            </form>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={refreshAll}>
              <RefreshCw className={`h-3.5 w-3.5 ${threadsQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {threadsQuery.isLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : threadsQuery.data?.threads.length === 0 ? (
              <p className="p-8 text-sm text-center text-muted-foreground">No conversations.</p>
            ) : (
              <ul className="divide-y">
                {threadsQuery.data?.threads.map((t: any) => {
                  const fromParsed = stripName(t.from);
                  const date = t.date ? new Date(t.date) : null;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => setSelectedThread(t.id)}
                        className={`w-full text-left px-3 py-2.5 transition-colors ${
                          selectedThread === t.id ? "bg-muted" : "hover:bg-muted/50"
                        } ${t.unread ? "font-semibold" : ""}`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="truncate text-sm flex-1">
                            {fromParsed.name}
                            {t.messageCount > 1 && (
                              <span className="ml-1 text-xs text-muted-foreground">({t.messageCount})</span>
                            )}
                          </span>
                          {t.starred && <Star className="h-3 w-3 fill-amber-500 text-amber-500" />}
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {date && !isNaN(date.getTime()) ? format(date, "MMM d") : ""}
                          </span>
                        </div>
                        <p className="text-xs truncate">{t.subject || "(no subject)"}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{t.snippet}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </Card>

        {/* RIGHT — thread reader */}
        <Card className={`${selectedThread ? "flex" : "hidden lg:flex"} flex-1 flex-col overflow-hidden`}>
          {!selectedThread ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a conversation
            </div>
          ) : threadQuery.isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : threadQuery.data ? (
            <>
              <div className="p-4 border-b flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden"
                  onClick={() => setSelectedThread(null)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="font-serif text-lg flex-1 truncate">
                  {threadQuery.data.messages[0]?.headers.subject || "(no subject)"}
                </h2>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => {
                    const anyUnread = threadQuery.data!.messages.some((m: any) => m.labelIds?.includes("UNREAD"));
                    toggleReadMut.mutate({ threadId: selectedThread, unread: !anyUnread });
                  }}
                  title="Mark read/unread">
                  <MailOpen className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => {
                    const starred = threadQuery.data!.messages.some((m: any) => m.labelIds?.includes("STARRED"));
                    toggleStarMut.mutate({ threadId: selectedThread, starred });
                  }}
                  title="Star">
                  <Star className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => archiveMut.mutate(selectedThread)} title="Archive">
                  <Archive className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                  onClick={() => {
                    if (confirm("Move this conversation to Trash?"))
                      trashMut.mutate(selectedThread);
                  }} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {threadQuery.data.messages.map((m: any, idx: number) => {
                    const fromParsed = stripName(m.headers.from);
                    const date = m.headers.date ? new Date(m.headers.date) : null;
                    return (
                      <div key={m.id} className="border-b border-border/50 last:border-0 pb-4 last:pb-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{fromParsed.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              to {m.headers.to}
                              {m.headers.cc && <> · cc {m.headers.cc}</>}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 ml-2">
                            {date && !isNaN(date.getTime()) ? format(date, "MMM d, h:mm a") : ""}
                          </span>
                        </div>
                        {m.bodyHtml ? (
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none text-sm"
                            dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
                          />
                        ) : (
                          <pre className="text-sm whitespace-pre-wrap font-sans">{m.bodyText || m.snippet}</pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="p-3 border-t flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openReply(false)}>
                  <Reply className="h-3.5 w-3.5 mr-1.5" /> Reply
                </Button>
                <Button size="sm" variant="outline" onClick={() => openReply(true)}>
                  <Reply className="h-3.5 w-3.5 mr-1.5" /> Reply All
                </Button>
                <Button size="sm" variant="outline" onClick={openForward}>
                  <Forward className="h-3.5 w-3.5 mr-1.5" /> Forward
                </Button>
              </div>
            </>
          ) : null}
        </Card>
      </div>

      {/* COMPOSER — bottom-right floating panel */}
      {composerOpen && (
        <div className="fixed bottom-4 right-4 w-[520px] max-w-[calc(100vw-2rem)] z-40">
          <Card className="shadow-2xl border-amber-500/30">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
              <p className="text-sm font-medium">
                {composerMode === "reply" ? "Reply" : composerMode === "forward" ? "Forward" : "New Message"}
              </p>
              <Button size="icon" variant="ghost" className="h-6 w-6"
                onClick={() => setComposerOpen(false)}>×</Button>
            </div>
            <div className="p-3 space-y-2">
              <Input
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="To (comma-separated)"
                className="h-8 text-sm"
              />
              <Input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Subject"
                className="h-8 text-sm"
              />
              <Textarea
                value={composeBody.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")}
                onChange={(e) => setComposeBody(e.target.value.replace(/\n/g, "<br>"))}
                placeholder="Write your message…"
                rows={10}
                className="text-sm resize-none"
              />
            </div>
            <div className="flex items-center justify-between px-3 py-2 border-t">
              <Button
                size="sm"
                onClick={() => {
                  if (!composeTo.trim() || !composeSubject.trim()) {
                    toast.error("To and Subject are required");
                    return;
                  }
                  sendMut.mutate();
                }}
                disabled={sendMut.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                {sendMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                Send
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setComposerOpen(false)}>
                Discard
              </Button>
            </div>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
