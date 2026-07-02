import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Briefcase, Mail, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pro-portal-otp`;

const GoogleIcon = () => (
  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

export default function ProPortalLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const exchangingRef = useRef(false);

  // Already signed in? Bounce to portal.
  useEffect(() => {
    const t = localStorage.getItem("pro_portal_session");
    if (t) {
      navigate("/pro-portal", { replace: true });
      return;
    }

    // If a Supabase session exists (post-Google OAuth redirect), try exchanging it.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session && !exchangingRef.current) {
        await exchangeSupabaseSession(data.session.access_token);
      }
    })();
  }, [navigate]);

  async function exchangeSupabaseSession(accessToken: string) {
    if (exchangingRef.current) return;
    exchangingRef.current = true;
    setOauthLoading(true);
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "oauth_exchange" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Google sign-in failed");
      // Clear the Supabase session — pro portal uses its own token.
      await supabase.auth.signOut();
      localStorage.setItem("pro_portal_session", data.session_token);
      localStorage.setItem("pro_portal_expires", data.session_expires_at);
      localStorage.setItem("pro_portal_profile", JSON.stringify(data.professional));
      navigate("/pro-portal", { replace: true });
    } catch (e: any) {
      await supabase.auth.signOut().catch(() => {});
      toast.error(e.message || "Google sign-in failed");
    } finally {
      exchangingRef.current = false;
      setOauthLoading(false);
    }
  }

  async function signInWithGoogle() {
    setOauthLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/pro-portal/login`,
        extraParams: { prompt: "select_account" },
      });
      if (result.error) throw result.error;
      if (result.redirected) return; // browser will navigate to Google
      // Popup flow — session set by helper
      const { data } = await supabase.auth.getSession();
      if (data.session) await exchangeSupabaseSession(data.session.access_token);
    } catch (e: any) {
      toast.error(e.message || "Could not start Google sign-in");
      setOauthLoading(false);
    }
  }

  async function sendCode() {
    if (!email) return;
    setLoading(true);
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "send", email }),
      });
      if (!res.ok) throw new Error("Failed to request code");
      toast.success("If the email is registered, a code was sent.");
      setStep("code");
    } catch (e: any) {
      toast.error(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (!code) return;
    setLoading(true);
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "verify", email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      localStorage.setItem("pro_portal_session", data.session_token);
      localStorage.setItem("pro_portal_expires", data.session_expires_at);
      localStorage.setItem("pro_portal_profile", JSON.stringify(data.professional));
      navigate("/pro-portal", { replace: true });
    } catch (e: any) {
      toast.error(e.message || "Invalid or expired code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md border-slate-200">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-900 text-white flex items-center justify-center">
            <Briefcase className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-serif text-slate-900">Pro Portal</CardTitle>
          <CardDescription className="text-slate-600">
            Secure collaboration workspace for ProsperWise professional partners.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={signInWithGoogle}
            disabled={oauthLoading}
            variant="outline"
            className="w-full"
          >
            <GoogleIcon />
            {oauthLoading ? "Connecting…" : "Sign in with Google"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-500">or use email code</span>
            </div>
          </div>

          {step === "email" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2 text-slate-700">
                  <Mail className="h-3.5 w-3.5" /> Professional email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@firm.com"
                  onKeyDown={(e) => e.key === "Enter" && sendCode()}
                />
              </div>
              <Button onClick={sendCode} disabled={loading || !email} className="w-full">
                {loading ? "Sending..." : "Send access code"}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="code" className="flex items-center gap-2 text-slate-700">
                  <KeyRound className="h-3.5 w-3.5" /> One-time code
                </Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                />
                <p className="text-xs text-slate-500">Sent to {email}. Codes expire in 10 minutes.</p>
              </div>
              <Button onClick={verifyCode} disabled={loading || code.length !== 6} className="w-full">
                {loading ? "Verifying..." : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => { setStep("email"); setCode(""); }}
                className="text-xs text-slate-500 hover:text-slate-800 underline w-full text-center"
              >
                Use a different email
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
