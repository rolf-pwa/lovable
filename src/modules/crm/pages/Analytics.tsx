import { AppLayout } from "@/shared/components/AppLayout";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { BarChart3, Eye, LogIn, Send, ChevronLeft, Users, ExternalLink, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { format, subDays, startOfDay, startOfWeek, eachDayOfInterval, eachWeekOfInterval } from "date-fns";

type TimeRange = "7d" | "30d" | "90d";
type Granularity = "daily" | "weekly";

interface LoginRecord {
  id: string;
  contact_id: string;
  login_method: string;
  created_at: string;
}

interface MarketingUpdate {
  id: string;
  title: string;
  sent: boolean;
  created_at: string;
  target_governance_status: string;
  target_contact_ids: string[] | null;
  target_household_ids: string[] | null;
}

interface ReadRecord {
  id: string;
  contact_id: string;
  update_id: string;
  read_at: string;
}

interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  governance_status: string;
  household_id: string | null;
}

interface GeorgiaSession {
  id: string;
  session_key: string;
  source: string;
  landing_path: string | null;
  referrer: string | null;
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
  message_count: number;
  reached_lead_capture: boolean;
  lead_captured: boolean;
  final_phase: string;
}

const Analytics = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [logins, setLogins] = useState<LoginRecord[]>([]);
  const [updates, setUpdates] = useState<MarketingUpdate[]>([]);
  const [reads, setReads] = useState<ReadRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [georgiaSessions, setGeorgiaSessions] = useState<GeorgiaSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillContact, setDrillContact] = useState<Contact | null>(null);
  const [drillUpdate, setDrillUpdate] = useState<MarketingUpdate | null>(null);

  const rangeStart = useMemo(() => {
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    return subDays(new Date(), days).toISOString();
  }, [timeRange]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("portal_logins" as any).select("*").gte("created_at", rangeStart).order("created_at", { ascending: false }),
      supabase.from("marketing_updates").select("*").order("created_at", { ascending: false }),
      supabase.from("marketing_update_reads").select("*").gte("read_at", rangeStart).order("read_at", { ascending: false }),
      supabase.from("contacts").select("id, full_name, email, governance_status, household_id"),
      supabase.from("georgia_session_starts").select("*").gte("started_at", rangeStart).order("started_at", { ascending: false }),
    ]).then(([loginsRes, updatesRes, readsRes, contactsRes, georgiaRes]) => {
      setLogins((loginsRes.data as any) || []);
      setUpdates(updatesRes.data || []);
      setReads(readsRes.data || []);
      setContacts(contactsRes.data || []);
      setGeorgiaSessions((georgiaRes.data as any) || []);
      setLoading(false);
    });
  }, [rangeStart]);

  const contactMap = useMemo(() => {
    const map: Record<string, Contact> = {};
    contacts.forEach((c) => (map[c.id] = c));
    return map;
  }, [contacts]);

  const sentUpdates = useMemo(() => updates.filter((u) => u.sent), [updates]);

  // Count recipients per update based on targeting rules
  const getRecipientCount = (u: MarketingUpdate): number => {
    const tContactIds = u.target_contact_ids || [];
    const tHouseholdIds = u.target_household_ids || [];
    if (tContactIds.length > 0) return tContactIds.length;
    if (tHouseholdIds.length > 0) {
      return contacts.filter((c) => c.household_id && tHouseholdIds.includes(c.household_id)).length;
    }
    if (u.target_governance_status === "all") return contacts.length;
    return contacts.filter((c) => c.governance_status === u.target_governance_status).length;
  };

  const totalSends = useMemo(
    () => sentUpdates.reduce((sum, u) => sum + getRecipientCount(u), 0),
    [sentUpdates, contacts]
  );

  // Build time-series buckets
  const buckets = useMemo(() => {
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    const start = startOfDay(subDays(new Date(), days));
    const end = startOfDay(new Date());

    if (granularity === "daily") {
      const dayList = eachDayOfInterval({ start, end });
      return dayList.map((d) => {
        const dayStr = format(d, "yyyy-MM-dd");
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        return {
          label: format(d, "MMM d"),
          logins: logins.filter((l) => l.created_at >= d.toISOString() && l.created_at < nextDay.toISOString()).length,
          opens: reads.filter((r) => r.read_at >= d.toISOString() && r.read_at < nextDay.toISOString()).length,
        };
      });
    } else {
      const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      return weeks.map((w, i) => {
        const weekEnd = i < weeks.length - 1 ? weeks[i + 1] : new Date();
        return {
          label: `W/O ${format(w, "MMM d")}`,
          logins: logins.filter((l) => l.created_at >= w.toISOString() && l.created_at < weekEnd.toISOString()).length,
          opens: reads.filter((r) => r.read_at >= w.toISOString() && r.read_at < weekEnd.toISOString()).length,
        };
      });
    }
  }, [logins, reads, granularity, timeRange]);

  // Per-client aggregation
  const clientStats = useMemo(() => {
    const map: Record<string, { logins: number; opens: number }> = {};
    logins.forEach((l) => {
      if (!map[l.contact_id]) map[l.contact_id] = { logins: 0, opens: 0 };
      map[l.contact_id].logins++;
    });
    reads.forEach((r) => {
      if (!map[r.contact_id]) map[r.contact_id] = { logins: 0, opens: 0 };
      map[r.contact_id].opens++;
    });
    return Object.entries(map)
      .map(([id, stats]) => ({ contact: contactMap[id], ...stats }))
      .filter((s) => s.contact)
      .sort((a, b) => b.logins + b.opens - (a.logins + a.opens));
  }, [logins, reads, contactMap]);

  // Drill-down data
  const drillLogins = useMemo(
    () => (drillContact ? logins.filter((l) => l.contact_id === drillContact.id) : []),
    [drillContact, logins]
  );
  const drillReads = useMemo(
    () => (drillContact ? reads.filter((r) => r.contact_id === drillContact.id) : []),
    [drillContact, reads]
  );

  // Max for bar chart scaling
  const maxBucket = Math.max(1, ...buckets.map((b) => Math.max(b.logins, b.opens)));

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl">
        {drillUpdate ? (
          (() => {
            const updateReads = reads.filter((r) => r.update_id === drillUpdate.id);
            const readContactIds = new Set(updateReads.map((r) => r.contact_id));
            const readers = updateReads
              .map((r) => ({ ...r, contact: contactMap[r.contact_id] }))
              .filter((r) => r.contact)
              .sort((a, b) => new Date(b.read_at).getTime() - new Date(a.read_at).getTime());

            // Compute recipients for this update
            const tContactIds = drillUpdate.target_contact_ids || [];
            const tHouseholdIds = drillUpdate.target_household_ids || [];
            let recipients: Contact[];
            if (tContactIds.length > 0) {
              recipients = contacts.filter((c) => tContactIds.includes(c.id));
            } else if (tHouseholdIds.length > 0) {
              recipients = contacts.filter((c) => c.household_id && tHouseholdIds.includes(c.household_id));
            } else if (drillUpdate.target_governance_status === "all") {
              recipients = contacts;
            } else {
              recipients = contacts.filter((c) => c.governance_status === drillUpdate.target_governance_status);
            }
            const notOpened = recipients.filter((c) => !readContactIds.has(c.id));

            return (
              <>
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => setDrillUpdate(null)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">{drillUpdate.title}</h1>
                    <p className="text-sm text-muted-foreground">
                      Sent {format(new Date(drillUpdate.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2 flex flex-row items-center gap-2">
                      <Send className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-medium text-muted-foreground">Recipients</CardTitle>
                    </CardHeader>
                    <CardContent><p className="text-3xl font-bold">{recipients.length}</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2 flex flex-row items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-medium text-muted-foreground">Opened</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{readers.length}</p>
                      {recipients.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {Math.round((readers.length / recipients.length) * 100)}% open rate
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Not Opened</CardTitle></CardHeader>
                    <CardContent><p className="text-3xl font-bold">{notOpened.length}</p></CardContent>
                  </Card>
                </div>

                <Tabs defaultValue="recipients">
                  <TabsList>
                    <TabsTrigger value="recipients">All Recipients ({recipients.length})</TabsTrigger>
                    <TabsTrigger value="opened">Opened ({readers.length})</TabsTrigger>
                    <TabsTrigger value="not-opened">Not Opened ({notOpened.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="recipients">
                    <Card>
                      <CardContent className="pt-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Client</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {recipients.map((c) => {
                              const readRecord = updateReads.find((r) => r.contact_id === c.id);
                              return (
                                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setDrillUpdate(null); setDrillContact(c); }}>
                                  <TableCell className="font-medium">{c.full_name}</TableCell>
                                  <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                                  <TableCell>
                                    {readRecord ? (
                                      <Badge variant="default">Opened {format(new Date(readRecord.read_at), "MMM d")}</Badge>
                                    ) : (
                                      <Badge variant="secondary">Not opened</Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="opened">
                    <Card>
                      <CardContent className="pt-4">
                        {readers.length === 0 ? (
                          <p className="text-muted-foreground text-sm py-4 text-center">No one has opened this update yet.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Client</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Opened At</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {readers.map((r) => (
                                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setDrillUpdate(null); setDrillContact(r.contact!); }}>
                                  <TableCell className="font-medium">{r.contact!.full_name}</TableCell>
                                  <TableCell className="text-muted-foreground">{r.contact!.email || "—"}</TableCell>
                                  <TableCell>{format(new Date(r.read_at), "MMM d, yyyy h:mm a")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="not-opened">
                    <Card>
                      <CardContent className="pt-4">
                        {notOpened.length === 0 ? (
                          <p className="text-muted-foreground text-sm py-4 text-center">Everyone has opened this update!</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Client</TableHead>
                                <TableHead>Email</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {notOpened.map((c) => (
                                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setDrillUpdate(null); setDrillContact(c); }}>
                                  <TableCell className="font-medium">{c.full_name}</TableCell>
                                  <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </>
            );
          })()
        ) : drillContact ? (
          <>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setDrillContact(null)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Link to={`/contacts/${drillContact.id}`} className="text-2xl font-bold text-foreground hover:underline flex items-center gap-2">
                {drillContact.full_name} <ExternalLink className="h-4 w-4" />
              </Link>
              {drillContact.email && <span className="text-muted-foreground text-sm">{drillContact.email}</span>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Portal Logins</CardTitle></CardHeader>
                <CardContent><p className="text-3xl font-bold">{drillLogins.length}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Updates Opened</CardTitle></CardHeader>
                <CardContent><p className="text-3xl font-bold">{drillReads.length}</p></CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-sm">Login History</CardTitle></CardHeader>
              <CardContent>
                {drillLogins.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No logins in this period.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {drillLogins.map((l) => (
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

            <Card>
              <CardHeader><CardTitle className="text-sm">Updates Opened</CardTitle></CardHeader>
              <CardContent>
                {drillReads.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No updates opened in this period.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Update</TableHead><TableHead>Opened</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {drillReads.map((r) => {
                        const update = updates.find((u) => u.id === r.update_id);
                        return (
                          <TableRow key={r.id}>
                            <TableCell>{update?.title || "Unknown"}</TableCell>
                            <TableCell>{format(new Date(r.read_at), "MMM d, yyyy h:mm a")}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="h-7 w-7" /> Analytics
              </h1>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {(["7d", "30d", "90d"] as TimeRange[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setTimeRange(r)}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        timeRange === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "90 Days"}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {(["daily", "weekly"] as Granularity[]).map((g) => (
                    <button
                      key={g}
                      onClick={() => setGranularity(g)}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors capitalize ${
                        granularity === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center gap-2">
                  <LogIn className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">Portal Logins</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{loading ? "—" : logins.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {logins.filter((l) => l.login_method === "otp").length} OTP · {logins.filter((l) => l.login_method === "google").length} Google
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">Updates Sent</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{loading ? "—" : totalSends}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    across {sentUpdates.length} update{sentUpdates.length !== 1 ? "s" : ""}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">Update Opens</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{loading ? "—" : reads.length}</p>
                  {totalSends > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {Math.round((reads.length / totalSends) * 100)}% open rate
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <Tabs defaultValue="logins">
              <TabsList>
                <TabsTrigger value="logins">Logins</TabsTrigger>
                <TabsTrigger value="opens">Update Opens</TabsTrigger>
              </TabsList>
              <TabsContent value="logins">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-end gap-1 h-40">
                      {buckets.map((b, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t bg-primary/80 transition-all min-h-[2px]"
                            style={{ height: `${(b.logins / maxBucket) * 100}%` }}
                            title={`${b.label}: ${b.logins} logins`}
                          />
                          {buckets.length <= 31 && (
                            <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                              {b.label.replace("W/O ", "")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="opens">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-end gap-1 h-40">
                      {buckets.map((b, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t bg-accent/80 transition-all min-h-[2px]"
                            style={{ height: `${(b.opens / maxBucket) * 100}%` }}
                            title={`${b.label}: ${b.opens} opens`}
                          />
                          {buckets.length <= 31 && (
                            <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                              {b.label.replace("W/O ", "")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Per-update open rates */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Marketing Update Performance</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Update</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Opens</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sentUpdates.slice(0, 20).map((u) => {
                      const openCount = reads.filter((r) => r.update_id === u.id).length;
                      const recipientCount = getRecipientCount(u);
                      const rate = recipientCount > 0 ? Math.round((openCount / recipientCount) * 100) : 0;
                      return (
                        <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDrillUpdate(u)}>
                          <TableCell className="font-medium">{u.title}</TableCell>
                          <TableCell>{format(new Date(u.created_at), "MMM d, yyyy")}</TableCell>
                          <TableCell>{recipientCount}</TableCell>
                          <TableCell>
                            <Badge variant={openCount > 0 ? "default" : "secondary"}>{openCount}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{rate}%</TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">View →</TableCell>
                        </TableRow>
                      );
                    })}
                    {sentUpdates.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-muted-foreground text-center">No updates sent yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Per-client table */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Client Activity</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Logins</TableHead>
                      <TableHead>Opens</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientStats.slice(0, 25).map((s) => (
                      <TableRow key={s.contact!.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDrillContact(s.contact!)}>
                        <TableCell className="font-medium">{s.contact!.full_name}</TableCell>
                        <TableCell>{s.logins}</TableCell>
                        <TableCell>{s.opens}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs">View →</TableCell>
                      </TableRow>
                    ))}
                    {clientStats.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-muted-foreground text-center">No activity in this period</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Georgia Chat Funnel + Abandoned Sessions */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Georgia Chat — Sessions & Abandonment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Sessions Started</p>
                    <p className="text-2xl font-bold">{georgiaSessions.length}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Reached Lead Form</p>
                    <p className="text-2xl font-bold">{georgiaSessions.filter((s) => s.reached_lead_capture).length}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Lead Captured</p>
                    <p className="text-2xl font-bold">{georgiaSessions.filter((s) => s.lead_captured).length}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Abandoned</p>
                    <p className="text-2xl font-bold">{georgiaSessions.filter((s) => !s.lead_captured).length}</p>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Last Phase</TableHead>
                      <TableHead>Msgs</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Landing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {georgiaSessions.filter((s) => !s.lead_captured).slice(0, 50).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs">{format(new Date(s.started_at), "MMM d, h:mm a")}</TableCell>
                        <TableCell><Badge variant="secondary">{s.source}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={s.reached_lead_capture ? "default" : "secondary"}>
                            {s.final_phase}
                          </Badge>
                        </TableCell>
                        <TableCell>{s.message_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(s.last_activity_at), "MMM d, h:mm a")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{s.landing_path || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {georgiaSessions.filter((s) => !s.lead_captured).length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-muted-foreground text-center">No abandoned sessions in this period</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default Analytics;
