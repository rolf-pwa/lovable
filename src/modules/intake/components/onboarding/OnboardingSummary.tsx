import { format } from "date-fns";
import { CalendarCheck, FileCheck2, Mail, MapPin, Phone, Sprout, Users } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { useOnboardingManifest } from "@/shared/hooks/useOnboardingManifest";
import type { OnboardingState } from "../../hooks/useOnboarding";
import { WEALTH_EVENT_LABELS } from "./StepWealthEvent";

interface Props {
  portalToken: string;
  state: OnboardingState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SummarySection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Read-only recap of everything the client provided during onboarding. */
export const OnboardingSummary = ({ portalToken, state, open, onOpenChange }: Props) => {
  const { manifest } = useOnboardingManifest(portalToken, { active: open });
  const { household, contact, members, booking } = state;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">Onboarding summary</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          <SummarySection icon={<Users className="h-3.5 w-3.5" />} title="Household">
            <div className="space-y-1.5 rounded-lg border border-border p-3">
              <p className="font-medium text-foreground">{household.label || "—"}</p>
              {household.address && (
                <p className="flex items-start gap-1.5 text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {household.address}
                </p>
              )}
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {contact.phone || "—"}
              </p>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {contact.email || "—"}
              </p>
            </div>
          </SummarySection>

          {members.length > 0 && (
            <SummarySection icon={<Users className="h-3.5 w-3.5" />} title="Household members">
              <div className="space-y-1.5">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <span className="text-foreground">{m.fullName}</span>
                    {m.role && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {m.role}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </SummarySection>
          )}

          {booking?.serviceName && (
            <SummarySection icon={<CalendarCheck className="h-3.5 w-3.5" />} title="Survey session">
              <div className="rounded-lg border border-border p-3">
                <p className="text-foreground">{booking.serviceName}</p>
                {household.auditBookedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Booked {format(new Date(household.auditBookedAt), "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </div>
            </SummarySection>
          )}

          {household.wealthEventType && (
            <SummarySection icon={<Sprout className="h-3.5 w-3.5" />} title="Wealth event">
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p className="font-medium text-foreground">
                  {WEALTH_EVENT_LABELS[household.wealthEventType] ?? household.wealthEventType}
                </p>
                {household.wealthEventNotes && (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {household.wealthEventNotes}
                  </p>
                )}
              </div>
            </SummarySection>
          )}

          <SummarySection icon={<FileCheck2 className="h-3.5 w-3.5" />} title="Documents">
            {manifest?.checklist?.length ? (
              <div className="space-y-1.5">
                {manifest.checklist.map((item, i) => (
                  <div
                    key={`${item.name}-${i}`}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <span className="text-foreground">{item.name}</span>
                    <Badge
                      variant={item.status === "filed" ? "default" : "outline"}
                      className="text-xs capitalize"
                    >
                      {(item.status ?? "waiting").replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-border p-3 text-muted-foreground">
                {manifest?.completion?.uploadedFiles ?? 0} document
                {manifest?.completion?.uploadedFiles === 1 ? "" : "s"} received.
              </p>
            )}
          </SummarySection>
        </div>
      </DialogContent>
    </Dialog>
  );
};
