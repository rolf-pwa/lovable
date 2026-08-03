import { useEffect, useState } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BOOKING_STATUS_LABELS } from "../lib/money";

interface Booking {
  id: string;
  requester_name: string | null;
  requester_email: string | null;
  starts_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  service?: { name: string } | null;
}

export function BookingsPanel() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("service_bookings" as any)
      .select("*, service:services(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    setBookings((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("service_bookings" as any).update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Booking updated");
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-amber-500" /> Booking requests
        </CardTitle>
        <Badge variant="secondary">{bookings.filter((b) => b.status === "requested").length} new</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : bookings.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No booking requests yet.</p>
        ) : (
          bookings.map((b) => (
            <div key={b.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{b.service?.name || "Service request"}</p>
                  <p className="text-muted-foreground">
                    {b.requester_name || "Unnamed"}
                    {b.requester_email ? ` · ${b.requester_email}` : ""}
                  </p>
                  {b.starts_at && (
                    <p className="text-xs text-muted-foreground">
                      Requested for {new Date(b.starts_at).toLocaleString("en-CA")}
                    </p>
                  )}
                  {b.notes && <p className="mt-1 text-xs text-muted-foreground">{b.notes}</p>}
                </div>
                <Select value={b.status} onValueChange={(v) => setStatus(b.id, v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))
        )}
        <Button variant="ghost" size="sm" onClick={load}>
          Refresh
        </Button>
      </CardContent>
    </Card>
  );
}
