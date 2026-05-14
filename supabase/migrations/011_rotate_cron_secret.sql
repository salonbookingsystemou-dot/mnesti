-- ─────────────────────────────────────────────────────────────────────────────
-- Mnesti — Rotate CRON_SECRET nei pg_cron job
--
-- Il vecchio secret era esposto in chiaro nel repository git.
-- Questa migrazione aggiorna i cron job con il nuovo secret.
--
-- IMPORTANTE: prima di eseguire questo SQL devi aggiornare il secret
-- CRON_SECRET nella Supabase Dashboard:
--   Dashboard → Edge Functions → Secrets → CRON_SECRET
--   Nuovo valore: a4bc9570d280f3be593756df46a4c09555739fe866fc99b43332e252a491c4f1
--
-- Eseguire in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Rimuovi i job esistenti con il vecchio secret
SELECT cron.unschedule('mnesti-daily-reminder') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mnesti-daily-reminder'
);
SELECT cron.unschedule('mnesti-no-exam-nudge') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mnesti-no-exam-nudge'
);

-- Ricrea con il nuovo secret
-- Daily reminder — ogni giorno alle 09:00 ora italiana (07:00 UTC)
SELECT cron.schedule(
  'mnesti-daily-reminder',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://olagntawajefdjrkkvcc.supabase.co/functions/v1/lifecycle-emails',
    headers := '{"Content-Type":"application/json","x-cron-secret":"a4bc9570d280f3be593756df46a4c09555739fe866fc99b43332e252a491c4f1"}',
    body    := '{"type":"daily_reminder"}'::jsonb
  ) AS request_id;
  $$
);

-- No-exam nudge — ogni ora al minuto :05
SELECT cron.schedule(
  'mnesti-no-exam-nudge',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://olagntawajefdjrkkvcc.supabase.co/functions/v1/lifecycle-emails',
    headers := '{"Content-Type":"application/json","x-cron-secret":"a4bc9570d280f3be593756df46a4c09555739fe866fc99b43332e252a491c4f1"}',
    body    := '{"type":"no_exam_nudge"}'::jsonb
  ) AS request_id;
  $$
);

-- Verifica
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'mnesti-%';
