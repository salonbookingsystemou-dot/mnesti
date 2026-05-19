-- Migration 013: aggiunge cancel_at_period_end e cancel_at a user_plans
-- Necessario per riflettere le cancellazioni "a fine periodo" da Stripe Portal.

ALTER TABLE public.user_plans
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancel_at            TIMESTAMPTZ;
