import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import prosperwiseLogo from "@/assets/prosperwise-logo.png";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const FN_OTP = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pro-portal-otp`;
const APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Stat { label: string; value: string | number }

interface Props {
  firmTitle: string;
  subtitle: string;
  crumbs?: { label: string; to?: string }[];
  stats?: Stat[];
  children: React.ReactNode;
}

export default function ProPortalShell({ firmTitle, subtitle, crumbs, stats, children }: Props) {
  const navigate = useNavigate();
  const idleTimer = useRef<number | null>(null);
  const session = typeof window !== "undefined" ? localStorage.getItem("pro_portal_session") : null;

  const logout = useCallback(async () => {
    try {
      await fetch(FN_OTP, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: APIKEY },
        body: JSON.stringify({ action: "logout", session_token: session }),
      });
    } catch {/* noop */}
    localStorage.removeItem("pro_portal_session");
    localStorage.removeItem("pro_portal_expires");
    localStorage.removeItem("pro_portal_profile");
    navigate("/pro-portal/login", { replace: true });
  }, [navigate, session]);

  useEffect(() => {
    if (!session) { navigate("/pro-portal/login", { replace: true }); return; }
    const reset = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        toast("Signed out due to inactivity");
        logout();
      }, 5 * 60 * 1000);
    };
    const events = ["mousemove", "keydown", "click", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [logout, session, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-primary-foreground/10 bg-primary">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <img src={prosperwiseLogo} alt="" className="h-10 w-10 opacity-90" />
              <div className="min-w-0">
                <h1 className="font-serif text-2xl md:text-3xl text-primary-foreground leading-tight truncate">
                  {firmTitle}
                </h1>
                <p className="text-sm text-primary-foreground/70 mt-1">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-6 border-l border-primary-foreground/15 pl-6">
              {(stats || []).map((s, i) => (
                <div key={i} className={i > 1 ? "hidden md:block" : i > 0 ? "hidden sm:block" : ""}>
                  <p className="text-[10px] uppercase tracking-wider text-primary-foreground/60">{s.label}</p>
                  <p className="font-serif text-2xl text-primary-foreground">{s.value}</p>
                </div>
              ))}
              <button
                onClick={logout}
                className="ml-2 inline-flex items-center gap-1.5 text-xs text-primary-foreground/70 hover:text-primary-foreground transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </div>
          <div className="mt-6 h-px bg-gradient-to-r from-transparent via-primary-foreground/30 to-transparent" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {crumbs && crumbs.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-6">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {c.to ? (
                  <button onClick={() => navigate(c.to!)} className="hover:text-foreground transition-colors">
                    {c.label}
                  </button>
                ) : (
                  <span className="text-foreground/80">{c.label}</span>
                )}
                {i < crumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </div>
        )}
        {children}
        <div className="text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60 pt-12 pb-2">
          ProsperWise · Private Family Office
        </div>
      </main>
    </div>
  );
}

export const proFetch = (bodyObj: any) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "x-pro-session": localStorage.getItem("pro_portal_session") || "",
  },
  body: JSON.stringify(bodyObj),
});

export const FN = {
  workspace: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pro-portal-workspace`,
  tasks: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pro-portal-tasks`,
};
