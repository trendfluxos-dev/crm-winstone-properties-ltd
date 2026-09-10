
CREATE TYPE public.app_role AS ENUM ('admin','team_leader','agent');
CREATE TYPE public.agent_presence AS ENUM ('on_call','idle','offline');
CREATE TYPE public.lead_status AS ENUM ('pending','contacted','follow_up','closed');
CREATE TYPE public.call_direction AS ENUM ('outgoing','incoming_callback');
CREATE TYPE public.sync_status AS ENUM ('uploaded','verified','failed');
CREATE TYPE public.call_sentiment AS ENUM ('positive','neutral','negative','critical');
CREATE TYPE public.sender_type AS ENUM ('agent','customer');
CREATE TYPE public.message_type AS ENUM ('text','voice_note','image','document');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  phone text,
  avatar_hue int NOT NULL DEFAULT 200,
  role public.app_role NOT NULL DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true,
  presence public.agent_presence NOT NULL DEFAULT 'offline',
  current_call_started_at timestamptz,
  last_active_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles open access (pre-auth phase)" ON public.profiles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone_number text NOT NULL UNIQUE,
  company text,
  status public.lead_status NOT NULL DEFAULT 'pending',
  outcome_category text,
  is_verified boolean NOT NULL DEFAULT false,
  call_attempts int NOT NULL DEFAULT 0,
  last_call_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads open access (pre-auth phase)" ON public.leads FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.call_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  call_direction public.call_direction NOT NULL DEFAULT 'outgoing',
  duration_seconds int NOT NULL DEFAULT 0,
  audio_url text,
  is_two_sided boolean NOT NULL DEFAULT false,
  sync_status public.sync_status NOT NULL DEFAULT 'uploaded',
  transcription_text text,
  ai_summary text,
  sentiment public.call_sentiment,
  customer_objections text[] NOT NULL DEFAULT '{}',
  deal_stage text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_recordings TO anon, authenticated;
GRANT ALL ON public.call_recordings TO service_role;
ALTER TABLE public.call_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_recordings open access (pre-auth phase)" ON public.call_recordings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX call_recordings_lead_idx ON public.call_recordings(lead_id, created_at DESC);

CREATE TABLE public.whatsapp_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_type public.sender_type NOT NULL,
  message_type public.message_type NOT NULL DEFAULT 'text',
  message_content text,
  media_url text,
  duration_seconds int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_interactions TO anon, authenticated;
GRANT ALL ON public.whatsapp_interactions TO service_role;
ALTER TABLE public.whatsapp_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp open access (pre-auth phase)" ON public.whatsapp_interactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX whatsapp_lead_idx ON public.whatsapp_interactions(lead_id, created_at);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_recordings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_interactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.call_recordings REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_interactions REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Demo team
INSERT INTO public.profiles (id, name, phone, role, is_active, presence, current_call_started_at, last_active_at, avatar_hue) VALUES
 ('11111111-1111-4111-8111-000000000001','Nusrat Jahan','+8801711000101','agent',true,'on_call', now() - interval '3 minutes', now(), 160),
 ('11111111-1111-4111-8111-000000000002','Rakib Hasan','+8801711000102','agent',true,'idle', NULL, now() - interval '6 minutes', 30),
 ('11111111-1111-4111-8111-000000000003','Farhana Akter','+8801711000103','agent',true,'on_call', now() - interval '11 minutes', now(), 280),
 ('11111111-1111-4111-8111-000000000004','Tanvir Ahmed','+8801711000104','agent',true,'offline', NULL, now() - interval '4 hours', 200),
 ('11111111-1111-4111-8111-000000000005','Shahriar Karim','+8801711000105','team_leader',true,'idle', NULL, now() - interval '20 minutes', 90),
 ('11111111-1111-4111-8111-000000000006','Winstone HQ','+8801711000100','admin',true,'idle', NULL, now(), 45);

