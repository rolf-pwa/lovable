import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScrollText, ExternalLink, CheckCircle2, Loader2, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CharterRow {
  id: string;
  contact_id: string;
  esign_status: string | null;
  draft_status: string | null;
  esign_doc_url: string | null;
  esign_signed_at: string | null;
  contactName: string;
  householdId: string | null;
}

interface Counts {
  draft: number;
  sent: number;
  signed: number;
  ratified: number;
  none: number;
}

export function CharterRatificationTile({ householdId }: { householdId?: string } = {}) {
  const [counts, setCounts] = useState<Counts>({ draft: 0, sent: 0, signed: 0, ratified: 0, none: 0 });
  const [queue, setQueue] = useState<CharterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const contactsQuery = supabase.from("contacts").select("id, first_name, last_name, household_id");
    if (householdId) contactsQuery.eq("household_id", householdId);
    const { data: contacts } = await contactsQuery;
    const contactIds = (contacts || []).map((c: any) => c.id);

    const chartersQuery = supabase
      .from("sovereignty_charters")
      .select("id, contact_id, esign_status, draft_status, esign_doc_url, esign_signed_at");
    if (householdId) chartersQuery.in("contact_id", contactIds.length ? contactIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: charters } = await chartersQuery;


    const contactMap = new Map(
      (contacts || []).map((c: any) => [
        c.id,
        { name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unknown", household_id: c.household_id },
      ]),
    );

    const c: Counts = { draft: 0, sent: 0, signed: 0, ratified: 0, none: 0 };
    const q: CharterRow[] = [];
    for (const ch of charters || []) {
      const status = ch.esign_status || "not_sent";
      if (status === "ratified") c.ratified++;
      else if (status === "signed") c.signed++;
      else if (status === "sent") c.sent++;
      else if (ch.draft_status === "draft" || ch.draft_status === "generated") c.draft++;
      else c.none++;

      if (status === "signed") {
        const info = contactMap.get(ch.contact_id);
        q.push({
          id: ch.id,
          contact_id: ch.contact_id,
          esign_status: ch.esign_status,
          draft_status: ch.draft_status,
          esign_doc_url: ch.esign_doc_url,
          esign_signed_at: ch.esign_signed_at,
          contactName: info?.name || "Unknown",
          householdId: info?.household_id || null,
        });
      }
    }
    setCounts(c);
    setQueue(q.sort((a, b) => (a.esign_signed_at || "").localeCompare(b.esign_signed_at || "")));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ratify = async (row: CharterRow) => {
    setWorking(row.id);
    const { data: userData } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("sovereignty_charters")
      .update({
        esign_status: "ratified",
        draft_status: "ratified",
        ratified_at: now,
        ratified_by: userData?.user?.id || null,
        footer_status: "Ratified / Sovereign phase",
      })
      .eq("id", row.id);
    setWorking(null);
    if (error) {
      toast({ title: "Could not ratify", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Charter ratified", description: `${row.contactName}'s charter is now Sovereign.` });
    load();
  };

  const total = counts.draft + counts.sent + counts.signed + counts.ratified + counts.none;

  return (
    <Card className="border-sanctuary-bronze/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-sanctuary-bronze" />
          Charter Ratification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Draft" value={counts.draft} tone="muted" />
              <Stat label="Sent" value={counts.sent} tone="muted" />
              <Stat label="Awaiting Review" value={counts.signed} tone="amber" />
              <Stat label="Ratified" value={counts.ratified} tone="bronze" />
            </div>

            {counts.signed > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                  Pending Ratification
                </p>
                <ScrollArea className="max-h-56">
                  <div className="space-y-2 pr-2">
                    {queue.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            to={`/contacts/${row.contact_id}`}
                            className="text-xs font-medium hover:underline truncate"
                          >
                            {row.contactName}
                          </Link>
                          {row.householdId && (
                            <Link
                              to={`/households/${row.householdId}`}
                              className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                            >
                              Household
                            </Link>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {row.esign_doc_url && (
                            <a
                              href={row.esign_doc_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-sanctuary-bronze hover:underline"
                            >
                              <FileText className="h-3 w-3" /> Drive
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto h-6 px-2 text-[11px] border-sanctuary-bronze/40 text-sanctuary-bronze hover:bg-sanctuary-bronze/10"
                            disabled={working === row.id}
                            onClick={() => ratify(row)}
                          >
                            {working === row.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Ratify
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {total > 0 && (
              <div className="pt-2 border-t border-border/40">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Ratified</span>
                  <span>
                    {counts.ratified} / {total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-sanctuary-bronze transition-all"
                    style={{ width: `${total ? (counts.ratified / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "muted" | "amber" | "bronze" }) {
  const toneCls =
    tone === "amber"
      ? "text-amber-600 border-amber-500/30 bg-amber-500/5"
      : tone === "bronze"
        ? "text-sanctuary-bronze border-sanctuary-bronze/30 bg-sanctuary-bronze/5"
        : "text-foreground border-border bg-muted/30";
  return (
    <div className={`rounded-md border px-2 py-1.5 ${toneCls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-base font-semibold leading-tight">{value}</p>
    </div>
  );
}
