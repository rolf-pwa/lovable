import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
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
  X,
} from "lucide-react";
import { supabase } from "@/shared/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

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
}

const TYPE_LABELS: Record<string, string> = {
  banking_withdrawal: "Banking & Withdrawals",
  personal_info: "Personal Info",
  document_request: "Document Request",
  general_inquiry: "General Inquiry",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  submitted: { label: "New", variant: "destructive" },
  in_progress: { label: "In Progress", variant: "default" },
  resolved: { label: "Resolved", variant: "secondary" },
};

export function PortalRequestsWidget() {
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<PortalRequest | null>(null);
  const [staffNotes, setStaffNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const fetchRequests = async () => {
    try {
      const { data, error: err } = await supabase
        .from("portal_requests")
        .select("*, contact:contacts(full_name)")
        .order("created_at", { ascending: false })
        .limit(20);
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

  const openRequest = (req: PortalRequest) => {
    setSelected(req);
    setStaffNotes(req.staff_notes || "");
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

      // Fire notification email (non-blocking)
      supabase.functions.invoke("notify-portal-request", {
        body: { request_id: selected.id, event_type: "status_update" },
      }).catch((e) => console.error("[Notify] Error:", e));

      toast.success(`Request marked as ${status}`);
      setSelected(null);
      fetchRequests();
    } catch {
      toast.error("Failed to update request");
    } finally {
      setSaving(false);
    }
  };

  // Load signed URLs when a request with files is selected
  useEffect(() => {
    if (!selected?.file_urls?.length) return;
    (async () => {
      const urls: Record<string, string> = {};
      for (const path of selected.file_urls!) {
        const { data } = await supabase.storage.from("portal-uploads").createSignedUrl(path, 3600);
        if (data?.signedUrl) urls[path] = data.signedUrl;
      }
      setSignedUrls((prev) => ({ ...prev, ...urls }));
    })();
  }, [selected]);

  const activeRequests = requests.filter((r) => r.status !== "resolved");
  const resolvedRequests = requests.filter((r) => r.status === "resolved");

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-sanctuary-bronze" />
            Client Requests
          </CardTitle>
          {activeRequests.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {activeRequests.length} open
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load requests</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No client requests yet.</p>
          ) : (
            <div className="space-y-2">
              {[...activeRequests, ...resolvedRequests].slice(0, 10).map((req) => {
                const sc = STATUS_CONFIG[req.status] || STATUS_CONFIG.submitted;
                return (
                  <button
                    key={req.id}
                    onClick={() => openRequest(req)}
                    className="w-full text-left rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {TYPE_LABELS[req.request_type] || req.request_type}
                        </p>
                        <p className="text-xs text-accent font-medium truncate">
                          {(req.contact as any)?.full_name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {req.request_description}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant={sc.variant} className="text-[10px]">
                          {sc.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    {req.file_urls && req.file_urls.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {req.file_urls.length} file{req.file_urls.length !== 1 ? "s" : ""} attached
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {selected ? TYPE_LABELS[selected.request_type] || selected.request_type : "Request"}
            </DialogTitle>
            <DialogDescription>
              {selected && (
                <span>
                  From <strong>{(selected.contact as any)?.full_name || "Unknown"}</strong> ·{" "}
                  {format(new Date(selected.created_at), "MMM d, yyyy 'at' h:mm a")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Status:</span>
                <Badge
                  variant={
                    (STATUS_CONFIG[selected.status] || STATUS_CONFIG.submitted).variant
                  }
                >
                  {(STATUS_CONFIG[selected.status] || STATUS_CONFIG.submitted).label}
                </Badge>
              </div>

              {/* Description */}
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {selected.request_description}
                </p>
              </div>

              {/* Attached Files */}
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

              {/* Staff Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Staff Notes
                </label>
                <Textarea
                  value={staffNotes}
                  onChange={(e) => setStaffNotes(e.target.value)}
                  placeholder="Add internal notes..."
                  className="text-sm min-h-[60px] resize-none"
                  disabled={saving}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {selected.status !== "in_progress" && selected.status !== "resolved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus("in_progress")}
                    disabled={saving}
                    className="flex-1"
                  >
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    Mark In Progress
                  </Button>
                )}
                {selected.status !== "resolved" && (
                  <Button
                    size="sm"
                    onClick={() => updateStatus("resolved")}
                    disabled={saving}
                    className="flex-1"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    )}
                    Resolve
                  </Button>
                )}
                {selected.status === "resolved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus("submitted")}
                    disabled={saving}
                    className="flex-1"
                  >
                    Reopen
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
