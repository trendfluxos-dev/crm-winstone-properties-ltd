import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Check, Copy, PhoneCall, ShieldAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/playbook")({
  head: () => ({
    meta: [
      { title: "কল স্ক্রিপ্ট ও প্লেবুক — Winstone Connect" },
      {
        name: "description",
        content:
          "Winstone Properties এজেন্টদের জন্য কল স্ক্রিপ্ট: ওপেনিং, যোগ্যতা প্রশ্ন, HOT/WARM/COLD, আপত্তি হ্যান্ডলিং ও ক্লোজিং।",
      },
      { property: "og:title", content: "কল স্ক্রিপ্ট ও প্লেবুক — Winstone Connect" },
      {
        property: "og:description",
        content: "এজেন্ট কল স্ক্রিপ্ট, আপত্তি হ্যান্ডলিং ও কল শেষে CRM আপডেট চেকলিস্ট।",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlaybookPage,
});

const MASTER_SCRIPT = `আসসালামু আলাইকুম, আমি [নাম], Winstone Properties Ltd. থেকে বলছি। আপনার সাথে এক মিনিট কথা বলা যাবে?
আমরা property নিয়ে কাজ করছি। আপনি কি নিজের থাকার জন্য নাকি investment-এর জন্য property দেখছেন?
আপনার preferred location কোনটা?
আর আনুমানিক budget range কত রাখছেন?
আপনি এখনই নেওয়ার plan করছেন, নাকি আগামী কয়েক মাসের মধ্যে?
ঠিক আছে। আপনার requirement অনুযায়ী relevant information আমি WhatsApp-এ পাঠিয়ে দিতে পারি। Details দেখার পর আমরা আপনার সুবিধামতো আবার কথা বলতে পারি। আর আপনি interested হলে site visit-ও arrange করে দিতে পারব।`;

const QUALIFY = [
  { q: "উদ্দেশ্য", ask: "আপনি propertyটা নিজের থাকার জন্য দেখছেন, নাকি investment-এর জন্য?" },
  {
    q: "লোকেশন",
    ask: "ঢাকার কোন location আপনার বেশি preferred? ওই area-র আশেপাশে alternative consider করবেন?",
  },
  {
    q: "বাজেট",
    ask: "Suitable option suggest করার জন্য আনুমানিক budget range জানলে ভালোভাবে guide করতে পারব — যেমন ৫০ লাখের মধ্যে, ৫০–৭০ লাখ বা তার বেশি।",
  },
  {
    q: "রিকোয়ারমেন্ট",
    ask: "Apartment হলে কয় bedroom? Size, parking, lift বা অন্য কোনো specific requirement আছে?",
  },
  {
    q: "টাইমলাইন",
    ask: "আপনি এখনই নেওয়ার plan করছেন, নাকি আগামী ৩–৬ মাসের মধ্যে?",
  },
];

const OBJECTIONS = [
  {
    t: "“আমি এখন ব্যস্ত”",
    a: "অবশ্যই, কোনো সমস্যা নেই। আপনার কোন সময়টা convenient হবে? আমি তখন short একটা call করব।",
    crm: "Callback time CRM-এ রাখুন",
  },
  {
    t: "“WhatsApp-এ পাঠান”",
    a: "অবশ্যই। Relevant information পাঠানোর জন্য শুধু জানি — আপনি কোন location আর আনুমানিক কোন budget range-এ দেখছেন?",
    crm: "লোকেশন ও বাজেট নিয়ে তবেই কল শেষ করুন",
  },
  {
    t: "“Price কত?”",
    a: "অবশ্যই জানাতে পারি। Exact option অনুযায়ী price পরিবর্তিত হয়। আপনি কোন location আর কয় bedroom-এর property দেখছেন?",
    crm: "শুধু official verified price",
  },
  {
    t: "“Discount আছে?”",
    a: "বর্তমান applicable offer থাকলে official information অনুযায়ী জানাতে পারব। আপনার requirementটা আগে একটু বুঝে নিই।",
    crm: "Approved না হলে discount বলা যাবে না",
  },
  {
    t: "“শুধু information নিচ্ছি”",
    a: "একদম স্বাভাবিক। Properly guide করার জন্য preferred location আর approximate budget জানালে relevant optionগুলোই share করতে পারব।",
    crm: "COLD/WARM হিসেবে রাখুন",
  },
  {
    t: "“Family-এর সাথে কথা বলে জানাব”",
    a: "অবশ্যই, discuss করাটা গুরুত্বপূর্ণ। প্রয়োজনীয় information WhatsApp-এ পাঠিয়ে দিচ্ছি। আমি কি [দিন] আবার follow-up করতে পারি?",
    crm: "Follow-up date দিন",
  },
  {
    t: "“এখন টাকা নেই”",
    a: "বুঝতে পারছি। Future-এ property নেওয়ার possibility আছে কি? Expected timeline জানালে সেই অনুযায়ী follow-up রাখতে পারি।",
    crm: "Future potential",
  },
  {
    t: "“আপনাদের company সম্পর্কে বলুন”",
    a: "Winstone Properties Ltd. real estate sector-এ property solutions নিয়ে কাজ করছে — requirement বুঝে project information, options এবং site visit support দিই।",
    crm: "শুধু approved তথ্য",
  },
];

const CLASSIFICATION = [
  ["HOT / A", "Strong buying intent", "সাথে সাথে follow-up + site visit"],
  ["WARM / B", "আগ্রহী, এখনই নয়", "Follow-up date দিন"],
  ["C", "কিছুটা আগ্রহ / mismatch", "Nurture"],
  ["COLD / D", "আগ্রহ কম বা নেই", "কম ঘন ঘন follow-up"],
  ["FOLLOW-UP", "কলব্যাক চেয়েছেন", "ঠিক সময়েই কল"],
  ["SITE VISIT", "ভিজিটে আগ্রহী/নিশ্চিত", "ভিজিট সমন্বয়"],
];

const CRM_CHECKLIST = [
  "নাম, ফোন, লোকেশন",
  "বাজেট, property type, bedroom",
  "Project interest",
  "Purpose ও buying timeline",
  "Financing preference",
  "Site visit interest",
  "Call result: Connected / No answer",
  "HOT / WARM / COLD ও গ্রেড",
  "Customer need ও objection",
  "Next action ও next follow-up date",
  "Agent note",
];

const NEVER_SAY = [
  "“আজকে না নিলে price বেড়ে যাবে” (verified না হলে)",
  "“এই unit এখনই শেষ হয়ে যাচ্ছে” (verified না হলে)",
  "“Guaranteed investment return” / “নিশ্চিত appreciation”",
  "“Special discount আছে” (approved না হলে)",
  "“আমি personally guarantee করছি”",
  "Fake availability, fake urgency, unverified payment plan বা handover date",
];

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="card-elevated space-y-3 p-4">
      <header className="space-y-1">
        {eyebrow ? <p className="eyebrow text-[10px] text-primary/70">{eyebrow}</p> : null}
        <h2 className="text-sm font-bold tracking-tight">{title}</h2>
        <div className="gold-rule" />
      </header>
      {children}
    </section>
  );
}

