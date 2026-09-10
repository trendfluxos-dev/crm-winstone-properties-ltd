import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";

const TABLES = ["leads", "call_recordings", "whatsapp_interactions", "profiles"] as const;

/** Keeps every open screen in sync with the backend as calls and chats land. */
export function useCrmRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel("crm-live");

    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
      });
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
