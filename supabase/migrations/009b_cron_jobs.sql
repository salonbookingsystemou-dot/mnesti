-- ─────────────────────────────────────────────────────────────────────────────
-- Mnesti — pg_cron jobs per lifecycle emails
--
-- PREREQUISITI:
--   1. Abilitare pg_cron e pg_net da: Supabase Dashboard → Extensions
--   2. Impostare il secret CRON_SECRET in: Dashboard → Edge Functions → Secrets
--   3. Aver già eseguito 009_lifecycle_emails.sql
--
-- Eseguire in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Rimuovi job esistenti se presenti (idempotente)
SELECT cron.unschedule('mnesti-daily-reminder') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mnesti-daily-reminder'
);
SELECT cron.unschedule('mnesti-no-exam-nudge') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mnesti-no-exam-nudge'
);

-- Daily reminder — ogni giorno alle 09:00 ora italiana (07:00 UTC)
SELECT cron.schedule(
  'mnesti-daily-reminder',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://olagntawajefdjrkkvcc.supabase.co/functions/v1/lifecycle-emails',
    headers := '{"Content-Type":"application/json","x-cron-secret":"f464edbbbcac82fd9ffacdac89d86689dcf5406bacbb7552"}',
    body    := '{"type":"daily_reminder"}'::jsonb
  ) AS request_id;
  $$
);

-- No-exam nudge — ogni ora al minuto :05 (intercetta i nuovi iscritti)
SELECT cron.schedule(
  'mnesti-no-exam-nudge',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://olagntawajefdjrkkvcc.supabase.co/functions/v1/lifecycle-emails',
    headers := '{"Content-Type":"application/json","x-cron-secret":"f464edbbbcac82fd9ffacdac89d86689dcf5406bacbb7552"}',
    body    := '{"type":"no_exam_nudge"}'::jsonb
  ) AS request_id;
  $$
);

-- Verifica
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'mnesti-%';
