import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Textarea } from "@/shared/components/ui/textarea";
import { Separator } from "@/shared/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
  Calendar, Mail, Plus, Send, Loader2, Link2Off, Inbox, ExternalLink, ChevronRight,
  MessageSquare, CheckSquare, FileText, X, UserCircle,
  Grape, Landmark, Anchor, Building2,
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { parseLocalDate } from "@/shared/lib/date-utils";
import { toast } from "sonner";
import { supabase } from "@/shared/integrations/supabase/client";
import { cn } from "@/shared/lib/utils";
import { AssigneePicker } from "@/modules/crm/components/AssigneePicker";
import {
  useGoogleStatus,
  useConnectGoogle,
  useDisconnectGoogle,
  useCalendarEvents,
} from "@/shared/hooks/useGoogle";


export function CommandCenter() {
  const { data: status, isLoading: statusLoading } = useGoogleStatus();
  const connectGoogle = useConnectGoogle();
  const disconnectGoogle = useDisconnectGoogle();
  const isConnected = status?.connected;

  if (statusLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="flex gap-3 text-muted-foreground/30">
            <Calendar className="h-8 w-8" />
            <Mail className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Connect Google Workspace</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Link your Google account to view Calendar events and enable task automation.
            </p>
          </div>
          <Button
            onClick={() => connectGoogle.mutate()}
            disabled={connectGoogle.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {connectGoogle.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            Connect Google Account
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Command Center</h2>
          <Badge className="bg-sanctuary-green/20 text-sanctuary-green border-sanctuary-green/30">
            Connected
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            disconnectGoogle.mutate(undefined, {
              onSuccess: () => toast.success("Google disconnected"),
            });
          }}
          className="text-muted-foreground text-xs"
        >
          <Link2Off className="mr-1 h-3 w-3" />
          Disconnect
        </Button>
      </div>
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AsanaMyTasksWidget />
        </div>
        <div className="space-y-6">
          <CalendarWidget />
          <FirmAumWidget />
        </div>
      </div>
    </div>
  );
}

