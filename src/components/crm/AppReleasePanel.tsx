import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Smartphone, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminToken } from "@/lib/local-session";
import { listAppReleases, publishAppRelease } from "@/lib/releases.functions";

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < buffer.length; index += chunk) {
    binary += String.fromCharCode(...buffer.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/**
 * IT Console: publish a newly signed build of the phone app and see which
 * phones are already running which version. Phones are never installed to
 * remotely — each agent confirms the install on their own handset.
 */
export function AppReleasePanel() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [versionCode, setVersionCode] = useState("");
  const [versionName, setVersionName] = useState("");
  const [notes, setNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const releases = useQuery({
    queryKey: ["app-releases", adminToken],
    queryFn: () => listAppReleases({ data: { adminToken } }),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("APK ফাইল বাছুন");
      return publishAppRelease({
        data: {
          adminToken,
          versionCode: Number(versionCode),
          versionName: versionName.trim(),
          releaseNotes: notes.trim() || null,
          isMandatory: mandatory,
          fileBase64: await fileToBase64(file),
        },
      });
    },
    onSuccess: (result) => {
      toast.success(`ভার্সন ${result.release.version_name} প্রকাশিত হয়েছে`);
      setFile(null);
      setVersionCode("");
      setVersionName("");
      setNotes("");
      setMandatory(false);
      if (fileInput.current) fileInput.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["app-releases"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = releases.data;
  const latest = data?.releases[0] ?? null;
  const devices = data?.devices ?? [];
  const onLatest = latest
    ? devices.filter((device) => device.appVersion === latest.version_name).length
    : 0;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Smartphone className="size-4 text-primary" /> ফোন অ্যাপের নতুন ভার্সন
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">নতুন APK প্রকাশ করুন</p>
          <p className="text-xs text-muted-foreground">
            নিজের keystore দিয়ে সাইন করা APK আপলোড করুন। প্রকাশের পর প্রতিটি ফোনের অ্যাপ নিজেই নতুন
            ভার্সনের কথা জানাবে; ইনস্টল এজেন্ট নিজে অনুমতি দিয়ে করবেন।
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="release-code" className="text-xs">
                Version code
              </Label>
              <Input
                id="release-code"
                type="number"
                min={1}
                value={versionCode}
                onChange={(event) => setVersionCode(event.target.value)}
                placeholder="9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="release-name" className="text-xs">
                Version name
              </Label>
              <Input
                id="release-name"
                value={versionName}
                onChange={(event) => setVersionName(event.target.value)}
                placeholder="1.8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="release-notes" className="text-xs">
              কী বদলেছে (এজেন্ট দেখবেন)
            </Label>
            <Textarea
              id="release-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="নতুন ভার্সনের সংক্ষিপ্ত বর্ণনা"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="release-file" className="text-xs">
              APK ফাইল
            </Label>
            <Input
              id="release-file"
              ref={fileInput}
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={mandatory}
              onChange={(event) => setMandatory(event.target.checked)}
            />
            বাধ্যতামূলক আপডেট (এজেন্ট এড়াতে পারবেন না)
          </label>
          <Button
            size="sm"
            disabled={
              publish.isPending ||
              !file ||
              !versionCode ||
              versionName.trim().length === 0 ||
              data?.canWrite === false
            }
            onClick={() => publish.mutate()}
          >
            {publish.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UploadCloud className="size-4" />
            )}
            প্রকাশ করুন
          </Button>
          {data?.canWrite === false && (
            <p className="text-xs text-muted-foreground">
              এই সেশনটি শুধু দেখার জন্য — প্রকাশ করতে IT Console-এর মাস্টার পিন লাগবে।
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">ফোনগুলোর ভার্সন</p>
          {releases.isLoading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> লোড হচ্ছে…
            </p>
          )}
          {releases.isError && (
            <p className="text-xs text-destructive">
              {releases.error instanceof Error ? releases.error.message : "তথ্য পাওয়া যায়নি"}
            </p>
          )}
          {latest ? (
            <p className="text-xs text-muted-foreground">
              সর্বশেষ প্রকাশিত: <strong>{latest.version_name}</strong> (code{" "}
              {latest.version_code}) · {devices.length}টি সক্রিয় ফোনের মধ্যে {onLatest}টি এই
              ভার্সনে
            </p>
          ) : (
            !releases.isLoading && (
              <p className="text-xs text-muted-foreground">এখনো কোনো ভার্সন প্রকাশিত হয়নি।</p>
            )
          )}
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {devices.map((device) => {
              const current = latest && device.appVersion === latest.version_name;
              return (
                <li
                  key={device.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs"
                >
                  <span className="truncate">{device.label ?? "নামহীন ফোন"}</span>
                  <span className={current ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                    {device.appVersion ?? "ভার্সন জানা নেই"}
                    {current ? " ✔" : " — আপডেট বাকি"}
                  </span>
                </li>
              );
            })}
            {devices.length === 0 && !releases.isLoading && (
              <li className="text-xs text-muted-foreground">কোনো সক্রিয় ফোন নিবন্ধিত নেই।</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
