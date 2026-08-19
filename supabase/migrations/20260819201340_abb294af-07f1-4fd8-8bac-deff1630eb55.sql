SELECT cron.unschedule('process-ortho-queue');
DROP FUNCTION IF EXISTS public.process_ortho_queue();
DROP TABLE IF EXISTS public.processing_queue;
DROP TABLE IF EXISTS public.job_status;