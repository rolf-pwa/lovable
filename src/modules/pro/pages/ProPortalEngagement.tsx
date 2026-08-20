import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { FileText, Download, Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ProPortalShell, { FN, proFetch } from "@/modules/pro/components/ProPortalShell";

const PILLAR_LABELS: Record<string, string> = {
  legal: "Legal", tax: "Tax", insurance: "Insurance", estate: "Estate",
  philanthropy: "Philanthropy", governance: "Governance", other: "Other",
};

interface Engagement {
  id: string;
  title: string;
  pillar: string;
  status: string;
  scope_label: string;
}
interface SharedFile { id: string; name: string; mime_type: string; size_bytes: number | null }
interface Message { id: string; sender_type: string; body: string; created_at: string }

function formatSize(n: number | null) {
  if (!n) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProPortalEngagement() {
  const { id } = useParams();
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(FN.engagements, proFetch({ action: "get", engagement_id: id }));
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setEngagement(d.engagement);
      setFiles(d.files || []);
      setMessages(d.messages || []);
    } catch (e: any) {
      toast.error(e.message || "Could not load engagement");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!composer.trim()) return;
    setSending(true);
    try {
      const res = await fetch(FN.messageSend, proFetch({ engagement_id: id, body: composer.trim() }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setComposer("");
      await load();
      toast.success("Message sent");
    } catch (e: any) {
      toast.error(e.message || "Could not send");
    } finally {
      setSending(false);
    }
  };

  const download = async (file: SharedFile) => {
    setDownloadingId(file.id);
    try {
      const res = await fetch(FN.engagements, proFetch({ action: "downloadSharedFile", engagement_id: id, file_id: file.id }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Download failed");
      const byteChars = atob(data.base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: data.mimeType || file.mime_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName || file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || "Could not download file");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <ProPortalShell
      firmTitle={engagement?.title || "Engagement"}
      subtitle={engagement ? `${PILLAR_LABELS[engagement.pillar] || engagement.pillar} · ${engagement.scope_label}` : "Loading…"}
      crumbs={[{ label: "Portal", to: "/pro-portal" }, { label: "Engagement" }]}
      stats={engagement ? [
        { label: "Status", value: engagement.status },
        { label: "Files", value: files.length },
      ] : []}
    >
      {loading ? (
        <div className="p-16 text-center text-muted-foreground">Loading engagement…</div>
      ) : !engagement ? (
        <div className="p-16 text-center text-muted-foreground">Engagement not found.</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <Card className="border-accent/20">
              <CardHeader>
                <CardTitle className="font-serif text-foreground flex items-center gap-2">
                  <Send className="h-4 w-4 text-accent" /> Thread
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="max-h-[420px] overflow-y-auto space-y-2 border rounded-md p-3 bg-muted/30">
                  {messages.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-6">No messages yet.</div>
                  ) : messages.map((m) => (
                    <div key={m.id} className={`flex ${m.sender_type === "pro" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        m.sender_type === "pro" ? "bg-accent text-accent-foreground" : "bg-background border"
                      }`}>
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div className="text-[10px] mt-1 opacity-70">
                          {m.sender_type === "pro" ? "You" : "ProsperWise"} · {format(new Date(m.created_at), "PP p")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Textarea
                  rows={3}
                  placeholder="Write a message to your ProsperWise contact…"
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button onClick={send} disabled={sending || !composer.trim()} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card className="border-accent/15">
              <CardHeader>
                <CardTitle className="text-base font-serif flex items-center gap-2">
                  <FileText className="h-4 w-4 text-accent" /> Shared Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                {files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No files shared on this engagement yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {files.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-sm border border-border/60 rounded-md px-3 py-2 bg-muted/30">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-foreground truncate">{f.name}</div>
                          {formatSize(f.size_bytes) && (
                            <div className="text-[11px] text-muted-foreground">{formatSize(f.size_bytes)}</div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          disabled={downloadingId === f.id}
                          onClick={() => download(f)}
                          title="Download"
                        >
                          {downloadingId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </ProPortalShell>
  );
}
