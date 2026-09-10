import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Lead, Profile } from "@/lib/crm-data";
import { logWhatsappMessage, uploadCallRecording } from "@/lib/crm.functions";
import { getAdminToken, useOperatorId } from "@/lib/local-session";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function ManualIngestDialog({
  leads,
  agents,
}: {
  leads: Lead[];
  agents: Profile[];
}) {
  const operatorId = useOperatorId();
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState<string>("");
  const [agentOverride, setAgentOverride] = useState<string | null>(null);
  // Defaults to the top-bar "Operating as" agent; can still be changed per log.
  const agentId = agentOverride ?? (agents.some((a) => a.id === operatorId) ? operatorId! : "");
  const setAgentId = setAgentOverride;
  const [file, setFile] = useState<File | null>(null);
  const [direction, setDirection] = useState<"outgoing" | "incoming_callback">("outgoing");
  const [duration, setDuration] = useState("60");
  const [senderType, setSenderType] = useState<"agent" | "customer">("customer");
  const [messageContent, setMessageContent] = useState("");
  const queryClient = useQueryClient();

  const uploadCall = useServerFn(uploadCallRecording);
  const logMessage = useServerFn(logWhatsappMessage);

  const callMutation = useMutation({
    mutationFn: async () => {
      if (!leadId || !file) throw new Error("Pick a lead and an audio file");
      return uploadCall({
        data: {
          adminToken: getAdminToken() ?? "",
          leadId,
          agentId: agentId || null,
          audioBase64: await fileToBase64(file),
          fileExtension: file.name.split(".").pop()?.toLowerCase() || "mp3",
          durationSeconds: Number(duration) || 0,
          direction,
          isTwoSided: true,
        },
      });
    },
    onSuccess: () => {
      toast.success("Recording uploaded and analysed");
      void queryClient.invalidateQueries();
      setOpen(false);
      setFile(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const messageMutation = useMutation({
    mutationFn: async () => {
      if (!leadId || !messageContent.trim()) throw new Error("Pick a lead and write a message");
      return logMessage({
        data: {
          adminToken: getAdminToken() ?? "",
          leadId,
          agentId: agentId || null,
          senderType,
          messageType: "text",
          messageContent: messageContent.trim(),
        },
      });
    },
    onSuccess: () => {
      toast.success("WhatsApp message logged");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp_interactions"] });
      setMessageContent("");
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Upload className="size-4" /> Manual log
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manual override</DialogTitle>
          <DialogDescription>
            Use this when the device app could not sync a call or chat automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Lead</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Select lead" />
              </SelectTrigger>
              <SelectContent>
                {leads.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.name} — {lead.phone_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="call" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="call" className="flex-1">
              Call recording
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex-1">
              WhatsApp message
            </TabsTrigger>
          </TabsList>

          <TabsContent value="call" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="audio">Audio file</Label>
              <Input
                id="audio"
                type="file"
                accept="audio/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="duration">Duration (seconds)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={0}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select
                  value={direction}
                  onValueChange={(value) => setDirection(value as typeof direction)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outgoing">Outgoing</SelectItem>
                    <SelectItem value="incoming_callback">Incoming callback</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => callMutation.mutate()}
              disabled={callMutation.isPending}
            >
              {callMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Upload and analyse
            </Button>
          </TabsContent>

          <TabsContent value="chat" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Sender</Label>
              <Select
                value={senderType}
                onValueChange={(value) => setSenderType(value as typeof senderType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                rows={4}
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="Paste the WhatsApp message text"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => messageMutation.mutate()}
              disabled={messageMutation.isPending}
            >
              {messageMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Log message
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
