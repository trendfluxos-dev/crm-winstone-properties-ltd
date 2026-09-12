export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_recordings: {
        Row: {
          agent_id: string | null
          ai_summary: string | null
          audio_url: string | null
          call_direction: Database["public"]["Enums"]["call_direction"]
          created_at: string
          customer_objections: string[]
          deal_stage: string | null
          duration_seconds: number
          id: string
          is_two_sided: boolean
          lead_id: string | null
          phone_number: string
          sentiment: Database["public"]["Enums"]["call_sentiment"] | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          transcription_text: string | null
        }
        Insert: {
          agent_id?: string | null
          ai_summary?: string | null
          audio_url?: string | null
          call_direction?: Database["public"]["Enums"]["call_direction"]
          created_at?: string
          customer_objections?: string[]
          deal_stage?: string | null
          duration_seconds?: number
          id?: string
          is_two_sided?: boolean
          lead_id?: string | null
          phone_number: string
          sentiment?: Database["public"]["Enums"]["call_sentiment"] | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          transcription_text?: string | null
        }
        Update: {
          agent_id?: string | null
          ai_summary?: string | null
          audio_url?: string | null
          call_direction?: Database["public"]["Enums"]["call_direction"]
          created_at?: string
          customer_objections?: string[]
          deal_stage?: string | null
          duration_seconds?: number
          id?: string
          is_two_sided?: boolean
          lead_id?: string | null
          phone_number?: string
          sentiment?: Database["public"]["Enums"]["call_sentiment"] | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          transcription_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_recordings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_recordings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_reports: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          status: string
          target_metrics: string
          target_range: string | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          status?: string
          target_metrics: string
          target_range?: string | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          status?: string
          target_metrics?: string
          target_range?: string | null
          title?: string
        }
        Relationships: []
      }
      lead_events: {
        Row: {
          agent_id: string | null
          created_at: string
          detail: string | null
          id: string
          kind: string
          lead_id: string | null
          recording_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          lead_id?: string | null
          recording_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          lead_id?: string | null
          recording_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_agent_id: string | null
          assigned_to: string | null
          assignment_source: string | null
          call_attempts: number
          call_count: number | null
          company: string | null
          created_at: string
          id: string
          is_verified: boolean
          last_call_at: string | null
          name: string
          notes: string | null
          outcome_category: string | null
          phone_number: string
          source: string
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_agent_id?: string | null
          assigned_to?: string | null
          assignment_source?: string | null
          call_attempts?: number
          call_count?: number | null
          company?: string | null
          created_at?: string
          id?: string
          is_verified?: boolean
          last_call_at?: string | null
          name: string
          notes?: string | null
          outcome_category?: string | null
          phone_number: string
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_agent_id?: string | null
          assigned_to?: string | null
          assignment_source?: string | null
          call_attempts?: number
          call_count?: number | null
          company?: string | null
          created_at?: string
          id?: string
          is_verified?: boolean
          last_call_at?: string | null
          name?: string
          notes?: string | null
          outcome_category?: string | null
          phone_number?: string
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_status: string
          avatar_hue: number
          created_at: string
          current_call_started_at: string | null
          email: string | null
          employee_id: string | null
          id: string
          is_active: boolean
          last_active_at: string | null
          name: string
          phone: string | null
          pin_hash: string | null
          presence: Database["public"]["Enums"]["agent_presence"]
          requested_role: Database["public"]["Enums"]["app_role"]
          role: Database["public"]["Enums"]["app_role"]
          status: string | null
          user_id: string | null
        }
        Insert: {
          approval_status?: string
          avatar_hue?: number
          created_at?: string
          current_call_started_at?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          last_active_at?: string | null
          name: string
          phone?: string | null
          pin_hash?: string | null
          presence?: Database["public"]["Enums"]["agent_presence"]
          requested_role?: Database["public"]["Enums"]["app_role"]
          role?: Database["public"]["Enums"]["app_role"]
          status?: string | null
          user_id?: string | null
        }
        Update: {
          approval_status?: string
          avatar_hue?: number
          created_at?: string
          current_call_started_at?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          last_active_at?: string | null
          name?: string
          phone?: string | null
          pin_hash?: string | null
          presence?: Database["public"]["Enums"]["agent_presence"]
          requested_role?: Database["public"]["Enums"]["app_role"]
          role?: Database["public"]["Enums"]["app_role"]
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          buyer_email: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          seats: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          buyer_email?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          seats?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          buyer_email?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string
          paddle_subscription_id?: string
          price_id?: string
          product_id?: string
          seats?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_interactions: {
        Row: {
          agent_id: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          lead_id: string | null
          media_url: string | null
          message_content: string | null
          message_type: Database["public"]["Enums"]["message_type"]
          sender_type: Database["public"]["Enums"]["sender_type"]
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lead_id?: string | null
          media_url?: string | null
          message_content?: string | null
          message_type?: Database["public"]["Enums"]["message_type"]
          sender_type: Database["public"]["Enums"]["sender_type"]
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lead_id?: string | null
          media_url?: string | null
          message_content?: string | null
          message_type?: Database["public"]["Enums"]["message_type"]
          sender_type?: Database["public"]["Enums"]["sender_type"]
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_interactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_active_license: { Args: { check_env?: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      agent_presence: "on_call" | "idle" | "offline"
      app_role: "admin" | "team_leader" | "agent"
      call_direction: "outgoing" | "incoming_callback"
      call_sentiment: "positive" | "neutral" | "negative" | "critical"
      lead_status: "pending" | "contacted" | "follow_up" | "closed"
      message_type: "text" | "voice_note" | "image" | "document"
      sender_type: "agent" | "customer"
      sync_status: "uploaded" | "verified" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_presence: ["on_call", "idle", "offline"],
      app_role: ["admin", "team_leader", "agent"],
      call_direction: ["outgoing", "incoming_callback"],
      call_sentiment: ["positive", "neutral", "negative", "critical"],
      lead_status: ["pending", "contacted", "follow_up", "closed"],
      message_type: ["text", "voice_note", "image", "document"],
      sender_type: ["agent", "customer"],
      sync_status: ["uploaded", "verified", "failed"],
    },
  },
} as const