function CalendarWidget() {
  const { timeMin, timeMax } = useMemo(() => {
    const now = new Date();
    return {
      timeMin: now.toISOString(),
      timeMax: new Date(now.getTime() + 7 * 86400000).toISOString(),
    };
  }, []);
  const { data, isLoading, error } = useCalendarEvents(timeMin, timeMax);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4 text-sanctuary-bronze" />
          Upcoming Events
        </CardTitle>
        <a href="https://calendar.google.com/calendar/u/0/appointments/AcZssZ3Edv0-dF_AX1v9OIgnxfXSVIqy1GCcpWscL6U=" target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm">
            <Plus className="mr-1 h-3 w-3" />
            New
          </Button>
        </a>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load events</p>
        ) : !data?.items?.length ? (
          <p className="text-sm text-muted-foreground">No upcoming events this week.</p>
        ) : (
          <div className="space-y-2">
            {data.items.slice(0, 8).map((event: any) => {
              const start = event.start?.dateTime || event.start?.date;
              const startDate = start ? parseISO(start) : null;
              return (
                 <a
                    key={event.id}
                    href={event.htmlLink || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                   <div className="min-w-[3rem] text-center">
                     {startDate && (
                       <>
                         <p className="text-xs text-muted-foreground">
                           {format(startDate, "EEE")}
                         </p>
                         <p className="text-sm font-semibold">
                           {format(startDate, "d")}
                         </p>
                       </>
                     )}
                   </div>
                   <div className="flex-1 min-w-0">
                     <p className="text-sm font-medium truncate">{event.summary}</p>
                     {startDate && event.start?.dateTime && (
                       <p className="text-xs text-muted-foreground">
                         {format(startDate, "h:mm a")}
                       </p>
                     )}
                   </div>
                 </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Firm-wide AUM — same card style/breakdown as the Contact/Household AUM
// cards, but unfiltered across every household so it aggregates the whole
// firm rather than one family.
function FirmAumWidget() {
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    vineyard: 0,
    storehouses: 0,
    corp: 0,
    holdingTank: 0,
    insuranceCash: 0,
  });
  const [byStorehouse, setByStorehouse] = useState<Record<number, number>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [
        { data: vineyard },
        { data: storehouses },
        { data: corpVineyard },
        { data: holdingTank },
        { data: insurance },
      ] = await Promise.all([
        supabase.from("vineyard_accounts").select("current_value"),
        supabase.from("storehouses").select("current_value, storehouse_number, asset_type"),
        supabase.from("corporate_vineyard_accounts").select("current_value"),
        supabase.from("holding_tank").select("current_value").neq("status", "moved"),
        supabase.from("insurance_policies" as any).select("cash_value, coverage_amount, coverage_storehouse_id"),
      ]);
      if (!mounted) return;

      const sum = (rows: any[] | null, key: string) =>
        (rows || []).reduce((s, r) => s + (Number(r[key]) || 0), 0);

      const nonResidence = (storehouses || []).filter(
        (s: any) => s.asset_type !== "Primary Residence & Protected Legacy Accounts",
      );
      const insuranceCash = sum(insurance, "cash_value");
      const legacyStorehouseIds = new Set(
        (storehouses || []).filter((s: any) => s.storehouse_number === 4).map((s: any) => s.id),
      );
      const coverageTotal = (insurance || [])
        .filter((p: any) => p.coverage_storehouse_id && legacyStorehouseIds.has(p.coverage_storehouse_id))
        .reduce((s: number, p: any) => s + (Number(p.coverage_amount) || 0), 0);

      const byNum: Record<number, number> = {};
      [1, 2, 3, 4].forEach((num) => {
        const rowTotal = nonResidence
          .filter((s: any) => s.storehouse_number === num)
          .reduce((s: number, r: any) => s + (Number(r.current_value) || 0), 0);
        byNum[num] = rowTotal + (num === 2 ? insuranceCash : 0) + (num === 4 ? coverageTotal : 0);
      });

      setTotals({
        vineyard: sum(vineyard, "current_value"),
        storehouses: sum(nonResidence, "current_value") + insuranceCash,
        corp: sum(corpVineyard, "current_value"),
        holdingTank: sum(holdingTank, "current_value"),
        insuranceCash,
      });
      setByStorehouse(byNum);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const total = totals.vineyard + totals.storehouses + totals.corp + totals.holdingTank;

  return (
    <Card className="border-sanctuary-bronze/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-widest text-sanctuary-bronze">
          Assets Under Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Total Firm AUM</p>
              <p className="text-3xl font-bold text-foreground">{formatCurrency(total)}</p>
            </div>
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Grape className="h-3.5 w-3.5" /> Portfolio
                </span>
                <span className="font-semibold text-primary">{formatCurrency(totals.vineyard)}</span>
              </div>
              {[
                { num: 1, label: "Liquidity Reserve" },
                { num: 2, label: "Strategic Reserve" },
                { num: 3, label: "Philanthropic Trust" },
                { num: 4, label: "Legacy Trust" },
              ].map(({ num, label }) => (
                <div key={num} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Landmark className="h-3.5 w-3.5" /> {label}
                  </span>
                  <span className="font-semibold text-accent">{formatCurrency(byStorehouse[num] || 0)}</span>
                </div>
              ))}
              {totals.corp > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" /> Corporate
                  </span>
                  <span className="font-semibold text-foreground">{formatCurrency(totals.corp)}</span>
                </div>
              )}
              {totals.holdingTank > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Anchor className="h-3.5 w-3.5" /> Holding Tank
                  </span>
                  <span className="font-semibold text-amber-600">{formatCurrency(totals.holdingTank)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Linkify helper ──
function Linkify({ children }: { children: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = children.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all hover:text-accent/80">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// AssigneePicker is now imported from @/modules/crm/components/AssigneePicker

interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  notes?: string;
  modified_at?: string | null;
  assignee?: { gid: string; name: string } | null;
  memberships?: { section?: { name?: string }; project?: { gid?: string } }[];
  custom_fields?: any[];
}

interface AsanaComment {
  gid: string;
  text: string;
  created_at: string;
  created_by?: { name?: string };
}

function extractProjectGid(asanaUrl: string | null): string | null {
  if (!asanaUrl) return null;
  const newMatch = asanaUrl.match(/\/project\/(\d+)/);
  if (newMatch) return newMatch[1];
  const match = asanaUrl.match(/app\.asana\.com\/(?:0|project)\/(\d+)/);
  return match ? match[1] : null;
}

function extractTaskGid(asanaUrl: string | null): string | null {
  if (!asanaUrl) return null;
  const taskMatch = asanaUrl.match(/\/task\/(\d+)/);
  if (taskMatch) return taskMatch[1];
  const listTaskMatch = asanaUrl.match(/\/project\/\d+\/list\/(\d+)/);
  if (listTaskMatch) return listTaskMatch[1];
  const twoSegment = asanaUrl.match(/app\.asana\.com\/0\/\d+\/(\d+)/);
  return twoSegment ? twoSegment[1] : null;
}

function isTaskBasedUrl(asanaUrl: string | null): boolean {
  if (!asanaUrl) return false;
  if (/\/task\/\d+/.test(asanaUrl)) return true;
  if (/\/project\/\d+\/list\/\d+/.test(asanaUrl)) return true;
  if (/app\.asana\.com\/0\/\d+\/f/.test(asanaUrl)) return true;
  if (/app\.asana\.com\/0\/\d+\/\d+/.test(asanaUrl) && !/\/(list|board|timeline|calendar)/.test(asanaUrl)) return true;
  return false;
}

// ── Dashboard Task Detail Panel ──
function DashboardTaskDetail({
  task,
  linked,
  section,
  onClose,
  onTaskUpdated,
}: {
  task: AsanaTask;
  linked: { id: string; name: string } | null;
  section: string | null;
  onClose: () => void;
  onTaskUpdated?: (t: AsanaTask) => void;
}) {
  const navigate = useNavigate();
  const [comments, setComments] = useState<AsanaComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [subtasks, setSubtasks] = useState<AsanaTask[]>([]);
  const [subtasksLoading, setSubtasksLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setCommentsLoading(true);
      setSubtasksLoading(true);
      try {
        const [commentsRes, subtasksRes] = await Promise.all([
          supabase.functions.invoke("asana-service", {
            body: { action: "getTaskStories", task_gid: task.gid },
          }),
          supabase.functions.invoke("asana-service", {
            body: { action: "getSubtasks", task_gid: task.gid },
          }),
        ]);
        if (!commentsRes.error && !commentsRes.data?.error) {
          setComments(commentsRes.data?.data || []);
        }
        if (!subtasksRes.error && !subtasksRes.data?.error) {
          setSubtasks(subtasksRes.data?.data || []);
        }
      } catch {
        // silent
      } finally {
        setCommentsLoading(false);
        setSubtasksLoading(false);
      }
    })();
  }, [task.gid]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const res = await supabase.functions.invoke("asana-service", {
        body: { action: "postTaskComment", task_gid: task.gid, text: newComment.trim() },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      setComments((prev) => [
        ...prev,
        { gid: Date.now().toString(), text: newComment.trim(), created_at: new Date().toISOString(), created_by: { name: "You" } },
      ]);
      setNewComment("");
      toast.success("Comment posted.");
    } catch (e: any) {
      toast.error(e.message || "Failed to post comment.");
    } finally {
      setPosting(false);
    }
  };

  const handleToggleComplete = async () => {
    setCompleting(true);
    try {
      const newCompleted = !task.completed;
      const res = await supabase.functions.invoke("asana-service", {
        body: { action: "updateTask", task_gid: task.gid, updates: { completed: newCompleted } },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      onTaskUpdated?.({ ...task, completed: newCompleted });
      toast.success(newCompleted ? "Task completed." : "Task reopened.");
    } catch (e: any) {
      toast.error(e.message || "Failed to update task.");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="mt-1 mb-2 rounded-lg border border-border bg-background p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground flex-1">{task.name}</h4>
        <div className="flex items-center gap-1 shrink-0">
          {linked && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => navigate(`/contacts/${linked.id}`)}
            >
              View Contact
            </Button>
          )}
          <a
            href={`https://app.asana.com/0/0/${task.gid}/f`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="sm" className="text-xs h-7">
              <ExternalLink className="h-3 w-3 mr-1" />
              Asana
            </Button>
          </a>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Meta + Actions */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {task.due_on && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Due: {format(parseLocalDate(task.due_on), "MMM d, yyyy")}
          </span>
        )}
        {section && <span>Section: {section}</span>}
        {linked && <span>Client: {linked.name}</span>}
        <span className="flex items-center gap-1">
          Assignee:
          <AssigneePicker
            currentAssignee={task.assignee}
            taskGid={task.gid}
            onAssigneeChanged={(a) => onTaskUpdated?.({ ...task, assignee: a })}
          />
        </span>
        {task.modified_at && (
          <span>Updated {formatDistanceToNow(new Date(task.modified_at), { addSuffix: true })}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={task.completed ? "secondary" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={handleToggleComplete}
          disabled={completing}
        >
          {completing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          {task.completed ? "Reopen" : "Mark Complete"}
        </Button>
      </div>

      {/* Subtasks */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
          <CheckSquare className="h-3 w-3" />
          Subtasks ({subtasksLoading ? "…" : subtasks.length})
        </div>
        {subtasksLoading ? (
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
        ) : subtasks.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No subtasks</p>
        ) : (
          <div className="space-y-1">
            {subtasks.map((sub) => (
              <div
                key={sub.gid}
                className={cn(
                  "flex items-center gap-2 rounded px-2.5 py-1.5 text-sm",
                  sub.completed ? "opacity-50 line-through text-muted-foreground" : "bg-muted/50"
                )}
              >
                <CheckSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{sub.name}</span>
                {sub.due_on && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(parseLocalDate(sub.due_on), "MMM d")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      {task.notes && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
            <FileText className="h-3 w-3" />
            Notes
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">
            <Linkify>{task.notes}</Linkify>
          </div>
        </div>
      )}

      <Separator />

      {/* Comments */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
          <MessageSquare className="h-3 w-3" />
          Comments ({commentsLoading ? "…" : comments.length})
        </div>

        {commentsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">No comments yet.</p>
        ) : (
          <div ref={scrollRef} className="space-y-2 max-h-[300px] overflow-y-auto">
            {comments.map((comment) => (
              <div key={comment.gid} className="rounded-md bg-muted/50 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    {comment.created_by?.name || "Unknown"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(comment.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap"><Linkify>{comment.text}</Linkify></p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            rows={2}
            className="text-sm flex-1 min-h-[44px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePostComment();
            }}
          />
          <Button
            size="icon"
            className="shrink-0 self-end h-9 w-9"
            onClick={handlePostComment}
            disabled={posting || !newComment.trim()}
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Press ⌘+Enter to send</p>
      </div>
    </div>
  );
}

function AsanaMyTasksWidget() {
  const [tasks, setTasks] = useState<AsanaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [contactMap, setContactMap] = useState<Record<string, { id: string; name: string }>>({});
  const [expandedGid, setExpandedGid] = useState<string | null>(null);
  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const handler = (e: Event) => {
      const gid = (e as CustomEvent).detail?.gid;
      if (!gid) return;
      setExpandedGid(gid);
      setTimeout(() => {
        taskRefs.current[gid]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    };
    window.addEventListener("open-my-task", handler);
    return () => window.removeEventListener("open-my-task", handler);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Use getUser() to force token refresh (getSession returns cached/stale tokens)
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return;

        const contactRes = await supabase
          .from("contacts")
          .select("id, full_name, asana_url")
          .not("asana_url", "is", null);

        const map: Record<string, { id: string; name: string }> = {};
        const projectGids: string[] = [];
        const taskBasedContacts: { taskGid: string; contactId: string; contactName: string }[] = [];

        if (contactRes.data) {
          for (const c of contactRes.data) {
            // Determine if this is a task-based or project-based URL
            const isTask = isTaskBasedUrl(c.asana_url);
            if (isTask) {
              const taskGid = extractTaskGid(c.asana_url);
              if (taskGid) {
                map[taskGid] = { id: c.id, name: c.full_name };
                taskBasedContacts.push({ taskGid, contactId: c.id, contactName: c.full_name });
              }
            } else {
              const projGid = extractProjectGid(c.asana_url);
              if (projGid) {
                map[projGid] = { id: c.id, name: c.full_name };
                projectGids.push(projGid);
              }
            }
          }
        }
        setContactMap(map);

        // Fetch project-level tasks AND subtasks from task-based contacts in parallel
        const fetches: Promise<any>[] = [
          supabase.functions.invoke("asana-service", {
            body: { action: "getMyTasks", project_gids: projectGids.length > 0 ? projectGids : undefined },
          }),
        ];

        // For each task-based contact, fetch its subtasks
        for (const tc of taskBasedContacts) {
          fetches.push(
            supabase.functions.invoke("asana-service", {
              body: { action: "getSubtasks", task_gid: tc.taskGid },
            }),
          );
        }

        const results = await Promise.all(fetches);

        // Merge all tasks, dedup by GID
        const seen = new Set<string>();
        const allTasks: AsanaTask[] = [];

        // Project-level tasks from getMyTasks
        const myTasksData = results[0]?.data?.data || [];
        for (const t of myTasksData) {
          if (!seen.has(t.gid)) {
            seen.add(t.gid);
            allTasks.push(t);
          }
        }

        // Subtasks from task-based contacts
        for (let i = 0; i < taskBasedContacts.length; i++) {
          const tc = taskBasedContacts[i];
          const subtaskData = results[i + 1]?.data?.data || [];
          for (const sub of subtaskData) {
            if (!seen.has(sub.gid) && sub.assignee) {
              seen.add(sub.gid);
              sub._parentTaskGid = tc.taskGid;
              allTasks.push(sub);
            }
          }
        }

        const incomplete = allTasks.filter((t) => !t.completed);
        const sorted = incomplete.sort((a, b) => {
          if (!a.due_on && !b.due_on) return 0;
          if (!a.due_on) return 1;
          if (!b.due_on) return -1;
          return parseLocalDate(a.due_on).getTime() - parseLocalDate(b.due_on).getTime();
        });
        setTasks(sorted);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function getLinkedContact(task: AsanaTask) {
    // Check if subtask was tagged with a parent task GID
    const parentGid = (task as any)._parentTaskGid;
    if (parentGid && contactMap[parentGid]) return contactMap[parentGid];
    // Check project memberships
    for (const m of task.memberships || []) {
      const gid = m.project?.gid;
      if (gid && contactMap[gid]) return contactMap[gid];
    }
    if (contactMap[task.gid]) return contactMap[task.gid];
    return null;
  }

  function getSectionLabel(task: AsanaTask): string | null {
    const section = task.memberships?.[0]?.section?.name;
    return section || null;
  }

  const handleTaskUpdated = (updatedTask: AsanaTask) => {
    setTasks((prev) =>
      prev.map((t) => (t.gid === updatedTask.gid ? { ...t, ...updatedTask } : t))
    );
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4 text-sanctuary-bronze" />
          My Tasks
        </CardTitle>
        {tasks.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {tasks.length}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load tasks</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks assigned to you.</p>
        ) : (
          <div className="space-y-2">
            {tasks.slice(0, 20).map((task) => {
              const linked = getLinkedContact(task);
              const section = getSectionLabel(task);
              const isExpanded = expandedGid === task.gid;
              return (
                <div key={task.gid} ref={(el) => (taskRefs.current[task.gid] = el)}>
                  <button
                    onClick={() => setExpandedGid(isExpanded ? null : task.gid)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/50 text-left",
                      isExpanded && "bg-muted/50 border-accent/30"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{task.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {linked && (
                          <span className="text-xs text-accent font-medium truncate">{linked.name}</span>
                        )}
                        <AssigneePicker
                          currentAssignee={task.assignee}
                          taskGid={task.gid}
                          onAssigneeChanged={(a) => handleTaskUpdated({ ...task, assignee: a })}
                        />
                        {task.due_on && (
                          <span className="text-xs text-muted-foreground">
                            Due: {format(parseLocalDate(task.due_on), "MMM d")}
                          </span>
                        )}
                        {task.modified_at && (
                          <span className="text-xs text-muted-foreground">
                            · {formatDistanceToNow(new Date(task.modified_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {section && (
                        <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                          {section}
                        </Badge>
                      )}
                      <ChevronRight className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        isExpanded && "rotate-90"
                      )} />
                    </div>
                  </button>
                  {isExpanded && (
                    <DashboardTaskDetail
                      task={task}
                      linked={linked}
                      section={section}
                      onClose={() => setExpandedGid(null)}
                      onTaskUpdated={handleTaskUpdated}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}