REVOKE EXECUTE ON FUNCTION public.process_ortho_queue() FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.process_ortho_queue() TO postgres, service_role;

-- Harden the has_role helper too (already used by RLS policies and exposed to authenticated users, which is intentional but flagged).
-- REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public;
-- GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;