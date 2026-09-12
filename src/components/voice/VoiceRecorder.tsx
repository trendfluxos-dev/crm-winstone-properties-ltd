import { useServerFn } from "@tanstack/react-start";
import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { encodeWav } from "@/lib/wav";
import { transcribeAudio } from "@/lib/transcribe.functions";

const CHUNK_MS = 4000;
const FFT_SIZE = 256;

export function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [partial, setPartial] = useState("");
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState("bn-BD");

  const transcriptRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pcmRef = useRef<Float32Array[]>([]);
  const intervalRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const sampleRateRef = useRef<number>(16000);

  const transcribe = useServerFn(transcribeAudio);

  useEffect(() => {
    return () => {
      void stopRecording(true);
    };
  }, []);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, partial]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      sampleRateRef.current = audioCtx.sampleRate;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyserRef.current = analyser;

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        pcmRef.current.push(new Float32Array(input));
      };
      processorRef.current = processor;

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioCtx.destination);

      setIsRecording(true);
      drawWaveform();

      intervalRef.current = window.setInterval(() => {
        flushChunk(false);
      }, CHUNK_MS);
    } catch (error) {
      toast.error("মাইক্রোফোন অনুমতি দরকার — ব্রাউজার সেটিং চেক করুন");
      console.error(error);
    }
  }

  async function stopRecording(silent = false) {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    await audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    processorRef.current = null;
    sourceRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;

    if (isRecording) {
      await flushChunk(true);
      if (!silent) toast.success("রেকর্ডিং শেষ");
    }
    setIsRecording(false);
    setPartial("");
  }

  async function flushChunk(final: boolean) {
    const chunks = pcmRef.current.splice(0);
    if (chunks.length === 0) return;

    const blob = encodeWav(chunks, sampleRateRef.current);
    if (blob.size < 2048) return; // skip empty/silent chunks

    setBusy(true);
    setPartial("...");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const { text } = await transcribe({
        data: { audioBase64: base64, language },
      });
      if (text) {
        setTranscript((prev) => [...prev, text.trim()]);
      }
      setPartial("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Transcription error";
      toast.error(message);
      setPartial("");
    } finally {
      setBusy(false);
    }
  }

  function drawWaveform() {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser || !isRecording) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(buffer);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "hsl(var(--primary))";
    ctx.beginPath();

    const slice = canvas.width / buffer.length;
    let x = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i] / 128.0;
      const y = (v * canvas.height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += slice;
    }
    ctx.stroke();

    rafRef.current = requestAnimationFrame(drawWaveform);
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <Card className="card-elevated overflow-hidden">
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">বাংলা ভয়েস ট্রান্সক্রিপশন</h2>
              <p className="text-sm text-muted-foreground">মাইক বোতাম চাপুন, বলুন — লেখা স্বয়ংক্রিয়ভাবে আসবে</p>
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
            >
              <option value="bn-BD">বাংলা (bn-BD)</option>
              <option value="bn">বাংলা (bn)</option>
              <option value="en">English</option>
            </select>
          </div>

          <div className="relative h-32 w-full overflow-hidden rounded-lg bg-surface">
            <canvas ref={canvasRef} width={640} height={128} className="h-full w-full" />
            {!isRecording && (
              <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                রেকর্ড শুরু করতে মাইক আইকনে চাপুন
              </p>
            )}
          </div>

          <div className="flex justify-center gap-3">
            {!isRecording ? (
              <Button size="lg" onClick={startRecording} disabled={busy}>
                <Mic className="mr-2 size-5" />
                রেকর্ড শুরু করুন
              </Button>
            ) : (
              <Button size="lg" variant="destructive" onClick={() => stopRecording()} disabled={busy}>
                <Square className="mr-2 size-5" />
                থামুন
              </Button>
            )}
          </div>

          {busy && <p className="text-center text-sm text-muted-foreground">শুনছি…</p>}
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardContent className="p-0">
          <div
            ref={transcriptRef}
            className="h-64 space-y-2 overflow-y-auto p-4 text-lg leading-relaxed"
          >
            {transcript.length === 0 && !partial && (
              <p className="text-sm text-muted-foreground">এখনো কোনো লেখা নেই।</p>
            )}
            {transcript.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            {partial && <p className="text-muted-foreground">{partial}</p>}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
