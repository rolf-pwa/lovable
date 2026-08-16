import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
 * /toe/:slug — shown before payment: a simple name/email/agree-to-terms
 * step, not an embedded Adobe signature. Adobe's redirect-after-completion
 * setting turned out to be account/group-wide, not per web form, so it
 * can't reliably tell two different ToE forms apart — this sidesteps that
 * entirely. The acceptance itself is recorded in toe_acceptances; the
 * actual document lives in Adobe and is just linked for review.
 */
export default function TermsOfEngagement() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<ToeForm | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Terms of Engagement | ProsperWise";
    if (!slug) {
      setNotConfigured(true);
      setLoading(false);
      return;
    }
    (supabase.from("adobe_webforms" as any) as any)
      .select("id, name, widget_url")
      .eq("toe_gate_slug", slug)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) setForm(data as ToeForm);
        else setNotConfigured(true);
        setLoading(false);
      });
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);
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
      setSubmitError("Please confirm you agree to the Terms of Engagement.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("toe_acceptances" as any).insert({
      pay_slug: slug,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      webform_id: form?.id ?? null,
    } as any);
    setSubmitting(false);
    if (error) {
      setSubmitError("Something went wrong. Please try again.");
      return;
    }
    navigate(`/pay/${slug}`);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </main>
    );
  }

  if (notConfigured || !form) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" />
          <p className="font-medium">This page isn't set up yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Please contact ProsperWise to continue.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Before we begin</CardTitle>
          <p className="text-sm text-muted-foreground">
            A few details, then you'll continue to payment.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
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
              href={form.widget_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              View {form.name}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
              <span>I have reviewed and agree to the Terms of Engagement.</span>
            </label>

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue to Payment
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