-- Demo leads
INSERT INTO public.leads (id, assigned_to, name, phone_number, company, status, outcome_category, is_verified, call_attempts, last_call_at, notes) VALUES
 ('22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-000000000001','Imran Chowdhury','+8801811000201','Meghna Traders','closed','deal_won',true,3, now() - interval '2 hours','Signed annual plan.'),
 ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-000000000001','Sabina Yasmin','+8801811000202','Yasmin Fabrics','follow_up','callback_requested',true,2, now() - interval '5 hours','Wants pricing sheet on WhatsApp.'),
 ('22222222-2222-4222-8222-000000000003','11111111-1111-4111-8111-000000000001','Habibur Rahman','+8801811000203','HR Electronics','contacted','price_objection',true,1, now() - interval '1 hour','Says competitor is cheaper.'),
 ('22222222-2222-4222-8222-000000000004','11111111-1111-4111-8111-000000000002','Mahmudul Alam','+8801811000204','Alam Distribution','contacted','interested',true,1, now() - interval '3 hours',NULL),
 ('22222222-2222-4222-8222-000000000005','11111111-1111-4111-8111-000000000002','Rehana Begum','+8801811000205','Begum Pharma','follow_up','no_answer',false,4, now() - interval '30 minutes','Never picks up before noon.'),
 ('22222222-2222-4222-8222-000000000006','11111111-1111-4111-8111-000000000002','Kamal Uddin','+8801811000206','Uddin Logistics','pending',NULL,false,0,NULL,NULL),
 ('22222222-2222-4222-8222-000000000007','11111111-1111-4111-8111-000000000003','Nadia Islam','+8801811000207','Islam Retail','closed','deal_won',true,2, now() - interval '1 day','Upsell in 3 months.'),
 ('22222222-2222-4222-8222-000000000008','11111111-1111-4111-8111-000000000003','Shafiqul Bari','+8801811000208','Bari Motors','contacted','needs_demo',true,1, now() - interval '45 minutes',NULL),
 ('22222222-2222-4222-8222-000000000009','11111111-1111-4111-8111-000000000003','Tahmina Sultana','+8801811000209','Sultana Foods','follow_up','budget_next_quarter',false,2, now() - interval '2 days',NULL),
 ('22222222-2222-4222-8222-000000000010','11111111-1111-4111-8111-000000000004','Jubayer Rahman','+8801811000210','JR Imports','contacted','price_objection',true,3, now() - interval '3 days',NULL),
 ('22222222-2222-4222-8222-000000000011','11111111-1111-4111-8111-000000000004','Lubna Ferdous','+8801811000211','Ferdous Interiors','pending',NULL,false,0,NULL,NULL),
 ('22222222-2222-4222-8222-000000000012','11111111-1111-4111-8111-000000000004','Arif Mahmud','+8801811000212','Mahmud Agro','closed','not_interested',true,2, now() - interval '4 days','Using in-house solution.'),
 ('22222222-2222-4222-8222-000000000013','11111111-1111-4111-8111-000000000001','Shirin Akhter','+8801811000213','Akhter Textiles','pending',NULL,false,0,NULL,NULL),
 ('22222222-2222-4222-8222-000000000014','11111111-1111-4111-8111-000000000002','Monir Hossain','+8801811000214','Hossain Hardware','pending',NULL,false,1, now() - interval '20 minutes','Line busy.'),
 ('22222222-2222-4222-8222-000000000015','11111111-1111-4111-8111-000000000003','Rumana Haque','+8801811000215','Haque Cosmetics','contacted','interested',false,1, now() - interval '90 minutes',NULL),
 ('22222222-2222-4222-8222-000000000016',NULL,'Delwar Hossain','+8801811000216','Delwar Steel','pending',NULL,false,0,NULL,NULL),
 ('22222222-2222-4222-8222-000000000017',NULL,'Sanjida Parvin','+8801811000217','Parvin Boutique','pending',NULL,false,0,NULL,NULL),
 ('22222222-2222-4222-8222-000000000018',NULL,'Ashraful Haque','+8801811000218','AH Builders','pending',NULL,false,0,NULL,NULL),
 ('22222222-2222-4222-8222-000000000019',NULL,'Mizanur Rahman','+8801811000219','Mizan Poultry','pending',NULL,false,0,NULL,NULL),
 ('22222222-2222-4222-8222-000000000020',NULL,'Kaniz Fatema','+8801811000220','Fatema Jewellers','pending',NULL,false,0,NULL,NULL),
 ('22222222-2222-4222-8222-000000000021',NULL,'Sohel Rana','+8801811000221','Rana Plastics','pending',NULL,false,0,NULL,NULL),
 ('22222222-2222-4222-8222-000000000022',NULL,'Bilkis Nahar','+8801811000222','Nahar Foods','pending',NULL,false,0,NULL,NULL),
 ('22222222-2222-4222-8222-000000000023','11111111-1111-4111-8111-000000000001','Golam Kibria','+8801811000223','Kibria Ceramics','follow_up','callback_requested',false,2, now() - interval '6 hours',NULL),
 ('22222222-2222-4222-8222-000000000024','11111111-1111-4111-8111-000000000003','Anisur Rahman','+8801811000224','Anis Cables','closed','deal_won',true,1, now() - interval '8 hours',NULL);

