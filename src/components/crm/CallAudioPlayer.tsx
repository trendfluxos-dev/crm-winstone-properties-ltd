import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getAudioUrl } from "@/lib/crm.functions";
import { formatDuration } from "@/lib/crm-format";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function waveformBars(seed: string, count = 72): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  return Array.from({ length: count }, (_, i) => {
    hash = (hash * 1103515245 + 12345) % 2147483648;
    const base = 0.25 + ((hash >>> 8) % 100) / 133;
    const envelope = Math.sin((i / count) * Math.PI) * 0.5 + 0.5;
    return Math.min(1, base * envelope + 0.12);
  });
}

export function CallAudioPlayer({
  recordingId,
  audioPath,
  fallbackDuration,
  seekRequest,
  onTimeUpdate,
}: {
  recordingId: string;
  audioPath: string;
  fallbackDuration: number;
  seekRequest?: { at: number; nonce: number } | null;
  onTimeUpdate?: (seconds: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration);
  const [speed, setSpeed] = useState<number>(1);
  const bars = useMemo(() => waveformBars(recordingId), [recordingId]);

  const resolveUrl = useServerFn(getAudioUrl);
  const {
    mutate: loadUrl,
    data: source,
    isPending,
    isError,
  } = useMutation({
    mutationFn: () => resolveUrl({ data: { path: audioPath } }),
  });

  useEffect(() => {
    loadUrl();
  }, [loadUrl, audioPath]);

  useEffect(() => {
    if (!seekRequest || !audioRef.current) return;
    audioRef.current.currentTime = seekRequest.at;
    void audioRef.current.play().catch(() => undefined);
  }, [seekRequest]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, source]);

  const skip = (delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + delta), duration || el.duration || 0);
  };

  const scrub = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    el.currentTime = ratio * (duration || el.duration || 0);
  };

  const progress = duration > 0 ? current / duration : 0;

  return (
    <div className="rounded-2xl bg-ink p-3 text-ink-foreground shadow-inner">
      {source?.url && (
        <audio
          ref={audioRef}
          src={source.url}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
            e.currentTarget.playbackRate = speed;
          }}
          onTimeUpdate={(e) => {
            setCurrent(e.currentTarget.currentTime);
            onTimeUpdate?.(e.currentTarget.currentTime);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}

      <div className="flex items-center gap-3">
        <Button
          size="icon"
          className="size-10 shrink-0 rounded-full"
          disabled={!source?.url}
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            if (el.paused) void el.play().catch(() => undefined);
            else el.pause();
          }}
          aria-label={playing ? "Pause recording" : "Play recording"}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : playing ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>

        <div
          className="flex h-12 flex-1 cursor-pointer items-end gap-[2px]"
          onClick={scrub}
          role="presentation"
        >
          {bars.map((height, index) => {
            const played = index / bars.length <= progress;
            return (
              <span
                key={index}
                className={cn(
                  "flex-1 rounded-sm transition-colors",
                  played ? "bg-live" : "bg-ink-muted/40",
                )}
                style={{ height: `${Math.round(height * 100)}%` }}
              />
            );
          })}
        </div>

        <span className="tabular w-24 shrink-0 text-right text-xs text-ink-muted">
          {formatDuration(current)} / {formatDuration(duration)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="rounded-full bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/20"
          onClick={() => skip(-5)}
          disabled={!source?.url}
        >
          <RotateCcw className="size-3.5" /> 5s
        </Button>
        <Button
          size="sm"
          className="rounded-full bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/20"
          onClick={() => skip(5)}
          disabled={!source?.url}
        >
          <RotateCw className="size-3.5" /> 5s
        </Button>
        <div className="ml-auto flex items-center gap-1 rounded-full bg-ink-foreground/10 p-1">
          {SPEEDS.map((option) => (
            <button
              key={option}
              onClick={() => setSpeed(option)}
              className={cn(
                "tabular rounded-full px-2 py-1 text-xs transition-colors",
                speed === option
                  ? "bg-live text-live-foreground"
                  : "text-ink-muted hover:text-ink-foreground",
              )}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <p className="mt-2 text-xs text-destructive">
          This recording could not be loaded for playback.
        </p>
      )}
    </div>
  );
}
