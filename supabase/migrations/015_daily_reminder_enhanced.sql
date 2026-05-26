-- ─────────────────────────────────────────────────────────────────────────────
-- Mnesti — Daily Reminder Enhancement
--
-- Extends get_daily_reminder_targets() to return:
--   week_topics   text[]  — study/review day titles for the current ISO week
--   next_question text    — first unanswered open question from available days
--   next_day_title text   — day title for the question above
--
-- Source data: user_data.psico_ai_plan (plan) and user_data.psico_state (progress)
-- Both are JSONB columns populated by the client via _syncToSupabase().
-- Only plans that use proper ISO date fields (AI-generated) produce data here;
-- legacy hardcoded plans (no date per day) gracefully return NULL for all fields.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_daily_reminder_targets()
RETURNS TABLE (
  user_id        uuid,
  email          text,
  exam_name      text,
  exam_date      date,
  days_remaining int,
  week_topics    text[],
  next_question  text,
  next_day_title text
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
    (e.exam_date - CURRENT_DATE)::int AS days_remaining,

    -- Argomenti della settimana corrente (lunedì–domenica ISO)
    -- Tutti i giorni di tipo studio/revisione nel piano con date nella settimana.
    (
      SELECT COALESCE(
        array_agg(day_exp.d->>'title' ORDER BY (day_exp.d->>'date')::date),
        ARRAY[]::text[]
      )
      FROM public.user_data ud,
           jsonb_array_elements(ud.psico_ai_plan->'days') AS day_exp(d)
      WHERE ud.user_id = u.id
        AND ud.psico_ai_plan IS NOT NULL
        AND day_exp.d->>'date' IS NOT NULL
        AND (day_exp.d->>'date')::date
            BETWEEN date_trunc('week', CURRENT_DATE)::date
                AND date_trunc('week', CURRENT_DATE)::date + 6
        AND day_exp.d->>'type' IN ('studio', 'revisione')
        AND day_exp.d->>'title' IS NOT NULL
        AND day_exp.d->>'title' <> ''
    ) AS week_topics,

    -- Prima domanda non ancora risposta dalla prima data disponibile
    -- (data <= oggi, giorno non completato/saltato, domanda senza feedback)
    (
      SELECT q_exp.q->>'text'
      FROM public.user_data ud,
           jsonb_array_elements(ud.psico_ai_plan->'days') AS day_exp(d),
           jsonb_array_elements(day_exp.d->'questions') WITH ORDINALITY AS q_exp(q, qidx)
      WHERE ud.user_id = u.id
        AND ud.psico_ai_plan IS NOT NULL
        AND day_exp.d->>'date' IS NOT NULL
        AND (day_exp.d->>'date')::date <= CURRENT_DATE
        AND day_exp.d->>'type' IN ('studio', 'revisione')
        AND NOT (
          ud.psico_state IS NOT NULL
          AND ud.psico_state ? (day_exp.d->>'id')
          AND (ud.psico_state->(day_exp.d->>'id'))->>'status' IN ('done', 'skip')
        )
        AND NOT (
          ud.psico_state IS NOT NULL
          AND ud.psico_state ? (day_exp.d->>'id')
          AND (ud.psico_state->(day_exp.d->>'id'))->'feedbacks' ? ((q_exp.qidx - 1)::text)
        )
      ORDER BY (day_exp.d->>'date')::date ASC, q_exp.qidx ASC
      LIMIT 1
    ) AS next_question,

    -- Titolo del giorno contenente la domanda sopra (stessa logica, stesso ordine)
    (
      SELECT day_exp.d->>'title'
      FROM public.user_data ud,
           jsonb_array_elements(ud.psico_ai_plan->'days') AS day_exp(d),
           jsonb_array_elements(day_exp.d->'questions') WITH ORDINALITY AS q_exp(q, qidx)
      WHERE ud.user_id = u.id
        AND ud.psico_ai_plan IS NOT NULL
        AND day_exp.d->>'date' IS NOT NULL
        AND (day_exp.d->>'date')::date <= CURRENT_DATE
        AND day_exp.d->>'type' IN ('studio', 'revisione')
        AND NOT (
          ud.psico_state IS NOT NULL
          AND ud.psico_state ? (day_exp.d->>'id')
          AND (ud.psico_state->(day_exp.d->>'id'))->>'status' IN ('done', 'skip')
        )
        AND NOT (
          ud.psico_state IS NOT NULL
          AND ud.psico_state ? (day_exp.d->>'id')
          AND (ud.psico_state->(day_exp.d->>'id'))->'feedbacks' ? ((q_exp.qidx - 1)::text)
        )
      ORDER BY (day_exp.d->>'date')::date ASC, q_exp.qidx ASC
      LIMIT 1
    ) AS next_day_title

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

GRANT EXECUTE ON FUNCTION public.get_daily_reminder_targets() TO service_role;
