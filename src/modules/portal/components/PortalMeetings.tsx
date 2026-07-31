import { Calendar, Clock, MapPin, Video } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  meetings: any[];
}

export function PortalMeetings({ meetings }: Props) {
  if (!meetings.length) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
        <Calendar className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No upcoming meetings scheduled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {meetings.map((event: any) => {
        const start = event.start?.dateTime
          ? parseISO(event.start.dateTime)
          : event.start?.date
          ? parseISO(event.start.date)
          : null;
        const end = event.end?.dateTime ? parseISO(event.end.dateTime) : null;
        const isAllDay = !event.start?.dateTime;

        return (
          <div
            key={event.id}
            className="rounded-lg border border-border bg-card p-4 hover:border-accent/30 transition-colors"
          >
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
      })}
    </div>
  );
}
