import { useEffect, useState } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "../lib/money";

interface PublicService {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  duration_minutes: number | null;
}

export default function BookService() {
  const [services, setServices] = useState<PublicService[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = "Book a service | ProsperWise";
    (async () => {
      const { data } = await supabase
        .from("services" as any)
        .select("id, name, description, price, currency, duration_minutes")
        .eq("is_active", true)
        .order("name");
      setServices((data as any) || []);
    })();
  }, []);

  const selected = services.find((s) => s.id === serviceId);

  const submit = async () => {
    if (!serviceId || !name.trim() || !email.trim()) {
      toast.error("Service, name, and email are required.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("service_bookings" as any).insert({
      service_id: serviceId,
      requester_name: name.trim(),
      requester_email: email.trim(),
      requester_phone: phone.trim() || null,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      duration_minutes: selected?.duration_minutes ?? null,
      notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("We couldn't submit that request. Please try again.");
      return;
    }
    setDone(true);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-2 font-serif text-3xl">Request a service</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Choose the engagement you'd like and we'll confirm a time by email.
        </p>

        {done ? (
          <Card>
            <CardContent className="flex items-start gap-3 py-8">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-amber-500" />
              <div>
                <p className="font-medium">Request received</p>
                <p className="text-sm text-muted-foreground">
                  Our team will follow up shortly to confirm your appointment.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Booking details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Service</Label>
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — {formatMoney(s.price, s.currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected?.description && <p className="text-xs text-muted-foreground">{selected.description}</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bk-name">Full name</Label>
                  <Input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bk-email">Email</Label>
                  <Input id="bk-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bk-phone">Phone (optional)</Label>
                  <Input id="bk-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bk-when">Preferred time (optional)</Label>
                  <Input
                    id="bk-when"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bk-notes">Anything we should know?</Label>
                <Textarea id="bk-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button className="w-full" onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit request
              </Button>
              <p className="text-xs text-muted-foreground">
                Please don't include financial account numbers or health information in this form.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
