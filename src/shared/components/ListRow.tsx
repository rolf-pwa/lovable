import * as React from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cn } from "@/shared/lib/utils";

const rowClasses = "flex items-center gap-4 border-b border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 last:border-0";

interface ListRowLinkProps extends Omit<LinkProps, "className"> {
  className?: string;
}

/** A single-line list row with no Card chrome (no border box/shadow per item) — just a divider and tight padding. */
export function ListRow({ to, className, ...props }: ListRowLinkProps) {
  return <Link to={to} className={cn(rowClasses, className)} {...props} />;
}

interface ListRowDivProps extends React.HTMLAttributes<HTMLDivElement> {}

/** Non-link variant, for rows that aren't a single navigation target. */
export function ListRowStatic({ className, ...props }: ListRowDivProps) {
  return <div className={cn(rowClasses, className)} {...props} />;
}
