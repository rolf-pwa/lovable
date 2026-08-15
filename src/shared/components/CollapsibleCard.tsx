import { useState, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CollapsibleCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBgClassName?: string;
  iconColorClassName?: string;
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

/**
 * Generic collapsible summary card — click the header to toggle. Matches the
 * "click-header, chevron toggle" pattern already used by PortalHoldingTank/
 * PortalTerritory on the client portal, so staff-side cards (Vineyard,
 * Storehouses, Insurance, etc.) look and behave the same way.
 */
export function CollapsibleCard({
  icon: Icon,
  iconBgClassName = "bg-primary/10",
  iconColorClassName = "text-primary",
  title,
  subtitle,
  headerRight,
  defaultCollapsed = true,
  className,
  contentClassName = "space-y-4",
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(!defaultCollapsed);

  return (
    <Card className={className}>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBgClassName}`}>
            <Icon className={`h-5 w-5 ${iconColorClassName}`} />
          </div>
          <div>
            <CardTitle className="text-lg font-serif">{title}</CardTitle>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {headerRight && (
              <div onClick={(e) => e.stopPropagation()}>{headerRight}</div>
            )}
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      {open && <CardContent className={contentClassName}>{children}</CardContent>}
    </Card>
  );
}
