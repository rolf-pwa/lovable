import { useMemo, useState, useEffect, useRef } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Calendar, Mail, Plus, Loader2, Link2Off, Inbox, ChevronRight,
  Grape, Landmark, Anchor, Building2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { parseLocalDate } from "@/shared/lib/date-utils";
import { toast } from "sonner";
import { supabase } from "@/shared/integrations/supabase/client";
import { cn } from "@/shared/lib/utils";
import { getTaskAgent } from "@/shared/lib/agents";
import type { PmTask, PmProject } from "@/shared/lib/agents";
import { TaskDetailPanel } from "@/modules/pm/components/TaskDetailPanel";
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
    <div className="space-y-4">
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
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MyTasksWidget />
        </div>
        <div className="space-y-4">
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
      <CardHeader className="flex flex-row items-center justify-between pb-2">
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
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-widest text-sanctuary-bronze">
          Assets Under Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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

const STATUS_DOT: Record<string, string> = {
  open: "bg-muted-foreground/40",
  in_progress: "bg-primary",
  done: "bg-emerald-500",
};

function MyTasksWidget() {
  const [tasks, setTasks] = useState<PmTask[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [myTasks, projects] = await Promise.all([
        getTaskAgent().listTasks({ assignee_id: "me" }),
        getTaskAgent().listProjects(),
      ]);
      const names: Record<string, string> = {};
      for (const p of projects as PmProject[]) names[p.id] = p.name;
      setProjectNames(names);

      const incomplete = myTasks.filter((t) => t.status !== "done");
      const sorted = [...incomplete].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return parseLocalDate(a.due_date).getTime() - parseLocalDate(b.due_date).getTime();
      });
      setTasks(sorted);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      if (!id) return;
      setExpandedId(id);
      setTimeout(() => {
        taskRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    };
    window.addEventListener("open-my-task", handler);
    return () => window.removeEventListener("open-my-task", handler);
  }, []);

  const handleTaskChanged = (updated: PmTask) => {
    setTasks((prev) =>
      updated.status === "done"
        ? prev.filter((t) => t.id !== updated.id)
        : prev.map((t) => (t.id === updated.id ? updated : t)),
    );
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
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
          <div className="space-y-1.5">
            {tasks.slice(0, 20).map((task) => {
              const projectName = task.project_id ? projectNames[task.project_id] : null;
              const isExpanded = expandedId === task.id;
              return (
                <div key={task.id} ref={(el) => (taskRefs.current[task.id] = el)}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : task.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/50 text-left",
                      isExpanded && "bg-muted/50 border-accent/30"
                    )}
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[task.status] || STATUS_DOT.open)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {projectName && (
                            <span className="text-xs text-accent font-medium truncate">{projectName}</span>
                          )}
                          {task.due_date && (
                            <span className="text-xs text-muted-foreground">
                              Due: {format(parseLocalDate(task.due_date), "MMM d")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                      isExpanded && "rotate-90"
                    )} />
                  </button>
                  {isExpanded && (
                    <div className="mt-1 mb-2 rounded-lg border border-border bg-background p-3">
                      <TaskDetailPanel task={task} onChanged={handleTaskChanged} />
                    </div>
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
