import { applyStatusCallback, readStoredConversation, readStoredStatus } from "/dev-server/src/lib/whatsapp-provider.server";
const LEAD = "31074173-2709-4261-9348-cc515c0b9a1c";
const { supabaseAdmin } = await import("/dev-server/src/integrations/supabase/client.server");
const mid = "wamid.test-" + Date.now();
const { data: ins, error } = await supabaseAdmin.from("whatsapp_interactions").insert({
  lead_id: LEAD, sender_type: "agent", message_type: "text", message_content: "status test",
  provider: "meta-cloud-api", provider_message_id: mid, status: "sent",
}).select("id").single();
if (error) throw error;
console.log("inserted", ins.id);
console.log("delivered ->", await applyStatusCallback({ providerMessageId: mid, status: "delivered" }), await readStoredStatus(mid));
console.log("read ->", await applyStatusCallback({ providerMessageId: mid, status: "read" }), await readStoredStatus(mid));
console.log("late sent (must stay read) ->", await applyStatusCallback({ providerMessageId: mid, status: "sent" }), await readStoredStatus(mid));
console.log("unknown id ->", await applyStatusCallback({ providerMessageId: "wamid.nope", status: "read" }));
const thread = await readStoredConversation(LEAD);
console.log("thread", thread.map((m) => [m.direction, m.status, m.readAt ? "read_at set" : "-"]));
await supabaseAdmin.from("whatsapp_interactions").delete().eq("id", ins.id);
console.log("cleaned", (await readStoredConversation(LEAD)).length);
