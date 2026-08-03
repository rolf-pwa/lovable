import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { formatMoney } from "../lib/money";

interface BookingStatus {
  id: string;
  status: string;
  payment_status: string;
  total: number | null;
  currency: string | null;
  scheduling_url: string | null;
  requester_name: string | null;
}

export default function BookingConfirmation() {
  const [params] = useSearchParams();
  const bookingId = params.get("booking") || "";
  const [booking, setBooking] = useState<BookingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const attempts = useRef(0);

  useEffect(() => {
    document.title = "Booking confirmed | ProsperWise";
    if (!bookingId) {
      setLoading(false);
      return;
    }

    let stop = false;
    const poll = async () => {
      const { data } = await supabase.functions.invoke("book-checkout", {
        body: { action: "status", bookingId },
      });
      const result: any = data;
      if (stop) return;
      if (result?.ok) setBooking(result.booking);
      setLoading(false);
      attempts.current += 1;
      if (result?.booking?.payment_status !== "paid" && attempts.current < 6) {
        setTimeout(poll, 2500);
      }
    };
    poll();
    return () => {
      stop = true;
    };
  }, [bookingId]);

  const paid = booking?.payment_status === "paid";

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="py-10">
            {loading ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment…
              </div>
            ) : !booking ? (
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">We couldn't find that booking</p>
                  <p className="text-sm text-muted-foreground">
                    If you completed a payment, our team will reach out to confirm your time.
                  </p>
                  <Button asChild variant="ghost" className="mt-3 px-0">
                    <Link to="/book">Back to booking</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  {paid ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-amber-500" />
                  ) : (
                    <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-muted-foreground" />
                  )}
                  <div>
                    <h1 className="font-serif text-2xl">
                      {paid ? "Payment received" : "Payment pending"}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {paid
                        ? `Thank you${booking.requester_name ? `, ${booking.requester_name.split(" ")[0]}` : ""}. Your booking is confirmed.`
                        : "We're still waiting on confirmation from Square. This page updates automatically."}
                    </p>
                  </div>
                </div>

                {booking.total != null && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-medium">
                        {formatMoney(Number(booking.total), booking.currency || "CAD")}
                      </span>
                    </div>
                  </div>
                )}

                {paid && booking.scheduling_url && (
                  <div className="space-y-2">
                    <p className="text-sm">Last step — choose the time that works for you.</p>
                    <Button asChild className="w-full">
                      <a href={booking.scheduling_url} target="_blank" rel="noopener noreferrer">
                        Choose your appointment time
                      </a>
                    </Button>
                  </div>
                )}
                {paid && !booking.scheduling_url && (
                  <p className="text-sm text-muted-foreground">
                    Our team will email you shortly to schedule your appointment.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
