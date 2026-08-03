import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/shared/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";

/**
 * /pay/:slug — sends the visitor straight to Square's hosted checkout so they
 * only enter their details once (on Square). No login, no in-app form.
 */
export default function QuickPay() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const started = useRef(false);

  const handle = slug || searchParams.get("service") || "";

  useEffect(() => {
    document.title = "Secure checkout | ProsperWise";
    if (started.current) return;
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
  }, [handle]);

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
