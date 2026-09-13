/**
 * System health notices in Bengali. Shown in both the IT Console and the
 * Executive HQ so a blocked pipeline or an unpaid bill is never silent.
 */

import type { SystemNotice } from "@/lib/notices-types";

const HOUR = 60 * 60 * 1000;

export async function buildSystemNotices(): Promise<{
  notices: SystemNotice[];
  checkedAt: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const notices: SystemNotice[] = [];

  const since24h = new Date(Date.now() - 24 * HOUR).toISOString();

  const [pending, unassigned, failedSync, missingAudio, staleLeads, agents, subs] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending")
        .not("user_id", "is", null),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("assigned_to", null),
      supabaseAdmin
        .from("call_recordings")
        .select("id", { count: "exact", head: true })
        .eq("sync_status", "failed"),
      supabaseAdmin
        .from("call_recordings")
        .select("id", { count: "exact", head: true })
        .is("audio_url", null)
        .gte("created_at", since24h),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .not("assigned_to", "is", null)
        .lt("created_at", new Date(Date.now() - 48 * HOUR).toISOString()),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("approval_status", "approved"),
      supabaseAdmin
        .from("subscriptions")
        .select("status, current_period_end")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const count = (value: { count: number | null }) => value.count ?? 0;

  if (count(pending) > 0) {
    notices.push({
      id: "pending-accounts",
      level: "warning",
      title: `${count(pending)} জন নতুন অ্যাকাউন্ট অনুমোদনের অপেক্ষায়`,
      detail: "তারা অনুমোদন না পাওয়া পর্যন্ত ডেস্কে ঢুকতে পারবে না, তাই কাজ শুরু করতে পারছে না।",
      action: "IT Console → Account approvals থেকে অনুমোদন দিন",
    });
  }

  if (count(unassigned) > 0) {
    notices.push({
      id: "unassigned-leads",
      level: "warning",
      title: `${count(unassigned)}টি লিডের কোনো মালিক নেই`,
      detail: "এজেন্টের কাছে না গেলে এই লিডগুলোতে কেউ কল করবে না, ফলে পাইপলাইন থেমে থাকছে।",
      action: "Coordinator Deck → Balance all চাপুন",
    });
  }

  if (count(failedSync) > 0) {
    notices.push({
      id: "failed-recordings",
      level: "critical",
      title: `${count(failedSync)}টি কল রেকর্ডিং সার্ভারে উঠতে ব্যর্থ`,
      detail:
        "ফোনের ইন্টারনেট বা অ্যাপের আপলোড আটকে আছে — এই কলগুলোর অডিও ও AI বিশ্লেষণ পাওয়া যাচ্ছে না।",
      action: "Ingest Check থেকে পাইপলাইন পরীক্ষা করুন, এজেন্টকে অ্যাপ রি-সিঙ্ক করতে বলুন",
    });
  }

  if (count(missingAudio) > 0) {
    notices.push({
      id: "missing-audio",
      level: "warning",
      title: `আজকের ${count(missingAudio)}টি কলে অডিও ফাইল নেই`,
      detail: "অডিও ছাড়া ট্রান্সক্রিপ্ট, সেন্টিমেন্ট ও AI কোচিং তৈরি হবে না।",
      action: "এজেন্টের ফোনে রেকর্ডিং পারমিশন ও স্টোরেজ চালু আছে কিনা দেখুন",
    });
  }

  if (count(staleLeads) > 0) {
    notices.push({
      id: "stale-leads",
      level: "info",
      title: `${count(staleLeads)}টি লিড ৪৮ ঘণ্টা ধরে pending`,
      detail: "মালিক থাকা সত্ত্বেও কল হয়নি — লিড ঠান্ডা হয়ে যাচ্ছে।",
      action: "Coordinator Deck থেকে এজেন্টকে তাগাদা দিন বা লিড পুনরায় ভাগ করুন",
    });
  }

  if (count(agents) === 0) {
    notices.push({
      id: "no-agents",
      level: "critical",
      title: "কোনো সক্রিয় অনুমোদিত এজেন্ট নেই",
      detail: "এজেন্ট ছাড়া লিড ভাগ করা যাবে না, তাই পুরো সিস্টেম নিষ্ক্রিয় থাকবে।",
      action: "IT Console থেকে অ্যাকাউন্ট অনুমোদন করুন",
    });
  }

  const activeSub = (subs.data ?? []).find(
    (row) =>
      ["active", "trialing", "past_due"].includes(row.status) &&
      (!row.current_period_end || new Date(row.current_period_end) > new Date()),
  );
  if (!activeSub) {
    notices.push({
      id: "billing",
      level: "info",
      title: "সক্রিয় কোনো বিল/সাবস্ক্রিপশন পাওয়া যায়নি",
      detail: "সিস্টেম এখন চালু আছে, তবে দীর্ঘদিন চালু রাখতে বিল পরিশোধ নিশ্চিত করা দরকার।",
      action: "IT Console → Billing থেকে পেমেন্ট দেখুন",
    });
  } else if (activeSub.status === "past_due") {
    notices.push({
      id: "billing-past-due",
      level: "critical",
      title: "বিল বাকি আছে",
      detail: "পেমেন্ট ব্যর্থ হয়েছে — সময়মতো পরিশোধ না হলে সেবা বন্ধ হয়ে যেতে পারে।",
      action: "IT Console → Billing থেকে এখনই পরিশোধ করুন",
    });
  }

  if (!process.env["LOVABLE_API_KEY"]) {
    notices.push({
      id: "ai-key",
      level: "critical",
      title: "AI সংযোগ কনফিগার করা নেই",
      detail: "AI Coach, Copilot ও Ask HQ কোনো উত্তর দিতে পারবে না।",
      action: "IT Console থেকে AI সংযোগ ঠিক করতে ডেভেলপারকে জানান",
    });
  }

  if (!process.env["INGEST_SECRET"]) {
    notices.push({
      id: "ingest-secret",
      level: "critical",
      title: "ইনজেস্ট সিক্রেট সেট করা নেই",
      detail: "অ্যান্ড্রয়েড অ্যাপ থেকে কল, রেকর্ডিং ও WhatsApp লগ সার্ভারে ঢুকতে পারবে না।",
      action: "Ingest Check থেকে পরীক্ষা করুন",
    });
  }

  if (notices.length === 0) {
    notices.push({
      id: "all-clear",
      level: "info",
      title: "সব ঠিক আছে",
      detail: "লিড বিতরণ, কল সিঙ্ক, অ্যাকাউন্ট ও বিলিং — কোথাও কোনো সমস্যা পাওয়া যায়নি।",
      action: null,
    });
  }

  return { notices, checkedAt: new Date().toISOString() };
}
