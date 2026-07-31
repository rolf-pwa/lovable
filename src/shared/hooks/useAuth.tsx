import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/shared/integrations/supabase/client";
import { isAllowedDomain } from "@/shared/lib/auth";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthorized: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAuthorized: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const hadSessionRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    console.log("[Auth] Init - hash:", window.location.hash?.substring(0, 50), "pathname:", window.location.pathname);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[Auth] onAuthStateChange:", event, "user:", session?.user?.email);

        // Clear any pending retry
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }

        if (session) {
          hadSessionRef.current = true;
          setSession(session);
          setUser(session.user);
          setLoading(false);
        } else if (event === "SIGNED_OUT") {
          // Explicit sign-out — clear immediately
          hadSessionRef.current = false;
          setSession(null);
          setUser(null);
          setLoading(false);
        } else if (hadSessionRef.current) {
          // We had a session but lost it (likely a token refresh failure).
          // Retry once before treating as logged out.
          console.log("[Auth] Session lost unexpectedly, retrying refresh...");
          retryTimerRef.current = setTimeout(async () => {
            const { data: { session: retried } } = await supabase.auth.getSession();
            if (retried) {
              console.log("[Auth] Retry succeeded:", retried.user?.email);
              setSession(retried);
              setUser(retried.user);
            } else {
              console.log("[Auth] Retry failed, signing out");
              hadSessionRef.current = false;
              setSession(null);
              setUser(null);
            }
          }, 2000);
        } else {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[Auth] getSession result:", session?.user?.email ?? "no session");
      if (session) hadSessionRef.current = true;
      setSession(prev => prev ?? session);
      setUser(prev => prev ?? session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const isAuthorized = isAllowedDomain(user?.email);

  return (
    <AuthContext.Provider value={{ user, session, loading, isAuthorized }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
