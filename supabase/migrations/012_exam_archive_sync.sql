-- ─────────────────────────────────────────────────────────────────────────────
-- Mnesti — Exam archive cloud sync
--
-- Problem: psico_exams_archive and per-exam plans/states were stored ONLY in
-- localStorage. A browser cache clear wiped them permanently.
--
-- Fix:
--   1. Add psico_exams_archive JSONB column to user_data (archive metadata list)
--   2. Create user_exam_plans table for per-exam plan + state data
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Add archive metadata column to user_data ──────────────────────────────
-- user_data was created manually in the Dashboard (no prior CREATE TABLE migration).
-- Use ALTER TABLE … ADD COLUMN IF NOT EXISTS so this is idempotent.

ALTER TABLE public.user_data
  ADD COLUMN IF NOT EXISTS psico_exams_archive JSONB DEFAULT '[]'::jsonb;


-- ── 2. Per-exam plan + state data table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_exam_plans (
  user_id    UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id    TEXT         NOT NULL,
  plan_data  JSONB,
  state_data JSONB,
  exam_info  JSONB,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exam_id)
);

ALTER TABLE public.user_exam_plans ENABLE ROW LEVEL SECURITY;

-- Users can only access their own exam plans
CREATE POLICY "Users manage own exam plans"
  ON public.user_exam_plans
  FOR ALL
  USING (auth.uid() = user_id);

-- Explicit grants (required from Supabase May 2026 security update)
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.user_exam_plans
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.user_exam_plans
  TO service_role;
