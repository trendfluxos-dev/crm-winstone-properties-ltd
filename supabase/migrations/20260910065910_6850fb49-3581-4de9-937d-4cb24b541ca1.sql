ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_id text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_employee_id_key ON public.profiles (employee_id) WHERE employee_id IS NOT NULL;

INSERT INTO public.profiles (name, phone, employee_id, role, is_active, presence, avatar_hue)
VALUES
  ('Mst. Soniya Yeasmin', '01805049668', 'WIN2601', 'agent', true, 'offline', 195),
  ('Mst. Nazrin Akter', '01805049667', 'WIN2602', 'agent', true, 'offline', 30),
  ('Srijonee Sarowar', '01805049673', 'WIN2603', 'agent', true, 'offline', 130),
  ('Monisha Biswas', '01805049674', 'WIN2604', 'agent', true, 'offline', 280),
  ('Debbroto Kumar Chakroborty', '01805049669', 'WIN2605', 'agent', true, 'offline', 340),
  ('Elias Zahid', '01805049665', 'WIN2606', 'agent', true, 'offline', 60)
ON CONFLICT DO NOTHING;