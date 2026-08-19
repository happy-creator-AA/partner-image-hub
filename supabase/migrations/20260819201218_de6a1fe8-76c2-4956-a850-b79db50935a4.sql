REVOKE EXECUTE ON FUNCTION public.process_ortho_queue() FROM anon;
GRANT EXECUTE ON FUNCTION public.process_ortho_queue() TO postgres, service_role, authenticated;