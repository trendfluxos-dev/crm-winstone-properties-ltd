import { createFileRoute } from "@tanstack/react-router";

import { VoiceRecorder } from "@/components/voice/VoiceRecorder";

export const Route = createFileRoute("/voice-transcription")({
  component: VoiceTranscriptionPage,
  head: () => ({
    meta: [
      { title: "Voice Transcription — Winstone Connect" },
      { name: "description", content: "Record Bengali speech and get instant transcription" },
      { property: "og:title", content: "Voice Transcription — Winstone Connect" },
      {
        property: "og:description",
        content: "Record Bengali speech and get instant transcription",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function VoiceTranscriptionPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold sm:text-3xl">Voice Transcription</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Web Audio API + বাংলা STT — কথা বলুন, লেখা পান
          </p>
        </header>
        <VoiceRecorder />
      </div>
    </main>
  );
}
