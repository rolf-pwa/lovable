import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { AlertCircle, Loader2 } from "lucide-react";

const TOE_REDIRECT_SLUG_KEY = "toe_redirect_slug";

/**
 * /toe/:slug — shown before payment: the visitor signs the Terms of
 * Engagement matching this slug (e.g. a separate Personal vs Corporate
 * engagement letter), then Adobe's own "redirect after completion" setting
 * (configured on the Web Form itself, not in this app) sends them to
 * /toe/complete, which reads the slug stashed here and forwards them on to
 * /pay/:slug. Nothing about /pay/:slug itself changes.
 */
export default function TermsOfEngagement() {
  const { slug } = useParams<{ slug?: string }>();
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Terms of Engagement | ProsperWise";
    if (!slug) {
      setNotConfigured(true);
      setLoading(false);
      return;
    }
    sessionStorage.setItem(TOE_REDIRECT_SLUG_KEY, slug);

    (supabase.from("adobe_webforms" as any) as any)
      .select("widget_url")
      .eq("toe_gate_slug", slug)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.widget_url) {
          const separator = String(data.widget_url).includes("?") ? "&" : "?";
          setWidgetUrl(`${data.widget_url}${separator}hosted=false`);
        } else {
          setNotConfigured(true);
        }
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </main>
    );
  }

  if (notConfigured || !widgetUrl) {
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
    <main className="flex min-h-screen flex-col bg-background">
      <div className="border-b border-border bg-card px-4 py-4 text-center">
        <h1 className="font-serif text-lg font-semibold text-foreground">Terms of Engagement</h1>
        <p className="text-sm text-muted-foreground">
          Please review and sign below — you'll continue to payment once it's complete.
        </p>
      </div>
      <iframe title="Terms of Engagement" src={widgetUrl} className="flex-1 w-full border-0" />
    </main>
  );
}
