-- ─────────────────────────────────────────────────────────────────────────────
-- Mnesti — Lifecycle Emails
--
-- Creates:
--   1. email_log              — tracks sent lifecycle emails (dedup)
--   2. get_no_exam_nudge_targets()  — users registered >24h ago with no exam
--   3. get_daily_reminder_targets() — users with upcoming exam not yet reminded today
--   4. pg_cron jobs           — schedule the two email types
--
-- Run in: Supabase Dashboard → SQL Editor
-- Requires: pg_cron and pg_net extensions enabled (Dashboard → Extensions)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Email log ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_log (
  id          bigserial    PRIMARY KEY,
  user_id     uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type  text         NOT NULL CHECK (email_type IN ('no_exam_nudge', 'daily_reminder')),
  sent_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_log_user_type ON public.email_log (user_id, email_type);
CREATE INDEX IF NOT EXISTS email_log_sent_at   ON public.email_log (sent_at);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- No direct access — only service_role via Edge Function
CREATE POLICY "deny_all_email_log" ON public.email_log
  AS RESTRICTIVE FOR ALL USING (false);


-- ── 2. No-exam nudge targets ──────────────────────────────────────────────────
-- Returns users who:
--   - registered more than 24 hours ago
--   - have confirmed their email
--   - have no rows in user_exams
--   - have never received a no_exam_nudge email

CREATE OR REPLACE FUNCTION public.get_no_exam_nudge_targets()
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE u.created_at          < now() - interval '24 hours'
    AND u.email_confirmed_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_exams e WHERE e.user_id = u.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.email_log l
      WHERE l.user_id = u.id AND l.email_type = 'no_exam_nudge'
    )
  LIMIT 100;
$$;


-- ── 3. Daily reminder targets ─────────────────────────────────────────────────
-- Returns users who:
--   - have at least one exam with exam_date >= today
--   - have not yet received a daily_reminder today
-- Returns the nearest upcoming exam per user.

CREATE OR REPLACE FUNCTION public.get_daily_reminder_targets()
RETURNS TABLE (
  user_id       uuid,
  email         text,
  exam_name     text,
  exam_date     date,
  days_remaining int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT DISTINCT ON (u.id)
    u.id,
    u.email::text,
    e.exam_name,
    e.exam_date,
    (e.exam_date - CURRENT_DATE)::int AS days_remaining
  FROM auth.users u
  JOIN public.user_exams e ON e.user_id = u.id
  WHERE e.exam_date             >= CURRENT_DATE
    AND u.email_confirmed_at    IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.email_log l
      WHERE l.user_id    = u.id
        AND l.email_type = 'daily_reminder'
        AND l.sent_at::date = CURRENT_DATE
    )
  ORDER BY u.id, e.exam_date ASC
  LIMIT 200;
$$;


-- ── Grant to service_role ─────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_no_exam_nudge_targets()   TO service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_reminder_targets()  TO service_role;


-- ── 4. pg_cron jobs ───────────────────────────────────────────────────────────
-- PREREQUISITI: abilitare le estensioni dalla Supabase Dashboard → Extensions:
--   • pg_cron
--   • pg_net
-- Poi eseguire il file: supabase/migrations/009b_cron_jobs.sql
-- ─────────────────────────────────────────────────────────────────────────────
