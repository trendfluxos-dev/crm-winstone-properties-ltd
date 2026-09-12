import { auth, defineMcp } from "@lovable.dev/mcp-js";

import createLead from "./tools/create-lead";
import floorSummary from "./tools/floor-summary";
import getCallIntel from "./tools/get-call-intel";
import leadHistory from "./tools/lead-history";
import listAgents from "./tools/list-agents";
import listLeads from "./tools/list-leads";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "web-crm-winstone",
  title: "WEB CRM WINSTONE",
  version: "0.1.0",
  instructions:
    "Tools for the Winstone Connect tele-sales CRM. Use list_agents for the roster, list_leads to browse or search leads, lead_history for one lead's calls and WhatsApp trail, floor_summary for activity totals and per-agent scorecards, and create_lead to add a lead. Callers must be signed in and approved in the IT Console allow-list.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAgents, listLeads, leadHistory, floorSummary, createLead],
});
