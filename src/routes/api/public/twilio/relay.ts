/**
 * Twilio ConversationRelay WebSocket endpoint.
 *
 * Twilio upgrades this URL to a WebSocket for the whole call, sends `setup`,
 * then `prompt` / `dtmf` / `interrupt` / `error` messages. We answer with
 * streamed `text` tokens (spoken by Twilio's TTS) and finish with an `end`
 * message when the caller should be handed to a human.
 */

import { createFileRoute } from "@tanstack/react-router";

type RelayIncoming =
  | { type: "setup"; sessionId: string; callSid: string; from: string; to: string; direction: string; callStatus?: string }
  | { type: "prompt"; voicePrompt: string; lang?: string; last?: boolean }
  | { type: "dtmf"; digit: string }
  | { type: "interrupt"; utteranceUntilInterrupt?: string; durationUntilInterruptMs?: number }
  | { type: "error"; description?: string };

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket & { accept(): void } };
};

export const Route = createFileRoute("/api/public/twilio/relay")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
          return new Response("Expected a WebSocket upgrade", { status: 426 });
        }

        const { relaySettings, openSession, saveTurn, closeSession, streamReply, wantsHuman } = await import(
          "@/lib/relay.server"
        );
        const { twilioConfig, validateSignature } = await import("@/lib/twilio.server");

        const settings = await relaySettings();
        if (!settings.enabled) {
          return new Response("AI voice is turned off", { status: 503 });
        }

        const cfg = twilioConfig();
        const signature = request.headers.get("X-Twilio-Signature");
        if (!validateSignature(cfg, request.url, {}, signature)) {
          const { markWebhookRejected } = await import("@/lib/webhook-log.server");
          await markWebhookRejected({
            provider: "twilio",
            eventType: "relay",
            reason: "invalid X-Twilio-Signature on WebSocket upgrade",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        if (typeof WebSocketPair === "undefined") {
          return new Response("WebSockets are not available in this runtime", { status: 501 });
        }

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        server.accept();

        let session: Awaited<ReturnType<typeof openSession>> | null = null;
        let turnIndex = 0;
        const history: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
        let closing = false;

        const send = (payload: Record<string, unknown>) => {
          try {
            server.send(JSON.stringify(payload));
          } catch (error) {
            console.error("[relay] send failed", error);
          }
        };

        const speak = (text: string, last: boolean) => {
          send({ type: "text", token: text, last, interruptible: true, preemptible: false });
        };

        const answer = async (spoken: string, lang?: string) => {
          if (!session) return;
          await saveTurn({
            rowId: session.rowId,
            turnIndex: turnIndex++,
            role: "customer",
            content: spoken,
            language: lang ?? settings.language,
          });
          history.push({ role: "user", content: spoken });

          const handoff = settings.handoffEnabled && wantsHuman(spoken);

          try {
            const reply = await streamReply(
              [{ role: "system", content: session.systemPrompt }, ...history.slice(-12)],
              (token) => speak(token, false),
            );
            speak("", true);
            history.push({ role: "assistant", content: reply });
            await saveTurn({
              rowId: session.rowId,
              turnIndex: turnIndex++,
              role: "assistant",
              content: reply,
              language: settings.ttsLanguage,
            });

            if (handoff) {
              closing = true;
              await closeSession({
                rowId: session.rowId,
                status: "handoff",
                handoffReason: "caller asked for a human",
                handoffAgentId: session.agentId,
              });
              send({
                type: "end",
                handoffData: JSON.stringify({
                  reasonCode: "live-agent-handoff",
                  reason: "caller asked for a human",
                  agentPhone: session.agentPhone,
                  leadId: session.leadId,
                }),
              });
            }
          } catch (error) {
            console.error("[relay] AI reply failed", error);
            speak("দুঃখিত, একটু সমস্যা হচ্ছে। আপনার এজেন্ট আপনাকে ফিরতি কল দেবেন।", true);
            closing = true;
            await closeSession({
              rowId: session.rowId,
              status: "failed",
              errorMessage: String(error).slice(0, 400),
            });
            send({
              type: "end",
              handoffData: JSON.stringify({ reasonCode: "ai-error", agentPhone: session.agentPhone }),
            });
          }
        };

        server.addEventListener("message", (event: MessageEvent) => {
          void (async () => {
            let message: RelayIncoming;
            try {
              message = JSON.parse(String(event.data)) as RelayIncoming;
            } catch {
              return;
            }

            try {
              if (message.type === "setup") {
                session = await openSession({
                  sessionId: message.sessionId,
                  callSid: message.callSid,
                  from: message.from,
                  to: message.to,
                  direction: message.direction,
                  language: settings.language,
                  greeting: settings.greeting,
                });
                speak(settings.greeting, true);
                history.push({ role: "assistant", content: settings.greeting });
                await saveTurn({
                  rowId: session.rowId,
                  turnIndex: turnIndex++,
                  role: "assistant",
                  content: settings.greeting,
                  language: settings.ttsLanguage,
                });
                return;
              }

              if (!session) return;

              if (message.type === "prompt") {
                if (message.last === false) return; // wait for the complete utterance
                const spoken = message.voicePrompt?.trim();
                if (!spoken) return;
                await answer(spoken, message.lang);
                return;
              }

              if (message.type === "dtmf") {
                await answer(`কাস্টমার কীপ্যাডে চাপ দিয়েছেন: ${message.digit}`);
                return;
              }

              if (message.type === "interrupt") {
                await saveTurn({
                  rowId: session.rowId,
                  turnIndex: turnIndex++,
                  role: "system",
                  content: message.utteranceUntilInterrupt ?? "caller interrupted",
                  interrupted: true,
                });
                return;
              }

              if (message.type === "error") {
                await closeSession({
                  rowId: session.rowId,
                  status: "failed",
                  errorMessage: message.description ?? "ConversationRelay error",
                });
                closing = true;
              }
            } catch (error) {
              console.error("[relay] message handling failed", error);
            }
          })();
        });

        server.addEventListener("close", () => {
          void (async () => {
            if (!session || closing) return;
            await closeSession({ rowId: session.rowId, status: "completed" });
          })();
        });

        return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
      },
    },
  },
});
