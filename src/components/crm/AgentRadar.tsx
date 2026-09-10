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
  on_call: { label: "On Call", dot: "bg-live", text: "text-live", ring: "border-live/40" },
  idle: { label: "Idle", dot: "bg-idle", text: "text-idle", ring: "border-idle/35" },
  offline: {
    label: "Offline",
    dot: "bg-offline",
    text: "text-muted-foreground",
    ring: "border-border",
  },
} as const;

export function AgentRadar({
  agents,
  calls,
}: {
  agents: Profile[];
  calls: CallRecording[];
}) {
  const now = useNow();

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold">Live Agent Radar</h2>
          <p className="text-sm text-muted-foreground">Who is talking right now, and for how long</p>
        </div>
        <span className="tabular text-xs text-muted-foreground">
          {agents.filter((a) => a.presence === "on_call").length} on call /{" "}
          {agents.length} agents
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {agents.map((agent) => {
          const style = PRESENCE[agent.presence];
          const lastCall = calls
            .filter((c) => c.agent_id === agent.id)
            .sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            )[0];
          const liveSeconds = agent.current_call_started_at
            ? Math.max(0, (now - new Date(agent.current_call_started_at).getTime()) / 1000)
            : null;

          return (
            <article
              key={agent.id}
              className={cn(
                "relative overflow-hidden rounded-xl border bg-card p-4 transition-colors",
                style.ring,
              )}
            >
              {agent.presence === "on_call" && (
                <span className="absolute inset-x-0 top-0 h-px animate-pulse bg-live" />
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid size-10 place-items-center rounded-full text-sm font-semibold"
                    style={{
                      backgroundColor: `oklch(0.35 0.06 ${agent.avatar_hue})`,
                      color: `oklch(0.92 0.06 ${agent.avatar_hue})`,
                    }}
                  >
                    {agent.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <p className="font-medium leading-tight">{agent.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {agent.role.replace("_", " ")}
                    </p>
                  </div>
                </div>

                <span className={cn("flex items-center gap-1.5 text-xs font-medium", style.text)}>
                  <span className="relative flex size-2">
                    {agent.presence === "on_call" && (
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-80" />
                    )}
                    <span className={cn("relative inline-flex size-2 rounded-full", style.dot)} />
                  </span>
                  {style.label}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-surface-2 p-2.5">
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <Timer className="size-3" />
                    {liveSeconds !== null ? "Current call" : "Last call"}
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
                    Last active
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
