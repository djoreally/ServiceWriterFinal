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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      abandoned_bookings: {
        Row: {
          attempt_count: number
          created_at: string
          email_sent_at: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          last_attempted_at: string | null
          last_step: number
          metadata: Json | null
          recovered: boolean
          recovered_at: string | null
          recovery_sent_at: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_catalog_id: string | null
          session_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          email_sent_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          last_attempted_at?: string | null
          last_step?: number
          metadata?: Json | null
          recovered?: boolean
          recovered_at?: string | null
          recovery_sent_at?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_catalog_id?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          email_sent_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          last_attempted_at?: string | null
          last_step?: number
          metadata?: Json | null
          recovered?: boolean
          recovered_at?: string | null
          recovery_sent_at?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_catalog_id?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_bookings_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      account_import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          dry_run: boolean
          error_summary: Json
          failed_records: number
          id: string
          imported_records: number
          rolled_back_at: string | null
          skipped_records: number
          source_file_name: string
          source_sha256: string
          source_system: string
          source_version: string
          status: string
          total_records: number
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          dry_run?: boolean
          error_summary?: Json
          failed_records?: number
          id?: string
          imported_records?: number
          rolled_back_at?: string | null
          skipped_records?: number
          source_file_name: string
          source_sha256: string
          source_system?: string
          source_version: string
          status?: string
          total_records?: number
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          dry_run?: boolean
          error_summary?: Json
          failed_records?: number
          id?: string
          imported_records?: number
          rolled_back_at?: string | null
          skipped_records?: number
          source_file_name?: string
          source_sha256?: string
          source_system?: string
          source_version?: string
          status?: string
          total_records?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_import_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      account_import_mappings: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          source_id: string
          source_section: string
          target_id: string
          target_table: string
          workspace_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          source_id: string
          source_section: string
          target_id: string
          target_table: string
          workspace_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          source_id?: string
          source_section?: string
          target_id?: string
          target_table?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_import_mappings_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "account_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_import_mappings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      account_import_records: {
        Row: {
          action: string
          batch_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          source_id: string
          source_row: Json
          source_section: string
          status: string
          target_id: string | null
          target_table: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          batch_id: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          source_id: string
          source_row?: Json
          source_section: string
          status: string
          target_id?: string | null
          target_table?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          batch_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          source_id?: string
          source_row?: Json
          source_section?: string
          status?: string
          target_id?: string | null
          target_table?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_import_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "account_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_import_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_calendar_events: {
        Row: {
          appointment_id: string
          calendar_id: string
          created_at: string
          google_event_id: string
          id: string
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          calendar_id?: string
          created_at?: string
          google_event_id: string
          id?: string
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          calendar_id?: string
          created_at?: string
          google_event_id?: string
          id?: string
          synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_calendar_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_items: {
        Row: {
          added_at_service: boolean
          appointment_id: string
          created_at: string
          description: string
          id: string
          is_prepaid: boolean
          item_type: string
          metadata: Json
          quantity: number
          service_catalog_id: string | null
          sort_order: number
          unit_price: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          added_at_service?: boolean
          appointment_id: string
          created_at?: string
          description: string
          id?: string
          is_prepaid?: boolean
          item_type?: string
          metadata?: Json
          quantity?: number
          service_catalog_id?: string | null
          sort_order?: number
          unit_price?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          added_at_service?: boolean
          appointment_id?: string
          created_at?: string
          description?: string
          id?: string
          is_prepaid?: boolean
          item_type?: string
          metadata?: Json
          quantity?: number
          service_catalog_id?: string | null
          sort_order?: number
          unit_price?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_items_workspace_appointment_fk"
            columns: ["workspace_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "appointment_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_items_workspace_service_fk"
            columns: ["workspace_id", "service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      appointments: {
        Row: {
          assigned_user_id: string | null
          confirmation_code: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          ends_at: string
          id: string
          location_id: string | null
          metadata: Json
          notes: string | null
          source: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          assigned_user_id?: string | null
          confirmation_code?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          ends_at: string
          id?: string
          location_id?: string | null
          metadata?: Json
          notes?: string | null
          source?: string
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          assigned_user_id?: string | null
          confirmation_code?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          ends_at?: string
          id?: string
          location_id?: string | null
          metadata?: Json
          notes?: string | null
          source?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_workspace_id_customer_id_fkey"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "appointments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_workspace_id_location_id_fkey"
            columns: ["workspace_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "appointments_workspace_id_vehicle_id_fkey"
            columns: ["workspace_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
          request_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          metadata?: Json
          request_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          metadata?: Json
          request_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          activity_type: string
          appointment_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          occurred_at: string
          source_event_id: string | null
          summary: string
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          activity_type: string
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          occurred_at?: string
          source_event_id?: string | null
          summary: string
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          activity_type?: string
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          occurred_at?: string
          source_event_id?: string | null
          summary?: string
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_campaign_members: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string
          delivery_status: string
          destination: string
          eligibility_state: string
          id: string
          message_intent_id: string | null
          suppression_reason: string | null
          workspace_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id: string
          delivery_status?: string
          destination: string
          eligibility_state?: string
          id?: string
          message_intent_id?: string | null
          suppression_reason?: string | null
          workspace_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string
          delivery_status?: string
          destination?: string
          eligibility_state?: string
          id?: string
          message_intent_id?: string | null
          suppression_reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaign_members_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaign_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_campaigns: {
        Row: {
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          channel: string
          created_at: string
          created_by: string | null
          frequency_policy: Json
          id: string
          name: string
          purpose: string
          scheduled_at: string | null
          segment_id: string | null
          template_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          channel: string
          created_at?: string
          created_by?: string | null
          frequency_policy?: Json
          id?: string
          name: string
          purpose: string
          scheduled_at?: string | null
          segment_id?: string | null
          template_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          frequency_policy?: Json
          id?: string
          name?: string
          purpose?: string
          scheduled_at?: string | null
          segment_id?: string | null
          template_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "crm_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string | null
          phone: string | null
          source: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_loyalty_accounts: {
        Row: {
          created_at: string
          current_points: number
          customer_id: string
          enrolled_at: string
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_points?: number
          customer_id: string
          enrolled_at?: string
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_points?: number
          customer_id?: string
          enrolled_at?: string
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_loyalty_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_loyalty_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          loyalty_account_id: string
          points_delta: number
          reason: string
          source_id: string | null
          source_type: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          loyalty_account_id: string
          points_delta: number
          reason: string
          source_id?: string | null
          source_type: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          loyalty_account_id?: string
          points_delta?: number
          reason?: string
          source_id?: string | null
          source_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_loyalty_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_loyalty_ledger_loyalty_account_id_fkey"
            columns: ["loyalty_account_id"]
            isOneToOne: false
            referencedRelation: "crm_loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_loyalty_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_permissions: {
        Row: {
          capability: string
          created_at: string
          granted_by: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          granted_by?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          granted_by?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_profiles: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          last_contacted_at: string | null
          last_service_at: string | null
          lead_source: string | null
          lifecycle_stage: string
          next_action_at: string | null
          preferred_channel: string | null
          relationship_owner_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          last_contacted_at?: string | null
          last_service_at?: string | null
          lead_source?: string | null
          lifecycle_stage?: string
          next_action_at?: string | null
          preferred_channel?: string | null
          relationship_owner_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          last_contacted_at?: string | null
          last_service_at?: string | null
          lead_source?: string | null
          lifecycle_stage?: string
          next_action_at?: string | null
          preferred_channel?: string | null
          relationship_owner_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_segments: {
        Row: {
          created_at: string
          created_by: string | null
          definition: Json
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_segments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_users: {
        Row: {
          created_at: string
          customer_id: string
          is_primary: boolean
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          is_primary?: boolean
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          is_primary?: boolean
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_users_customer_fk"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "customer_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          country_code: string
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          metadata: Json
          notes: string | null
          phone: string | null
          postal_code: string | null
          region: string | null
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          metadata?: Json
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          metadata?: Json
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_events: {
        Row: {
          appointment_id: string | null
          created_at: string
          event_type: string
          id: string
          location: Json | null
          new_status: string | null
          notes: string | null
          performed_by: string | null
          previous_status: string | null
          technician_id: string | null
          work_order_id: string | null
          workspace_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          location?: Json | null
          new_status?: string | null
          notes?: string | null
          performed_by?: string | null
          previous_status?: string | null
          technician_id?: string | null
          work_order_id?: string | null
          workspace_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          location?: Json | null
          new_status?: string | null
          notes?: string | null
          performed_by?: string | null
          previous_status?: string | null
          technician_id?: string | null
          work_order_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      filter_catalog: {
        Row: {
          brand: Database["public"]["Enums"]["filter_brand"]
          created_at: string
          description: string | null
          filter_type: Database["public"]["Enums"]["filter_type"]
          id: string
          is_active: boolean
          part_number: string
          unit_price: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brand?: Database["public"]["Enums"]["filter_brand"]
          created_at?: string
          description?: string | null
          filter_type: Database["public"]["Enums"]["filter_type"]
          id?: string
          is_active?: boolean
          part_number: string
          unit_price?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brand?: Database["public"]["Enums"]["filter_brand"]
          created_at?: string
          description?: string | null
          filter_type?: Database["public"]["Enums"]["filter_type"]
          id?: string
          is_active?: boolean
          part_number?: string
          unit_price?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "filter_catalog_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_client_contacts: {
        Row: {
          created_at: string
          email: string | null
          fleet_client_id: string
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          fleet_client_id: string
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          fleet_client_id?: string
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_client_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_client_contacts_workspace_id_fleet_client_id_fkey"
            columns: ["workspace_id", "fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      fleet_clients: {
        Row: {
          account_number: string | null
          billing_email: string | null
          billing_terms_days: number
          created_at: string
          id: string
          is_active: boolean
          lifecycle_stage: Database["public"]["Enums"]["fleet_lifecycle_stage"]
          name: string
          phone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_number?: string | null
          billing_email?: string | null
          billing_terms_days?: number
          created_at?: string
          id?: string
          is_active?: boolean
          lifecycle_stage?: Database["public"]["Enums"]["fleet_lifecycle_stage"]
          name: string
          phone?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_number?: string | null
          billing_email?: string | null
          billing_terms_days?: number
          created_at?: string
          id?: string
          is_active?: boolean
          lifecycle_stage?: Database["public"]["Enums"]["fleet_lifecycle_stage"]
          name?: string
          phone?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_contracts: {
        Row: {
          contract_number: string | null
          created_at: string
          ends_on: string | null
          fleet_client_id: string
          id: string
          name: string
          starts_on: string | null
          status: string
          terms: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          contract_number?: string | null
          created_at?: string
          ends_on?: string | null
          fleet_client_id: string
          id?: string
          name: string
          starts_on?: string | null
          status?: string
          terms?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          contract_number?: string | null
          created_at?: string
          ends_on?: string | null
          fleet_client_id?: string
          id?: string
          name?: string
          starts_on?: string | null
          status?: string
          terms?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_contracts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_contracts_workspace_id_fleet_client_id_fkey"
            columns: ["workspace_id", "fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      fleet_dispatch_assignments: {
        Row: {
          created_at: string
          id: string
          scheduled_end: string | null
          scheduled_start: string | null
          service_request_id: string
          status: string
          technician_id: string
          updated_at: string
          work_order_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_request_id: string
          status?: string
          technician_id: string
          updated_at?: string
          work_order_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_request_id?: string
          status?: string
          technician_id?: string
          updated_at?: string
          work_order_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_dispatch_assignments_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_dispatch_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_dispatch_assignments_workspace_id_service_request_id_fkey"
            columns: ["workspace_id", "service_request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "fleet_dispatch_assignments_workspace_id_work_order_id_fkey"
            columns: ["workspace_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      fleet_service_requests: {
        Row: {
          created_at: string
          created_by: string | null
          external_reference: string | null
          fleet_client_id: string
          fleet_contract_id: string | null
          id: string
          location_id: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["work_order_priority"]
          requested_for: string | null
          requested_service: string
          status: Database["public"]["Enums"]["fleet_request_status"]
          updated_at: string
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_reference?: string | null
          fleet_client_id: string
          fleet_contract_id?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["work_order_priority"]
          requested_for?: string | null
          requested_service: string
          status?: Database["public"]["Enums"]["fleet_request_status"]
          updated_at?: string
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_reference?: string | null
          fleet_client_id?: string
          fleet_contract_id?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["work_order_priority"]
          requested_for?: string | null
          requested_service?: string
          status?: Database["public"]["Enums"]["fleet_request_status"]
          updated_at?: string
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_workspace_id_fleet_client_id_fkey"
            columns: ["workspace_id", "fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "fleet_service_requests_workspace_id_fleet_contract_id_fkey"
            columns: ["workspace_id", "fleet_contract_id"]
            isOneToOne: false
            referencedRelation: "fleet_contracts"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "fleet_service_requests_workspace_id_location_id_fkey"
            columns: ["workspace_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "fleet_service_requests_workspace_id_vehicle_id_fkey"
            columns: ["workspace_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      google_calendar_sync_tokens: {
        Row: {
          access_token_encrypted: string | null
          calendar_id: string
          created_at: string
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          needs_reauth: boolean
          refresh_token_encrypted: string | null
          sync_enabled: boolean
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          calendar_id?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          needs_reauth?: boolean
          refresh_token_encrypted?: string | null
          sync_enabled?: boolean
          token_expires_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          calendar_id?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          needs_reauth?: boolean
          refresh_token_encrypted?: string | null
          sync_enabled?: boolean
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      in_app_notification_push_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          notification_id: string
          sent_at: string | null
          status: string
          subscription_id: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          notification_id: string
          sent_at?: string | null
          status?: string
          subscription_id: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          notification_id?: string
          sent_at?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notification_push_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "in_app_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_app_notification_push_outbox_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tech_push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      in_app_notifications: {
        Row: {
          created_at: string
          dedupe_key: string
          dismissed_at: string | null
          id: string
          message: string
          metadata: Json
          read: boolean
          read_at: string | null
          source_event_id: string | null
          title: string
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          dedupe_key?: string
          dismissed_at?: string | null
          id?: string
          message: string
          metadata?: Json
          read?: boolean
          read_at?: string | null
          source_event_id?: string | null
          title: string
          type: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          dismissed_at?: string | null
          id?: string
          message?: string
          metadata?: Json
          read?: boolean
          read_at?: string | null
          source_event_id?: string | null
          title?: string
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_messages: {
        Row: {
          body: string
          channel: string
          created_at: string
          customer_id: string | null
          from_address: string
          id: string
          provider: string
          provider_event_id: string
          provider_message_id: string | null
          raw_payload: Json
          received_at: string
          status: string
          to_address: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          customer_id?: string | null
          from_address: string
          id?: string
          provider: string
          provider_event_id: string
          provider_message_id?: string | null
          raw_payload?: Json
          received_at: string
          status?: string
          to_address: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          customer_id?: string | null
          from_address?: string
          id?: string
          provider?: string
          provider_event_id?: string
          provider_message_id?: string | null
          raw_payload?: Json
          received_at?: string
          status?: string
          to_address?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_messages_workspace_id_customer_id_fkey"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inbound_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          created_at: string
          data_origin: string
          description: string | null
          id: string
          image_url: string | null
          import_batch_id: string | null
          is_warehouse_item: boolean
          low_stock_threshold: number
          name: string
          origin_source: string | null
          quantity: number
          reorder_url: string | null
          sell_price: number
          sku: string | null
          tire_load_index: string | null
          tire_position: string | null
          tire_season: string | null
          tire_size: string | null
          tire_speed_rating: string | null
          unit: string
          unit_cost: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          data_origin?: string
          description?: string | null
          id?: string
          image_url?: string | null
          import_batch_id?: string | null
          is_warehouse_item?: boolean
          low_stock_threshold?: number
          name: string
          origin_source?: string | null
          quantity?: number
          reorder_url?: string | null
          sell_price?: number
          sku?: string | null
          tire_load_index?: string | null
          tire_position?: string | null
          tire_season?: string | null
          tire_size?: string | null
          tire_speed_rating?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          data_origin?: string
          description?: string | null
          id?: string
          image_url?: string | null
          import_batch_id?: string | null
          is_warehouse_item?: boolean
          low_stock_threshold?: number
          name?: string
          origin_source?: string | null
          quantity?: number
          reorder_url?: string | null
          sell_price?: number
          sku?: string | null
          tire_load_index?: string | null
          tire_position?: string | null
          tire_season?: string | null
          tire_size?: string | null
          tire_speed_rating?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invitation_delivery_attempts: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          invitation_id: string
          invited_email: string
          provider: string
          provider_message_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          invitation_id: string
          invited_email: string
          provider: string
          provider_message_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          invitation_id?: string
          invited_email?: string
          provider?: string
          provider_message_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_delivery_attempts_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_delivery_attempts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          invitation_id: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          invitation_id: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          invitation_id?: string
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_events_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          expires_at: string
          id: string
          invited_email: string
          invited_role: Database["public"]["Enums"]["member_role"]
          revoked_at: string | null
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          expires_at: string
          id?: string
          invited_email: string
          invited_role: Database["public"]["Enums"]["member_role"]
          revoked_at?: string | null
          token_hash: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          expires_at?: string
          id?: string
          invited_email?: string
          invited_role?: Database["public"]["Enums"]["member_role"]
          revoked_at?: string | null
          token_hash?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_customer_workspace_fk"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          metadata: Json
          quantity: number
          service_catalog_id: string | null
          sort_order: number
          tax_rate: number
          unit_price: number
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          metadata?: Json
          quantity?: number
          service_catalog_id?: string | null
          sort_order?: number
          tax_rate?: number
          unit_price?: number
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          metadata?: Json
          quantity?: number
          service_catalog_id?: string | null
          sort_order?: number
          tax_rate?: number
          unit_price?: number
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_workspace_id_invoice_id_fkey"
            columns: ["workspace_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "invoice_lines_workspace_service_fkey"
            columns: ["workspace_id", "service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "invoice_lines_workspace_vehicle_fkey"
            columns: ["workspace_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          customer_id: string
          due_at: string | null
          id: string
          invoice_number: number
          issued_at: string | null
          metadata: Json
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          vehicle_id: string | null
          work_order_id: string | null
          workspace_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          due_at?: string | null
          id?: string
          invoice_number?: never
          issued_at?: string | null
          metadata?: Json
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
          workspace_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          due_at?: string | null
          id?: string
          invoice_number?: never
          issued_at?: string | null
          metadata?: Json
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_customer_id_fkey"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_vehicle_id_fkey"
            columns: ["workspace_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_work_order_id_fkey"
            columns: ["workspace_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      lifecycle_event_outbox: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          entity_id: string
          entity_type: string
          event_key: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          payload: Json
          recipient_email: string | null
          recipient_role: string
          sent_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          entity_id: string
          entity_type: string
          event_key: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          recipient_email?: string | null
          recipient_role?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_key?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          recipient_email?: string | null
          recipient_role?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_event_outbox_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          location_type: Database["public"]["Enums"]["location_type"]
          longitude: number | null
          name: string
          phone: string | null
          postal_code: string | null
          region: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          location_type?: Database["public"]["Enums"]["location_type"]
          longitude?: number | null
          name: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          location_type?: Database["public"]["Enums"]["location_type"]
          longitude?: number | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_delivery_events: {
        Row: {
          created_at: string
          failure_code: string | null
          failure_reason: string | null
          id: string
          message_log_id: string | null
          occurred_at: string
          provider: string
          provider_event_id: string
          provider_message_id: string | null
          raw_payload: Json
          received_at: string
          recipient_email: string | null
          recipient_phone: string | null
          status: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          message_log_id?: string | null
          occurred_at: string
          provider: string
          provider_event_id: string
          provider_message_id?: string | null
          raw_payload?: Json
          received_at?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          status: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          message_log_id?: string | null
          occurred_at?: string
          provider?: string
          provider_event_id?: string
          provider_message_id?: string | null
          raw_payload?: Json
          received_at?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_delivery_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_delivery_events_workspace_id_message_log_id_fkey"
            columns: ["workspace_id", "message_log_id"]
            isOneToOne: false
            referencedRelation: "message_logs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      message_logs: {
        Row: {
          body_redacted: string | null
          channel: string
          consent_checked_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivered_at: string | null
          failed_at: string | null
          failure_code: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string
          last_delivery_occurred_at: string | null
          metadata: Json
          provider: string
          provider_connection_id: string | null
          provider_message_id: string | null
          purpose: string
          queued_at: string
          recipient_email: string | null
          recipient_phone: string | null
          sent_at: string | null
          status: string
          subject: string | null
          suppression_checked_at: string | null
          template_key: string
          template_version: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body_redacted?: string | null
          channel: string
          consent_checked_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          last_delivery_occurred_at?: string | null
          metadata?: Json
          provider: string
          provider_connection_id?: string | null
          provider_message_id?: string | null
          purpose: string
          queued_at?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          suppression_checked_at?: string | null
          template_key: string
          template_version?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body_redacted?: string | null
          channel?: string
          consent_checked_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          last_delivery_occurred_at?: string | null
          metadata?: Json
          provider?: string
          provider_connection_id?: string | null
          provider_message_id?: string | null
          purpose?: string
          queued_at?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          suppression_checked_at?: string | null
          template_key?: string
          template_version?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_provider_connection_id_fkey"
            columns: ["provider_connection_id"]
            isOneToOne: false
            referencedRelation: "provider_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_workspace_id_customer_id_fkey"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "message_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          purpose: string
          subject: string | null
          template_key: string
          updated_at: string
          variables_schema: Json
          version: number
          workspace_id: string
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          purpose: string
          subject?: string | null
          template_key: string
          updated_at?: string
          variables_schema?: Json
          version?: number
          workspace_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          purpose?: string
          subject?: string | null
          template_key?: string
          updated_at?: string
          variables_schema?: Json
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_consents: {
        Row: {
          channel: string
          consented_at: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          evidence: Json
          id: string
          legal_basis: string | null
          purpose: string
          revoked_at: string | null
          source: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel: string
          consented_at?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          evidence?: Json
          id?: string
          legal_basis?: string | null
          purpose: string
          revoked_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel?: string
          consented_at?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          evidence?: Json
          id?: string
          legal_basis?: string | null
          purpose?: string
          revoked_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messaging_consents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_consents_workspace_id_customer_id_fkey"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "messaging_consents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_suppressions: {
        Row: {
          active: boolean
          channel: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          email: string | null
          id: string
          lifted_at: string | null
          phone: string | null
          purpose: string | null
          reason: string
          source: string
          suppressed_at: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          active?: boolean
          channel?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          id?: string
          lifted_at?: string | null
          phone?: string | null
          purpose?: string | null
          reason: string
          source?: string
          suppressed_at?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          active?: boolean
          channel?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          id?: string
          lifted_at?: string | null
          phone?: string | null
          purpose?: string | null
          reason?: string
          source?: string
          suppressed_at?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_suppressions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_suppressions_workspace_id_customer_id_fkey"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "messaging_suppressions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency_code: string
          customer_id: string | null
          id: string
          invoice_id: string | null
          metadata: Json
          paid_at: string | null
          provider: Database["public"]["Enums"]["integration_provider"] | null
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          paid_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          paid_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_customer_id_fkey"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_invoice_id_fkey"
            columns: ["workspace_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_connections: {
        Row: {
          created_at: string
          created_by: string | null
          external_account_id: string | null
          id: string
          last_synced_at: string | null
          metadata: Json
          provider: Database["public"]["Enums"]["integration_provider"]
          scopes: string[]
          secret_reference: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_account_id?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          provider: Database["public"]["Enums"]["integration_provider"]
          scopes?: string[]
          secret_reference?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_account_id?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          provider?: Database["public"]["Enums"]["integration_provider"]
          scopes?: string[]
          secret_reference?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_conversions: {
        Row: {
          completed_at: string | null
          conversion_options: Json
          created_at: string
          created_by: string
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string
          quote_id: string
          service_record_id: string | null
          source_items_snapshot: Json
          source_quote_snapshot: Json
          status: Database["public"]["Enums"]["quote_conversion_status"]
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          conversion_options?: Json
          created_at?: string
          created_by: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key: string
          quote_id: string
          service_record_id?: string | null
          source_items_snapshot?: Json
          source_quote_snapshot: Json
          status?: Database["public"]["Enums"]["quote_conversion_status"]
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          conversion_options?: Json
          created_at?: string
          created_by?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string
          quote_id?: string
          service_record_id?: string | null
          source_items_snapshot?: Json
          source_quote_snapshot?: Json
          status?: Database["public"]["Enums"]["quote_conversion_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_conversions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_conversions_workspace_quote_fk"
            columns: ["workspace_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "quote_conversions_workspace_service_fk"
            columns: ["workspace_id", "service_record_id"]
            isOneToOne: false
            referencedRelation: "service_records"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          inventory_item_id: string | null
          quantity: number
          quote_id: string
          total_price: number
          unit_price: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          inventory_item_id?: string | null
          quantity?: number
          quote_id: string
          total_price?: number
          unit_price?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          inventory_item_id?: string | null
          quantity?: number
          quote_id?: string
          total_price?: number
          unit_price?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          expires_at: string | null
          id: string
          metadata: Json
          status: string
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          vehicle_id: string | null
          work_order_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          status?: string
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          status?: string
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_workspace_id_customer_id_fkey"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "quotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_workspace_id_vehicle_id_fkey"
            columns: ["workspace_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "quotes_workspace_id_work_order_id_fkey"
            columns: ["workspace_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          estimated_minutes: number | null
          id: string
          is_active: boolean
          labor_price: number
          metadata: Json
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          labor_price?: number
          metadata?: Json
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          labor_price?: number
          metadata?: Json
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      service_record_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          inventory_item_id: string | null
          item_type: Database["public"]["Enums"]["service_record_line_item_type"]
          labor_hours: number | null
          labor_rate: number | null
          metadata: Json
          quantity: number
          service_record_id: string
          sort_order: number
          source_quote_id: string | null
          source_quote_item_id: string | null
          total_price: number
          unit_price: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          inventory_item_id?: string | null
          item_type: Database["public"]["Enums"]["service_record_line_item_type"]
          labor_hours?: number | null
          labor_rate?: number | null
          metadata?: Json
          quantity?: number
          service_record_id: string
          sort_order?: number
          source_quote_id?: string | null
          source_quote_item_id?: string | null
          total_price: number
          unit_price?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          inventory_item_id?: string | null
          item_type?: Database["public"]["Enums"]["service_record_line_item_type"]
          labor_hours?: number | null
          labor_rate?: number | null
          metadata?: Json
          quantity?: number
          service_record_id?: string
          sort_order?: number
          source_quote_id?: string | null
          source_quote_item_id?: string | null
          total_price?: number
          unit_price?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_record_line_items_service_record_id_fkey"
            columns: ["service_record_id"]
            isOneToOne: false
            referencedRelation: "service_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_record_line_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_record_line_items_workspace_quote_fk"
            columns: ["workspace_id", "source_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "service_record_line_items_workspace_quote_item_fk"
            columns: ["workspace_id", "source_quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "service_record_line_items_workspace_record_fk"
            columns: ["workspace_id", "service_record_id"]
            isOneToOne: false
            referencedRelation: "service_records"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      service_records: {
        Row: {
          appointment_id: string | null
          complaint: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          currency_code: string
          customer_id: string | null
          customer_notes: string | null
          diagnosis: string | null
          discount_amount: number | null
          id: string
          internal_notes: string | null
          metadata: Json
          oil_quarts_used: number | null
          quote_id: string | null
          started_at: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          tax_rate: number | null
          technician_id: string | null
          total_amount: number | null
          updated_at: string
          vehicle_id: string | null
          work_order_id: string | null
          work_performed: string | null
          workspace_id: string
        }
        Insert: {
          appointment_id?: string | null
          complaint?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          currency_code?: string
          customer_id?: string | null
          customer_notes?: string | null
          diagnosis?: string | null
          discount_amount?: number | null
          id?: string
          internal_notes?: string | null
          metadata?: Json
          oil_quarts_used?: number | null
          quote_id?: string | null
          started_at?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          technician_id?: string | null
          total_amount?: number | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
          work_performed?: string | null
          workspace_id: string
        }
        Update: {
          appointment_id?: string | null
          complaint?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          currency_code?: string
          customer_id?: string | null
          customer_notes?: string | null
          diagnosis?: string | null
          discount_amount?: number | null
          id?: string
          internal_notes?: string | null
          metadata?: Json
          oil_quarts_used?: number | null
          quote_id?: string | null
          started_at?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          technician_id?: string | null
          total_amount?: number | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
          work_performed?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_records_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_records_workspace_customer_fk"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "service_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_records_workspace_quote_id_fkey"
            columns: ["workspace_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "service_records_workspace_vehicle_fk"
            columns: ["workspace_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          badge_color: string | null
          badge_label: string | null
          billing_cycle: string
          created_at: string
          cta_label: string | null
          description: string | null
          display_order: number
          features: Json
          highlight: boolean
          id: string
          included_services: Json
          is_active: boolean
          is_template: boolean
          max_services_per_cycle: number | null
          name: string
          price: number
          price_max: number | null
          price_min: number | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          badge_color?: string | null
          badge_label?: string | null
          billing_cycle?: string
          created_at?: string
          cta_label?: string | null
          description?: string | null
          display_order?: number
          features?: Json
          highlight?: boolean
          id?: string
          included_services?: Json
          is_active?: boolean
          is_template?: boolean
          max_services_per_cycle?: number | null
          name: string
          price?: number
          price_max?: number | null
          price_min?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          badge_color?: string | null
          badge_label?: string | null
          billing_cycle?: string
          created_at?: string
          cta_label?: string | null
          description?: string | null
          display_order?: number
          features?: Json
          highlight?: boolean
          id?: string
          included_services?: Json
          is_active?: boolean
          is_template?: boolean
          max_services_per_cycle?: number | null
          name?: string
          price?: number
          price_max?: number | null
          price_min?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tech_push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          disabled_at: string | null
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          auth_key: string
          created_at?: string
          disabled_at?: string | null
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          auth_key?: string
          created_at?: string
          disabled_at?: string | null
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tech_push_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_service_specs: {
        Row: {
          created_at: string
          engine: string | null
          id: string
          metadata: Json
          oil_capacity: string | null
          oil_filter: string | null
          oil_type: string | null
          source: string
          updated_at: string
          vehicle_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          engine?: string | null
          id?: string
          metadata?: Json
          oil_capacity?: string | null
          oil_filter?: string | null
          oil_type?: string | null
          source?: string
          updated_at?: string
          vehicle_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          engine?: string | null
          id?: string
          metadata?: Json
          oil_capacity?: string | null
          oil_filter?: string | null
          oil_type?: string | null
          source?: string
          updated_at?: string
          vehicle_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_service_specs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_service_specs_workspace_vehicle_fk"
            columns: ["workspace_id", "vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          customer_id: string | null
          id: string
          license_plate: string | null
          make: string | null
          metadata: Json
          mileage: number | null
          mileage_unit: string
          model: string | null
          notes: string | null
          plate_region: string | null
          status: Database["public"]["Enums"]["vehicle_status"]
          trim: string | null
          updated_at: string
          vin: string | null
          workspace_id: string
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          license_plate?: string | null
          make?: string | null
          metadata?: Json
          mileage?: number | null
          mileage_unit?: string
          model?: string | null
          notes?: string | null
          plate_region?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          trim?: string | null
          updated_at?: string
          vin?: string | null
          workspace_id: string
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          license_plate?: string | null
          make?: string | null
          metadata?: Json
          mileage?: number | null
          mileage_unit?: string
          model?: string | null
          notes?: string | null
          plate_region?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          trim?: string | null
          updated_at?: string
          vin?: string | null
          workspace_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_workspace_id_customer_id_fkey"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "vehicles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error_message: string | null
          event_type: string
          external_event_id: string
          id: string
          payload: Json
          processed_at: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          received_at: string
          signature_verified: boolean
          status: string
          workspace_id: string | null
        }
        Insert: {
          error_message?: string | null
          event_type: string
          external_event_id: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          received_at?: string
          signature_verified?: boolean
          status?: string
          workspace_id?: string | null
        }
        Update: {
          error_message?: string | null
          event_type?: string
          external_event_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          received_at?: string
          signature_verified?: boolean
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          unassigned_at: string | null
          user_id: string
          work_order_id: string
          workspace_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          unassigned_at?: string | null
          user_id: string
          work_order_id: string
          workspace_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          unassigned_at?: string | null
          user_id?: string
          work_order_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_assignments_workspace_id_work_order_id_fkey"
            columns: ["workspace_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      work_order_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          from_status: Database["public"]["Enums"]["work_order_status"] | null
          id: string
          payload: Json
          to_status: Database["public"]["Enums"]["work_order_status"] | null
          work_order_id: string
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          from_status?: Database["public"]["Enums"]["work_order_status"] | null
          id?: string
          payload?: Json
          to_status?: Database["public"]["Enums"]["work_order_status"] | null
          work_order_id: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["work_order_status"] | null
          id?: string
          payload?: Json
          to_status?: Database["public"]["Enums"]["work_order_status"] | null
          work_order_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_events_workspace_id_work_order_id_fkey"
            columns: ["workspace_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      work_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          item_type: string
          quantity: number
          service_catalog_id: string | null
          sort_order: number
          tax_rate: number
          unit_price: number
          updated_at: string
          work_order_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          item_type: string
          quantity?: number
          service_catalog_id?: string | null
          sort_order?: number
          tax_rate?: number
          unit_price?: number
          updated_at?: string
          work_order_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          item_type?: string
          quantity?: number
          service_catalog_id?: string | null
          sort_order?: number
          tax_rate?: number
          unit_price?: number
          updated_at?: string
          work_order_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_items_workspace_id_service_catalog_id_fkey"
            columns: ["workspace_id", "service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "work_order_items_workspace_id_work_order_id_fkey"
            columns: ["workspace_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      work_orders: {
        Row: {
          appointment_id: string | null
          complaint: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          diagnosis: string | null
          id: string
          location_id: string | null
          metadata: Json
          number: number
          opened_at: string | null
          priority: Database["public"]["Enums"]["work_order_priority"]
          status: Database["public"]["Enums"]["work_order_status"]
          technician_notes: string | null
          updated_at: string
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          appointment_id?: string | null
          complaint?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          diagnosis?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          number?: never
          opened_at?: string | null
          priority?: Database["public"]["Enums"]["work_order_priority"]
          status?: Database["public"]["Enums"]["work_order_status"]
          technician_notes?: string | null
          updated_at?: string
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          appointment_id?: string | null
          complaint?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          diagnosis?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          number?: never
          opened_at?: string | null
          priority?: Database["public"]["Enums"]["work_order_priority"]
          status?: Database["public"]["Enums"]["work_order_status"]
          technician_notes?: string | null
          updated_at?: string
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_workspace_id_appointment_id_fkey"
            columns: ["workspace_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "work_orders_workspace_id_customer_id_fkey"
            columns: ["workspace_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "work_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_workspace_id_location_id_fkey"
            columns: ["workspace_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "work_orders_workspace_id_vehicle_id_fkey"
            columns: ["workspace_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          is_active: boolean
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_settings: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          allow_cancellation: boolean
          allow_multi_day_bookings: boolean
          allow_rescheduling: boolean
          booking_enabled: boolean
          booking_slug: string | null
          buffer_time_after: number
          buffer_time_before: number
          cancellation_window_hours: number
          city: string | null
          closing_time: string | null
          country_code: string
          created_at: string
          day_hours: Json
          email: string | null
          logo_url: string | null
          marketplace_opt_in: boolean
          max_advance_days: number
          min_lead_time_hours: number
          oil_price_per_quart: number
          opening_time: string | null
          operational_settings: Json
          owner_name: string | null
          payment_provider: string | null
          phone: string | null
          postal_code: string | null
          region: string | null
          require_approval: boolean
          require_terms_acceptance: boolean
          reschedule_window_hours: number
          service_radius_miles: number | null
          shop_fee_description: string | null
          shop_fee_enabled: boolean
          shop_fee_type: string
          shop_fee_value: number
          slot_duration_minutes: number
          surcharge_description: string | null
          surcharge_enabled: boolean
          surcharge_type: string
          surcharge_value: number
          tax_rate: number
          terminology: Json
          terms_and_conditions: string | null
          updated_at: string
          waste_oil_fee: number
          waste_oil_fee_enabled: boolean
          website_url: string | null
          working_days: string[]
          workspace_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          allow_cancellation?: boolean
          allow_multi_day_bookings?: boolean
          allow_rescheduling?: boolean
          booking_enabled?: boolean
          booking_slug?: string | null
          buffer_time_after?: number
          buffer_time_before?: number
          cancellation_window_hours?: number
          city?: string | null
          closing_time?: string | null
          country_code?: string
          created_at?: string
          day_hours?: Json
          email?: string | null
          logo_url?: string | null
          marketplace_opt_in?: boolean
          max_advance_days?: number
          min_lead_time_hours?: number
          oil_price_per_quart?: number
          opening_time?: string | null
          operational_settings?: Json
          owner_name?: string | null
          payment_provider?: string | null
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          require_approval?: boolean
          require_terms_acceptance?: boolean
          reschedule_window_hours?: number
          service_radius_miles?: number | null
          shop_fee_description?: string | null
          shop_fee_enabled?: boolean
          shop_fee_type?: string
          shop_fee_value?: number
          slot_duration_minutes?: number
          surcharge_description?: string | null
          surcharge_enabled?: boolean
          surcharge_type?: string
          surcharge_value?: number
          tax_rate?: number
          terminology?: Json
          terms_and_conditions?: string | null
          updated_at?: string
          waste_oil_fee?: number
          waste_oil_fee_enabled?: boolean
          website_url?: string | null
          working_days?: string[]
          workspace_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          allow_cancellation?: boolean
          allow_multi_day_bookings?: boolean
          allow_rescheduling?: boolean
          booking_enabled?: boolean
          booking_slug?: string | null
          buffer_time_after?: number
          buffer_time_before?: number
          cancellation_window_hours?: number
          city?: string | null
          closing_time?: string | null
          country_code?: string
          created_at?: string
          day_hours?: Json
          email?: string | null
          logo_url?: string | null
          marketplace_opt_in?: boolean
          max_advance_days?: number
          min_lead_time_hours?: number
          oil_price_per_quart?: number
          opening_time?: string | null
          operational_settings?: Json
          owner_name?: string | null
          payment_provider?: string | null
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          require_approval?: boolean
          require_terms_acceptance?: boolean
          reschedule_window_hours?: number
          service_radius_miles?: number | null
          shop_fee_description?: string | null
          shop_fee_enabled?: boolean
          shop_fee_type?: string
          shop_fee_value?: number
          slot_duration_minutes?: number
          surcharge_description?: string | null
          surcharge_enabled?: boolean
          surcharge_type?: string
          surcharge_value?: number
          tax_rate?: number
          terminology?: Json
          terms_and_conditions?: string | null
          updated_at?: string
          waste_oil_fee?: number
          waste_oil_fee_enabled?: boolean
          website_url?: string | null
          working_days?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          app_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          created_by: string
          currency_code: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["workspace_kind"]
          legal_name: string | null
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          app_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          created_by: string
          currency_code?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["workspace_kind"]
          legal_name?: string | null
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          app_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          created_by?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["workspace_kind"]
          legal_name?: string | null
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_dispatch_job_v1: {
        Args: {
          p_job_id: string
          p_job_source: string
          p_notes?: string
          p_technician_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      book_appointment_safe: {
        Args: {
          p_business_user_id: string
          p_description: string
          p_duration_minutes: number
          p_estimated_cost: number
          p_guest_email: string
          p_guest_name: string
          p_guest_phone: string
          p_notes: string
          p_scheduled_date: string
          p_scheduled_time: string
          p_service_catalog_id: string
          p_status?: string
          p_tax_amount: number
          p_title: string
          p_vehicle_id: string
        }
        Returns: string
      }
      claim_in_app_push_outbox: {
        Args: { p_limit?: number; p_worker_id?: string }
        Returns: {
          attempts: number
          auth_key: string
          endpoint: string
          id: string
          message: string
          metadata: Json
          notification_id: string
          p256dh: string
          subscription_id: string
          title: string
          worker_id: string
        }[]
      }
      claim_lifecycle_events: {
        Args: { p_limit?: number; p_worker_id?: string }
        Returns: {
          attempts: number
          available_at: string
          created_at: string
          entity_id: string
          entity_type: string
          event_key: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          payload: Json
          recipient_email: string | null
          recipient_role: string
          sent_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "lifecycle_event_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_appointment_v1: {
        Args: { p_appointment_id: string; p_workspace_id: string }
        Returns: string
      }
      complete_in_app_push_outbox: {
        Args: {
          p_error?: string
          p_id: string
          p_retry_seconds?: number
          p_sent: boolean
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_lifecycle_event: {
        Args: {
          p_error?: string
          p_id: string
          p_retry_seconds?: number
          p_sent: boolean
          p_worker_id: string
        }
        Returns: boolean
      }
      convert_quote_to_service_record_v1: {
        Args: {
          p_appointment_id?: string
          p_created_by: string
          p_expected_quote_updated_at?: string
          p_idempotency_key: string
          p_internal_notes?: string
          p_quote_id: string
          p_service_date?: string
          p_technician_id?: string
          p_work_order_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_invoice_v1: {
        Args: { p_header: Json; p_lines: Json; p_workspace_id: string }
        Returns: string
      }
      create_work_order_v1: {
        Args: { p_payload: Json; p_workspace_id: string }
        Returns: {
          id: string
          number: number
        }[]
      }
      enqueue_lifecycle_event: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_event_key: string
          p_idempotency_key: string
          p_payload?: Json
          p_recipient_email?: string
          p_recipient_role?: string
          p_workspace_id: string
        }
        Returns: string
      }
      get_booked_slots: {
        Args: { booking_date: string; business_user_id: string }
        Returns: {
          duration_minutes: number
          scheduled_time: string
        }[]
      }
      get_public_blocked_dates: {
        Args: { p_business_user_id: string; p_customer_account_id?: string }
        Returns: {
          blocked_date: string
          reason: string
        }[]
      }
      get_public_booking_profile_v2: {
        Args: { booking_slug_param: string }
        Returns: {
          allow_cancellation: boolean
          allow_rescheduling: boolean
          buffer_time_after: number
          buffer_time_before: number
          business_name: string
          cancellation_window_hours: number
          closing_time: string
          currency: string
          email: string
          google_review_url: string
          logo_url: string
          max_advance_days: number
          min_lead_time_hours: number
          oil_price_per_quart: number
          opening_time: string
          phone: string
          require_approval: boolean
          require_terms_acceptance: boolean
          reschedule_window_hours: number
          service_address: string
          service_coordinates: Json
          service_radius_miles: number
          slot_duration_minutes: number
          stripe_charges_enabled: boolean
          terms_and_conditions: string
          user_id: string
          working_days: string[]
          yelp_review_url: string
        }[]
      }
      get_public_booking_settings: {
        Args: { p_business_user_id: string }
        Returns: {
          day_hours: Json
          oil_price_per_quart: number
          payment_provider: string
          service_verticals: string[]
          shop_fee_description: string
          shop_fee_enabled: boolean
          shop_fee_type: string
          shop_fee_value: number
          square_charges_enabled: boolean
          square_merchant_id: string
          surcharge_description: string
          surcharge_enabled: boolean
          surcharge_type: string
          surcharge_value: number
          waste_oil_fee: number
          waste_oil_fee_enabled: boolean
          weather_guard_enabled: boolean
          weather_guard_settings: Json
        }[]
      }
      get_public_service_catalog: {
        Args: { business_user_id: string }
        Returns: {
          category: string
          default_price: number
          description: string
          estimated_duration: number
          id: string
          is_upsell: boolean
          name: string
        }[]
      }
      get_public_service_catalog_v2: {
        Args: { p_booking_context_id?: string; p_business_user_id: string }
        Returns: {
          allows_manual_fitment: boolean
          booking_requirements: string[]
          category: string
          category_id: string
          configuration_schema_version: number
          default_price: number
          description: string
          estimated_duration: number
          id: string
          is_upsell: boolean
          name: string
          pricing_mode: string
          requires_fitment_lookup: boolean
          requires_inventory_selection: boolean
          requires_tire_quantity: boolean
          service_intent: string
          service_vertical: string
        }[]
      }
      get_public_service_packages: {
        Args: { business_user_id: string }
        Returns: {
          description: string
          discount_type: string
          discount_value: number
          estimated_duration: number
          id: string
          name: string
          package_price: number
          services: Json
        }[]
      }
      get_workforce_identity_v1: {
        Args: never
        Returns: {
          is_default: boolean
          landing_path: string
          role: string
          workspace_name: string
          workspace_user_id: string
        }[]
      }
      has_crm_capability: {
        Args: { required_capability: string; target_workspace_id: string }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["member_role"][]
          target_workspace_id: string
        }
        Returns: boolean
      }
      insert_booking_appointment_services: {
        Args: { p_appointment_id: string; p_services: Json }
        Returns: number
      }
      is_assigned_technician: {
        Args: { target_work_order_id: string; target_workspace_id: string }
        Returns: boolean
      }
      is_customer_for_workspace: {
        Args: { target_customer_id: string; target_workspace_id: string }
        Returns: boolean
      }
      is_workspace_admin: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      is_workspace_staff: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      messaging_apply_delivery_event: {
        Args: {
          target_failure_code?: string
          target_failure_reason?: string
          target_occurred_at: string
          target_provider: string
          target_provider_message_id: string
          target_status: string
        }
        Returns: string
      }
      messaging_has_active_suppression: {
        Args: {
          target_channel: string
          target_email?: string
          target_phone?: string
          target_purpose: string
          target_workspace_id: string
        }
        Returns: boolean
      }
      messaging_record_delivery_suppression: {
        Args: {
          target_email: string
          target_reason: string
          target_workspace_id: string
        }
        Returns: string
      }
      messaging_record_marketing_opt_out: {
        Args: {
          target_email: string
          target_source?: string
          target_workspace_id: string
        }
        Returns: string
      }
      patch_draft_invoice_v1: {
        Args: {
          p_invoice_id: string
          p_lines: Json
          p_patch: Json
          p_workspace_id: string
        }
        Returns: string
      }
      patch_work_order_v1: {
        Args: { p_patch: Json; p_work_order_id: string; p_workspace_id: string }
        Returns: string
      }
      populate_user_service_packages: {
        Args: { p_user_id: string }
        Returns: number
      }
      reconcile_invoice_payment_balance_v1: {
        Args: { p_invoice_id: string; p_workspace_id: string }
        Returns: undefined
      }
      record_fleet_invoice_payment: {
        Args: {
          _amount: number
          _details?: Json
          _idempotency_key: string
          _invoice_id: string
        }
        Returns: {
          amount_paid: number
          balance_due: number
          status: string
        }[]
      }
      record_public_booking_payment_intent_v1: {
        Args: {
          p_amount: number
          p_appointment_id: string
          p_business_user_id: string
          p_currency: string
          p_customer_email: string
          p_customer_name: string
          p_subtotal: number
          p_tax_amount: number
          p_tax_rate: number
        }
        Returns: string
      }
      replace_invoice_lines_v1: {
        Args: { p_invoice_id: string; p_lines: Json; p_workspace_id: string }
        Returns: undefined
      }
      save_appointment_booking_configuration: {
        Args: {
          p_appointment_id: string
          p_business_user_id: string
          p_configuration: Json
        }
        Returns: undefined
      }
      select_active_workspace_v1: {
        Args: { p_owner_user_id: string; p_role?: string }
        Returns: {
          landing_path: string
          role: string
          workspace_user_id: string
        }[]
      }
      set_vehicle_tire_spec_v1: {
        Args: {
          p_business_user_id: string
          p_tire_load_index?: string
          p_tire_size: string
          p_tire_size_front?: string
          p_tire_size_rear?: string
          p_tire_size_source?: string
          p_tire_speed_rating?: string
          p_vehicle_id: string
        }
        Returns: undefined
      }
      upsert_booking_vehicle: {
        Args: {
          p_business_user_id: string
          p_customer_id: string
          p_engine?: string
          p_image_url?: string
          p_license_plate?: string
          p_make: string
          p_mileage?: number
          p_model: string
          p_oil_capacity?: string
          p_oil_type?: string
          p_vin?: string
          p_year: number
        }
        Returns: string
      }
      upsert_customer: {
        Args: {
          p_address?: string
          p_email: string
          p_name: string
          p_phone?: string
          p_user_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      appointment_status:
        | "requested"
        | "confirmed"
        | "checked_in"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      customer_status: "active" | "inactive" | "archived"
      filter_brand:
        | "fram"
        | "wix"
        | "purolator"
        | "ac_delco"
        | "motorcraft"
        | "bosch"
        | "k_n"
        | "mobil1"
        | "other"
      filter_type:
        | "oil"
        | "air"
        | "cabin"
        | "fuel"
        | "transmission"
        | "hydraulic"
        | "pcv"
        | "breather"
      fleet_lifecycle_stage:
        | "prospect"
        | "onboarding"
        | "active"
        | "at_risk"
        | "churned"
      fleet_request_status:
        | "new"
        | "triaged"
        | "quoted"
        | "approved"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      integration_provider:
        | "stripe"
        | "square"
        | "quickbooks"
        | "google_calendar"
        | "resend"
        | "sms"
        | "carfax"
        | "mapbox"
        | "ai"
        | "other"
      invoice_status:
        | "draft"
        | "issued"
        | "partially_paid"
        | "paid"
        | "void"
        | "past_due"
      location_type: "shop" | "mobile" | "fleet_site" | "customer_site"
      member_role:
        | "owner"
        | "admin"
        | "manager"
        | "service_advisor"
        | "technician"
        | "dispatcher"
        | "receptionist"
        | "fleet_manager"
        | "viewer"
        | "customer"
      payment_status:
        | "pending"
        | "succeeded"
        | "failed"
        | "refunded"
        | "partially_refunded"
      quote_conversion_status: "processing" | "converted" | "failed"
      service_record_line_item_type: "labor" | "part" | "fee" | "discount"
      user_role: "owner" | "manager" | "technician" | "viewer"
      vehicle_status: "active" | "inactive" | "sold" | "archived"
      work_order_priority: "low" | "normal" | "high" | "urgent"
      work_order_status:
        | "draft"
        | "scheduled"
        | "assigned"
        | "in_progress"
        | "waiting_for_parts"
        | "awaiting_approval"
        | "completed"
        | "cancelled"
      workspace_kind: "shop" | "fleet" | "hybrid"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "moderator", "user"],
      appointment_status: [
        "requested",
        "confirmed",
        "checked_in",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      customer_status: ["active", "inactive", "archived"],
      filter_brand: [
        "fram",
        "wix",
        "purolator",
        "ac_delco",
        "motorcraft",
        "bosch",
        "k_n",
        "mobil1",
        "other",
      ],
      filter_type: [
        "oil",
        "air",
        "cabin",
        "fuel",
        "transmission",
        "hydraulic",
        "pcv",
        "breather",
      ],
      fleet_lifecycle_stage: [
        "prospect",
        "onboarding",
        "active",
        "at_risk",
        "churned",
      ],
      fleet_request_status: [
        "new",
        "triaged",
        "quoted",
        "approved",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      integration_provider: [
        "stripe",
        "square",
        "quickbooks",
        "google_calendar",
        "resend",
        "sms",
        "carfax",
        "mapbox",
        "ai",
        "other",
      ],
      invoice_status: [
        "draft",
        "issued",
        "partially_paid",
        "paid",
        "void",
        "past_due",
      ],
      location_type: ["shop", "mobile", "fleet_site", "customer_site"],
      member_role: [
        "owner",
        "admin",
        "manager",
        "service_advisor",
        "technician",
        "dispatcher",
        "receptionist",
        "fleet_manager",
        "viewer",
        "customer",
      ],
      payment_status: [
        "pending",
        "succeeded",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      quote_conversion_status: ["processing", "converted", "failed"],
      service_record_line_item_type: ["labor", "part", "fee", "discount"],
      user_role: ["owner", "manager", "technician", "viewer"],
      vehicle_status: ["active", "inactive", "sold", "archived"],
      work_order_priority: ["low", "normal", "high", "urgent"],
      work_order_status: [
        "draft",
        "scheduled",
        "assigned",
        "in_progress",
        "waiting_for_parts",
        "awaiting_approval",
        "completed",
        "cancelled",
      ],
      workspace_kind: ["shop", "fleet", "hybrid"],
    },
  },
} as const
