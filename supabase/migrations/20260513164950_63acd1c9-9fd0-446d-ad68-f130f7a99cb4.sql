ALTER TABLE public.quo_calls
  ADD COLUMN IF NOT EXISTS is_voicemail boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voicemail_url text;

CREATE INDEX IF NOT EXISTS idx_quo_calls_voicemail
  ON public.quo_calls (occurred_at DESC)
  WHERE is_voicemail = true;