import { useCallback, useEffect, useState } from "react";

const INTAKE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/intake-portal`;

export type WealthEventType =
  | "inheritance"
  | "divorce"
  | "retirement"
  | "business_exit"
  | "business_growth"
  | "other_sudden_wealth";

export interface OnboardingMemberInput {
  fullName: string;
  email?: string;
  relationship: "spouse" | "child" | "dependant" | "other";
  isMinor?: boolean;
}

export interface OnboardingState {
  household: {
    id?: string;
    label: string;
    address: string;
    step: number;
    auditBookedAt: string | null;
    profileCompletedAt: string | null;
    wealthEventType: WealthEventType | null;
    wealthEventNotes: string;
    wealthEventCompletedAt: string | null;
    onboardingCompletedAt: string | null;
    vaultReady: boolean;
  };
  contact: {
    id?: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
  };
  members: { id: string; fullName: string; email: string | null; role: string | null }[];
  booking: { id: string; schedulingUrl: string | null; serviceName: string | null } | null;
  wealthEventOptions: WealthEventType[];
}

async function call(portalToken: string, body: Record<string, unknown>) {
  const res = await fetch(INTAKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-portal-token": portalToken },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Something went wrong. Please try again.");
  return data;
}

/**
 * Drives the guided Sovereignty Audit onboarding (steps 1-3). Step 4 — the
 * document checklist — is owned by the intake manifest hook.
 */
export function useOnboarding(portalToken?: string) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!portalToken) return;
    try {
      setError(null);
      const data = await call(portalToken, { action: "onboarding" });
      setState(data as OnboardingState);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your onboarding");
    } finally {
      setLoading(false);
    }
  }, [portalToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(
    async (body: Record<string, unknown>) => {
      if (!portalToken) return false;
      setSaving(true);
      setError(null);
      try {
        const data = await call(portalToken, body);
        setState(data as OnboardingState);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to save");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [portalToken],
  );

  return {
    state,
    loading,
    saving,
    error,
    refresh,
    confirmAuditBooked: () => mutate({ action: "onboarding_audit_booked" }),
    saveProfile: (input: {
      householdName: string;
      address: string;
      phone?: string;
      email?: string;
      members: OnboardingMemberInput[];
    }) => mutate({ action: "onboarding_profile", ...input }),
    saveWealthEvent: (wealthEventType: WealthEventType, notes: string) =>
      mutate({ action: "onboarding_wealth_event", wealthEventType, notes }),
    markDocumentsComplete: () => mutate({ action: "onboarding_documents_complete" }),
  };
}
