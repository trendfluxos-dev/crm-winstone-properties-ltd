-- The table-wide SELECT grant overrode the column-level revoke, so the customer
-- access token stayed readable. Replace it with explicit safe-column grants.
REVOKE SELECT ON public.support_conversations FROM anon;
REVOKE SELECT ON public.support_conversations FROM authenticated;

GRANT SELECT (
  id, customer_id, subject, channel, status, priority, assignee_profile_id,
  category, intent, sentiment, summary, tags, ai_handled, escalated_at,
  escalation_reason, unread_for_agent, unread_for_customer, message_count,
  first_customer_message_at, first_human_response_at, last_message_at,
  resolved_at, sla_due_at, created_at, updated_at
) ON public.support_conversations TO authenticated;

GRANT ALL ON public.support_conversations TO service_role;