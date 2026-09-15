-- Realtime publishes profiles with a column list that hides pin_hash. With
-- REPLICA IDENTITY FULL that list cannot cover the identity, so every UPDATE on
-- profiles failed (42P10) — including account approvals. The primary key is a
-- valid replica identity and keeps pin_hash unpublished.
ALTER TABLE public.profiles REPLICA IDENTITY USING INDEX profiles_pkey;