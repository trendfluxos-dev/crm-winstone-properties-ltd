CREATE TABLE public.shift_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_key text NOT NULL,
  shift_label text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  hq_visible boolean NOT NULL DEFAULT true,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  agents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX shift_summaries_shift_key_key ON public.shift_summaries (shift_key);
CREATE INDEX shift_summaries_window_start_idx ON public.shift_summaries (window_start DESC);

GRANT SELECT ON public.shift_summaries TO authenticated;
GRANT ALL ON public.shift_summaries TO service_role;

ALTER TABLE public.shift_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management reads shift summaries"
ON public.shift_summaries
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'team_leader'));