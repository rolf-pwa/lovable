import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Briefcase, Mail, KeyRound } from "lucide-react";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pro-portal-otp`;

export default function ProPortalLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Already signed in? Bounce to portal.
  useEffect(() => {
    const t = localStorage.getItem("pro_portal_session");
    if (t) navigate("/pro-portal", { replace: true });
  }, [navigate]);

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
