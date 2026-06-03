import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogIn, Eye, MousePointerClick, BarChart3 } from "lucide-react";
import { format } from "date-fns";

interface Props {
  contactId?: string;
  contactIds?: string[];
}

interface LoginRow { id: string; created_at: string; login_method: string; }
interface ReadRow { id: string; read_at: string; update_id: string; }
interface InteractionRow { id: string; interacted_at: string; task_gid: string; }
interface UpdateRow { id: string; title: string; url: string | null; created_at: string; }

export function ContactAnalytics({ contactId }: Props) {
  const [logins, setLogins] = useState<LoginRow[]>([]);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [interactions, setInteractions] = useState<InteractionRow[]>([]);
  const [updates, setUpdates] = useState<Record<string, UpdateRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from("portal_logins" as any).select("*").eq("contact_id", contactId).order("created_at", { ascending: false }),
      supabase.from("marketing_update_reads").select("*").eq("contact_id", contactId).order("read_at", { ascending: false }),
      supabase.from("portal_task_interactions").select("*").eq("contact_id", contactId).order("interacted_at", { ascending: false }),
    ]).then(async ([loginsRes, readsRes, interactionsRes]) => {
      if (cancelled) return;
      const loginsData = (loginsRes.data as any) || [];
      const readsData = (readsRes.data as any) || [];
      const interactionsData = (interactionsRes.data as any) || [];
      setLogins(loginsData);
      setReads(readsData);
      setInteractions(interactionsData);

      const updateIds = Array.from(new Set(readsData.map((r: ReadRow) => r.update_id)));
      if (updateIds.length > 0) {
        const { data } = await supabase
          .from("marketing_updates")
          .select("id, title, url, created_at")
          .in("id", updateIds as string[]);
        if (!cancelled && data) {
          const map: Record<string, UpdateRow> = {};
          data.forEach((u: any) => (map[u.id] = u));
          setUpdates(map);
        }
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [contactId]);

  const lastLogin = logins[0]?.created_at;
  const lastRead = reads[0]?.read_at;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <LogIn className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium text-muted-foreground">Portal Logins</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{logins.length}</p>
            {lastLogin && (
              <p className="text-xs text-muted-foreground mt-1">
                Last: {format(new Date(lastLogin), "MMM d, yyyy")}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium text-muted-foreground">Updates Opened</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{reads.length}</p>
            {lastRead && (
              <p className="text-xs text-muted-foreground mt-1">
                Last: {format(new Date(lastRead), "MMM d, yyyy")}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium text-muted-foreground">Task Interactions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{interactions.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent" /> Marketing Updates Opened
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : reads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No updates opened yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Update</TableHead>
                  <TableHead>Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reads.map((r) => {
                  const u = updates[r.update_id];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {u ? (
                          u.url ? (
                            <a href={u.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {u.title}
                            </a>
                          ) : (
                            u.title
                          )
                        ) : (
                          <span className="text-muted-foreground">Unknown update</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(r.read_at), "MMM d, yyyy h:mm a")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LogIn className="h-4 w-4 text-accent" /> Portal Login History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : logins.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No portal logins yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logins.slice(0, 50).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{format(new Date(l.created_at), "MMM d, yyyy h:mm a")}</TableCell>
                    <TableCell><Badge variant="secondary">{l.login_method}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {interactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-accent" /> Recent Task Interactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task ID</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interactions.slice(0, 25).map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.task_gid}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(i.interacted_at), "MMM d, yyyy h:mm a")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
