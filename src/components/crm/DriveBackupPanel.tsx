import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Cloud, FolderSync, Loader2, Save, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  backupSingleRecordingToDriveFn,
  getDriveBackupSettingsFn,
  initializeDriveBackupFolderFn,
  saveDriveBackupSettingsFn,
  syncRecordingDocToDriveFn,
  syncRecordingsToDriveFn,
} from "@/lib/drive-backup.functions";

function todayDhaka() {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function DriveBackupPanel() {
  const getSettings = useServerFn(getDriveBackupSettingsFn);
  const saveSettings = useServerFn(saveDriveBackupSettingsFn);
  const initFolder = useServerFn(initializeDriveBackupFolderFn);
  const syncRecordings = useServerFn(syncRecordingsToDriveFn);
  const syncDoc = useServerFn(syncRecordingDocToDriveFn);
  const backupOne = useServerFn(backupSingleRecordingToDriveFn);

  const [dateKey, setDateKey] = useState(todayDhaka());
  const [recordingId, setRecordingId] = useState("");

  const {
    data: settings,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["drive-backup-settings"],
    queryFn: () => getSettings({}),
  });

  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null);
  const [folderIdDraft, setFolderIdDraft] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const folderId = folderIdDraft.trim() || (settings?.folderId ?? null);
      return saveSettings({ data: { enabled: enabledDraft ?? settings?.enabled ?? false, folderId } });
    },
    onSuccess: () => {
      toast.success("Google Drive ব্যাকআপ সেটিংস সংরক্ষিত হয়েছে");
      setEnabledDraft(null);
      setFolderIdDraft("");
      void refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const init = useMutation({
    mutationFn: () => initFolder({}),
    onSuccess: (data) => {
      toast.success("Drive ফোল্ডার তৈরি/লোড হয়েছে");
      setFolderIdDraft(data.folderId ?? "");
      void refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recordingsSync = useMutation({
    mutationFn: () => syncRecordings({ data: { dateKey } }),
    onSuccess: (data) => {
      toast.success(
        `${data.attempted}টি চেষ্টা · ${data.done}টি জমা · ${data.failed}টি ব্যর্থ`,
      );
      if (data.errors.length > 0) console.error("Drive sync errors", data.errors);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const docSync = useMutation({
    mutationFn: () => syncDoc({ data: { dateKey } }),
    onSuccess: (data) => {
      toast.success(`${data.calls}টি কল · ${data.recordings}টি রেকর্ডিংয়ের ডক Google Drive-ে জমা হয়েছে`);
      window.open(data.docUrl, "_blank", "noopener,noreferrer");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const singleBackup = useMutation({
    mutationFn: () => backupOne({ data: { recordingId } }),
    onSuccess: (data) => {
      toast.success(`${data.driveFileName} Google Drive-ে জমা হয়েছে`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const enabledValue = enabledDraft ?? settings?.enabled ?? false;
  const folderIdValue =
    folderIdDraft || settings?.folderId || "";

  return (
    <section className="card-elevated p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Cloud className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Google Drive ব্যাকআপ</h2>
      </header>

      <p className="mt-1 text-xs text-muted-foreground">
        রেকর্ডিং ফাইল ও দৈনিক সারসংক্ষেপ ডক সরাসরি কোম্পানির নির্ধারিত Google Drive ফোল্ডারে জমা হয়।
        এখানে ফোল্ডার আইডি দিন, বা "নতুন ফোল্ডার তৈরি করুন" চাপুন।
      </p>

      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          সেটিংস লোড হচ্ছে...
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="drive-enabled" className="text-sm font-medium">
                ব্যাকআপ চালু
              </Label>
              <Switch
                id="drive-enabled"
                checked={enabledValue}
                onCheckedChange={(checked) => setEnabledDraft(checked)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="drive-folder" className="text-xs text-muted-foreground">
                Google Drive ফোল্ডার আইডি (URL-এর শেষ অংশ)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="drive-folder"
                  value={folderIdValue}
                  onChange={(event) => setFolderIdDraft(event.target.value)}
                  placeholder="1A2B3C..."
                  className="flex-1 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={init.isPending}
                  onClick={() => init.mutate()}
                  title="Winstone Recordings নামে ফোল্ডার তৈরি/বের করুন"
                >
                  {init.isPending ? <Loader2 className="size-4 animate-spin" /> : <FolderSync className="size-4" />}
                </Button>
              </div>
              {settings?.folderUrl && (
                <a
                  href={settings.folderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-primary underline"
                >
                  Drive ফোল্ডারটি খুলুন
                </a>
              )}
            </div>

            <Button
              size="sm"
              className="w-full"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
              সেটিংস সংরক্ষণ করুন
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Settings className="size-3.5" />
              ম্যানুয়াল সিঙ্ক
            </p>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateKey}
                max={todayDhaka()}
                onChange={(event) => setDateKey(event.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={recordingsSync.isPending}
                onClick={() => recordingsSync.mutate()}
              >
                {recordingsSync.isPending ? <Loader2 className="size-4 animate-spin" /> : "রেকর্ডিং জমা"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={docSync.isPending}
                onClick={() => docSync.mutate()}
              >
                {docSync.isPending ? <Loader2 className="size-4 animate-spin" /> : "ডক জমা"}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={recordingId}
                onChange={(event) => setRecordingId(event.target.value)}
                placeholder="রেকর্ডিং আইডি"
                className="flex-1 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={singleBackup.isPending || !recordingId}
                onClick={() => singleBackup.mutate()}
              >
                {singleBackup.isPending ? <Loader2 className="size-4 animate-spin" /> : "জমা"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
