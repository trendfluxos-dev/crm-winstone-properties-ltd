-- Live shift sheet in the IT Console: agent updates must reach it instantly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_reports;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'follow_up_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_up_events;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shift_summaries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_summaries;
  END IF;
END $$;

ALTER TABLE public.call_reports REPLICA IDENTITY FULL;
ALTER TABLE public.follow_up_events REPLICA IDENTITY FULL;
ALTER TABLE public.shift_summaries REPLICA IDENTITY FULL;
