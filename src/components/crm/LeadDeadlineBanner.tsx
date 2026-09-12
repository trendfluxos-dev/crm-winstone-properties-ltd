import { useQuery } from "@tanstack/react-query";
import { AlarmClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type DeadlineConfig = {
  text?: string;
  dueAt?: string;
  target?: number;
};

/**
 * Shows the supervisor-set daily lead deadline on the agent desk.
 * Reads public.app_config row `daily_lead_deadline`; hides when absent
 * or when the deadline has passed.
 */
export function LeadDeadlineBanner() {
  const { data } = useQuery({
    queryKey: ["daily-lead-deadline"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<DeadlineConfig | null> => {
      const { data: row, error } = await supabase
        .from("app_config")
        .select("data")
        .eq("id", "daily_lead_deadline")
        .maybeSingle();
      if (error || !row) return null;
      return (row.data ?? null) as DeadlineConfig | null;
    },
  });

  if (!data?.text || !data.dueAt) return null;
  const due = new Date(data.dueAt);
  if (Number.isNaN(due.getTime()) || due.getTime() < Date.now()) return null;

  const dueText = new Intl.DateTimeFormat("bn-BD", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(due);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <AlarmClock className="mt-0.5 size-5 shrink-0 text-amber-600" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          আজকের লক্ষ্য{data.target ? `: ${data.target}টি লিড` : ""} — শেষ সময় {dueText}
        </p>
        <p className="text-xs text-amber-700/90 dark:text-amber-300/90">{data.text}</p>
      </div>
    </div>
  );
}