-- Demo calls
INSERT INTO public.call_recordings (id, lead_id, agent_id, phone_number, call_direction, duration_seconds, is_two_sided, sync_status, transcription_text, ai_summary, sentiment, customer_objections, deal_stage, created_at) VALUES
 ('33333333-3333-4333-8333-000000000001','22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-000000000001','+8801811000201','outgoing',412,true,'verified',
  E'[00:00] Agent: Good morning Imran bhai, this is Nusrat from Winstone.\n[00:07] Customer: Yes, tell me. I looked at the proposal you sent.\n[00:15] Agent: Great. The annual plan covers 25 seats with onboarding included.\n[00:26] Customer: The price is a bit high, but the onboarding helps.\n[00:38] Agent: I can include two extra training sessions at no cost.\n[00:49] Customer: Alright, send the contract today and I will sign it.\n[00:58] Agent: Sending it within the hour. Thank you Imran bhai.',
  E'• Customer reviewed the proposal and is ready to sign the annual 25-seat plan.\n• Price was the only hesitation, resolved by adding two free training sessions.\n• Contract to be sent within the hour for same-day signature.',
  'positive','{"Price is higher than expected"}','closed_won', now() - interval '2 hours'),
 ('33333333-3333-4333-8333-000000000002','22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-000000000001','+8801811000202','outgoing',187,true,'verified',
  E'[00:00] Agent: Hello Sabina apa, Nusrat from Winstone here.\n[00:06] Customer: I am in a meeting, can you send details on WhatsApp?\n[00:13] Agent: Of course, I will send the pricing sheet right away.\n[00:20] Customer: Also I need to check with my partner before deciding.\n[00:29] Agent: Understood. Shall I call back on Thursday morning?\n[00:35] Customer: Yes, Thursday works.',
  E'• Customer was busy and asked for the pricing sheet over WhatsApp.\n• Decision requires her business partner''s agreement.\n• Callback agreed for Thursday morning.',
  'neutral','{"Needs partner approval","No time to talk now"}','follow_up', now() - interval '5 hours'),
 ('33333333-3333-4333-8333-000000000003','22222222-2222-4222-8222-000000000003','11111111-1111-4111-8111-000000000001','+8801811000203','outgoing',263,true,'verified',
  E'[00:00] Agent: Habib bhai, good afternoon. This is Nusrat from Winstone.\n[00:08] Customer: Your rate is 20 percent above what I get elsewhere.\n[00:18] Agent: Our package includes support and free updates, which they charge for.\n[00:31] Customer: Support matters, but my budget is fixed this quarter.\n[00:44] Agent: I can arrange quarterly billing to ease the cash flow.\n[00:55] Customer: Send me that option in writing.',
  E'• Customer sees the price as roughly 20% above a competitor.\n• Bundled support and free updates were positioned as the differentiator.\n• Quarterly billing offered; customer asked for it in writing.',
  'negative','{"Competitor is 20% cheaper","Fixed budget this quarter"}','negotiation', now() - interval '1 hour'),
 ('33333333-3333-4333-8333-000000000004','22222222-2222-4222-8222-000000000005','11111111-1111-4111-8111-000000000002','+8801811000205','outgoing',6,false,'uploaded',NULL,NULL,NULL,'{}','no_contact', now() - interval '30 minutes'),
 ('33333333-3333-4333-8333-000000000005','22222222-2222-4222-8222-000000000004','11111111-1111-4111-8111-000000000002','+8801811000204','outgoing',221,true,'verified',
  E'[00:00] Agent: Mahmudul bhai, Rakib from Winstone.\n[00:05] Customer: I am interested but I want to see the dashboard first.\n[00:16] Agent: I can run a 20 minute demo tomorrow at 11.\n[00:24] Customer: Tomorrow 11 is fine. Send the link.\n[00:31] Agent: Done, sending the invite now.',
  E'• Customer is interested and asked to see the dashboard before committing.\n• Demo scheduled for tomorrow at 11:00.\n• Invite link to be sent immediately.',
  'positive','{"Wants to see the product first"}','demo_scheduled', now() - interval '3 hours'),
 ('33333333-3333-4333-8333-000000000006','22222222-2222-4222-8222-000000000007','11111111-1111-4111-8111-000000000003','+8801811000207','incoming_callback',334,true,'verified',
  E'[00:00] Customer: Hello, this is Nadia. I am calling back about the offer.\n[00:09] Agent: Wonderful. Did you get a chance to review the terms?\n[00:17] Customer: Yes, we want to start with 10 seats this month.\n[00:27] Agent: I will prepare the invoice for 10 seats today.\n[00:36] Customer: Please do. And add me to the training session.',
  E'• Customer called back and confirmed a 10-seat start this month.\n• Invoice to be prepared today.\n• Customer requested a spot in the training session.',
  'positive','{}','closed_won', now() - interval '1 day'),
 ('33333333-3333-4333-8333-000000000007','22222222-2222-4222-8222-000000000008','11111111-1111-4111-8111-000000000003','+8801811000208','outgoing',149,false,'uploaded',
  E'[00:00] Agent: Shafiqul bhai, this is Farhana from Winstone. Can you hear me?\n[00:09] Agent: Hello? I think the line is weak. I will send the details on WhatsApp.',
  E'• Only the agent side of the call was captured, customer audio is missing.\n• Agent reported a weak line and moved to WhatsApp.\n• Needs manual review before counting as a connected conversation.',
  'neutral','{}','review_needed', now() - interval '45 minutes'),
 ('33333333-3333-4333-8333-000000000008','22222222-2222-4222-8222-000000000010','11111111-1111-4111-8111-000000000004','+8801811000210','outgoing',298,true,'verified',
  E'[00:00] Agent: Jubayer bhai, Tanvir from Winstone.\n[00:06] Customer: I already told your colleague the price does not work.\n[00:16] Agent: I hear you. May I show a smaller starter package?\n[00:27] Customer: Only if it is under half the current quote.\n[00:38] Agent: Let me check what I can do and revert tomorrow.\n[00:46] Customer: Do not call me more than once a week.',
  E'• Customer is frustrated by repeated calls and rejects the current quote.\n• Open to a starter package at under half the quoted price.\n• Explicitly asked to be contacted at most once a week.',
  'critical','{"Price far above budget","Too many calls from the team"}','at_risk', now() - interval '3 days'),
 ('33333333-3333-4333-8333-000000000009','22222222-2222-4222-8222-000000000024','11111111-1111-4111-8111-000000000003','+8801811000224','outgoing',276,true,'verified',
  E'[00:00] Agent: Anisur bhai, Farhana from Winstone speaking.\n[00:07] Customer: Yes, we are ready to move ahead with the standard plan.\n[00:18] Agent: Excellent, I will send the agreement now.\n[00:26] Customer: Please include the payment schedule too.',
  E'• Customer confirmed they will proceed with the standard plan.\n• Agreement to be sent immediately.\n• Customer asked for the payment schedule to be included.',
  'positive','{}','closed_won', now() - interval '8 hours'),
 ('33333333-3333-4333-8333-000000000010','22222222-2222-4222-8222-000000000014','11111111-1111-4111-8111-000000000002','+8801811000214','outgoing',4,false,'failed',NULL,NULL,NULL,'{}','no_contact', now() - interval '20 minutes'),
 ('33333333-3333-4333-8333-000000000011','22222222-2222-4222-8222-000000000015','11111111-1111-4111-8111-000000000003','+8801811000215','outgoing',167,true,'uploaded',
  E'[00:00] Agent: Rumana apa, this is Farhana from Winstone.\n[00:06] Customer: I saw your message. What is the monthly cost?\n[00:15] Agent: It starts at 4,500 taka per month for five users.\n[00:25] Customer: That sounds reasonable. Send me the details.',
  E'• Customer asked about monthly pricing after seeing the WhatsApp message.\n• Quoted 4,500 BDT per month for five users.\n• Customer found it reasonable and asked for written details.',
  'positive','{}','interested', now() - interval '90 minutes');

