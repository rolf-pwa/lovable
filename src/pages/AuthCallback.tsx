import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { isAllowedDomain } from "@/shared/lib/auth";

/**
 * Handles the OAuth callback at the root URL.
 * - @prosperwise.ca users → /dashboard
 * - Other Google users → /portal (with contact lookup)
 * - No auth hash → /dashboard (existing session) or /login
 */
const AuthCallback = () => {
  const [ready, setReady] = useState(false);
  const [destination, setDestination] = useState("/dashboard");
  const hasAuthHash = window.location.hash?.includes("access_token");

  useEffect(() => {
    // No auth hash — check for existing session
    if (!hasAuthHash) {
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email && !isAllowedDomain(session.user.email)) {
          // Non-staff user with existing session → route to portal
          try {
            const resp = await supabase.functions.invoke("portal-otp", {
              body: { action: "google-auth", email: session.user.email },
            });
            if (!resp.error && resp.data && !resp.data.error) {
              sessionStorage.setItem("portal_google_auth", JSON.stringify(resp.data));
              setDestination("/portal");
            } else {
              setDestination("/access-denied");
            }
          } catch {
            setDestination("/access-denied");
          }
        }
        setReady(true);
      })();
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          const email = session?.user?.email;
          if (isAllowedDomain(email)) {
            setDestination("/dashboard");
          } else if (email) {
            // Non-prosperwise user → portal client via Google
            // Look up their contact record by email
            try {
              const resp = await supabase.functions.invoke("portal-otp", {
                body: { action: "google-auth", email },
              });
              if (!resp.error && resp.data && !resp.data.error) {
                // Store portal session data in sessionStorage
                sessionStorage.setItem("portal_google_auth", JSON.stringify(resp.data));
                setDestination("/portal");
              } else {
                setDestination("/access-denied");
              }
            } catch {
              setDestination("/access-denied");
            }
          } else {
            setDestination("/access-denied");
          }
          setReady(true);
        }
      }
    );

    const timeout = setTimeout(() => setReady(true), 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [hasAuthHash]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="animate-pulse text-primary-foreground">Signing in...</div>
      </div>
    );
  }

  return <Navigate to={destination} replace />;
};

export default AuthCallback;
