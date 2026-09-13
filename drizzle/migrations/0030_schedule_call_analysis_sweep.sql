-- lovable-cron-fallback-reviewed: 96 runs/day; retry backstop for failed inline transcription/AI analysis of uploaded call recordings
select cron.unschedule('winstone-call-analysis-sweep')
where exists (select 1 from cron.job where jobname = 'winstone-call-analysis-sweep');

select cron.schedule(
  'winstone-call-analysis-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://project--990267f3-4198-4d83-ae21-7d9c802617f4.lovable.app/api/public/ingest/analyze?limit=10',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value->>'secret' from public.system_settings where key = 'shift_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);