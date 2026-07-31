import { supabase } from "@/shared/integrations/supabase/client";
import { lovable } from "@/shared/integrations/lovable/index";

const ALLOWED_DOMAIN = "prosperwise.ca";

export async function signInWithGoogle() {
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
    extraParams: {
      prompt: "select_account",
    },
  });
  return result;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export function isAllowedDomain(email: string | undefined): boolean {
  if (!email) return false;
  return email.endsWith(`@${ALLOWED_DOMAIN}`);
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
