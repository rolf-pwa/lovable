import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/shared/components/AppLayout";
import { LinkifyText } from "@/shared/components/LinkifyText";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Input } from "@/shared/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import {
  ClipboardList,
  Loader2,
  CheckCircle,
  Clock,
  FileText,
  ExternalLink,
  Send,
  MessageCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface RequestMessage {
  id: string;
  sender_type: "advisor" | "client";
  sender_name: string | null;
  content: string;
  created_at: string;
}

interface PortalRequest {
  id: string;
  contact_id: string;
  request_type: string;
  request_description: string;
  status: string;
  file_urls: string[] | null;
  staff_notes: string | null;
  request_details: any;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  contact?: { full_name: string } | null;
  messages?: RequestMessage[];
}

const TYPE_LABELS: Record<string, string> = {
  banking_withdrawal: "Banking & Withdrawals",
  personal_info: "Personal Info",
  document_request: "Document Request",
  data_access: "My Data — Access Request",
  general_inquiry: "General Inquiry",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  submitted: { label: "New", variant: "destructive" },
  in_progress: { label: "In Progress", variant: "default" },
  resolved: { label: "Resolved", variant: "secondary" },
};

const Requests = () => {
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<PortalRequest | null>(null);
  const [staffNotes, setStaffNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchRequests = async () => {
    try {
      const { data, error: err } = await supabase
        .from("portal_requests")
        .select("*, contact:contacts(full_name), messages:portal_request_messages(*)")
        .order("created_at", { ascending: false });
      if (err) throw err;
      setRequests((data as any[]) || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selected?.messages]);

  const openRequest = (req: PortalRequest) => {
    setSelected(req);
    setStaffNotes(req.staff_notes || "");
    setReplyText("");
  };

  const updateStatus = async (status: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updates: any = {
        status,
        staff_notes: staffNotes.trim() || null,
      };
      if (status === "resolved") {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = user?.id;
      }
      const { error: err } = await supabase
        .from("portal_requests")
        .update(updates)
        .eq("id", selected.id);
      if (err) throw err;
      toast.success(`Request marked as ${status}`);
      setSelected(null);
      fetchRequests();
    } catch {
      toast.error("Failed to update request");
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selected || sendingReply) return;
    setSendingReply(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user?.id || "")
        .maybeSingle();

      const { data, error: err } = await supabase.functions.invoke("portal-request-reply", {
        body: {
          request_id: selected.id,
          sender_type: "advisor",
          sender_name: profile?.full_name || "Your Personal CFO",
          content: replyText.trim(),
        },
      });

      if (err || data?.error) {
        throw err || new Error(data.error);
      }

      setReplyText("");
      toast.success("Reply sent to client");

      const { data: refreshed } = await supabase
        .from("portal_requests")
        .select("*, contact:contacts(full_name), messages:portal_request_messages(*)")
        .eq("id", selected.id)
        .maybeSingle();

      if (refreshed) setSelected(refreshed as any);
      fetchRequests();
    } catch {
      toast.error("Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selected?.file_urls?.length) return;
    (async () => {
      const urls: Record<string, string> = {};
      for (const path of selected.file_urls!) {
        const { data } = await supabase.storage
          .from("portal-uploads")
          .createSignedUrl(path, 3600);
        if (data?.signedUrl) urls[path] = data.signedUrl;
      }
      setSignedUrls(urls);
    })();
  }, [selected]);

  const activeRequests = requests.filter((r) => r.status !== "resolved");
  const resolvedRequests = requests.filter((r) => r.status === "resolved");

  const renderRequestCard = (req: PortalRequest) => {
    const sc = STATUS_CONFIG[req.status] || STATUS_CONFIG.submitted;
    const clientMessages = (req.messages || []).filter((m) => m.sender_type === "client");
    return (
      <button
        key={req.id}
        onClick={() => openRequest(req)}
        className="w-full text-left rounded-md border border-border p-4 transition-colors hover:bg-muted/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {TYPE_LABELS[req.request_type] || req.request_type}
            </p>
            <Link
              to={`/contacts/${req.contact_id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-accent font-medium mt-0.5 hover:underline block"
            >
              {(req.contact as any)?.full_name || "Unknown"}
            </Link>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {req.request_description}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge variant={sc.variant} className="text-[10px]">
              {sc.label}
            </Badge>
            {clientMessages.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                <MessageCircle className="h-2.5 w-2.5 mr-0.5" />
                {clientMessages.length}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
        {req.file_urls && req.file_urls.length > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <FileText className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {req.file_urls.length} file{req.file_urls.length !== 1 ? "s" : ""} attached
            </span>
          </div>
        )}
      </button>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Client Requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage admin requests submitted by clients through the portal
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-destructive">Failed to load requests</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="open">
            <TabsList>
              <TabsTrigger value="open">
                Open
                {activeRequests.length > 0 && (
                  <Badge variant="destructive" className="ml-2 text-[10px]">
                    {activeRequests.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="resolved">
                Resolved ({resolvedRequests.length})
              </TabsTrigger>
              <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="open" className="mt-4">
              {activeRequests.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No open requests</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {activeRequests.map(renderRequestCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="resolved" className="mt-4">
              {resolvedRequests.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No resolved requests yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {resolvedRequests.map(renderRequestCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="all" className="mt-4">
              {requests.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No requests yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {requests.map(renderRequestCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
            <DialogTitle className="font-serif">
              {selected ? TYPE_LABELS[selected.request_type] || selected.request_type : "Request"}
            </DialogTitle>
            <DialogDescription>
              {selected && (
                <span>
                  From <Link to={`/contacts/${selected.contact_id}`} className="font-bold hover:underline">{(selected.contact as any)?.full_name || "Unknown"}</Link> ·{" "}
                  {format(new Date(selected.created_at), "MMM d, yyyy 'at' h:mm a")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Status & Actions */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">Status:</span>
                  <Badge variant={(STATUS_CONFIG[selected.status] || STATUS_CONFIG.submitted).variant}>
                    {(STATUS_CONFIG[selected.status] || STATUS_CONFIG.submitted).label}
                  </Badge>
                </div>

                {/* Original request */}
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Client's Request</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {selected.request_description}
                  </p>
                </div>

                {/* Chat Transcript from Georgia */}
                {selected.request_details?.chat_transcript?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <MessageCircle className="h-3.5 w-3.5" />
                      Georgia Chat Transcript
                    </p>
                    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 max-h-48 overflow-y-auto">
                      {(selected.request_details.chat_transcript as { role: string; content: string }[]).map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${
                              msg.role === "user"
                                ? "bg-accent/20 text-foreground"
                                : "bg-background text-foreground"
                            }`}
                          >
                            <p className="text-[10px] font-medium opacity-50 mb-0.5">
                              {msg.role === "user" ? "Client" : "Georgia"}
                            </p>
                            <p className="whitespace-pre-wrap"><LinkifyText text={msg.content} /></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attachments */}
                {selected.file_urls && selected.file_urls.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Attached Files</p>
                    {selected.file_urls.map((url, i) => {
                      const fileName = url.split("/").pop() || `File ${i + 1}`;
                      return (
                        <a
                          key={i}
                          href={signedUrls[url] || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="flex-1 truncate text-foreground">{fileName}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* Conversation Thread */}
                {(selected.messages || []).length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <MessageCircle className="h-3.5 w-3.5" />
                      Conversation
                    </p>
                    {(selected.messages || [])
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.sender_type === "advisor" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                              msg.sender_type === "advisor"
                                ? "bg-accent text-accent-foreground"
                                : "bg-muted text-foreground"
                            }`}
                          >
                            <p className="text-[10px] font-medium mb-0.5 opacity-70">
                              {msg.sender_type === "advisor" ? (msg.sender_name || "Advisor") : (msg.sender_name || "Client")}
                            </p>
                            <p className="whitespace-pre-wrap"><LinkifyText text={msg.content} /></p>
                            <p className="text-[9px] opacity-50 mt-1">
                              {format(new Date(msg.created_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Staff Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Staff Notes (internal)</label>
                  <Textarea
                    value={staffNotes}
                    onChange={(e) => setStaffNotes(e.target.value)}
                    placeholder="Add internal notes..."
                    className="text-sm min-h-[60px] resize-none"
                    disabled={saving}
                  />
                </div>

                {/* Status buttons */}
                <div className="flex gap-2">
                  {selected.status !== "in_progress" && selected.status !== "resolved" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus("in_progress")} disabled={saving} className="flex-1">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      Mark In Progress
                    </Button>
                  )}
                  {selected.status !== "resolved" && (
                    <Button size="sm" onClick={() => updateStatus("resolved")} disabled={saving} className="flex-1">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
                      Resolve
                    </Button>
                  )}
                  {selected.status === "resolved" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus("submitted")} disabled={saving} className="flex-1">
                      Reopen
                    </Button>
                  )}
                </div>
              </div>

              {/* Reply to client */}
              {selected.status !== "resolved" && (
                <div className="border-t border-border px-4 py-3 flex gap-2">
                  <Input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendReply()}
                    placeholder="Reply to client..."
                    disabled={sendingReply}
                    className="flex-1"
                  />
                  <Button size="icon" onClick={sendReply} disabled={sendingReply || !replyText.trim()}>
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Requests;
