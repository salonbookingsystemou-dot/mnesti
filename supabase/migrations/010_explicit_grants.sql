-- ─────────────────────────────────────────────────────────────────────────────
-- Mnesti — Explicit table grants (Supabase Data API security update)
--
-- From May 30, 2026 new Supabase projects require explicit GRANTs on public-
-- schema tables for PostgREST / supabase-js / GraphQL access.
-- From October 30, 2026 this is enforced on all existing projects.
--
-- This migration makes grants explicit on every table created in prior
-- migrations, matching the intent of the existing RLS policies exactly.
-- The user_data table (no migration in repo) is handled separately — see the
-- comment at the bottom.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── api_usage ─────────────────────────────────────────────────────────────────
-- authenticated: SELECT (RLS narrows to own rows)
-- service_role:  full access — edge functions write via increment_api_usage()
--                and admin functions read aggregates

GRANT SELECT
  ON public.api_usage
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.api_usage
  TO service_role;


-- ── user_plans ────────────────────────────────────────────────────────────────
-- authenticated: SELECT (RLS narrows to own row)
-- service_role:  full access — stripe-webhook / create-checkout write plans,
--                trigger create_free_plan_for_new_user() runs as SECURITY DEFINER

GRANT SELECT
  ON public.user_plans
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.user_plans
  TO service_role;


-- ── admin_emails ──────────────────────────────────────────────────────────────
-- RLS policy is RESTRICTIVE + USING (false) — anon/authenticated are always
-- blocked at the row level regardless of table privilege.
-- Only service_role (RLS bypass) and SECURITY DEFINER functions need access.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.admin_emails
  TO service_role;


-- ── user_exams ────────────────────────────────────────────────────────────────
-- authenticated: full CRUD (RLS narrows to own rows via auth.uid() = user_id)
-- service_role:  full access — lifecycle-emails reads targets, admin functions
--                aggregate counts via SECURITY DEFINER

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.user_exams
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.user_exams
  TO service_role;


-- ── email_log ─────────────────────────────────────────────────────────────────
-- RLS policy is RESTRICTIVE + USING (false) — no direct client access.
-- Only the lifecycle-emails edge function (service_role key) inserts rows.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.email_log
  TO service_role;


-- ── Sequences for bigserial columns ───────────────────────────────────────────
-- Explicit USAGE + SELECT on sequences so service_role can generate new IDs
-- on tables that use bigserial (api_usage.id, email_log.id).

GRANT USAGE, SELECT
  ON SEQUENCE public.api_usage_id_seq
  TO service_role;

GRANT USAGE, SELECT
  ON SEQUENCE public.email_log_id_seq
  TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- MANUAL ACTION REQUIRED: user_data table
-- ─────────────────────────────────────────────────────────────────────────────
-- The user_data table is used by the browser client (cloud-sync upsert/select)
-- but has no CREATE TABLE migration in this repository.
-- Run the following in the Supabase Dashboard → SQL Editor once:
--
--   GRANT SELECT, INSERT, UPDATE, DELETE
--     ON public.user_data
--     TO authenticated;
--
--   GRANT SELECT, INSERT, UPDATE, DELETE
--     ON public.user_data
--     TO service_role;
--
-- (Adjust if the table only needs SELECT for authenticated users.)
-- ─────────────────────────────────────────────────────────────────────────────
