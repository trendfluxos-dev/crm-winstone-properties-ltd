import { PhoneCall, PhoneOff, Timer } from "lucide-react";
import { useEffect, useState } from "react";

import type { CallRecording, Profile } from "@/lib/crm-data";
import { formatDuration, relativeTime } from "@/lib/crm-format";
import { cn } from "@/lib/utils";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const PRESENCE = {
  on_call: {
    label: "কলে আছে",
    dot: "bg-live",
    text: "text-live",
    ring: "border-live/40",
    pill: "bg-live/10 text-live border-live/25",
  },
  idle: {
    label: "খালি",
    dot: "bg-idle",
    text: "text-idle-foreground",
    ring: "border-border",
    pill: "bg-idle/15 text-idle-foreground border-idle/30",
  },
  offline: {
    label: "অফলাইন",
    dot: "bg-offline",
    text: "text-muted-foreground",
    ring: "border-border",
    pill: "bg-surface-2 text-muted-foreground border-border",
  },
} as const;

export function AgentRadar({
  agents,
  calls,
  onSelectAgent,
}: {
  agents: Profile[];
  calls: CallRecording[];
  onSelectAgent?: (agentId: string) => void;
}) {
  const now = useNow();

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold sm:text-lg">লাইভ এজেন্ট রাডার</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            এই মুহূর্তে কে কথা বলছে, কতক্ষণ ধরে
          </p>
        </div>
        <span className="tabular text-xs text-muted-foreground">
          {agents.filter((a) => a.presence === "on_call").length} জন কলে / {agents.length} জন এজেন্ট
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {agents.map((agent) => {
          const style = PRESENCE[agent.presence];
          const lastCall = calls
            .filter((c) => c.agent_id === agent.id)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          const liveSeconds = agent.current_call_started_at
            ? Math.max(0, (now - new Date(agent.current_call_started_at).getTime()) / 1000)
            : null;

          return (
            <article
              key={agent.id}
              role={onSelectAgent ? "button" : undefined}
              tabIndex={onSelectAgent ? 0 : undefined}
              onClick={() => onSelectAgent?.(agent.id)}
              onKeyDown={(e) => {
                if (onSelectAgent && (e.key === "Enter" || e.key === " ")) onSelectAgent(agent.id);
              }}
              className={cn(
                "card-elevated relative overflow-hidden p-4 text-left",
                onSelectAgent && "cursor-pointer hover:border-primary/40",
                style.ring,
              )}
            >
              {agent.presence === "on_call" && (
                <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-live/0 via-live to-live/0" />
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-11 place-items-center rounded-full text-sm font-semibold ring-2 ring-offset-2 ring-offset-card",
                      agent.presence === "on_call" && "glow-live ring-live",
                      agent.presence === "idle" && "ring-idle/70",
                      agent.presence === "offline" && "ring-border",
                    )}
                    style={{
                      backgroundColor: `oklch(0.93 0.05 ${agent.avatar_hue})`,
                      color: `oklch(0.4 0.12 ${agent.avatar_hue})`,
                    }}
                  >
                    {agent.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <p className="font-semibold leading-tight tracking-tight">{agent.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {agent.role.replace("_", " ")}
                    </p>
                  </div>
                </div>

                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    style.pill,
                  )}
                >
                  <span className="relative flex size-2">
                    {agent.presence === "on_call" && (
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-80" />
                    )}
                    <span className={cn("relative inline-flex size-2 rounded-full", style.dot)} />
                  </span>
                  {liveSeconds !== null ? (
                    <span className="tabular">{formatDuration(liveSeconds)}</span>
                  ) : (
                    style.label
                  )}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-surface-2 p-2.5">
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <Timer className="size-3" />
                    {liveSeconds !== null ? "চলতি কল" : "শেষ কল"}
                  </dt>
                  <dd className="tabular mt-1 text-base font-semibold">
                    {liveSeconds !== null
                      ? formatDuration(liveSeconds)
                      : lastCall
                        ? formatDuration(lastCall.duration_seconds)
                        : "--:--"}
                  </dd>
                </div>
                <div className="rounded-lg bg-surface-2 p-2.5">
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    {agent.presence === "offline" ? (
                      <PhoneOff className="size-3" />
                    ) : (
                      <PhoneCall className="size-3" />
                    )}
                    শেষ সক্রিয়
                  </dt>
                  <dd className="mt-1 text-base font-semibold">
                    {relativeTime(agent.last_active_at)}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
