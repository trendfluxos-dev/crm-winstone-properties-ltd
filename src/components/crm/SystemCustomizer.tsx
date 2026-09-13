import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Save, Settings2, ShieldCheck, Sliders, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getAppConfig, resetAppConfig, saveAppConfig } from "@/lib/config.functions";
import {
  DEFAULT_CONFIG,
  FIELD_TYPE_LABELS,
  PERMISSION_LABELS,
  type AppConfig,
  type CustomField,
} from "@/lib/crm-config";
import { useAdminToken } from "@/lib/local-session";

export const appConfigQuery = {
  queryKey: ["app-config"] as const,
  queryFn: () => getAppConfig(),
  staleTime: 30_000,
};

/** IT customizer: extra lead fields, floor rules and agent permissions. */
export function SystemCustomizer() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(appConfigQuery);
  const [draft, setDraft] = useState<AppConfig>(DEFAULT_CONFIG);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.config && !dirty) setDraft(data.config);
  }, [data?.config, dirty]);

  const edit = (patch: (current: AppConfig) => AppConfig) => {
    setDraft((current) => patch(current));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => saveAppConfig({ data: { adminToken: adminToken ?? "", config: draft } }),
    onSuccess: async () => {
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["app-config"] });
      toast.success("নিয়ম সংরক্ষিত — পরের সিঙ্কে প্রতিটি ডিভাইসে চলে যাবে");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reset = useMutation({
    mutationFn: () => resetAppConfig({ data: { adminToken: adminToken ?? "" } }),
    onSuccess: async (result) => {
      setDraft(result.config);
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["app-config"] });
      toast.success("ডিফল্ট সেটিং ফেরত আনা হয়েছে");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addField = () =>
    edit((c) => ({
      ...c,
      fields: [
        ...c.fields,
        {
          key: `field_${c.fields.length + 1}`,
          label: "নতুন ফিল্ড",
          type: "text",
          required: false,
          options: [],
        },
      ],
    }));

  const updateField = (index: number, patch: Partial<CustomField>) =>
    edit((c) => ({
      ...c,
      fields: c.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));

  const removeField = (index: number) =>
    edit((c) => ({ ...c, fields: c.fields.filter((_, i) => i !== index) }));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Settings2 className="size-4 text-primary" /> সিস্টেম কাস্টমাইজার
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {data?.updatedAt && (
            <span className="text-xs text-muted-foreground">
              সর্বশেষ সংরক্ষণ {new Date(data.updatedAt).toLocaleString("bn-BD")}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => reset.mutate()}
            disabled={reset.isPending || !adminToken}
          >
            <RotateCcw className="size-4" /> ডিফল্টে ফিরুন
          </Button>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending || !adminToken}
          >
            <Save className="size-4" /> {save.isPending ? "সংরক্ষণ হচ্ছে…" : "নিয়ম সংরক্ষণ"}
          </Button>
        </div>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">বর্তমান নিয়ম লোড হচ্ছে…</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-elevated space-y-4 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sliders className="size-4 text-primary" /> ফ্লোরের নিয়ম
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberRow
              label="এত সেকেন্ড পর কল 'কথা হয়েছে' গণ্য"
              suffix="সেকেন্ড"
              value={draft.rules.minConnectedSeconds}
              onChange={(v) =>
                edit((c) => ({ ...c, rules: { ...c.rules, minConnectedSeconds: v } }))
              }
            />
            <NumberRow
              label="ফলো-আপ কলের সময়সীমা"
              suffix="ঘণ্টা"
              value={draft.rules.followUpSlaHours}
              onChange={(v) => edit((c) => ({ ...c, rules: { ...c.rules, followUpSlaHours: v } }))}
            />
            <NumberRow
              label="দৈনিক কলের লক্ষ্য"
              suffix="টি কল"
              value={draft.rules.dailyDialTarget}
              onChange={(v) => edit((c) => ({ ...c, rules: { ...c.rules, dailyDialTarget: v } }))}
            />
            <NumberRow
              label="এতবার চেষ্টার পর লিড পার্ক হবে"
              suffix="বার"
              value={draft.rules.maxAttemptsBeforeDrop}
              onChange={(v) =>
                edit((c) => ({ ...c, rules: { ...c.rules, maxAttemptsBeforeDrop: v } }))
              }
            />
            <NumberRow
              label="সিম কলের খরচ"
              suffix="৳/মিনিট"

              value={draft.rules.ratePerMinute}
              onChange={(v) => edit((c) => ({ ...c, rules: { ...c.rules, ratePerMinute: v } }))}
            />
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <ToggleRow
              label="Auto-assign new leads"
              hint="Website and ad leads go to the lightest workload."
              checked={draft.rules.autoAssignNewLeads}
              onChange={(v) =>
                edit((c) => ({ ...c, rules: { ...c.rules, autoAssignNewLeads: v } }))
              }
            />
            <ToggleRow
              label="Recording required on every call"
              hint="The phone app must upload audio for each dial."
              checked={draft.rules.requireCallRecording}
              onChange={(v) =>
                edit((c) => ({ ...c, rules: { ...c.rules, requireCallRecording: v } }))
              }
            />
            <ToggleRow
              label="Ask the customer before recording"
              hint="Phone app plays a consent prompt first."
              checked={draft.rules.askRecordingConsent}
              onChange={(v) =>
                edit((c) => ({ ...c, rules: { ...c.rules, askRecordingConsent: v } }))
              }
            />
          </div>
        </div>

        <div className="card-elevated space-y-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" /> Agent permissions
          </h3>
          <div className="space-y-2">
            {PERMISSION_LABELS.map((p) => (
              <ToggleRow
                key={p.key}
                label={p.label}
                hint={p.hint}
                checked={draft.permissions[p.key]}
                onChange={(v) =>
                  edit((c) => ({ ...c, permissions: { ...c.permissions, [p.key]: v } }))
                }
              />
            ))}
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3">
              <div>
                <p className="text-sm font-medium">Use the AI Coach</p>
                <p className="text-xs text-muted-foreground">
                  Always on for every agent — cannot be switched off.
                </p>
              </div>
              <span className="rounded-full bg-live/15 px-2 py-0.5 text-xs font-medium text-live">
                Always on
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card-elevated space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" /> Agent integrations (AI assistants)
        </h3>
        <p className="text-xs text-muted-foreground">
          Only these email addresses can reach the CRM from an AI assistant such as ChatGPT or
          Claude. They must sign in with that Google account first. Leave it empty to block
          everyone.
        </p>
        <Label className="text-xs text-muted-foreground">
          Approved email addresses (comma separated)
        </Label>
        <Input
          value={draft.mcpAllowedEmails.join(", ")}
          placeholder="you@winstonebd.com, manager@winstonebd.com"
          onChange={(e) =>
            edit((c) => ({
              ...c,
              mcpAllowedEmails: e.target.value
                .split(",")
                .map((v) => v.trim().toLowerCase())
                .filter(Boolean)
                .slice(0, 25),
            }))
          }
        />
      </div>

      <div className="card-elevated space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Extra lead fields</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={addField}
            disabled={draft.fields.length >= 20}
          >
            <Plus className="size-4" /> Add field
          </Button>
        </div>
        {draft.fields.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No extra fields yet. Add one to collect things like plot size or budget on every lead.
          </p>
        )}
        <div className="space-y-3">
          {draft.fields.map((field, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl border border-border bg-surface-2 p-3 sm:grid-cols-[1fr_1fr_140px_auto]"
            >
              <div>
                <Label className="text-xs text-muted-foreground">Label</Label>
                <Input
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Key (used by the phone app)</Label>
                <Input
                  value={field.key}
                  onChange={(e) =>
                    updateField(index, {
                      key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select
                  value={field.type}
                  onValueChange={(v) => updateField(index, { type: v as CustomField["type"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                  <Switch
                    checked={field.required}
                    onCheckedChange={(v) => updateField(index, { required: v })}
                  />
                  Required
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeField(index)}
                  aria-label="Remove field"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              {field.type === "select" && (
                <div className="sm:col-span-4">
                  <Label className="text-xs text-muted-foreground">
                    Dropdown choices (comma separated)
                  </Label>
                  <Input
                    value={field.options.join(", ")}
                    onChange={(e) =>
                      updateField(index, {
                        options: e.target.value
                          .split(",")
                          .map((o) => o.trim())
                          .filter(Boolean)
                          .slice(0, 20),
                      })
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={String(value)}
          inputMode="decimal"
          onChange={(e) => {
            const next = Number(e.target.value.replace(/[^\d.]/g, ""));
            onChange(Number.isFinite(next) ? next : 0);
          }}
        />
        <span className="whitespace-nowrap text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
