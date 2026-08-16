import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const TOE_REDIRECT_SLUG_KEY = "toe_redirect_slug";

/**
 * /toe/complete — the fixed target configured as the Web Form's "redirect
 * after completion" URL in Adobe. Forwards on to the /pay/:slug the visitor
 * started from (stashed by TermsOfEngagement.tsx), or /pay if that's missing
 * — QuickPay already handles a missing slug gracefully.
 */
export default function TermsOfEngagementComplete() {
  useEffect(() => {
    document.title = "Thank you | ProsperWise";
    const slug = sessionStorage.getItem(TOE_REDIRECT_SLUG_KEY);
    sessionStorage.removeItem(TOE_REDIRECT_SLUG_KEY);
    window.location.replace(slug ? `/pay/${slug}` : "/pay");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-accent" />
        <p className="font-medium">Thank you — continuing to payment…</p>
      </div>
    </main>
  );
}
