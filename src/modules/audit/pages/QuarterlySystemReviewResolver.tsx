import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/shared/integrations/supabase/client";
import { toast } from "sonner";

export default function QuarterlySystemReviewResolver() {
  const { contactId } = useParams<{ contactId?: string }>();
  const navigate = useNavigate();

  const isFreshGeneration = (updatedAt?: string | null) => {
    if (!updatedAt) return false;
    const updatedTime = new Date(updatedAt).getTime();
    if (Number.isNaN(updatedTime)) return false;
    return Date.now() - updatedTime < 45_000;
  };

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      try {
        if (!contactId) throw new Error("Missing contact");

        const { data: existing } = await supabase
          .from("quarterly_system_reviews")
          .select("id, generation_status, updated_at")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const hasFreshInFlightReview = existing?.id && ["generating", "pending"].includes(existing.generation_status) && isFreshGeneration(existing.updated_at);

        if (!cancelled && existing?.id && !["generating", "pending", "failed"].includes(existing.generation_status)) {
          navigate(`/quarterly-system-review/${existing.id}`, { replace: true });
          return;
        }

        if (!cancelled && hasFreshInFlightReview) {
          navigate(`/quarterly-system-review/${existing.id}`, { replace: true });
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quarterly-system-review-generate`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(existing?.id ? { reviewId: existing.id } : { contactId }),
        });
        const data = await res.json();
        if (!res.ok || !data.reviewId) throw new Error(data.error || "Failed to create quarterly review");
        if (!cancelled) navigate(`/quarterly-system-review/${data.reviewId}`, { replace: true });
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to open quarterly review");
          navigate(-1);
        }
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [contactId, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Opening Quarterly System Review…</p>
      </div>
    </div>
  );
}