function PlaybookPage() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(MASTER_SCRIPT);
    setCopied(true);
    toast.success("স্ক্রিপ্ট কপি হয়েছে");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <header className="space-y-1">
          <p className="eyebrow text-[10px] text-primary/70">Winstone Properties Ltd.</p>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <BookOpen className="size-5 text-primary" /> কল স্ক্রিপ্ট ও প্লেবুক
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect → Understand → Qualify → Match → Follow-up → Site Visit → Conversion. কথা বলার
            অনুপাত: কাস্টমার ৬০–৭০%, এজেন্ট ৩০–৪০%।
          </p>
        </header>

        <Section title="৩০ সেকেন্ডের মাস্টার স্ক্রিপ্ট" eyebrow="সবচেয়ে দরকারি">
          <p className="whitespace-pre-line text-sm leading-relaxed">{MASTER_SCRIPT}</p>
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => void copy()}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} কপি করুন
          </Button>
        </Section>

        <Section title="ওপেনিং (প্রথম ২০–৩০ সেকেন্ড)">
          <p className="text-sm leading-relaxed">
            “আসসালামু আলাইকুম, আমি [Agent Name], Winstone Properties Ltd. থেকে বলছি। আপনার সাথে এক
            মিনিট কথা বলা যাবে?”
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            রাজি হলে: “ধন্যবাদ। আমরা residential property নিয়ে কাজ করছি। আপনার property-related কোনো
            requirement বা future plan আছে কিনা, সেটা জানার জন্যই contact করেছি।” — এরপর সরাসরি
            pitch নয়, প্রথম qualification প্রশ্ন।
          </p>
        </Section>

        <Section title="৫টি যোগ্যতা প্রশ্ন" eyebrow="প্রতি কলে">
          <ol className="space-y-2.5">
            {QUALIFY.map((item, i) => (
              <li key={item.q} className="flex gap-3">
                <span className="tabular mt-0.5 text-sm font-semibold text-primary">{i + 1}</span>
                <span>
                  <span className="block text-sm font-semibold">{item.q}</span>
                  <span className="block text-sm text-muted-foreground">{item.ask}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="HOT / WARM / COLD স্ক্রিপ্ট">
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/35 bg-accent/30 p-3">
              <p className="text-sm font-semibold text-primary">HOT — বাজেট আছে, শিগগির কিনবেন</p>
              <p className="mt-1 text-sm">
                “আপনার requirement অনুযায়ী আমাদের project-এর optionগুলো relevant হতে পারে। চাইলে
                verified information ও project details WhatsApp-এ পাঠাতে পারি।” → “আপনি কি projectটা
                সরাসরি visit করতে আগ্রহী? কোন দিন ও সময় convenient হবে?”
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">WARM — আগ্রহী, এখনই সিদ্ধান্ত নয়</p>
              <p className="mt-1 text-sm text-muted-foreground">
                “Property purchase একটা important decision, সময় নিয়ে compare করা স্বাভাবিক। আমি
                details WhatsApp-এ পাঠিয়ে দিচ্ছি। আমি [দিন] short follow-up করতে পারি?”
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">COLD — আগ্রহ কম</p>
              <p className="mt-1 text-sm text-muted-foreground">
                “ঠিক আছে, কোনো সমস্যা নেই, আমি আর disturb করছি না। Future-এ requirement হলে অবশ্যই
                assist করতে পারব — basic information রেখে দিচ্ছি।”
              </p>
            </div>
          </div>
        </Section>

        <Section title="আপত্তি হ্যান্ডলিং">
          <ul className="space-y-2.5">
            {OBJECTIONS.map((o) => (
              <li key={o.t} className="border-b border-border/60 pb-2.5 last:border-0 last:pb-0">
                <p className="text-sm font-semibold">{o.t}</p>
                <p className="text-sm text-muted-foreground">{o.a}</p>
                <p className="mt-0.5 text-[11px] text-primary/80">{o.crm}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="ক্লোজিং — প্রতিটি কলে একটি next step">
          <ul className="space-y-1.5 text-sm">
            <li>
              <span className="font-semibold">A · WhatsApp</span> — “আমি এখন আপনার WhatsApp-এ
              relevant information পাঠিয়ে দিচ্ছি।”
            </li>
            <li>
              <span className="font-semibold">B · Follow-up</span> — “আমি [date/time]-এ আবার contact
              করছি।”
            </li>
            <li>
              <span className="font-semibold">C · Site visit</span> — “আপনার সুবিধামতো [date/time]-এ
              site visit arrange করছি।”
            </li>
            <li>
              <span className="font-semibold">D · Not ready</span> — “আমি follow-up date রেখে দিচ্ছি,
              প্রয়োজন হলে তখন কথা বলব।”
            </li>
          </ul>
        </Section>

        <Section title="লিড শ্রেণিবিভাগ">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Category</th>
                  <th className="py-1.5 pr-3 font-medium">অর্থ</th>
                  <th className="py-1.5 font-medium">Agent action</th>
                </tr>
              </thead>
              <tbody>
                {CLASSIFICATION.map((row) => (
                  <tr key={row[0]} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 font-semibold text-primary">{row[0]}</td>
                    <td className="py-1.5 pr-3">{row[1]}</td>
                    <td className="py-1.5 text-muted-foreground">{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="কল শেষে বাধ্যতামূলক CRM আপডেট" eyebrow="প্রতিটি কলের পরে">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {CRM_CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <PhoneCall className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-destructive">
            <ShieldAlert className="size-4" /> কখনো বলবেন না
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {NEVER_SAY.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </section>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          Don’t push the customer — Right Customer → Right Property → Right Information → Right
          Follow-up.
        </p>
      </div>
    </AppShell>
  );
}
