CREATE TABLE public.processing_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamp with time zone,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT status_values CHECK (status IN ('pending', 'processing', 'done', 'failed'))
);

CREATE TABLE public.job_status (
  name text PRIMARY KEY,
  status text NOT NULL DEFAULT 'running',
  paused_until timestamp with time zone,
  last_error text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT job_status_values CHECK (status IN ('running', 'paused'))
);

INSERT INTO public.job_status (name) VALUES ('ortho-generation') ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_queue TO authenticated;
GRANT ALL ON public.processing_queue TO service_role;
GRANT SELECT, UPDATE ON public.job_status TO authenticated;
GRANT ALL ON public.job_status TO service_role;

ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read queue rows"
  ON public.processing_queue
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage queue"
  ON public.processing_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can read job status"
  ON public.job_status
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can update job status"
  ON public.job_status
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER processing_queue_updated_at
  BEFORE UPDATE ON public.processing_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER job_status_updated_at
  BEFORE UPDATE ON public.job_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.process_ortho_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  response net.http_response;
BEGIN
  -- Ensure the secret is available before calling the public endpoint.
  IF current_setting('app.settings.cron_secret', true) IS NULL OR current_setting('app.settings.cron_secret', true) = '' THEN
    RAISE WARNING 'LOVABLE_CRON_SECRET not set; skipping ortho queue processing';
    RETURN;
  END IF;

  SELECT * INTO response
  FROM net.http_get(
    url := current_setting('app.settings.cron_url', true),
    params := '{}',
    headers := jsonb_build_object('X-Cron-Secret', current_setting('app.settings.cron_secret', true))
  );

  IF response.status >= 400 THEN
    RAISE WARNING 'Ortho queue call failed: % %', response.status, response.content;
  END IF;
END;
$$;

SELECT cron.schedule(
  'process-ortho-queue',
  '* * * * *',
  'SELECT public.process_ortho_queue();'
);