-- Explicit deny-all policies: data is only reachable via PIN-gated server functions (service role bypasses RLS).
CREATE POLICY "Deny client access" ON public.custom_reports
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "Deny client access" ON public.system_settings
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);