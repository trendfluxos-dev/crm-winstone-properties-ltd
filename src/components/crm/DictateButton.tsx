import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Microphone dictation for a text field, using the browser's own speech
 * recognition (no paid speech service). Recognised text is APPENDED to whatever
 * the agent already typed — it never clears the field — and it never submits the
 * form. Tap once to listen, tap again to stop.
 */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, new () => Recognition>;
  return w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null;
}

export function DictateButton({
  onAppend,
  lang = "bn-BD",
  label = "বলে লিখুন",
}: {
  onAppend: (text: string) => void;
  lang?: string;
  label?: string;
}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const ref = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(Boolean(recognitionCtor()));
    return () => {
      try {
        ref.current?.stop();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  const start = () => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      toast.error("এই ব্রাউজারে ভয়েস লেখা নেই — Chrome ব্যবহার করুন বা টাইপ করুন");
      return;
    }
    const rec = new Ctor();
    ref.current = rec;
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event: unknown) => {
      const e = event as {
        resultIndex: number;
        results: { length: number; [i: number]: { 0: { transcript: string }; isFinal: boolean } };
      };
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const item = e.results[i];
        if (item?.isFinal) text += `${item[0].transcript} `;
      }
      const trimmed = text.trim();
      if (trimmed) onAppend(trimmed);
    };
    rec.onerror = (event: unknown) => {
      const code = (event as { error?: string }).error ?? "";
      setListening(false);
      toast.error(
        code === "not-allowed"
          ? "মাইক্রোফোনের অনুমতি দিন (ব্রাউজার সেটিং)"
          : code === "no-speech"
            ? "কিছু শোনা যায়নি — আবার চেষ্টা করুন"
            : "ভয়েস লেখা বন্ধ হয়ে গেল — আবার চাপুন",
      );
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const stop = () => {
    try {
      ref.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={listening ? "destructive" : "secondary"}
      className="h-7 gap-1 px-2 text-[11px]"
      onClick={() => (listening ? stop() : start())}
      title={supported ? label : "এই ব্রাউজারে ভয়েস লেখা নেই"}
    >
      {listening ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
      {listening ? "শুনছি… থামান" : label}
    </Button>
  );
}
