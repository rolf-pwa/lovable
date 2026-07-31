import { useState } from "react";
import { AppLayout } from "@/shared/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Separator } from "@/shared/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Clock,
  Shield,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/shared/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

type ReviewStatus = "pending" | "approved" | "rejected" | "escalated";

interface ReviewItem {
  id: string;
  contact_id: string | null;
  family_id: string | null;
  action_type: string;
  action_description: string;
  proposed_data: Record<string, any>;
  logic_trace: string | null;
  status: ReviewStatus;
  client_visible: boolean;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  escalated_to: string | null;
  created_at: string;
  updated_at: string;
  // joined
  contact_name?: string;
}

const STATUS_CONFIG: Record<ReviewStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  escalated: { label: "Escalated to Rolf", color: "bg-purple-100 text-purple-800 border-purple-200", icon: AlertTriangle },
};

const ReviewQueue = () => {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ReviewStatus | "all">("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["review-queue", filter],
    queryFn: async () => {
      let query = (supabase.from("review_queue" as any) as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Enrich with contact names
      const contactIds = [...new Set((data as any[]).map((d: any) => d.contact_id).filter(Boolean))];
      let contactMap: Record<string, string> = {};
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, full_name")
          .in("id", contactIds);
        contactMap = Object.fromEntries((contacts || []).map((c) => [c.id, c.full_name]));
      }

      return (data as any[]).map((item: any) => ({
        ...item,
        contact_name: item.contact_id ? contactMap[item.contact_id] || "Unknown" : "N/A",
      })) as ReviewItem[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, escalatedTo }: { id: string; status: ReviewStatus; escalatedTo?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const updates: Record<string, any> = {
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      };
      if (escalatedTo) updates.escalated_to = escalatedTo;

      // If approving, apply the proposed_data to the target table
      if (status === "approved") {
        const item = items.find((i) => i.id === id);
        if (item?.proposed_data) {
          const { table, action, data } = item.proposed_data as { table?: string; action?: string; data?: Record<string, any> };
          if (table && action && data) {
            if (action === "insert") {
              const { error: syncErr } = await (supabase.from(table as any) as any).insert(data);
              if (syncErr) throw new Error(`Sync failed: ${syncErr.message}`);
            } else if (action === "update" && item.contact_id) {
              const { error: syncErr } = await (supabase.from(table as any) as any)
                .update(data)
                .eq("id", item.contact_id);
              if (syncErr) throw new Error(`Sync failed: ${syncErr.message}`);
            }
          }
        }

        // Also write to audit trail
        if (user) {
          const item = items.find((i) => i.id === id);
          await (supabase.from("sovereignty_audit_trail") as any).insert({
            action_type: item?.action_type || "review_approved",
            action_description: item?.action_description || "",
            contact_id: item?.contact_id,
            user_id: user.id,
            proposed_data: item?.proposed_data,
          });
        }
      }

      // If rejecting, remove associated holding tank records
      if (status === "rejected") {
        const item = items.find((i) => i.id === id);
        if (item?.proposed_data) {
          const pd = item.proposed_data as Record<string, any>;
          // Use holding_tank_ids from proposed_data if available (onboarding items)
          if (Array.isArray(pd.holding_tank_ids) && pd.holding_tank_ids.length > 0) {
            await supabase
              .from("holding_tank")
              .delete()
              .in("id", pd.holding_tank_ids);
          } else if (item.contact_id) {
            // Fallback: delete by contact_id
            await supabase
              .from("holding_tank")
              .delete()
              .eq("contact_id", item.contact_id)
              .eq("status", "holding");
          }
        }
      }

      const { error } = await (supabase.from("review_queue" as any) as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["contact-detail"] });
      queryClient.invalidateQueries({ queryKey: ["vineyard-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["holding-tank"] });
      toast.success(`Item ${vars.status === "escalated" ? "escalated to Rolf" : vars.status}.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleClientVisible = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean }) => {
      const { error } = await (supabase.from("review_queue" as any) as any)
        .update({ client_visible: visible })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      toast.success(vars.visible ? "Now visible to client." : "Hidden from client.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Review Queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All AI-proposed actions require human approval before syncing
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["pending", "approved", "escalated", "rejected", "all"] as const).map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
              className="capitalize"
            >
              {s === "all" ? "All" : STATUS_CONFIG[s as ReviewStatus]?.label || s}
              {s === "pending" && pendingCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px]">
                  {pendingCount}
                </Badge>
              )}
            </Button>
          ))}
        </div>

        {/* Items */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <Shield className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {filter === "pending" ? "No pending items. All clear." : "No items match this filter."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-260px)]">
            <div className="space-y-3 pr-4">
              {items.map((item) => {
                const cfg = STATUS_CONFIG[item.status];
                const StatusIcon = cfg.icon;
                const isExpanded = expandedId === item.id;

                return (
                  <Card key={item.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      {/* Header */}
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={cfg.color}>
                              <StatusIcon className="mr-1 h-3 w-3" />
                              {cfg.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {item.action_type.replace(/_/g, " ")}
                            </Badge>
                            {item.client_visible && (
                              <Badge className="bg-primary/10 text-primary text-[10px] border-primary/20">
                                <Eye className="mr-1 h-2.5 w-2.5" />
                                Client Visible
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm font-medium text-foreground">
                            {item.action_description}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span>Contact: {item.contact_name}</span>
                            <span>·</span>
                            <span>{format(new Date(item.created_at), "MMM d, h:mm a")}</span>
                          </div>
                        </div>

                        {/* Expand toggle */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          <Separator />

                          {/* Proposed Data */}
                          {item.proposed_data && Object.keys(item.proposed_data).length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                Proposed Data
                              </p>
                              <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto max-h-40">
                                {JSON.stringify(item.proposed_data, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Logic Trace */}
                          {item.logic_trace && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                Logic Trace
                              </p>
                              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                                {item.logic_trace}
                              </div>
                            </div>
                          )}

                          {/* Client Visible Toggle */}
                          <div className="flex items-center justify-between rounded-md border p-3">
                            <div>
                              <p className="text-sm font-medium">Client Visible</p>
                              <p className="text-xs text-muted-foreground">
                                Toggle to make this item visible in the Client Portal
                              </p>
                            </div>
                            <Switch
                              checked={item.client_visible}
                              onCheckedChange={(checked) =>
                                toggleClientVisible.mutate({ id: item.id, visible: checked })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Actions (only for pending) */}
                      {item.status === "pending" && (
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => updateStatus.mutate({ id: item.id, status: "approved" })}
                            disabled={updateStatus.isPending}
                            className="gap-1.5"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve & Sync
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatus.mutate({ id: item.id, status: "escalated", escalatedTo: "Rolf" })}
                            disabled={updateStatus.isPending}
                            className="gap-1.5"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Escalate to Rolf
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateStatus.mutate({ id: item.id, status: "rejected" })}
                            disabled={updateStatus.isPending}
                            className="gap-1.5 text-destructive hover:text-destructive"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </AppLayout>
  );
};

export default ReviewQueue;
