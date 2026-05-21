-- ─────────────────────────────────────────────────────────────────────────────
-- Mnesti — No-exam nudge: invia fino a 3 volte nei primi 10 giorni
--
-- Logica precedente: inviava UNA SOLA email a chi non aveva mai ricevuto
--                    il nudge, senza limite di tempo sull'account.
--
-- Nuova logica:
--   • Fino a 3 nudge totali per utente
--   • Solo se l'account ha meno di 10 giorni
--   • Almeno 3 giorni di distanza tra un invio e il successivo
--   → risultato: invii approssimativi a ~giorno 2, 5 e 8 dall'iscrizione
--
-- Eseguire in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_no_exam_nudge_targets()
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE
    -- Finestra temporale: almeno 24h ma non più di 10 giorni dall'iscrizione
    u.created_at < now() - interval '24 hours'
    AND u.created_at > now() - interval '10 days'

    -- Email confermata
    AND u.email_confirmed_at IS NOT NULL

    -- Nessun esame creato
    AND NOT EXISTS (
      SELECT 1 FROM public.user_exams e WHERE e.user_id = u.id
    )

    -- Ricevuto meno di 3 nudge in totale
    AND (
      SELECT COUNT(*)
      FROM public.email_log l
      WHERE l.user_id = u.id AND l.email_type = 'no_exam_nudge'
    ) < 3

    -- Non ha ricevuto un nudge negli ultimi 3 giorni
    AND NOT EXISTS (
      SELECT 1 FROM public.email_log l
      WHERE l.user_id    = u.id
        AND l.email_type = 'no_exam_nudge'
        AND l.sent_at    > now() - interval '3 days'
    )

  LIMIT 100;
$$;
