import { Link, useLocation } from "react-router-dom";
import prosperwiseLogoColor from "@/assets/prosperwise-logo-color.png";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  ShieldCheck,
  ExternalLink,
  ClipboardCheck,
  ClipboardList,
  Calendar,
  Mail,
  FolderOpen,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  Megaphone,
  Cpu,
  TrendingUp,
  BookOpen,
  Anchor,
  PackagePlus,
  BarChart3,
  Crown,
  Inbox as InboxIcon,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// Context for sidebar collapsed state
const SidebarCollapseContext = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});

export function useSidebarCollapse() {
  return useContext(SidebarCollapseContext);
}

export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    return stored === "true";
  });

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <SidebarCollapseContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

const topItems = [
  { to: "/requests", label: "Client Requests", icon: ClipboardList, requestsBadge: true },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contacts", label: "CRM", icon: Users },
  { to: "/inbox", label: "Inbox", icon: InboxIcon, inboxBadge: true },
  { to: "/mail", label: "Mail", icon: Mail },
];

const marketingItems = [
  { to: "/marketing-updates", label: "Marketing Updates", icon: Megaphone },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const growthItems = [
  { to: "/pipeline", label: "Pipeline", icon: TrendingUp },
  { to: "/holding-tank", label: "Holding Tank", icon: Anchor },
];

const adminItems = [
  { to: "/onboarding", label: "Onboarding", icon: PackagePlus },
  { to: "/importers", label: "Bulk Importers", icon: Upload },
  { to: "/review-queue", label: "Review Queue", icon: ClipboardCheck, reviewBadge: true },
  { to: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { to: "/workbench", label: "Workbench", icon: Cpu },
  { to: "/admin/vfo", label: "VFO Roster", icon: Crown },
  { to: "/professionals", label: "Professionals", icon: Briefcase },
];

const externalLinks = [
  { href: "https://app.asana.com", label: "Asana", icon: CheckSquare },
  { href: "https://iaa.secureweb.inalco.com/MKMWPN23/home", label: "IA Financial", icon: ShieldCheck },
  { href: "https://calendar.google.com", label: "Google Calendar", icon: Calendar },
  { href: "https://mail.google.com", label: "Gmail", icon: Mail },
  { href: "https://drive.google.com", label: "Google Drive", icon: FolderOpen },
];

export function AppSidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const { collapsed, toggle } = useSidebarCollapse();
  const [pendingTasksCount, setPendingTasksCount] = useState<number | null>(null);
  const [pendingReviewCount, setPendingReviewCount] = useState<number | null>(null);
  const [openRequestsCount, setOpenRequestsCount] = useState<number | null>(null);
  const [inboxUnreadCount, setInboxUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await supabase.functions.invoke("asana-service", {
          body: { action: "getInbox" },
        });
        if (!res.error && res.data?.data) {
          const open = (res.data.data as any[]).filter((t: any) => !t.completed).length;
          setPendingTasksCount(open);
        }
      } catch {}
    })();

    (async () => {
      try {
        const { count } = await (supabase.from("review_queue" as any) as any)
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        setPendingReviewCount(count ?? 0);
      } catch {}
    })();

    (async () => {
      try {
        const { count } = await supabase
          .from("portal_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "in_progress"]);
        setOpenRequestsCount(count ?? 0);
      } catch {}
    })();

    const loadInboxUnread = async () => {
      try {
        const { data } = await supabase.functions.invoke("quo-service", {
          body: { action: "unreadCount" },
        });
        setInboxUnreadCount(data?.unread ?? 0);
      } catch {}
    };
    loadInboxUnread();

    const channel = supabase
      .channel("sidebar-quo-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "quo_messages" }, loadInboxUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "quo_calls" }, loadInboxUnread)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const getBadgeCount = (item: any) => {
    if (item.tasksBadge && pendingTasksCount !== null && pendingTasksCount > 0) return pendingTasksCount;
    if (item.reviewBadge && pendingReviewCount !== null && pendingReviewCount > 0) return pendingReviewCount;
    if (item.requestsBadge && openRequestsCount !== null && openRequestsCount > 0) return openRequestsCount;
    if (item.inboxBadge && inboxUnreadCount !== null && inboxUnreadCount > 0) return inboxUnreadCount;
    return null;
  };

  const renderNavLink = (to: string, label: string, Icon: any, badge: number | null, active: boolean, isCollapsed: boolean, nested = false) => {
    const linkContent = (
      <Link
        key={to}
        to={to}
        className={cn(
          "flex items-center gap-4 rounded-lg transition-colors",
          isCollapsed ? "justify-center px-3 py-3" : nested ? "px-5 py-2.5" : "px-5 py-4",
          nested ? "text-sm font-medium" : "text-[15px] font-medium",
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className={cn("shrink-0", nested ? "h-4 w-4" : "h-5 w-5")} />
        {!isCollapsed && label}
        {!isCollapsed && badge !== null && (
          <span
            className={cn(
              "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
              active
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-accent/25 text-accent border border-accent/30"
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={to}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {label}
            {badge !== null && ` (${badge})`}
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div key={to}>{linkContent}</div>;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col bg-background transition-all duration-200",
          collapsed ? "w-[68px]" : "w-72"
        )}
      >
        {/* Logo + Toggle */}
        <div className={cn("flex items-center justify-between pt-6 pb-2", collapsed ? "px-3" : "px-6")}>
          {!collapsed && <img src={prosperwiseLogoColor} alt="ProsperWise" className="h-10" />}
          <button
            onClick={toggle}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-2 pt-8 overflow-y-auto">
          {topItems.map(({ to, label, icon: Icon, ...rest }: any) => {
            const active = location.pathname === to || location.pathname.startsWith(to + "/");
            const badge = getBadgeCount({ ...rest });
            return renderNavLink(to, label, Icon, badge, active, collapsed);
          })}

          {/* Growth group: Pipeline, Leads, Holding Tank */}
          {collapsed ? (
            growthItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to || location.pathname.startsWith(to + "/");
              return renderNavLink(to, label, Icon, null, active, collapsed);
            })
          ) : (
            <Collapsible defaultOpen={growthItems.some(({ to }) => location.pathname === to || location.pathname.startsWith(to + "/"))}>
              <CollapsibleTrigger className="flex w-full items-center gap-4 rounded-lg px-5 py-3 text-[15px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <TrendingUp className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-left">Growth</span>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 pl-4">
                {growthItems.map(({ to, label, icon: Icon }) => {
                  const active = location.pathname === to || location.pathname.startsWith(to + "/");
                  return renderNavLink(to, label, Icon, null, active, false, true);
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Admin group: Onboarding, Review Queue, Knowledge Base, Workbench */}
          {collapsed ? (
            adminItems.map(({ to, label, icon: Icon, ...rest }: any) => {
              const active = location.pathname === to || location.pathname.startsWith(to + "/");
              const badge = getBadgeCount({ ...rest });
              return renderNavLink(to, label, Icon, badge, active, collapsed);
            })
          ) : (
            <Collapsible defaultOpen={adminItems.some(({ to }) => location.pathname === to || location.pathname.startsWith(to + "/"))}>
              <CollapsibleTrigger className="flex w-full items-center gap-4 rounded-lg px-5 py-3 text-[15px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <ShieldCheck className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-left">Admin</span>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 pl-4">
                {adminItems.map(({ to, label, icon: Icon, ...rest }: any) => {
                  const active = location.pathname === to || location.pathname.startsWith(to + "/");
                  const badge = getBadgeCount({ ...rest });
                  return renderNavLink(to, label, Icon, badge, active, false, true);
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Marketing group: Marketing Updates, Analytics */}
          {collapsed ? (
            marketingItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to || location.pathname.startsWith(to + "/");
              return renderNavLink(to, label, Icon, null, active, collapsed);
            })
          ) : (
            <Collapsible defaultOpen={marketingItems.some(({ to }) => location.pathname === to || location.pathname.startsWith(to + "/"))}>
              <CollapsibleTrigger className="flex w-full items-center gap-4 rounded-lg px-5 py-3 text-[15px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <Megaphone className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-left">Marketing</span>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 pl-4">
                {marketingItems.map(({ to, label, icon: Icon }) => {
                  const active = location.pathname === to || location.pathname.startsWith(to + "/");
                  return renderNavLink(to, label, Icon, null, active, false, true);
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          <Separator className="my-4 bg-border" />

          {collapsed ? (
            <div className="space-y-0.5">
              {externalLinks.map(({ href, label, icon: Icon }) => (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center rounded-lg px-3 py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          ) : (
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center gap-2 px-5 py-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                Integrations
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5">
                {externalLinks.map(({ href, label, icon: Icon }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 rounded-lg px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    <ExternalLink className="ml-auto h-3 w-3 opacity-30" />
                  </a>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
