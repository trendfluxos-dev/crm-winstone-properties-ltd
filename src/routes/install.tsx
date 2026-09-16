import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Download, Globe, Smartphone, ShieldCheck, Info } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";

const APK_PATH = "/api/public/download/apk";

type Release = {
  version_code: number;
  version_name: string;
  release_notes: string | null;
  released_at: string | null;
};

export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: "Install Winstone Connect — Android App & Web App" },
      {
        name: "description",
        content:
          "Download the Winstone Connect Android app, or install the Winstone CRM web app on your phone home screen. Sign in with your existing CRM account.",
      },
      { property: "og:title", content: "Install Winstone Connect" },
      {
        property: "og:description",
        content:
          "Android app download plus home-screen install for the Winstone Connect tele-sales system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InstallPage,
});

function InstallPage() {
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  const [releaseChecked, setReleaseChecked] = useState(false);

  const apkUrl = origin ? `${origin}${APK_PATH}` : APK_PATH;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    void (async () => {
      const { default: QRCode } = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(`${origin}${APK_PATH}`, {
        width: 360,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      if (!cancelled) setQr(dataUrl);
    })().catch(() => setQr(null));
    return () => {
      cancelled = true;
    };
  }, [origin]);

  // Real release metadata only — the same endpoint the phones use.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/public/agent/version?version_code=0", {
      headers: { accept: "application/json" },
    })
      .then((res) => res.json())
      .then((body: { latest: Release | null }) => {
        if (cancelled) return;
        setRelease(body.latest ?? null);
        setReleaseChecked(true);
      })
      .catch(() => setReleaseChecked(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(apkUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <header>
          <p className="eyebrow">App Delivery</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Winstone Connect অ্যাপ ইনস্টল
          </h1>
          <div className="gold-rule mt-3" />
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            দুইভাবে চালানো যায় — ফোনের জন্য নেটিভ Android অ্যাপ (কল রেকর্ডিং ও সিঙ্ক সহ), অথবা
            ব্রাউজার থেকে হোম স্ক্রিনে বসানো ওয়েব অ্যাপ। দুই জায়গাতেই আপনার বর্তমান CRM অ্যাকাউন্ট
            দিয়েই লগইন করবেন — নতুন কোনো অ্যাকাউন্ট লাগবে না।
          </p>
        </header>

        {/* Native Android APK */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Smartphone className="size-4 text-primary" />
            <h2 className="text-lg font-semibold">Android অ্যাপ (APK)</h2>
          </div>

          <div className="mt-4 grid gap-5 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              {qr ? (
                <img
                  src={qr}
                  alt="Winstone Connect Android অ্যাপ ডাউনলোড লিংকের QR কোড"
                  className="size-44 rounded-lg border border-border bg-background p-1"
                  width={176}
                  height={176}
                />
              ) : (
                <div className="flex size-44 items-center justify-center rounded-lg border border-border text-xs text-muted-foreground">
                  QR তৈরি হচ্ছে…
                </div>
              )}
              <p className="text-center text-xs text-muted-foreground">
                ফোনের ক্যামেরা দিয়ে স্ক্যান করুন
              </p>
            </div>

            <div className="min-w-0 space-y-4">
              <code className="block truncate rounded-md border border-border bg-surface px-3 py-2 text-xs">
                {apkUrl}
              </code>

              <div className="flex flex-wrap gap-2">
                <Button asChild className="h-10">
                  <a href={APK_PATH}>
                    <Download className="size-4" /> APK ডাউনলোড
                  </a>
                </Button>
                <Button variant="outline" className="h-10" onClick={() => void copy()}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "কপি হয়েছে" : "লিংক কপি"}
                </Button>
              </div>

              <ol className="space-y-1.5 text-sm text-foreground">
                <li>
                  <span className="font-semibold text-primary">১.</span> উপরের বাটন বা QR থেকে APK
                  ফাইল ডাউনলোড করুন।
                </li>
                <li>
                  <span className="font-semibold text-primary">২.</span> Android যদি জিজ্ঞেস করে, এই
                  ব্রাউজারের জন্য “Install unknown apps” অনুমতি দিন।
                </li>
                <li>
                  <span className="font-semibold text-primary">৩.</span> ডাউনলোড হওয়া ফাইলে ট্যাপ
                  করে Install দিন।
                </li>
                <li>
                  <span className="font-semibold text-primary">৪.</span> অ্যাপ খুলে আপনার CRM ফোন
                  নম্বর ও পাসওয়ার্ড দিয়ে লগইন করুন।
                </li>
                <li>
                  <span className="font-semibold text-primary">৫.</span> নতুন ভার্সন এলে অ্যাপ নিজেই
                  জানাবে — সেখান থেকেই আপডেট ইনস্টল করুন।
                </li>
              </ol>

              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs">
                {!releaseChecked ? (
                  <span className="text-muted-foreground">রিলিজ তথ্য দেখা হচ্ছে…</span>
                ) : release ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <ShieldCheck className="size-3.5 text-success" />
                    <span className="font-semibold">
                      সর্বশেষ প্রকাশিত: v{release.version_name} (build {release.version_code})
                    </span>
                    {release.released_at ? (
                      <span className="text-muted-foreground">
                        · {new Date(release.released_at).toLocaleDateString("bn-BD")}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="flex items-start gap-2 text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0 text-info" />
                    এখনো IT কনসোল থেকে কোনো রিলিজ প্রকাশ করা হয়নি — ডাউনলোড লিংক প্রজেক্টে থাকা
                    বিল্ডটি দিচ্ছে। রিলিজ প্রকাশ করলে এখানে ভার্সন দেখা যাবে।
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Web app / PWA */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            <h2 className="text-lg font-semibold">ওয়েব অ্যাপ (হোম স্ক্রিন)</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Android অ্যাপের বিকল্প নয় — কল রেকর্ডিং ও অটো কল-সিঙ্ক শুধু নেটিভ Android অ্যাপেই হয়।
            ওয়েব অ্যাপ লিড, রিপোর্ট ও ড্যাশবোর্ডের জন্য, ল্যাপটপ ও iPhone-এও চলে।
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>
              <span className="font-semibold text-primary">Chrome (Android/Desktop):</span> মেনু →
              “Install app” / “Add to Home screen”।
            </li>
            <li>
              <span className="font-semibold text-primary">Safari (iPhone/iPad):</span> Share বাটন →
              “Add to Home Screen”।
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
