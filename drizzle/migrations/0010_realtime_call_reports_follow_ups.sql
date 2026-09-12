ALTER PUBLICATION supabase_realtime ADD TABLE public.call_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_up_events;
ALTER TABLE public.call_reports REPLICA IDENTITY FULL;
ALTER TABLE public.follow_up_events REPLICA IDENTITY FULL;