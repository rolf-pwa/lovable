import { useMemo } from "react";
import { useCalendarEvents } from "@/shared/hooks/useGoogle";
import { useGoogleStatus } from "@/shared/hooks/useGoogle";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Calendar, MapPin, Video } from "lucide-react";
import { format } from "date-fns";

interface ContactCalendarProps {
  contactEmail: string | null;
  contactName?: string;
}

export function ContactCalendar({ contactEmail, contactName }: ContactCalendarProps) {
  const appointmentParams = new URLSearchParams();
  if (contactName) appointmentParams.set("name", contactName);
  if (contactEmail) appointmentParams.set("email", contactEmail);
  const qs = appointmentParams.toString() ? `?${appointmentParams.toString()}` : "";
  const { data: status } = useGoogleStatus();
  const { now, sixMonthsOut } = useMemo(() => ({
    now: new Date().toISOString(),
    sixMonthsOut: new Date(Date.now() + 180 * 86400000).toISOString(),
  }), []);
  const { data, isLoading, error } = useCalendarEvents(now, sixMonthsOut, status?.connected);

  if (!contactEmail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Upcoming Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No email address on file.</p>
        </CardContent>
      </Card>
    );
  }

  if (!status?.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Upcoming Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect Google on the Dashboard to see events.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Filter events where the contact is an attendee
  const contactEvents = (data?.items || []).filter((event: any) => {
    const email = contactEmail.toLowerCase();
    const attendees = event.attendees || [];
    const isAttendee = attendees.some(
      (a: any) => a.email?.toLowerCase() === email
    );
    const isOrganizer = event.organizer?.email?.toLowerCase() === email;
    const isCreator = event.creator?.email?.toLowerCase() === email;
    return isAttendee || isOrganizer || isCreator;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4" />
          Upcoming Events
        </CardTitle>
        <div className="flex items-center gap-1">
          <a
            href={`https://calendar.app.google/Xq8tAmJBkmGExrRD8${qs}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="sm" className="gap-1">
              <MapPin className="h-3 w-3" />
              In Person
            </Button>
          </a>
          <a
            href={`https://calendar.app.google/uKiwTrDfYH2pJV4V7${qs}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="sm" className="gap-1">
              <Video className="h-3 w-3" />
              Video
            </Button>
          </a>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground animate-pulse">Loading events...</p>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load events.</p>
        ) : !contactEvents.length ? (
          <p className="text-sm text-muted-foreground">No upcoming events with this contact.</p>
        ) : (
          <ul className="space-y-3">
            {contactEvents.slice(0, 10).map((event: any) => {
              const start = event.start?.dateTime || event.start?.date;
              const parsedStart = start ? new Date(start) : null;
              return (
                <li key={event.id}>
                  <a
                    href={event.htmlLink || `https://calendar.google.com/calendar/r/day/${parsedStart ? format(parsedStart, "yyyy/MM/dd") : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 rounded-md border-b border-border/50 pb-3 last:border-0 last:pb-0 transition-colors hover:bg-muted/50 -mx-1 px-1"
                  >
                    {parsedStart && !isNaN(parsedStart.getTime()) && (
                      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 text-primary">
                        <span className="text-[10px] font-medium uppercase leading-none">
                          {format(parsedStart, "MMM")}
                        </span>
                        <span className="text-sm font-bold leading-tight">
                          {format(parsedStart, "d")}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {event.summary || "(No title)"}
                      </p>
                      {parsedStart && !isNaN(parsedStart.getTime()) && (
                        <p className="text-xs text-muted-foreground">
                          {format(parsedStart, "EEEE, MMM d · h:mm a")}
                        </p>
                      )}
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
