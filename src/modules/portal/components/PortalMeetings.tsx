import { Calendar, Clock, MapPin, Video } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  meetings: any[];
}

function eventEnd(event: any): Date | null {
  if (event.end?.dateTime) return parseISO(event.end.dateTime);
  if (event.end?.date) return parseISO(event.end.date);
  if (event.start?.dateTime) return parseISO(event.start.dateTime);
  if (event.start?.date) return parseISO(event.start.date);
  return null;
}

function eventStart(event: any): Date | null {
  if (event.start?.dateTime) return parseISO(event.start.dateTime);
  if (event.start?.date) return parseISO(event.start.date);
  return null;
}

function MeetingCard({ event }: { event: any }) {
  const start = eventStart(event);
  const end = event.end?.dateTime ? parseISO(event.end.dateTime) : null;
  const isAllDay = !event.start?.dateTime;

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">
            {event.summary || "Untitled Event"}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {start
                ? isAllDay
                  ? format(start, "MMM d, yyyy")
                  : `${format(start, "MMM d · h:mm a")}${end ? ` – ${format(end, "h:mm a")}` : ""}`
                : "TBD"}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
            {event.hangoutLink && (
              <a
                href={event.hangoutLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-accent hover:underline"
              >
                <Video className="h-3 w-3" />
                Join Meeting
              </a>
            )}
          </div>
        </div>
        {event.status === "confirmed" && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/20">
            Confirmed
          </span>
        )}
      </div>
    </div>
  );
}

export function PortalMeetings({ meetings }: Props) {
  if (!meetings.length) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
        <Calendar className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No meetings scheduled.</p>
      </div>
    );
  }

  const now = new Date();
  const upcoming = meetings
    .filter((e) => { const end = eventEnd(e); return !end || end >= now; })
    .sort((a, b) => (eventStart(a)?.getTime() ?? 0) - (eventStart(b)?.getTime() ?? 0));
  const past = meetings
    .filter((e) => { const end = eventEnd(e); return end && end < now; })
    .sort((a, b) => (eventStart(b)?.getTime() ?? 0) - (eventStart(a)?.getTime() ?? 0));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming meetings scheduled.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((event: any) => <MeetingCard key={event.id} event={event} />)}
          </div>
        )}
      </div>
      {past.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Past</h3>
          <div className="space-y-3 opacity-75">
            {past.map((event: any) => <MeetingCard key={event.id} event={event} />)}
          </div>
        </div>
      )}
    </div>
  );
}
