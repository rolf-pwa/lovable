import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/shared/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";

const ContactSchema = z.object({
  fullName: z.string().trim().min(1, "Name required").max(160),
  email: z.string().trim().email("Valid email required").max(255),
});

interface ToeForm {
  id: string;
  name: string;
  widget_url: string;
}

/**
 * /pay/:slug — sends the visitor straight to Square's hosted checkout so they
 * only enter their details once (on Square). No login, no in-app form.
 *
 * If a Terms of Engagement form is registered (adobe_webforms.is_toe_gate),
 * a name/email/agree step is shown first — a first-party clickwrap, not an
 * embedded Adobe signature: Adobe's own redirect-after-completion setting
 * is account/group-wide, not per web form, so gating on a completed
 * signature wasn't reliable. If no ToE is registered, behavior is unchanged
 * from before — straight to checkout.
 */
export default function QuickPay() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const started = useRef(false);

  const handle = slug || searchParams.get("service") || "";

  const [gateChecked, setGateChecked] = useState(false);
  const [toeForm, setToeForm] = useState<ToeForm | null>(null);
  const [toeAccepted, setToeAccepted] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submittingToe, setSubmittingToe] = useState(false);
  const [toeError, setToeError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Secure checkout | ProsperWise";
  }, []);

  useEffect(() => {
    (supabase.from("adobe_webforms" as any) as any)
      .select("id, name, widget_url")
      .eq("is_toe_gate", true)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }: any) => {
        setToeForm(data ?? null);
        setGateChecked(true);
      });
  }, []);

  const proceedToCheckout = gateChecked && (!toeForm || toeAccepted);

  useEffect(() => {
    if (!proceedToCheckout || started.current) return;
    started.current = true;

    (async () => {
      if (!handle) {
        setError("This payment link is missing a service.");
        return;
      }
      const { data, error: fnError } = await supabase.functions.invoke("book-checkout", {
        body: {
          action: "createCheckout",
          quick: true,
          serviceSlug: handle,
          returnUrl: `${window.location.origin}/book/confirm`,
        },
      });
      const result: any = data;
      if (fnError || !result?.ok || !result?.checkoutUrl) {
        setError(result?.error || "We couldn't open the secure checkout. Please try again.");
        return;
      }
      setCheckoutUrl(result.checkoutUrl);
      window.location.replace(result.checkoutUrl);
    })();
  }, [proceedToCheckout, handle]);

  const submitToe = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setToeError(null);
    const parsed = ContactSchema.safeParse({ fullName, email });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) {
        if (v && v[0]) errs[k] = v[0];
      }
      setErrors(errs);
      return;
    }
    if (!agreed) {
      setToeError("Please confirm you agree to the Terms of Engagement.");
      return;
    }
    setSubmittingToe(true);
    const { error: insertErr } = await supabase.from("toe_acceptances" as any).insert({
      pay_slug: handle,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      webform_id: toeForm?.id ?? null,
    } as any);
    setSubmittingToe(false);
    if (insertErr) {
      setToeError("Something went wrong. Please try again.");
      return;
    }
    setToeAccepted(true);
  };

  if (!gateChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </main>
    );
  }

  if (toeForm && !toeAccepted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Before we begin</CardTitle>
            <p className="text-sm text-muted-foreground">A few details, then you'll continue to payment.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitToe} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="toe-name">Full name</Label>
                <Input
                  id="toe-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  maxLength={160}
                />
                {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="toe-email">Email</Label>
                <Input
                  id="toe-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  maxLength={255}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <a
                href={toeForm.widget_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                View {toeForm.name}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>

              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
                <span>I have reviewed and agree to the Terms of Engagement.</span>
              </label>

              {toeError && <p className="text-sm text-destructive">{toeError}</p>}

              <Button type="submit" size="lg" className="w-full" disabled={submittingToe}>
                {submittingToe && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue to Payment
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        {error ? (
          <>
            <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" />
            <p className="font-medium">{error}</p>
            <Button asChild variant="outline" className="mt-4">
              <a href={handle ? `/book/${handle}` : "/book"}>Use the booking form instead</a>
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-accent" />
            <p className="font-medium">Opening secure checkout…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              You'll enter your details once on Square's payment page, then pick your time.
            </p>
            {checkoutUrl && (
              <Button asChild variant="outline" className="mt-4">
                <a href={checkoutUrl}>Continue to payment</a>
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
