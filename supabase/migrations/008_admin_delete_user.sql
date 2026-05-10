-- ─────────────────────────────────────────────────────────────────────────────
-- Mnesti — Admin: delete user function
-- Run in: Supabase Dashboard → SQL Editor
--
-- Creates:
--   admin_delete_user(p_user_id uuid) — hard-deletes a user and all related data
--
-- Security:
--   SECURITY DEFINER so the function runs with the owner's privileges (superuser)
--   and can write to auth.users. The caller must be an admin (is_admin() check).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins may call this function
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accesso non autorizzato.';
  END IF;

  -- Cascade-delete related public data first
  -- (user_exams already has ON DELETE CASCADE but we delete explicitly for safety)
  DELETE FROM public.user_exams  WHERE user_id = p_user_id;
  DELETE FROM public.api_usage   WHERE user_id = p_user_id;
  DELETE FROM public.user_plans  WHERE user_id = p_user_id;

  -- Delete the auth user (requires SECURITY DEFINER with superuser ownership)
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- Grant execute only to authenticated users (is_admin() check inside protects it)
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
