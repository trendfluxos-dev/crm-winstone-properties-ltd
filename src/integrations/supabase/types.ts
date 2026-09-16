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
      agent_devices: {
        Row: {
          android_version: string | null
          app_version: string | null
          created_at: string
          device_label: string | null
          device_uid: string | null
          id: string
          last_seen_at: string
          manufacturer: string | null
          model: string | null
          phone_number: string | null
          platform: string
          profile_id: string
          recording_capable: boolean | null
          recording_checked_at: string | null
          recording_mode: string | null
          recording_note: string | null
          recording_tested: boolean
          revoked_at: string | null
          sim_verified_at: string | null
          status: string
          token_hash: string
        }
        Insert: {
          android_version?: string | null
          app_version?: string | null
          created_at?: string
          device_label?: string | null
          device_uid?: string | null
          id?: string
          last_seen_at?: string
          manufacturer?: string | null
          model?: string | null
          phone_number?: string | null
          platform?: string
          profile_id: string
          recording_capable?: boolean | null
          recording_checked_at?: string | null
          recording_mode?: string | null
          recording_note?: string | null
          recording_tested?: boolean
          revoked_at?: string | null
          sim_verified_at?: string | null
          status?: string
          token_hash: string
        }
        Update: {
          android_version?: string | null
          app_version?: string | null
          created_at?: string
          device_label?: string | null
          device_uid?: string | null
          id?: string
          last_seen_at?: string
          manufacturer?: string | null
          model?: string | null
          phone_number?: string | null
          platform?: string
          profile_id?: string
          recording_capable?: boolean | null
          recording_checked_at?: string | null
          recording_mode?: string | null
          recording_note?: string | null
          recording_tested?: boolean
          revoked_at?: string | null
          sim_verified_at?: string | null
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_devices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          actor_profile_id: string | null
          category: string
          cost_amount: number
          cost_credits: number
          created_at: string
          currency: string
          detail: string | null
          est_credits: number
          id: string
          idempotency_key: string | null
          input_units: number
          latency_ms: number | null
          model: string | null
          operation: string | null
          output_units: number
          provider: string | null
          rate_card_id: string | null
          status: string
          unit_kind: string
          units: number
        }
        Insert: {
          actor_profile_id?: string | null
          category: string
          cost_amount?: number
          cost_credits?: number
          created_at?: string
          currency?: string
          detail?: string | null
          est_credits: number
          id?: string
          idempotency_key?: string | null
          input_units?: number
          latency_ms?: number | null
          model?: string | null
          operation?: string | null
          output_units?: number
          provider?: string | null
          rate_card_id?: string | null
          status?: string
          unit_kind?: string
          units?: number
        }
        Update: {
          actor_profile_id?: string | null
          category?: string
          cost_amount?: number
          cost_credits?: number
          created_at?: string
          currency?: string
          detail?: string | null
          est_credits?: number
          id?: string
          idempotency_key?: string | null
          input_units?: number
          latency_ms?: number | null
          model?: string | null
          operation?: string | null
          output_units?: number
          provider?: string | null
          rate_card_id?: string | null
          status?: string
          unit_kind?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_voice_sessions: {
        Row: {
          call_sid: string | null
          direction: string
          ended_at: string | null
          error_message: string | null
          from_number: string | null
          handoff_agent_id: string | null
          handoff_reason: string | null
          id: string
          language: string
          lead_id: string | null
          session_id: string | null
          started_at: string
          status: string
          to_number: string | null
          turn_count: number
          updated_at: string
        }
        Insert: {
          call_sid?: string | null
          direction?: string
          ended_at?: string | null
          error_message?: string | null
          from_number?: string | null
          handoff_agent_id?: string | null
          handoff_reason?: string | null
          id?: string
          language?: string
          lead_id?: string | null
          session_id?: string | null
          started_at?: string
          status?: string
          to_number?: string | null
          turn_count?: number
          updated_at?: string
        }
        Update: {
          call_sid?: string | null
          direction?: string
          ended_at?: string | null
          error_message?: string | null
          from_number?: string | null
          handoff_agent_id?: string | null
          handoff_reason?: string | null
          id?: string
          language?: string
          lead_id?: string | null
          session_id?: string | null
          started_at?: string
          status?: string
          to_number?: string | null
          turn_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_voice_sessions_handoff_agent_id_fkey"
            columns: ["handoff_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_voice_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_voice_turns: {
        Row: {
          content: string
          created_at: string
          id: string
          interrupted: boolean
          language: string | null
          role: string
          session_row_id: string
          turn_index: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          interrupted?: boolean
          language?: string | null
          role: string
          session_row_id: string
          turn_index: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          interrupted?: boolean
          language?: string | null
          role?: string
          session_row_id?: string
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_voice_turns_session_row_id_fkey"
            columns: ["session_row_id"]
            isOneToOne: false
            referencedRelation: "ai_voice_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_artifact_checksums: {
        Row: {
          artifact_key: string
          claimed_at: string
          computed_at: string | null
          created_at: string
          filename: string
          sha256: string | null
          size_bytes: number | null
          source: string
          updated_at: string
        }
        Insert: {
          artifact_key: string
          claimed_at?: string
          computed_at?: string | null
          created_at?: string
          filename: string
          sha256?: string | null
          size_bytes?: number | null
          source: string
          updated_at?: string
        }
        Update: {
          artifact_key?: string
          claimed_at?: string
          computed_at?: string | null
          created_at?: string
          filename?: string
          sha256?: string | null
          size_bytes?: number | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      app_releases: {
        Row: {
          id: string
          is_mandatory: boolean
          release_notes: string | null
          released_at: string
          storage_path: string
          version_code: number
          version_name: string
        }
        Insert: {
          id?: string
          is_mandatory?: boolean
          release_notes?: string | null
          released_at?: string
          storage_path?: string
          version_code: number
          version_name: string
        }
        Update: {
          id?: string
          is_mandatory?: boolean
          release_notes?: string | null
          released_at?: string
          storage_path?: string
          version_code?: number
          version_name?: string
        }
        Relationships: []
      }
      architect_payout_profiles: {
        Row: {
          account_number_encrypted: string | null
          account_number_masked: string | null
          bank_name: string
          beneficiary_name: string
          branch_name: string | null
          created_at: string
          currency: string
          id: string
          is_active: boolean
          note: string | null
          routing_number: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          account_number_encrypted?: string | null
          account_number_masked?: string | null
          bank_name: string
          beneficiary_name: string
          branch_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          note?: string | null
          routing_number?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          account_number_encrypted?: string | null
          account_number_masked?: string | null
          bank_name?: string
          beneficiary_name?: string
          branch_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          note?: string | null
          routing_number?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      architect_payouts: {
        Row: {
          allocation_id: string | null
          amount: number
          confirmed_at: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          invoice_id: string
          profile_id: string | null
          provider: string | null
          provider_reference: string | null
          requested_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          allocation_id?: string | null
          amount: number
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id: string
          profile_id?: string | null
          provider?: string | null
          provider_reference?: string | null
          requested_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          allocation_id?: string | null
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          profile_id?: string | null
          provider?: string | null
          provider_reference?: string | null
          requested_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "architect_payouts_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "billing_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "architect_payouts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "service_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "architect_payouts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "architect_payout_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_label: string | null
          actor_profile_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_allocations: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          invoice_id: string
          kind: string
          label: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id: string
          kind: string
          label: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string
          kind?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "service_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_budgets: {
        Row: {
          alert_thresholds: number[]
          created_at: string
          hard_cap: boolean
          id: string
          is_active: boolean
          monthly_credit_budget: number
          note: string | null
          profile_id: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          alert_thresholds?: number[]
          created_at?: string
          hard_cap?: boolean
          id?: string
          is_active?: boolean
          monthly_credit_budget?: number
          note?: string | null
          profile_id?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          alert_thresholds?: number[]
          created_at?: string
          hard_cap?: boolean
          id?: string
          is_active?: boolean
          monthly_credit_budget?: number
          note?: string | null
          profile_id?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_budgets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoice_lines: {
        Row: {
          amount: number
          calls: number
          created_at: string
          credits: number
          dimension: string
          id: string
          invoice_id: string
          key: string
          label: string
        }
        Insert: {
          amount?: number
          calls?: number
          created_at?: string
          credits?: number
          dimension: string
          id?: string
          invoice_id: string
          key: string
          label: string
        }
        Update: {
          amount?: number
          calls?: number
          created_at?: string
          credits?: number
          dimension?: string
          id?: string
          invoice_id?: string
          key?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          closed_at: string
          created_at: string
          currency: string
          generation_hash: string
          id: string
          period_end: string
          period_month: string
          period_start: string
          status: string
          total_amount: number
          total_calls: number
          total_credits: number
          updated_at: string
        }
        Insert: {
          closed_at?: string
          created_at?: string
          currency?: string
          generation_hash: string
          id?: string
          period_end: string
          period_month: string
          period_start: string
          status?: string
          total_amount?: number
          total_calls?: number
          total_credits?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string
          created_at?: string
          currency?: string
          generation_hash?: string
          id?: string
          period_end?: string
          period_month?: string
          period_start?: string
          status?: string
          total_amount?: number
          total_calls?: number
          total_credits?: number
          updated_at?: string
        }
        Relationships: []
      }
      call_processing_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_type: string
          provider: string | null
          recording_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type: string
          provider?: string | null
          recording_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          provider?: string | null
          recording_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_processing_jobs_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "call_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      call_recordings: {
        Row: {
          agent_id: string | null
          agent_phone: string | null
          ai_grade: string | null
          ai_intent: string | null
          ai_lead_category: string | null
          ai_next_action: string | null
          ai_summary: string | null
          ai_temperature: string | null
          analysis_attempts: number
          analysis_error: string | null
          analysis_status: string
          answered_at: string | null
          audio_url: string | null
          call_direction: Database["public"]["Enums"]["call_direction"]
          call_source: string
          call_status: string
          checksum: string | null
          client_upload_id: string | null
          created_at: string
          customer_objections: string[]
          deal_stage: string | null
          device_id: string | null
          duration_seconds: number
          external_call_id: string | null
          file_name: string | null
          file_size_bytes: number | null
          finished_at: string | null
          id: string
          is_two_sided: boolean
          lead_id: string | null
          mime_type: string | null
          phone_number: string
          recorder_source: string | null
          recording_status: string
          sentiment: Database["public"]["Enums"]["call_sentiment"] | null
          started_at: string | null
          storage_bucket: string | null
          storage_path: string | null
          stt_duration_ms: number | null
          stt_error_code: string | null
          stt_error_message: string | null
          stt_fallback_used: boolean
          stt_language: string | null
          stt_model: string | null
          stt_provider: string | null
          stt_request_id: string | null
          stt_status: string | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          transcribed_at: string | null
          transcription_text: string | null
          updated_at: string
          upload_status: string
        }
        Insert: {
          agent_id?: string | null
          agent_phone?: string | null
          ai_grade?: string | null
          ai_intent?: string | null
          ai_lead_category?: string | null
          ai_next_action?: string | null
          ai_summary?: string | null
          ai_temperature?: string | null
          analysis_attempts?: number
          analysis_error?: string | null
          analysis_status?: string
          answered_at?: string | null
          audio_url?: string | null
          call_direction?: Database["public"]["Enums"]["call_direction"]
          call_source?: string
          call_status?: string
          checksum?: string | null
          client_upload_id?: string | null
          created_at?: string
          customer_objections?: string[]
          deal_stage?: string | null
          device_id?: string | null
          duration_seconds?: number
          external_call_id?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          finished_at?: string | null
          id?: string
          is_two_sided?: boolean
          lead_id?: string | null
          mime_type?: string | null
          phone_number: string
          recorder_source?: string | null
          recording_status?: string
          sentiment?: Database["public"]["Enums"]["call_sentiment"] | null
          started_at?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          stt_duration_ms?: number | null
          stt_error_code?: string | null
          stt_error_message?: string | null
          stt_fallback_used?: boolean
          stt_language?: string | null
          stt_model?: string | null
          stt_provider?: string | null
          stt_request_id?: string | null
          stt_status?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          transcribed_at?: string | null
          transcription_text?: string | null
          updated_at?: string
          upload_status?: string
        }
        Update: {
          agent_id?: string | null
          agent_phone?: string | null
          ai_grade?: string | null
          ai_intent?: string | null
          ai_lead_category?: string | null
          ai_next_action?: string | null
          ai_summary?: string | null
          ai_temperature?: string | null
          analysis_attempts?: number
          analysis_error?: string | null
          analysis_status?: string
          answered_at?: string | null
          audio_url?: string | null
          call_direction?: Database["public"]["Enums"]["call_direction"]
          call_source?: string
          call_status?: string
          checksum?: string | null
          client_upload_id?: string | null
          created_at?: string
          customer_objections?: string[]
          deal_stage?: string | null
          device_id?: string | null
          duration_seconds?: number
          external_call_id?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          finished_at?: string | null
          id?: string
          is_two_sided?: boolean
          lead_id?: string | null
          mime_type?: string | null
          phone_number?: string
          recorder_source?: string | null
          recording_status?: string
          sentiment?: Database["public"]["Enums"]["call_sentiment"] | null
          started_at?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          stt_duration_ms?: number | null
          stt_error_code?: string | null
          stt_error_message?: string | null
          stt_fallback_used?: boolean
          stt_language?: string | null
          stt_model?: string | null
          stt_provider?: string | null
          stt_request_id?: string | null
          stt_status?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          transcribed_at?: string | null
          transcription_text?: string | null
          updated_at?: string
          upload_status?: string
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
            foreignKeyName: "call_recordings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "agent_devices"
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
      call_reports: {
        Row: {
          agent_id: string | null
          ai_decision: string | null
          ai_suggestion: Json | null
          call_ended_at: string
          call_started_at: string | null
          category: string | null
          connected: boolean
          created_at: string
          device_id: string | null
          duration_seconds: number
          follow_up_at: string | null
          grade: string | null
          id: string
          lead_id: string
          note: string | null
          phone_number: string | null
          reason: string | null
          recording_id: string | null
          status: string
          submitted_at: string | null
          summary: string | null
          temperature: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          ai_decision?: string | null
          ai_suggestion?: Json | null
          call_ended_at?: string
          call_started_at?: string | null
          category?: string | null
          connected?: boolean
          created_at?: string
          device_id?: string | null
          duration_seconds?: number
          follow_up_at?: string | null
          grade?: string | null
          id?: string
          lead_id: string
          note?: string | null
          phone_number?: string | null
          reason?: string | null
          recording_id?: string | null
          status?: string
          submitted_at?: string | null
          summary?: string | null
          temperature?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          ai_decision?: string | null
          ai_suggestion?: Json | null
          call_ended_at?: string
          call_started_at?: string | null
          category?: string | null
          connected?: boolean
          created_at?: string
          device_id?: string | null
          duration_seconds?: number
          follow_up_at?: string | null
          grade?: string | null
          id?: string
          lead_id?: string
          note?: string | null
          phone_number?: string | null
          reason?: string | null
          recording_id?: string | null
          status?: string
          submitted_at?: string | null
          summary?: string | null
          temperature?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_reports_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "agent_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_reports_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_reports_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "call_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          channel: string
          consent_type: string
          created_at: string
          granted: boolean
          id: string
          lead_id: string | null
          note: string | null
          phone_number: string
          recorded_by: string | null
          source: string
        }
        Insert: {
          channel?: string
          consent_type?: string
          created_at?: string
          granted?: boolean
          id?: string
          lead_id?: string | null
          note?: string | null
          phone_number: string
          recorded_by?: string | null
          source?: string
        }
        Update: {
          channel?: string
          consent_type?: string
          created_at?: string
          granted?: boolean
          id?: string
          lead_id?: string | null
          note?: string | null
          phone_number?: string
          recorded_by?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      do_not_contact: {
        Row: {
          added_by: string | null
          channel: string
          created_at: string
          id: string
          phone_number: string
          reason: string | null
          source: string
        }
        Insert: {
          added_by?: string | null
          channel?: string
          created_at?: string
          id?: string
          phone_number: string
          reason?: string | null
          source?: string
        }
        Update: {
          added_by?: string | null
          channel?: string
          created_at?: string
          id?: string
          phone_number?: string
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "do_not_contact_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_pages: {
        Row: {
          body_markdown: string
          category: string
          created_at: string
          id: string
          published_at: string | null
          slug: string
          sort_order: number
          source: string
          status: string
          summary: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_markdown?: string
          category?: string
          created_at?: string
          id?: string
          published_at?: string | null
          slug: string
          sort_order?: number
          source?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_markdown?: string
          category?: string
          created_at?: string
          id?: string
          published_at?: string | null
          slug?: string
          sort_order?: number
          source?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_agent_folders: {
        Row: {
          created_at: string
          folder_id: string
          folder_name: string
          id: string
          last_synced_at: string
          parent_folder_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          folder_name: string
          id?: string
          last_synced_at?: string
          parent_folder_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          folder_name?: string
          id?: string
          last_synced_at?: string
          parent_folder_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_agent_folders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_events: {
        Row: {
          agent_id: string | null
          category: string
          completed_at: string | null
          created_at: string
          customer_name: string | null
          id: string
          lead_id: string
          note: string | null
          notified_at: string | null
          phone_number: string | null
          priority: string
          recording_id: string | null
          reminder_minutes: number
          report_id: string | null
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          category: string
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          lead_id: string
          note?: string | null
          notified_at?: string | null
          phone_number?: string | null
          priority?: string
          recording_id?: string | null
          reminder_minutes?: number
          report_id?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          lead_id?: string
          note?: string | null
          notified_at?: string | null
          phone_number?: string | null
          priority?: string
          recording_id?: string | null
          reminder_minutes?: number
          report_id?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_events_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "call_recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "call_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignments: {
        Row: {
          changed_by: string | null
          created_at: string
          from_agent_id: string | null
          id: string
          lead_id: string
          note: string | null
          source: string
          to_agent_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          lead_id: string
          note?: string | null
          source?: string
          to_agent_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          lead_id?: string
          note?: string | null
          source?: string
          to_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignments_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_classifications: {
        Row: {
          agent_id: string | null
          classified_at: string
          grade: string
          id: string
          lead_id: string
          note: string | null
          report_id: string | null
          source: string
          temperature: string
        }
        Insert: {
          agent_id?: string | null
          classified_at?: string
          grade: string
          id?: string
          lead_id: string
          note?: string | null
          report_id?: string | null
          source?: string
          temperature: string
        }
        Update: {
          agent_id?: string | null
          classified_at?: string
          grade?: string
          id?: string
          lead_id?: string
          note?: string | null
          report_id?: string | null
          source?: string
          temperature?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_classifications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_classifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_classifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "call_reports"
            referencedColumns: ["id"]
          },
        ]
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
      lead_year_archives: {
        Row: {
          archive_year: number
          archived_at: string
          archived_by: string | null
          created_at: string
          id: string
          lead_count: number
          note: string | null
          report_count: number
          storage_location: string
        }
        Insert: {
          archive_year: number
          archived_at?: string
          archived_by?: string | null
          created_at?: string
          id?: string
          lead_count?: number
          note?: string | null
          report_count?: number
          storage_location: string
        }
        Update: {
          archive_year?: number
          archived_at?: string
          archived_by?: string | null
          created_at?: string
          id?: string
          lead_count?: number
          note?: string | null
          report_count?: number
          storage_location?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_year_archives_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          assigned_agent_id: string | null
          assigned_to: string | null
          assignment_source: string | null
          best_channel: string | null
          call_attempts: number
          call_count: number | null
          city_area: string | null
          classification_note: string | null
          classified_at: string | null
          classified_by: string | null
          company: string | null
          created_at: string
          data_completeness: string | null
          email: string | null
          grade: string | null
          id: string
          is_verified: boolean
          last_call_at: string | null
          lead_quality: string | null
          lead_type: string | null
          missing_fields: string | null
          name: string
          next_action: string | null
          notes: string | null
          outcome_category: string | null
          outreach_bn: string | null
          outreach_en: string | null
          phone_number: string
          profession: string | null
          reference_by: string | null
          sector: string | null
          serial_no: string | null
          source: string
          status: Database["public"]["Enums"]["lead_status"]
          temperature: string | null
          updated_at: string
          work_date: string | null
          work_state: string
        }
        Insert: {
          address?: string | null
          assigned_agent_id?: string | null
          assigned_to?: string | null
          assignment_source?: string | null
          best_channel?: string | null
          call_attempts?: number
          call_count?: number | null
          city_area?: string | null
          classification_note?: string | null
          classified_at?: string | null
          classified_by?: string | null
          company?: string | null
          created_at?: string
          data_completeness?: string | null
          email?: string | null
          grade?: string | null
          id?: string
          is_verified?: boolean
          last_call_at?: string | null
          lead_quality?: string | null
          lead_type?: string | null
          missing_fields?: string | null
          name: string
          next_action?: string | null
          notes?: string | null
          outcome_category?: string | null
          outreach_bn?: string | null
          outreach_en?: string | null
          phone_number: string
          profession?: string | null
          reference_by?: string | null
          sector?: string | null
          serial_no?: string | null
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          temperature?: string | null
          updated_at?: string
          work_date?: string | null
          work_state?: string
        }
        Update: {
          address?: string | null
          assigned_agent_id?: string | null
          assigned_to?: string | null
          assignment_source?: string | null
          best_channel?: string | null
          call_attempts?: number
          call_count?: number | null
          city_area?: string | null
          classification_note?: string | null
          classified_at?: string | null
          classified_by?: string | null
          company?: string | null
          created_at?: string
          data_completeness?: string | null
          email?: string | null
          grade?: string | null
          id?: string
          is_verified?: boolean
          last_call_at?: string | null
          lead_quality?: string | null
          lead_type?: string | null
          missing_fields?: string | null
          name?: string
          next_action?: string | null
          notes?: string | null
          outcome_category?: string | null
          outreach_bn?: string | null
          outreach_en?: string | null
          phone_number?: string
          profession?: string | null
          reference_by?: string | null
          sector?: string | null
          serial_no?: string | null
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          temperature?: string | null
          updated_at?: string
          work_date?: string | null
          work_state?: string
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
          {
            foreignKeyName: "leads_classified_by_fkey"
            columns: ["classified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          invoice_id: string | null
          payload: Json
          provider: string
          provider_txn_id: string
          status: string
          updated_at: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string | null
          payload?: Json
          provider: string
          provider_txn_id: string
          status?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string | null
          payload?: Json
          provider?: string
          provider_txn_id?: string
          status?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "service_invoices"
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
          sim_bound_at: string | null
          sim_number: string | null
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
          sim_bound_at?: string | null
          sim_number?: string | null
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
          sim_bound_at?: string | null
          sim_number?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      provider_rate_cards: {
        Row: {
          amount_per_unit: number
          created_at: string
          credits_per_unit: number
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          model: string | null
          note: string | null
          operation: string | null
          provider: string
          unit_kind: string
          updated_at: string
        }
        Insert: {
          amount_per_unit?: number
          created_at?: string
          credits_per_unit?: number
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          model?: string | null
          note?: string | null
          operation?: string | null
          provider: string
          unit_kind?: string
          updated_at?: string
        }
        Update: {
          amount_per_unit?: number
          created_at?: string
          credits_per_unit?: number
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          model?: string | null
          note?: string | null
          operation?: string | null
          provider?: string
          unit_kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      recording_doc_backups: {
        Row: {
          created_at: string
          date_key: string
          doc_id: string | null
          drive_file_id: string | null
          drive_file_name: string | null
          drive_file_url: string | null
          drive_folder_id: string | null
          error_message: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_key: string
          doc_id?: string | null
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_file_url?: string | null
          drive_folder_id?: string | null
          error_message?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_key?: string
          doc_id?: string | null
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_file_url?: string | null
          drive_folder_id?: string | null
          error_message?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      recording_drive_backups: {
        Row: {
          bytes: number | null
          call_recording_id: string | null
          created_at: string
          drive_file_id: string | null
          drive_file_name: string | null
          drive_file_url: string | null
          drive_folder_id: string | null
          error_message: string | null
          id: string
          mime_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bytes?: number | null
          call_recording_id?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_file_url?: string | null
          drive_folder_id?: string | null
          error_message?: string | null
          id?: string
          mime_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bytes?: number | null
          call_recording_id?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_file_url?: string | null
          drive_folder_id?: string | null
          error_message?: string | null
          id?: string
          mime_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_drive_backups_call_recording_id_fkey"
            columns: ["call_recording_id"]
            isOneToOne: true
            referencedRelation: "call_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      service_invoices: {
        Row: {
          amount: number
          billing_date: string
          created_at: string
          currency: string
          due_at: string
          id: string
          note: string | null
          paid_at: string | null
          period_end: string
          period_month: string
          period_start: string
          reference: string
          service_active_until: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          billing_date: string
          created_at?: string
          currency?: string
          due_at: string
          id?: string
          note?: string | null
          paid_at?: string | null
          period_end: string
          period_month: string
          period_start: string
          reference: string
          service_active_until?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_date?: string
          created_at?: string
          currency?: string
          due_at?: string
          id?: string
          note?: string | null
          paid_at?: string | null
          period_end?: string
          period_month?: string
          period_start?: string
          reference?: string
          service_active_until?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      shift_summaries: {
        Row: {
          agents: Json
          created_at: string
          generated_at: string
          hq_visible: boolean
          id: string
          shift_key: string
          shift_label: string
          totals: Json
          window_end: string
          window_start: string
        }
        Insert: {
          agents?: Json
          created_at?: string
          generated_at?: string
          hq_visible?: boolean
          id?: string
          shift_key: string
          shift_label: string
          totals?: Json
          window_end: string
          window_start: string
        }
        Update: {
          agents?: Json
          created_at?: string
          generated_at?: string
          hq_visible?: boolean
          id?: string
          shift_key?: string
          shift_label?: string
          totals?: Json
          window_end?: string
          window_start?: string
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
      support_article_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      support_articles: {
        Row: {
          author_profile_id: string | null
          body_markdown: string
          category_id: string | null
          created_at: string
          id: string
          published_at: string | null
          search_tsv: unknown
          slug: string
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_profile_id?: string | null
          body_markdown: string
          category_id?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          search_tsv?: unknown
          slug: string
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_profile_id?: string | null
          body_markdown?: string
          category_id?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          search_tsv?: unknown
          slug?: string
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_articles_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "support_article_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      support_canned_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          shortcut: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          shortcut: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          shortcut?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_conversations: {
        Row: {
          access_token: string
          ai_handled: boolean
          assignee_profile_id: string | null
          category: string | null
          channel: string
          created_at: string
          customer_id: string
          escalated_at: string | null
          escalation_reason: string | null
          first_customer_message_at: string | null
          first_human_response_at: string | null
          id: string
          intent: string | null
          last_message_at: string
          message_count: number
          priority: string
          resolved_at: string | null
          sentiment: string | null
          sla_due_at: string | null
          status: string
          subject: string | null
          summary: string | null
          tags: string[]
          unread_for_agent: boolean
          unread_for_customer: boolean
          updated_at: string
        }
        Insert: {
          access_token: string
          ai_handled?: boolean
          assignee_profile_id?: string | null
          category?: string | null
          channel?: string
          created_at?: string
          customer_id: string
          escalated_at?: string | null
          escalation_reason?: string | null
          first_customer_message_at?: string | null
          first_human_response_at?: string | null
          id?: string
          intent?: string | null
          last_message_at?: string
          message_count?: number
          priority?: string
          resolved_at?: string | null
          sentiment?: string | null
          sla_due_at?: string | null
          status?: string
          subject?: string | null
          summary?: string | null
          tags?: string[]
          unread_for_agent?: boolean
          unread_for_customer?: boolean
          updated_at?: string
        }
        Update: {
          access_token?: string
          ai_handled?: boolean
          assignee_profile_id?: string | null
          category?: string | null
          channel?: string
          created_at?: string
          customer_id?: string
          escalated_at?: string | null
          escalation_reason?: string | null
          first_customer_message_at?: string | null
          first_human_response_at?: string | null
          id?: string
          intent?: string | null
          last_message_at?: string
          message_count?: number
          priority?: string
          resolved_at?: string | null
          sentiment?: string | null
          sla_due_at?: string | null
          status?: string
          subject?: string | null
          summary?: string | null
          tags?: string[]
          unread_for_agent?: boolean
          unread_for_customer?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_assignee_profile_id_fkey"
            columns: ["assignee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "support_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      support_csat: {
        Row: {
          comment: string | null
          conversation_id: string
          created_at: string
          id: string
          rating: number
        }
        Insert: {
          comment?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          rating: number
        }
        Update: {
          comment?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_csat_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_customers: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          name: string | null
          notes: string | null
          phone: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          name?: string | null
          notes?: string | null
          phone?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          name?: string | null
          notes?: string | null
          phone?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          ai_citations: Json
          ai_confidence: number | null
          ai_model: string | null
          ai_needs_human: boolean | null
          attachments: Json
          author_kind: string
          author_label: string | null
          author_profile_id: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
        }
        Insert: {
          ai_citations?: Json
          ai_confidence?: number | null
          ai_model?: string | null
          ai_needs_human?: boolean | null
          attachments?: Json
          author_kind: string
          author_label?: string | null
          author_profile_id?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
        }
        Update: {
          ai_citations?: Json
          ai_confidence?: number | null
          ai_model?: string | null
          ai_needs_human?: boolean | null
          attachments?: Json
          author_kind?: string
          author_label?: string | null
          author_profile_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_notes: {
        Row: {
          author_label: string | null
          author_profile_id: string | null
          body: string
          conversation_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          ticket_id: string | null
        }
        Insert: {
          author_label?: string | null
          author_profile_id?: string | null
          body: string
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          ticket_id?: string | null
        }
        Update: {
          author_label?: string | null
          author_profile_id?: string | null
          body?: string
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_notes_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "support_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_settings: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_ticket_events: {
        Row: {
          actor_kind: string
          actor_label: string | null
          actor_profile_id: string | null
          created_at: string
          detail: string | null
          id: string
          kind: string
          ticket_id: string
        }
        Insert: {
          actor_kind?: string
          actor_label?: string | null
          actor_profile_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          ticket_id: string
        }
        Update: {
          actor_kind?: string
          actor_label?: string | null
          actor_profile_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assignee_profile_id: string | null
          category: string | null
          conversation_id: string | null
          created_at: string
          created_by_kind: string
          created_by_profile_id: string | null
          customer_id: string
          description: string | null
          id: string
          priority: string
          ref: string
          resolved_at: string | null
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_profile_id?: string | null
          category?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by_kind?: string
          created_by_profile_id?: string | null
          customer_id: string
          description?: string | null
          id?: string
          priority?: string
          ref?: string
          resolved_at?: string | null
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_profile_id?: string | null
          category?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by_kind?: string
          created_by_profile_id?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          priority?: string
          ref?: string
          resolved_at?: string | null
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assignee_profile_id_fkey"
            columns: ["assignee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "support_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_events: {
        Row: {
          agent_id: string | null
          created_at: string
          device_id: string | null
          entity_id: string | null
          entity_type: string
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          payload: Json
          processed_at: string | null
          retry_count: number
          status: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          device_id?: string | null
          entity_id?: string | null
          entity_type: string
          error_message?: string | null
          event_type: string
          id?: string
          idempotency_key?: string | null
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          device_id?: string | null
          entity_id?: string | null
          entity_type?: string
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string | null
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "agent_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          action: string | null
          code: string
          created_at: string
          detail: string | null
          id: string
          severity: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action?: string | null
          code: string
          created_at?: string
          detail?: string | null
          id?: string
          severity?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action?: string | null
          code?: string
          created_at?: string
          detail?: string | null
          id?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          signature_valid: boolean
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          event_id: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          signature_valid?: boolean
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          signature_valid?: boolean
          status?: string
        }
        Relationships: []
      }
      whatsapp_interactions: {
        Row: {
          agent_id: string | null
          created_at: string
          delivered_at: string | null
          duration_seconds: number | null
          error_detail: string | null
          id: string
          lead_id: string | null
          media_url: string | null
          message_content: string | null
          message_type: Database["public"]["Enums"]["message_type"]
          provider: string
          provider_message_id: string | null
          read_at: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
          status: string
          status_updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          delivered_at?: string | null
          duration_seconds?: number | null
          error_detail?: string | null
          id?: string
          lead_id?: string | null
          media_url?: string | null
          message_content?: string | null
          message_type?: Database["public"]["Enums"]["message_type"]
          provider?: string
          provider_message_id?: string | null
          read_at?: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
          status?: string
          status_updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          delivered_at?: string | null
          duration_seconds?: number | null
          error_detail?: string | null
          id?: string
          lead_id?: string | null
          media_url?: string | null
          message_content?: string | null
          message_type?: Database["public"]["Enums"]["message_type"]
          provider?: string
          provider_message_id?: string | null
          read_at?: string | null
          sender_type?: Database["public"]["Enums"]["sender_type"]
          status?: string
          status_updated_at?: string | null
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
      has_pending_call_report: { Args: { _agent_id: string }; Returns: boolean }
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
