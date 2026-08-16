-- Registry of Adobe Sign Web Forms so staff can add a new prefillable
-- carrier form (or any other Web Form) without an engineering change per
-- form. Each field's "source" says where its prefilled value comes from —
-- a known CRM field (matched to the current account/contact context in the
-- CRM) or "manual" (entered fresh by staff each time, e.g. a transaction
-- amount that was never a stored value to begin with).
CREATE TABLE public.adobe_webforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  widget_url TEXT NOT NULL,
  -- Matched against holding_tank/vineyard_accounts.custodian to decide which
  -- account rows show this form's button. NULL = show on every account.
  custodian TEXT,
  -- [{ field_name, label, source: 'account_number' | 'contact_name' | 'manual',
  --    input_type: 'text' | 'textarea', required: boolean }, ...]
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_adobe_webforms_custodian ON public.adobe_webforms(custodian) WHERE is_active;

ALTER TABLE public.adobe_webforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage Web Forms"
ON public.adobe_webforms FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_adobe_webforms_updated_at
BEFORE UPDATE ON public.adobe_webforms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the IA Withdrawal Form — already built and verified end-to-end
-- against a real account before this registry existed. Migrating it in so
-- nothing regresses once the hardcoded version is removed.
INSERT INTO public.adobe_webforms (name, widget_url, custodian, fields)
VALUES (
  'IA Withdrawal Form',
  'https://prosperwise.na4.documents.adobe.com/public/esignWidget?wid=CBFCIBAA3AAABLblqZhA-rQfvflfU7V1uxlWm0gZfBijBy6rDmt1BH-HPz5vo7bqKTKMEyuTEKWx1twhuB9M*',
  'iA Financial Group',
  '[
    {"field_name": "Account", "label": "Account", "source": "account_number", "input_type": "text", "required": true},
    {"field_name": "Name", "label": "Name", "source": "contact_name", "input_type": "text", "required": true},
    {"field_name": "Amount", "label": "Amount", "source": "manual", "input_type": "text", "required": true},
    {"field_name": "Fund", "label": "Fund", "source": "manual", "input_type": "text", "required": false},
    {"field_name": "Instructions", "label": "Special instructions", "source": "manual", "input_type": "textarea", "required": false}
  ]'::jsonb
);
