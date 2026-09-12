import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2, Save, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importMyLeads, parseLeadFile, type ParsedLeadRow } from "@/lib/lead-import.functions";
import { useAdminToken } from "@/lib/local-session";

const ACCEPT =
  ".csv,.tsv,.txt,.json,.pdf,.docx,.xlsx,.pptx,image/*,text/csv,application/pdf";

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Import leads from whatever the agent has: a CSV, a Word/Excel sheet, a PDF,
 * or a photo of a written list. The file is read into rows the agent can fix
 * before saving, so nothing enters the CRM unchecked.
 */
export function LeadImportDialog() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const parse = useServerFn(parseLeadFile);
  const save = useServerFn(importMyLeads);
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedLeadRow[]>([]);

  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = toBase64(await file.arrayBuffer());
      return parse({
        data: {
          adminToken,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          dataBase64,
        },
      });
    },
    onSuccess: (result) => {
      setRows(result.rows);
      toast.success(
        `${result.rows.length}টি লিড পাওয়া গেছে${result.skipped ? ` · ${result.skipped}টি বাদ পড়েছে (নম্বর নেই বা একই নম্বর)` : ""}`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { adminToken, rows } }),
    onSuccess: (result) => {
      toast.success(
        `${result.added}টি নতুন লিড যোগ হয়েছে${result.duplicate ? ` · ${result.duplicate}টি আগেই ছিল` : ""}`,
      );
      if (result.failed.length) toast.error(`${result.failed.length}টি সারি সংরক্ষণ হয়নি`);
      setRows([]);
      setFileName(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = (index: number, patch: Partial<ParsedLeadRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Upload className="size-4" /> লিড ইমপোর্ট
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>ফাইল থেকে লিড ইমপোর্ট</DialogTitle>
          <DialogDescription>
            CSV, Word, Excel, PDF বা তালিকার ছবি দিন — নাম, ঠিকানা, ফোন নম্বর, ক্রমিক ও রেফারেন্স
            আলাদা করে সাজিয়ে দেওয়া হবে। সংরক্ষণের আগে আপনি ঠিক করে নিতে পারবেন।
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setFileName(file.name);
              setRows([]);
              parseMutation.mutate(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              className="gap-2"
              disabled={parseMutation.isPending}
              onClick={() => fileInput.current?.click()}
            >
              {parseMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileUp className="size-4" />
              )}
              ফাইল বাছুন
            </Button>
            <p className="text-xs text-muted-foreground">
              {fileName ?? "সর্বোচ্চ ৮ মেগাবাইট"}
            </p>
          </div>

          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">ক্রমিক</th>
                    <th className="px-2 py-2 font-medium">নাম</th>
                    <th className="px-2 py-2 font-medium">ঠিকানা</th>
                    <th className="px-2 py-2 font-medium">ফোন</th>
                    <th className="px-2 py-2 font-medium">রেফারেন্স</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index} className="border-b border-border/60 last:border-0">
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 w-16"
                          value={row.serialNo ?? ""}
                          onChange={(e) => update(index, { serialNo: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8"
                          value={row.name}
                          onChange={(e) => update(index, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8"
                          value={row.address ?? ""}
                          onChange={(e) => update(index, { address: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="tabular h-8 w-36"
                          value={row.phoneNumber}
                          onChange={(e) => update(index, { phoneNumber: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8"
                          value={row.referenceBy ?? ""}
                          placeholder="নিজে / হেড অফিস"
                          onChange={(e) => update(index, { referenceBy: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="সারি বাদ দিন"
                          onClick={() => setRows((c) => c.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <Label className="text-xs text-muted-foreground">
              রেফারেন্স খালি রাখলে আপনার নিজের নাম বসে যাবে। সব লিড আপনার নিজের তালিকায় যাবে।
            </Label>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={rows.length === 0 || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {rows.length}টি লিড সংরক্ষণ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
