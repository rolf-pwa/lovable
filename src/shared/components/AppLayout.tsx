import { AppSidebar, SidebarCollapseProvider } from "./AppSidebar";
import { AssistantSidebar } from "@/shared/components/AssistantSidebar";
import { DashboardSidebar } from "./DashboardSidebar";
import { useAuth } from "@/shared/hooks/useAuth";
import { signOut } from "@/shared/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { LogOut } from "lucide-react";
import { format } from "date-fns";
import { NotificationBell } from "@/shared/components/NotificationBell";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const today = format(new Date(), "EEEE, MMMM d, yyyy");

  return (
    <SidebarCollapseProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-3">
            <div className="flex items-center gap-6 min-w-0 flex-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground shrink-0">
                {today}
              </span>
              <div className="min-w-0 flex-1">
                <DashboardSidebar />
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <NotificationBell />
              <div className="h-6 w-px bg-border" />
              <Avatar className="h-8 w-8 border border-border">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                  {user?.email?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block overflow-hidden">
                <p className="truncate text-xs font-medium text-foreground">
                  {user?.user_metadata?.full_name || user?.email}
                </p>
              </div>
              <button
                onClick={() => signOut()}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>


          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
          </main>
        </div>
        <AssistantSidebar />
      </div>
    </SidebarCollapseProvider>
  );
}
