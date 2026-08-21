-- Cache the shared item's Drive display name at link-creation time, so
-- staff-facing lists (e.g. the Pros tab's engagement rows) can show what
-- was actually shared without a live Drive lookup per row.
ALTER TABLE public.vault_share_links
  ADD COLUMN IF NOT EXISTS name TEXT;
