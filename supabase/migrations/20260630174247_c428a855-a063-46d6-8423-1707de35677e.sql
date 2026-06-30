
-- 1. Professionals directory
CREATE TABLE public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text NOT NULL,
  firm text,
  professional_type text NOT NULL CHECK (professional_type IN ('lawyer','accountant','insurance_broker','executor','poa','financial_planner','other')),
  credentials text,
  phone text,
  pro_portal_enabled boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX professionals_email_lower_idx ON public.professionals (lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage professionals" ON public.professionals
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER professionals_set_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Engagements
CREATE TABLE public.professional_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('family','household','contact')),
  scope_id uuid NOT NULL,
  pillar text NOT NULL CHECK (pillar IN ('tax','legal','insurance','estate','philanthropy','governance','other')),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','invited','active','completed','archived','revoked')),
  vault_share_link_id uuid REFERENCES public.vault_share_links(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engagements_pro_idx ON public.professional_engagements(professional_id);
CREATE INDEX engagements_scope_idx ON public.professional_engagements(scope_type, scope_id);
CREATE INDEX engagements_status_idx ON public.professional_engagements(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_engagements TO authenticated;
GRANT ALL ON public.professional_engagements TO service_role;
ALTER TABLE public.professional_engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage engagements" ON public.professional_engagements
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER engagements_set_updated_at
  BEFORE UPDATE ON public.professional_engagements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Engagement messages
CREATE TABLE public.engagement_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.professional_engagements(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('staff','pro','client','system')),
  sender_id uuid,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  read_by_staff_at timestamptz,
  read_by_pro_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engagement_messages_engagement_idx ON public.engagement_messages(engagement_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_messages TO authenticated;
GRANT ALL ON public.engagement_messages TO service_role;
ALTER TABLE public.engagement_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage engagement messages" ON public.engagement_messages
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Pro portal tokens
CREATE TABLE public.pro_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  otp_code_hash text,
  otp_expires_at timestamptz,
  session_expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  device_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pro_portal_tokens_pro_idx ON public.pro_portal_tokens(professional_id);
CREATE INDEX pro_portal_tokens_hash_idx ON public.pro_portal_tokens(token_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_portal_tokens TO authenticated;
GRANT ALL ON public.pro_portal_tokens TO service_role;
ALTER TABLE public.pro_portal_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view pro portal tokens" ON public.pro_portal_tokens
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
