-- Dedup guard for the Quarterly VFO Audit (Intercompany/Shareholder Loan
-- Audit), mirroring households.retention_flagged_at's exact role for
-- retention-review: lets quarterly-vfo-audit-generate re-run (cron or
-- manual) without re-notifying staff about a loan it already flagged
-- recently.

ALTER TABLE public.liabilities
  ADD COLUMN last_audit_flagged_at TIMESTAMP WITH TIME ZONE;