-- Demo WhatsApp threads
INSERT INTO public.whatsapp_interactions (lead_id, agent_id, sender_type, message_type, message_content, duration_seconds, created_at) VALUES
 ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-000000000001','agent','text','Assalamu alaikum Sabina apa, sharing the pricing sheet as promised.',NULL, now() - interval '4 hours 50 minutes'),
 ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-000000000001','agent','document','Winstone-Pricing-2026.pdf',NULL, now() - interval '4 hours 49 minutes'),
 ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-000000000001','customer','text','Got it. Discussing with my partner tonight.',NULL, now() - interval '4 hours 10 minutes'),
 ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-000000000001','customer','voice_note','Voice note from customer',23, now() - interval '3 hours 40 minutes'),
 ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-000000000001','agent','text','Noted apa. I will call you Thursday at 10am.',NULL, now() - interval '3 hours 30 minutes'),
 ('22222222-2222-4222-8222-000000000003','11111111-1111-4111-8111-000000000001','agent','text','Habib bhai, here is the quarterly billing option in writing.',NULL, now() - interval '50 minutes'),
 ('22222222-2222-4222-8222-000000000003','11111111-1111-4111-8111-000000000001','customer','text','Received. Will review with accounts.',NULL, now() - interval '35 minutes'),
 ('22222222-2222-4222-8222-000000000008','11111111-1111-4111-8111-000000000003','agent','text','Shafiqul bhai, the line was weak. Sharing the demo details here.',NULL, now() - interval '40 minutes'),
 ('22222222-2222-4222-8222-000000000008','11111111-1111-4111-8111-000000000003','customer','text','Ok, send a time for tomorrow.',NULL, now() - interval '25 minutes'),
 ('22222222-2222-4222-8222-000000000004','11111111-1111-4111-8111-000000000002','agent','text','Demo invite for tomorrow 11am is sent to your email.',NULL, now() - interval '2 hours 50 minutes'),
 ('22222222-2222-4222-8222-000000000004','11111111-1111-4111-8111-000000000002','customer','text','Confirmed.',NULL, now() - interval '2 hours 30 minutes'),
 ('22222222-2222-4222-8222-000000000015','11111111-1111-4111-8111-000000000003','agent','text','Rumana apa, details as discussed: 4,500 BDT / month for 5 users.',NULL, now() - interval '80 minutes'),
 ('22222222-2222-4222-8222-000000000015','11111111-1111-4111-8111-000000000003','customer','voice_note','Voice note from customer',15, now() - interval '60 minutes'),
 ('22222222-2222-4222-8222-000000000005','11111111-1111-4111-8111-000000000002','agent','text','Rehana apa, tried calling. Best time to reach you?',NULL, now() - interval '25 minutes'),
 ('22222222-2222-4222-8222-000000000010','11111111-1111-4111-8111-000000000004','customer','text','Please stop calling every day.',NULL, now() - interval '2 days'),
 ('22222222-2222-4222-8222-000000000010','11111111-1111-4111-8111-000000000004','agent','text','Apologies Jubayer bhai. I will only send a weekly update from now.',NULL, now() - interval '2 days'),
 ('22222222-2222-4222-8222-000000000023','11111111-1111-4111-8111-000000000001','agent','text','Golam bhai, following up on our call. Shall I call tomorrow?',NULL, now() - interval '5 hours'),
 ('22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-000000000001','agent','document','Winstone-Annual-Contract.pdf',NULL, now() - interval '100 minutes'),
 ('22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-000000000001','customer','image','Signed contract photo',NULL, now() - interval '70 minutes'),
 ('22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-000000000001','customer','text','Signed copy attached. Thank you Nusrat.',NULL, now() - interval '69 minutes');
