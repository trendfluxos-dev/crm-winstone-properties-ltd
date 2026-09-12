DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_recordings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_recordings;
  END IF;
END $$;

ALTER TABLE public.call_recordings REPLICA IDENTITY FULL;