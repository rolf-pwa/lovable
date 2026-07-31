import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/shared/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Resolves /stabilization-map/lead/:leadId or /stabilization-map/contact/:contactId
 * into an actual map id, then redirects to /stabilization-map/:id.
 */
export default function StabilizationMapResolver() {
  const { leadId, contactId } = useParams<{ leadId?: string; contactId?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      try {
        // 1. Try to find an existing map
        let query = supabase
          .from("stabilization_maps" as any)
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1);

        if (leadId) query = query.eq("lead_id", leadId);
        else if (contactId) query = query.eq("contact_id", contactId);
        else throw new Error("Missing lead or contact");

        const { data: existing } = await query.maybeSingle();

        if (!cancelled && (existing as any)?.id) {
          navigate(`/stabilization-map/${(existing as any).id}`, { replace: true });
          return;
        }

        // 2. No existing map — call the edge function to create one
        const { data: { session } } = await supabase.auth.getSession();
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stabilization-map-generate`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(leadId ? { leadId } : { contactId }),
        });
        const data = await res.json();
        if (!res.ok || !data.mapId) throw new Error(data.error || "Failed to create map");
        if (!cancelled) navigate(`/stabilization-map/${data.mapId}`, { replace: true });
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to open Stabilization Map");
          navigate(-1);
        }
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [leadId, contactId, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Opening Stabilization Map…</p>
      </div>
    </div>
  );
}
