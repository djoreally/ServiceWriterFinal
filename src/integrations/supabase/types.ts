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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      service_records: {
        Row: {
          appointment_id: string
          complaint: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          customer_notes: string | null
          diagnosis: string | null
          id: string
          internal_notes: string | null
          metadata: Json
          oil_quarts_used: number | null
          started_at: string | null
          status: string
          technician_id: string | null
          updated_at: string
          work_order_id: string | null
          work_performed: string | null
          workspace_id: string
        }
        Insert: {
          appointment_id: string
          complaint?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          customer_notes?: string | null
          diagnosis?: string | null
          id?: string
          internal_notes?: string | null
          metadata?: Json
          oil_quarts_used?: number | null
          started_at?: string | null
          status?: string
          technician_id?: string | null
          updated_at?: string
          work_order_id?: string | null
          work_performed?: string | null
          workspace_id: string
        }
        Update: {
          appointment_id?: string
          complaint?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          customer_notes?: string | null
          diagnosis?: string | null
          id?: string
          internal_notes?: string | null
          metadata?: Json
          oil_quarts_used?: number | null
          started_at?: string | null
          status?: string
          technician_id?: string | null
          updated_at?: string
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
            foreignKeyName: "service_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
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
          recovered: boolean | null
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
          recovered?: boolean | null
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
          recovered?: boolean | null
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
      accounting_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          month_end: string
          month_start: string
          status: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          month_end: string
          month_start: string
          status?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          month_end?: string
          month_start?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_agent_memory: {
        Row: {
          agent_slug: string
          content: string
          created_at: string
          id: string
          metadata: Json
          role: string
          user_id: string
        }
        Insert: {
          agent_slug: string
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          user_id: string
        }
        Update: {
          agent_slug?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_memory_agent_slug_fkey"
            columns: ["agent_slug"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["slug"]
          },
        ]
      }
      ai_agents: {
        Row: {
          avatar: string | null
          capabilities: Json
          color: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          model: string
          name: string
          role: string
          slug: string
          system_prompt: string
          temperature: number
          updated_at: string
        }
        Insert: {
          avatar?: string | null
          capabilities?: Json
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          model?: string
          name: string
          role: string
          slug: string
          system_prompt: string
          temperature?: number
          updated_at?: string
        }
        Update: {
          avatar?: string | null
          capabilities?: Json
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          model?: string
          name?: string
          role?: string
          slug?: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_handoff_matrix: {
        Row: {
          created_at: string
          from_agent: string
          id: string
          priority: number
          to_agent: string
          trigger_condition: string
        }
        Insert: {
          created_at?: string
          from_agent: string
          id?: string
          priority?: number
          to_agent: string
          trigger_condition: string
        }
        Update: {
          created_at?: string
          from_agent?: string
          id?: string
          priority?: number
          to_agent?: string
          trigger_condition?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_handoff_matrix_from_agent_fkey"
            columns: ["from_agent"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "ai_handoff_matrix_to_agent_fkey"
            columns: ["to_agent"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["slug"]
          },
        ]
      }
      ai_shared_brain: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      ai_task_queue: {
        Row: {
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          owner_agent: string | null
          payload: Json
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          owner_agent?: string | null
          payload?: Json
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          owner_agent?: string | null
          payload?: Json
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_task_queue_owner_agent_fkey"
            columns: ["owner_agent"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["slug"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          metadata: Json
          session_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json
          session_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json
          session_id?: string
          tenant_id?: string
        }
        Relationships: []
      }
      appointment_booking_configurations: {
        Row: {
          appointment_id: string
          configuration: Json
          created_at: string
          id: string
          schema_version: number
          user_id: string
        }
        Insert: {
          appointment_id: string
          configuration: Json
          created_at?: string
          id?: string
          schema_version?: number
          user_id: string
        }
        Update: {
          appointment_id?: string
          configuration?: Json
          created_at?: string
          id?: string
          schema_version?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_booking_configurations_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
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
      appointment_completion_idempotency: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          idempotency_key: string
          response_payload: Json | null
          service_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          response_payload?: Json | null
          service_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          response_payload?: Json | null
          service_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_completion_idempotency_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_completion_idempotency_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_services: {
        Row: {
          added_at_service: boolean | null
          appointment_id: string
          created_at: string | null
          description: string | null
          id: string
          is_prepaid: boolean | null
          name: string
          price: number
          quantity: number
          service_catalog_id: string | null
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          added_at_service?: boolean | null
          appointment_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_prepaid?: boolean | null
          name: string
          price?: number
          quantity?: number
          service_catalog_id?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          added_at_service?: boolean | null
          appointment_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_prepaid?: boolean | null
          name?: string
          price?: number
          quantity?: number
          service_catalog_id?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_appointment_services_appointment"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          actual_end_time: string | null
          actual_start_time: string | null
          applied_tax_rate: number | null
          assigned_at: string | null
          assigned_technician_id: string | null
          assigned_van_id: string | null
          created_at: string
          customer_account_id: string | null
          customer_city: string | null
          customer_id: string | null
          customer_postal_code: string | null
          customer_state: string | null
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          deleted_at: string | null
          description: string | null
          dispatch_notes: string | null
          dispatch_status: string | null
          duration_minutes: number
          estimated_cost: number | null
          estimated_duration_minutes: number | null
          estimated_travel_minutes_from_base: number | null
          google_calendar_event_id: string | null
          google_calendar_synced_at: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          import_batch_id: string | null
          intake_responses: Json | null
          job_priority: string | null
          location_address: string | null
          location_geocode_confidence: number | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          location_routable_lat: number | null
          location_routable_lng: number | null
          location_verified_at: string | null
          management_token: string | null
          mileage_captured: number | null
          notes: string | null
          origin_source: string | null
          payment_status: string | null
          reminder_sent_at: string | null
          reward_applied_at: string | null
          reward_discount_cents: number
          reward_instance_id: string | null
          scheduled_date: string
          scheduled_time: string
          service_catalog_id: string | null
          service_record_id: string | null
          service_zone_id: string | null
          source: string | null
          status: string
          tax_amount: number | null
          tax_jurisdiction_details: Json | null
          terms_accepted_at: string | null
          title: string
          travel_time_minutes: number | null
          updated_at: string
          user_id: string
          vehicle_id: string | null
          vin_captured: string | null
          weather_decision: string | null
          weather_evaluated_at: string | null
          weather_risk_score: number | null
        }
        Insert: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          applied_tax_rate?: number | null
          assigned_at?: string | null
          assigned_technician_id?: string | null
          assigned_van_id?: string | null
          created_at?: string
          customer_account_id?: string | null
          customer_city?: string | null
          customer_id?: string | null
          customer_postal_code?: string | null
          customer_state?: string | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          deleted_at?: string | null
          description?: string | null
          dispatch_notes?: string | null
          dispatch_status?: string | null
          duration_minutes?: number
          estimated_cost?: number | null
          estimated_duration_minutes?: number | null
          estimated_travel_minutes_from_base?: number | null
          google_calendar_event_id?: string | null
          google_calendar_synced_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          import_batch_id?: string | null
          intake_responses?: Json | null
          job_priority?: string | null
          location_address?: string | null
          location_geocode_confidence?: number | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          location_routable_lat?: number | null
          location_routable_lng?: number | null
          location_verified_at?: string | null
          management_token?: string | null
          mileage_captured?: number | null
          notes?: string | null
          origin_source?: string | null
          payment_status?: string | null
          reminder_sent_at?: string | null
          reward_applied_at?: string | null
          reward_discount_cents?: number
          reward_instance_id?: string | null
          scheduled_date: string
          scheduled_time: string
          service_catalog_id?: string | null
          service_record_id?: string | null
          service_zone_id?: string | null
          source?: string | null
          status?: string
          tax_amount?: number | null
          tax_jurisdiction_details?: Json | null
          terms_accepted_at?: string | null
          title: string
          travel_time_minutes?: number | null
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
          vin_captured?: string | null
          weather_decision?: string | null
          weather_evaluated_at?: string | null
          weather_risk_score?: number | null
        }
        Update: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          applied_tax_rate?: number | null
          assigned_at?: string | null
          assigned_technician_id?: string | null
          assigned_van_id?: string | null
          created_at?: string
          customer_account_id?: string | null
          customer_city?: string | null
          customer_id?: string | null
          customer_postal_code?: string | null
          customer_state?: string | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          deleted_at?: string | null
          description?: string | null
          dispatch_notes?: string | null
          dispatch_status?: string | null
          duration_minutes?: number
          estimated_cost?: number | null
          estimated_duration_minutes?: number | null
          estimated_travel_minutes_from_base?: number | null
          google_calendar_event_id?: string | null
          google_calendar_synced_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          import_batch_id?: string | null
          intake_responses?: Json | null
          job_priority?: string | null
          location_address?: string | null
          location_geocode_confidence?: number | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          location_routable_lat?: number | null
          location_routable_lng?: number | null
          location_verified_at?: string | null
          management_token?: string | null
          mileage_captured?: number | null
          notes?: string | null
          origin_source?: string | null
          payment_status?: string | null
          reminder_sent_at?: string | null
          reward_applied_at?: string | null
          reward_discount_cents?: number
          reward_instance_id?: string | null
          scheduled_date?: string
          scheduled_time?: string
          service_catalog_id?: string | null
          service_record_id?: string | null
          service_zone_id?: string | null
          source?: string | null
          status?: string
          tax_amount?: number | null
          tax_jurisdiction_details?: Json | null
          terms_accepted_at?: string | null
          title?: string
          travel_time_minutes?: number | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
          vin_captured?: string | null
          weather_decision?: string | null
          weather_evaluated_at?: string | null
          weather_risk_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_assigned_van_id_fkey"
            columns: ["assigned_van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_account_id_fkey"
            columns: ["customer_account_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_reward_instance_id_fkey"
            columns: ["reward_instance_id"]
            isOneToOne: false
            referencedRelation: "loyalty_reward_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_record_id_fkey"
            columns: ["service_record_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_zone_id_fkey"
            columns: ["service_zone_id"]
            isOneToOne: false
            referencedRelation: "service_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: string
          bucket: string
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          file_size: number
          folder: string | null
          height: number | null
          id: string
          mime_type: string
          original_filename: string
          status: string
          storage_path: string
          tenant_id: string | null
          thumbnail_path: string | null
          updated_at: string
          user_id: string
          width: number | null
        }
        Insert: {
          asset_type: string
          bucket?: string
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          file_size?: number
          folder?: string | null
          height?: number | null
          id?: string
          mime_type: string
          original_filename: string
          status?: string
          storage_path: string
          tenant_id?: string | null
          thumbnail_path?: string | null
          updated_at?: string
          user_id: string
          width?: number | null
        }
        Update: {
          asset_type?: string
          bucket?: string
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          file_size?: number
          folder?: string | null
          height?: number | null
          id?: string
          mime_type?: string
          original_filename?: string
          status?: string
          storage_path?: string
          tenant_id?: string | null
          thumbnail_path?: string | null
          updated_at?: string
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event: string
          function_name: string | null
          id: string
          level: string
          message: string | null
          metadata: Json
          occurred_at: string
          request_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event: string
          function_name?: string | null
          id?: string
          level: string
          message?: string | null
          metadata?: Json
          occurred_at?: string
          request_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event?: string
          function_name?: string | null
          id?: string
          level?: string
          message?: string | null
          metadata?: Json
          occurred_at?: string
          request_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          deleted_at: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_security_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      automation_jobs: {
        Row: {
          active: boolean
          batch_size: number | null
          cadence_note: string | null
          created_at: string
          criticality: string
          cron_expression: string | null
          function_name: string
          job_name: string
          monitoring_threshold_minutes: number
          notes: string | null
          owner: string
          request_body: Json
          trigger_kind: Database["public"]["Enums"]["automation_trigger_kind"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          batch_size?: number | null
          cadence_note?: string | null
          created_at?: string
          criticality?: string
          cron_expression?: string | null
          function_name: string
          job_name: string
          monitoring_threshold_minutes?: number
          notes?: string | null
          owner?: string
          request_body?: Json
          trigger_kind?: Database["public"]["Enums"]["automation_trigger_kind"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          batch_size?: number | null
          cadence_note?: string | null
          created_at?: string
          criticality?: string
          cron_expression?: string | null
          function_name?: string
          job_name?: string
          monitoring_threshold_minutes?: number
          notes?: string | null
          owner?: string
          request_body?: Json
          trigger_kind?: Database["public"]["Enums"]["automation_trigger_kind"]
          updated_at?: string
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          actions_jsonb: Json
          audience_jsonb: Json | null
          conditions_jsonb: Json | null
          created_at: string
          frequency_guard_jsonb: Json | null
          id: string
          is_active: boolean
          name: string
          priority: number
          trigger_jsonb: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          actions_jsonb?: Json
          audience_jsonb?: Json | null
          conditions_jsonb?: Json | null
          created_at?: string
          frequency_guard_jsonb?: Json | null
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          trigger_jsonb?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          actions_jsonb?: Json
          audience_jsonb?: Json | null
          conditions_jsonb?: Json | null
          created_at?: string
          frequency_guard_jsonb?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          trigger_jsonb?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      automation_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          customer_id: string | null
          description: string | null
          due_at: string | null
          id: string
          rule_id: string | null
          scheduled_follow_up_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          rule_id?: string | null
          scheduled_follow_up_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          rule_id?: string | null
          scheduled_follow_up_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_tasks_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "follow_up_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_tasks_scheduled_follow_up_id_fkey"
            columns: ["scheduled_follow_up_id"]
            isOneToOne: false
            referencedRelation: "scheduled_follow_ups"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_dates: {
        Row: {
          blocked_date: string
          created_at: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          blocked_date: string
          created_at?: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          blocked_date?: string
          created_at?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      booking_contexts: {
        Row: {
          business_user_id: string
          created_at: string
          expires_at: string
          id: string
          location_context: Json | null
          selected_date: string | null
          selected_time: string | null
          service_context: Json | null
          session_id: string | null
          status: string
          updated_at: string
          vehicle_context: Json | null
        }
        Insert: {
          business_user_id: string
          created_at?: string
          expires_at?: string
          id?: string
          location_context?: Json | null
          selected_date?: string | null
          selected_time?: string | null
          service_context?: Json | null
          session_id?: string | null
          status?: string
          updated_at?: string
          vehicle_context?: Json | null
        }
        Update: {
          business_user_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          location_context?: Json | null
          selected_date?: string | null
          selected_time?: string | null
          service_context?: Json | null
          session_id?: string | null
          status?: string
          updated_at?: string
          vehicle_context?: Json | null
        }
        Relationships: []
      }
      business_profiles: {
        Row: {
          accept_deposits: boolean | null
          address: string | null
          allow_cancellation: boolean | null
          allow_multi_day_bookings: boolean | null
          allow_rescheduling: boolean | null
          appointment_reminder_hours: number | null
          auto_dispatch_enabled: boolean
          booking_enabled: boolean
          booking_slug: string | null
          brand_background_color: string | null
          brand_font_family: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          buffer_time_after: number | null
          buffer_time_before: number | null
          business_name: string | null
          cancellation_window_hours: number | null
          carfax_activated: boolean | null
          carfax_activation_date: string | null
          carfax_location_id: string | null
          cash_drawer_config: Json | null
          cash_drawer_enabled: boolean | null
          cash_drawer_open_on_cash_payment: boolean | null
          cash_drawer_require_reason: boolean | null
          cash_drawer_type: string | null
          city: string | null
          closing_time: string | null
          cover_image_url: string | null
          created_at: string
          currency: string | null
          date_format: string | null
          day_hours: Json | null
          default_labor_rate: number | null
          default_tax_nexus_state: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          deposit_percentage: number | null
          dispatch_fleet_performance_threshold: number
          dispatch_weight_distance: number
          dispatch_weight_fairness: number
          dispatch_weight_load: number
          dispatch_weight_performance: number
          dispatch_weight_route: number
          elevenlabs_agent_id: string | null
          email: string | null
          google_review_url: string | null
          id: string
          location_tax_enabled: boolean | null
          logo_url: string | null
          marketing_email_enabled: boolean
          marketing_email_footer: string | null
          marketing_email_monthly_limit: number
          marketing_email_sent_this_period: number
          marketplace_accept_new_customers: boolean
          marketplace_allow_same_day: boolean
          marketplace_auto_accept: boolean
          marketplace_description: string | null
          marketplace_max_jobs_per_day: number | null
          marketplace_opt_in: boolean | null
          marketplace_service_area_zips: string[]
          max_advance_days: number | null
          min_labor_hours: number | null
          min_lead_time_hours: number | null
          min_platform_fee_cents: number
          oil_price_per_quart: number | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          opening_time: string | null
          owner_name: string | null
          parts_markup_percent: number | null
          payment_provider: string | null
          phone: string | null
          phone_as_coupon_enabled: boolean
          phone_coupon_description: string
          phone_coupon_discount_type: string
          phone_coupon_discount_value: number
          phone_coupon_min_order_amount: number
          platform_fee_bps: number
          postal_code: string | null
          qbo_access_token_encrypted: string | null
          qbo_connected_at: string | null
          qbo_enabled: boolean | null
          qbo_income_account_id: string | null
          qbo_last_sync_at: string | null
          qbo_realm_id: string | null
          qbo_refresh_token_encrypted: string | null
          qbo_sync_customers: boolean | null
          qbo_sync_invoices: boolean | null
          qbo_sync_payments: boolean | null
          qbo_token_expires_at: string | null
          receptionist_first_message: string | null
          receptionist_phone_number: string | null
          receptionist_phone_number_id: string | null
          receptionist_provisioned_at: string | null
          receptionist_status: string | null
          receptionist_system_prompt: string | null
          receptionist_voice_id: string | null
          require_approval: boolean | null
          require_terms_acceptance: boolean | null
          reschedule_window_hours: number | null
          review_request_delay_hours: number | null
          service_address: string | null
          service_coordinates: Json | null
          service_radius_miles: number | null
          service_reminder_months: number | null
          service_verticals: string[]
          shop_fee_description: string | null
          shop_fee_enabled: boolean | null
          shop_fee_type: string | null
          shop_fee_value: number | null
          shop_supplies_percent: number | null
          slot_duration_minutes: number | null
          sms_a2p_status: string
          sms_default_from_number: string | null
          sms_low_balance_threshold: number
          sms_marketing_enabled: boolean
          sms_messaging_service_sid: string | null
          sms_monthly_included_segments: number
          sms_overage_enabled: boolean
          sms_segments_remaining: number
          sms_sender_id: string | null
          sms_transactional_enabled: boolean
          square_access_token_encrypted: string | null
          square_account_status: string | null
          square_charges_enabled: boolean | null
          square_location_id: string | null
          square_merchant_id: string | null
          square_onboarding_complete: boolean | null
          square_refresh_token_encrypted: string | null
          square_token_expires_at: string | null
          state: string | null
          stripe_account_id: string | null
          stripe_account_status: string | null
          stripe_charges_enabled: boolean | null
          stripe_onboarding_complete: boolean | null
          stripe_payouts_enabled: boolean | null
          surcharge_description: string | null
          surcharge_enabled: boolean | null
          surcharge_type: string | null
          surcharge_value: number | null
          tax_provider: string | null
          tax_provider_api_key: string | null
          tax_rate: number | null
          technician_customer_messaging_enabled: boolean
          terminology: Json | null
          terms_and_conditions: string | null
          timezone: string | null
          updated_at: string
          user_id: string
          waste_oil_fee: number | null
          waste_oil_fee_enabled: boolean | null
          weather_guard_enabled: boolean | null
          weather_guard_settings: Json | null
          website_url: string | null
          working_days: string[] | null
          yelp_review_url: string | null
        }
        Insert: {
          accept_deposits?: boolean | null
          address?: string | null
          allow_cancellation?: boolean | null
          allow_multi_day_bookings?: boolean | null
          allow_rescheduling?: boolean | null
          appointment_reminder_hours?: number | null
          auto_dispatch_enabled?: boolean
          booking_enabled?: boolean
          booking_slug?: string | null
          brand_background_color?: string | null
          brand_font_family?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          buffer_time_after?: number | null
          buffer_time_before?: number | null
          business_name?: string | null
          cancellation_window_hours?: number | null
          carfax_activated?: boolean | null
          carfax_activation_date?: string | null
          carfax_location_id?: string | null
          cash_drawer_config?: Json | null
          cash_drawer_enabled?: boolean | null
          cash_drawer_open_on_cash_payment?: boolean | null
          cash_drawer_require_reason?: boolean | null
          cash_drawer_type?: string | null
          city?: string | null
          closing_time?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency?: string | null
          date_format?: string | null
          day_hours?: Json | null
          default_labor_rate?: number | null
          default_tax_nexus_state?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          deposit_percentage?: number | null
          dispatch_fleet_performance_threshold?: number
          dispatch_weight_distance?: number
          dispatch_weight_fairness?: number
          dispatch_weight_load?: number
          dispatch_weight_performance?: number
          dispatch_weight_route?: number
          elevenlabs_agent_id?: string | null
          email?: string | null
          google_review_url?: string | null
          id?: string
          location_tax_enabled?: boolean | null
          logo_url?: string | null
          marketing_email_enabled?: boolean
          marketing_email_footer?: string | null
          marketing_email_monthly_limit?: number
          marketing_email_sent_this_period?: number
          marketplace_accept_new_customers?: boolean
          marketplace_allow_same_day?: boolean
          marketplace_auto_accept?: boolean
          marketplace_description?: string | null
          marketplace_max_jobs_per_day?: number | null
          marketplace_opt_in?: boolean | null
          marketplace_service_area_zips?: string[]
          max_advance_days?: number | null
          min_labor_hours?: number | null
          min_lead_time_hours?: number | null
          min_platform_fee_cents?: number
          oil_price_per_quart?: number | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          opening_time?: string | null
          owner_name?: string | null
          parts_markup_percent?: number | null
          payment_provider?: string | null
          phone?: string | null
          phone_as_coupon_enabled?: boolean
          phone_coupon_description?: string
          phone_coupon_discount_type?: string
          phone_coupon_discount_value?: number
          phone_coupon_min_order_amount?: number
          platform_fee_bps?: number
          postal_code?: string | null
          qbo_access_token_encrypted?: string | null
          qbo_connected_at?: string | null
          qbo_enabled?: boolean | null
          qbo_income_account_id?: string | null
          qbo_last_sync_at?: string | null
          qbo_realm_id?: string | null
          qbo_refresh_token_encrypted?: string | null
          qbo_sync_customers?: boolean | null
          qbo_sync_invoices?: boolean | null
          qbo_sync_payments?: boolean | null
          qbo_token_expires_at?: string | null
          receptionist_first_message?: string | null
          receptionist_phone_number?: string | null
          receptionist_phone_number_id?: string | null
          receptionist_provisioned_at?: string | null
          receptionist_status?: string | null
          receptionist_system_prompt?: string | null
          receptionist_voice_id?: string | null
          require_approval?: boolean | null
          require_terms_acceptance?: boolean | null
          reschedule_window_hours?: number | null
          review_request_delay_hours?: number | null
          service_address?: string | null
          service_coordinates?: Json | null
          service_radius_miles?: number | null
          service_reminder_months?: number | null
          service_verticals?: string[]
          shop_fee_description?: string | null
          shop_fee_enabled?: boolean | null
          shop_fee_type?: string | null
          shop_fee_value?: number | null
          shop_supplies_percent?: number | null
          slot_duration_minutes?: number | null
          sms_a2p_status?: string
          sms_default_from_number?: string | null
          sms_low_balance_threshold?: number
          sms_marketing_enabled?: boolean
          sms_messaging_service_sid?: string | null
          sms_monthly_included_segments?: number
          sms_overage_enabled?: boolean
          sms_segments_remaining?: number
          sms_sender_id?: string | null
          sms_transactional_enabled?: boolean
          square_access_token_encrypted?: string | null
          square_account_status?: string | null
          square_charges_enabled?: boolean | null
          square_location_id?: string | null
          square_merchant_id?: string | null
          square_onboarding_complete?: boolean | null
          square_refresh_token_encrypted?: string | null
          square_token_expires_at?: string | null
          state?: string | null
          stripe_account_id?: string | null
          stripe_account_status?: string | null
          stripe_charges_enabled?: boolean | null
          stripe_onboarding_complete?: boolean | null
          stripe_payouts_enabled?: boolean | null
          surcharge_description?: string | null
          surcharge_enabled?: boolean | null
          surcharge_type?: string | null
          surcharge_value?: number | null
          tax_provider?: string | null
          tax_provider_api_key?: string | null
          tax_rate?: number | null
          technician_customer_messaging_enabled?: boolean
          terminology?: Json | null
          terms_and_conditions?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          waste_oil_fee?: number | null
          waste_oil_fee_enabled?: boolean | null
          weather_guard_enabled?: boolean | null
          weather_guard_settings?: Json | null
          website_url?: string | null
          working_days?: string[] | null
          yelp_review_url?: string | null
        }
        Update: {
          accept_deposits?: boolean | null
          address?: string | null
          allow_cancellation?: boolean | null
          allow_multi_day_bookings?: boolean | null
          allow_rescheduling?: boolean | null
          appointment_reminder_hours?: number | null
          auto_dispatch_enabled?: boolean
          booking_enabled?: boolean
          booking_slug?: string | null
          brand_background_color?: string | null
          brand_font_family?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          buffer_time_after?: number | null
          buffer_time_before?: number | null
          business_name?: string | null
          cancellation_window_hours?: number | null
          carfax_activated?: boolean | null
          carfax_activation_date?: string | null
          carfax_location_id?: string | null
          cash_drawer_config?: Json | null
          cash_drawer_enabled?: boolean | null
          cash_drawer_open_on_cash_payment?: boolean | null
          cash_drawer_require_reason?: boolean | null
          cash_drawer_type?: string | null
          city?: string | null
          closing_time?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency?: string | null
          date_format?: string | null
          day_hours?: Json | null
          default_labor_rate?: number | null
          default_tax_nexus_state?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          deposit_percentage?: number | null
          dispatch_fleet_performance_threshold?: number
          dispatch_weight_distance?: number
          dispatch_weight_fairness?: number
          dispatch_weight_load?: number
          dispatch_weight_performance?: number
          dispatch_weight_route?: number
          elevenlabs_agent_id?: string | null
          email?: string | null
          google_review_url?: string | null
          id?: string
          location_tax_enabled?: boolean | null
          logo_url?: string | null
          marketing_email_enabled?: boolean
          marketing_email_footer?: string | null
          marketing_email_monthly_limit?: number
          marketing_email_sent_this_period?: number
          marketplace_accept_new_customers?: boolean
          marketplace_allow_same_day?: boolean
          marketplace_auto_accept?: boolean
          marketplace_description?: string | null
          marketplace_max_jobs_per_day?: number | null
          marketplace_opt_in?: boolean | null
          marketplace_service_area_zips?: string[]
          max_advance_days?: number | null
          min_labor_hours?: number | null
          min_lead_time_hours?: number | null
          min_platform_fee_cents?: number
          oil_price_per_quart?: number | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          opening_time?: string | null
          owner_name?: string | null
          parts_markup_percent?: number | null
          payment_provider?: string | null
          phone?: string | null
          phone_as_coupon_enabled?: boolean
          phone_coupon_description?: string
          phone_coupon_discount_type?: string
          phone_coupon_discount_value?: number
          phone_coupon_min_order_amount?: number
          platform_fee_bps?: number
          postal_code?: string | null
          qbo_access_token_encrypted?: string | null
          qbo_connected_at?: string | null
          qbo_enabled?: boolean | null
          qbo_income_account_id?: string | null
          qbo_last_sync_at?: string | null
          qbo_realm_id?: string | null
          qbo_refresh_token_encrypted?: string | null
          qbo_sync_customers?: boolean | null
          qbo_sync_invoices?: boolean | null
          qbo_sync_payments?: boolean | null
          qbo_token_expires_at?: string | null
          receptionist_first_message?: string | null
          receptionist_phone_number?: string | null
          receptionist_phone_number_id?: string | null
          receptionist_provisioned_at?: string | null
          receptionist_status?: string | null
          receptionist_system_prompt?: string | null
          receptionist_voice_id?: string | null
          require_approval?: boolean | null
          require_terms_acceptance?: boolean | null
          reschedule_window_hours?: number | null
          review_request_delay_hours?: number | null
          service_address?: string | null
          service_coordinates?: Json | null
          service_radius_miles?: number | null
          service_reminder_months?: number | null
          service_verticals?: string[]
          shop_fee_description?: string | null
          shop_fee_enabled?: boolean | null
          shop_fee_type?: string | null
          shop_fee_value?: number | null
          shop_supplies_percent?: number | null
          slot_duration_minutes?: number | null
          sms_a2p_status?: string
          sms_default_from_number?: string | null
          sms_low_balance_threshold?: number
          sms_marketing_enabled?: boolean
          sms_messaging_service_sid?: string | null
          sms_monthly_included_segments?: number
          sms_overage_enabled?: boolean
          sms_segments_remaining?: number
          sms_sender_id?: string | null
          sms_transactional_enabled?: boolean
          square_access_token_encrypted?: string | null
          square_account_status?: string | null
          square_charges_enabled?: boolean | null
          square_location_id?: string | null
          square_merchant_id?: string | null
          square_onboarding_complete?: boolean | null
          square_refresh_token_encrypted?: string | null
          square_token_expires_at?: string | null
          state?: string | null
          stripe_account_id?: string | null
          stripe_account_status?: string | null
          stripe_charges_enabled?: boolean | null
          stripe_onboarding_complete?: boolean | null
          stripe_payouts_enabled?: boolean | null
          surcharge_description?: string | null
          surcharge_enabled?: boolean | null
          surcharge_type?: string | null
          surcharge_value?: number | null
          tax_provider?: string | null
          tax_provider_api_key?: string | null
          tax_rate?: number | null
          technician_customer_messaging_enabled?: boolean
          terminology?: Json | null
          terms_and_conditions?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          waste_oil_fee?: number | null
          waste_oil_fee_enabled?: boolean | null
          weather_guard_enabled?: boolean | null
          weather_guard_settings?: Json | null
          website_url?: string | null
          working_days?: string[] | null
          yelp_review_url?: string | null
        }
        Relationships: []
      }
      business_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          grace_notifications_sent: number
          grace_period_ends_at: string | null
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_notifications_sent?: number
          grace_period_ends_at?: string | null
          id?: string
          plan_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_notifications_sent?: number
          grace_period_ends_at?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      carfax_exports: {
        Row: {
          created_at: string
          error_message: string | null
          export_date: string
          export_type: string
          file_name: string
          ftp_uploaded_at: string | null
          id: string
          record_count: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          export_date?: string
          export_type: string
          file_name: string
          ftp_uploaded_at?: string | null
          id?: string
          record_count?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          export_date?: string
          export_type?: string
          file_name?: string
          ftp_uploaded_at?: string | null
          id?: string
          record_count?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      carfax_feed_schedule: {
        Row: {
          created_at: string | null
          error_message: string | null
          executed_at: string | null
          id: string
          scheduled_for: string
          shops_processed: number | null
          status: string
          total_records: number | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          scheduled_for: string
          shops_processed?: number | null
          status?: string
          total_records?: number | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          scheduled_for?: string
          shops_processed?: number | null
          status?: string
          total_records?: number | null
        }
        Relationships: []
      }
      cash_drawer_events: {
        Row: {
          actual_amount: number | null
          amount: number | null
          appointment_id: string | null
          created_at: string | null
          device_info: Json | null
          event_type: string
          expected_amount: number | null
          id: string
          opened_by: string | null
          payment_id: string | null
          payment_method: string | null
          reason: string | null
          trigger_type: string
          user_id: string
          variance: number | null
        }
        Insert: {
          actual_amount?: number | null
          amount?: number | null
          appointment_id?: string | null
          created_at?: string | null
          device_info?: Json | null
          event_type: string
          expected_amount?: number | null
          id?: string
          opened_by?: string | null
          payment_id?: string | null
          payment_method?: string | null
          reason?: string | null
          trigger_type: string
          user_id: string
          variance?: number | null
        }
        Update: {
          actual_amount?: number | null
          amount?: number | null
          appointment_id?: string | null
          created_at?: string | null
          device_info?: Json | null
          event_type?: string
          expected_amount?: number | null
          id?: string
          opened_by?: string | null
          payment_id?: string | null
          payment_method?: string | null
          reason?: string | null
          trigger_type?: string
          user_id?: string
          variance?: number | null
        }
        Relationships: []
      }
      cash_drawer_reconciliations: {
        Row: {
          closed_at: string
          counted_by: string | null
          counted_cents: number | null
          created_at: string
          expected_cents: number
          id: string
          notes: string | null
          opened_at: string
          user_id: string
        }
        Insert: {
          closed_at: string
          counted_by?: string | null
          counted_cents?: number | null
          created_at?: string
          expected_cents?: number
          id?: string
          notes?: string | null
          opened_at: string
          user_id: string
        }
        Update: {
          closed_at?: string
          counted_by?: string | null
          counted_cents?: number | null
          created_at?: string
          expected_cents?: number
          id?: string
          notes?: string | null
          opened_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_drawer_sessions: {
        Row: {
          cash_in_total: number | null
          cash_out_total: number | null
          cash_sales_total: number | null
          closing_amount: number | null
          created_at: string | null
          ended_at: string | null
          expected_closing: number | null
          id: string
          opening_amount: number
          staff_name: string | null
          started_at: string
          status: string | null
          updated_at: string | null
          user_id: string
          variance: number | null
          variance_reason: string | null
        }
        Insert: {
          cash_in_total?: number | null
          cash_out_total?: number | null
          cash_sales_total?: number | null
          closing_amount?: number | null
          created_at?: string | null
          ended_at?: string | null
          expected_closing?: number | null
          id?: string
          opening_amount?: number
          staff_name?: string | null
          started_at?: string
          status?: string | null
          updated_at?: string | null
          user_id: string
          variance?: number | null
          variance_reason?: string | null
        }
        Update: {
          cash_in_total?: number | null
          cash_out_total?: number | null
          cash_sales_total?: number | null
          closing_amount?: number | null
          created_at?: string | null
          ended_at?: string | null
          expected_closing?: number | null
          id?: string
          opening_amount?: number
          staff_name?: string | null
          started_at?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
          variance?: number | null
          variance_reason?: string | null
        }
        Relationships: []
      }
      charge_adjustments: {
        Row: {
          adjustment_type: string
          amount_cents: number
          approved_by: string | null
          created_at: string
          id: string
          job_charge_id: string
          metadata: Json
          reason: string
          user_id: string
        }
        Insert: {
          adjustment_type: string
          amount_cents: number
          approved_by?: string | null
          created_at?: string
          id?: string
          job_charge_id: string
          metadata?: Json
          reason: string
          user_id: string
        }
        Update: {
          adjustment_type?: string
          amount_cents?: number
          approved_by?: string | null
          created_at?: string
          id?: string
          job_charge_id?: string
          metadata?: Json
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_adjustments_job_charge_id_fkey"
            columns: ["job_charge_id"]
            isOneToOne: false
            referencedRelation: "job_charge_balances_v1"
            referencedColumns: ["job_charge_id"]
          },
          {
            foreignKeyName: "charge_adjustments_job_charge_id_fkey"
            columns: ["job_charge_id"]
            isOneToOne: false
            referencedRelation: "job_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          subtype: string | null
          type: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          subtype?: string | null
          type: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          subtype?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      client_error_events: {
        Row: {
          context: Json
          correlation_id: string | null
          created_at: string
          endpoint: string | null
          error_message: string
          id: string
          severity: string
          source: string
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          correlation_id?: string | null
          created_at?: string
          endpoint?: string | null
          error_message: string
          id?: string
          severity?: string
          source?: string
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          correlation_id?: string | null
          created_at?: string
          endpoint?: string | null
          error_message?: string
          id?: string
          severity?: string
          source?: string
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      coupon_codes: {
        Row: {
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          max_uses: number | null
          min_order_amount: number | null
          updated_at: string
          used_count: number | null
          user_id: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          updated_at?: string
          used_count?: number | null
          user_id: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          updated_at?: string
          used_count?: number | null
          user_id?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      customer_accounts: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string | null
          id: string
          phone: string | null
          provider_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          phone?: string | null
          provider_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          provider_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_accounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customer_accounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      customer_events: {
        Row: {
          appointment_id: string | null
          campaign_id: string | null
          created_at: string | null
          customer_id: string | null
          event_data: Json | null
          event_type: string
          id: string
          occurred_at: string | null
          revenue_impact: number | null
          service_id: string | null
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          occurred_at?: string | null
          revenue_impact?: number | null
          service_id?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          occurred_at?: string | null
          revenue_impact?: number | null
          service_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_preferences: {
        Row: {
          appointment_reminders: boolean | null
          created_at: string
          customer_id: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          email_marketing: boolean | null
          id: string
          review_requests: boolean | null
          service_reminders: boolean | null
          unsubscribe_reason: string | null
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          appointment_reminders?: boolean | null
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          email_marketing?: boolean | null
          id?: string
          review_requests?: boolean | null
          service_reminders?: boolean | null
          unsubscribe_reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          appointment_reminders?: boolean | null
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          email_marketing?: boolean | null
          id?: string
          review_requests?: boolean | null
          service_reminders?: boolean | null
          unsubscribe_reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_preferences_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_segments: {
        Row: {
          auto_campaign_id: string | null
          auto_follow_up_days: number | null
          calculation_error: string | null
          calculation_started_at: string | null
          calculation_status: string
          color: string | null
          created_at: string | null
          customer_count: number | null
          description: string | null
          geo_center_lat: number | null
          geo_center_lng: number | null
          geo_radius_miles: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_auto: boolean | null
          last_calculated_at: string | null
          max_average_order: number | null
          max_days_since_service: number | null
          max_lifetime_value: number | null
          max_total_services: number | null
          member_count: number
          min_average_order: number | null
          min_days_since_service: number | null
          min_lifetime_value: number | null
          min_total_services: number | null
          name: string
          priority: number | null
          service_types_include: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_campaign_id?: string | null
          auto_follow_up_days?: number | null
          calculation_error?: string | null
          calculation_started_at?: string | null
          calculation_status?: string
          color?: string | null
          created_at?: string | null
          customer_count?: number | null
          description?: string | null
          geo_center_lat?: number | null
          geo_center_lng?: number | null
          geo_radius_miles?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_auto?: boolean | null
          last_calculated_at?: string | null
          max_average_order?: number | null
          max_days_since_service?: number | null
          max_lifetime_value?: number | null
          max_total_services?: number | null
          member_count?: number
          min_average_order?: number | null
          min_days_since_service?: number | null
          min_lifetime_value?: number | null
          min_total_services?: number | null
          name: string
          priority?: number | null
          service_types_include?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_campaign_id?: string | null
          auto_follow_up_days?: number | null
          calculation_error?: string | null
          calculation_started_at?: string | null
          calculation_status?: string
          color?: string | null
          created_at?: string | null
          customer_count?: number | null
          description?: string | null
          geo_center_lat?: number | null
          geo_center_lng?: number | null
          geo_radius_miles?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_auto?: boolean | null
          last_calculated_at?: string | null
          max_average_order?: number | null
          max_days_since_service?: number | null
          max_lifetime_value?: number | null
          max_total_services?: number | null
          member_count?: number
          min_average_order?: number | null
          min_days_since_service?: number | null
          min_lifetime_value?: number | null
          min_total_services?: number | null
          name?: string
          priority?: number | null
          service_types_include?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customer_subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          customer_id: string
          id: string
          plan_id: string
          start_date: string
          status: string
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          customer_id: string
          id?: string
          plan_id: string
          start_date?: string
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          customer_id?: string
          id?: string
          plan_id?: string
          start_date?: string
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tenant_isolation_forensics: {
        Row: {
          appointment_user_ids: string[]
          current_user_id: string
          customer_id: string
          detected_at: string
          distinct_owner_count: number
          id: string
          incident_type: string
          notes: string | null
          requires_gdpr_notification: boolean
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          vehicle_user_ids: string[]
        }
        Insert: {
          appointment_user_ids?: string[]
          current_user_id: string
          customer_id: string
          detected_at?: string
          distinct_owner_count: number
          id?: string
          incident_type?: string
          notes?: string | null
          requires_gdpr_notification?: boolean
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          vehicle_user_ids?: string[]
        }
        Update: {
          appointment_user_ids?: string[]
          current_user_id?: string
          customer_id?: string
          detected_at?: string
          distinct_owner_count?: number
          id?: string
          incident_type?: string
          notes?: string | null
          requires_gdpr_notification?: boolean
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          vehicle_user_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "customer_tenant_isolation_forensics_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          acquisition_source: string | null
          address: string | null
          average_order_value: number | null
          churn_risk: string | null
          created_at: string
          customer_account_id: string | null
          customer_segment: string | null
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          days_since_last_service: number | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          first_service_date: string | null
          id: string
          import_batch_id: string | null
          last_name: string | null
          last_service_date: string | null
          latitude: number | null
          lifetime_value: number | null
          longitude: number | null
          name: string
          notes: string | null
          origin_source: string | null
          phone: string | null
          postal_code: string | null
          segment_score: number | null
          total_services: number | null
          updated_at: string
          user_id: string
          visit_frequency_days: number | null
        }
        Insert: {
          acquisition_source?: string | null
          address?: string | null
          average_order_value?: number | null
          churn_risk?: string | null
          created_at?: string
          customer_account_id?: string | null
          customer_segment?: string | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          days_since_last_service?: number | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          first_service_date?: string | null
          id?: string
          import_batch_id?: string | null
          last_name?: string | null
          last_service_date?: string | null
          latitude?: number | null
          lifetime_value?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          origin_source?: string | null
          phone?: string | null
          postal_code?: string | null
          segment_score?: number | null
          total_services?: number | null
          updated_at?: string
          user_id: string
          visit_frequency_days?: number | null
        }
        Update: {
          acquisition_source?: string | null
          address?: string | null
          average_order_value?: number | null
          churn_risk?: string | null
          created_at?: string
          customer_account_id?: string | null
          customer_segment?: string | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          days_since_last_service?: number | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          first_service_date?: string | null
          id?: string
          import_batch_id?: string | null
          last_name?: string | null
          last_service_date?: string | null
          latitude?: number | null
          lifetime_value?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          origin_source?: string | null
          phone?: string | null
          postal_code?: string | null
          segment_score?: number | null
          total_services?: number | null
          updated_at?: string
          user_id?: string
          visit_frequency_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_customer_account_id_fkey"
            columns: ["customer_account_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      declined_services: {
        Row: {
          appointment_id: string | null
          catalog_item_id: string | null
          converted_at: string | null
          converted_service_id: string | null
          created_at: string | null
          customer_id: string | null
          decline_notes: string | null
          decline_reason: string | null
          declined_at: string | null
          estimated_cost: number | null
          follow_up_scheduled_for: string | null
          follow_up_sent_at: string | null
          follow_up_status: string | null
          id: string
          potential_revenue: number | null
          recommended_service: string
          service_id: string | null
          updated_at: string | null
          urgency: string | null
          user_id: string
          vehicle_id: string | null
          was_converted: boolean | null
        }
        Insert: {
          appointment_id?: string | null
          catalog_item_id?: string | null
          converted_at?: string | null
          converted_service_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          decline_notes?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          estimated_cost?: number | null
          follow_up_scheduled_for?: string | null
          follow_up_sent_at?: string | null
          follow_up_status?: string | null
          id?: string
          potential_revenue?: number | null
          recommended_service: string
          service_id?: string | null
          updated_at?: string | null
          urgency?: string | null
          user_id: string
          vehicle_id?: string | null
          was_converted?: boolean | null
        }
        Update: {
          appointment_id?: string | null
          catalog_item_id?: string | null
          converted_at?: string | null
          converted_service_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          decline_notes?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          estimated_cost?: number | null
          follow_up_scheduled_for?: string | null
          follow_up_sent_at?: string | null
          follow_up_status?: string | null
          id?: string
          potential_revenue?: number | null
          recommended_service?: string
          service_id?: string | null
          updated_at?: string | null
          urgency?: string | null
          user_id?: string
          vehicle_id?: string | null
          was_converted?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "declined_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "declined_services_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "declined_services_converted_service_id_fkey"
            columns: ["converted_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "declined_services_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "declined_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "declined_services_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_queue: {
        Row: {
          completed_at: string | null
          created_at: string | null
          deletion_reason: string | null
          id: string
          metadata: Json | null
          scheduled_for: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          deletion_reason?: string | null
          id?: string
          metadata?: Json | null
          scheduled_for: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          deletion_reason?: string | null
          id?: string
          metadata?: Json | null
          scheduled_for?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      detailing_pricing_rules: {
        Row: {
          condition: string
          created_at: string
          duration_multiplier: number
          flat_fee: number
          id: string
          photo_required: boolean
          price_multiplier: number
          quote_required: boolean
          requires_covered_area: boolean
          requires_power: boolean
          requires_water: boolean
          service_catalog_id: string | null
          size_tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          condition: string
          created_at?: string
          duration_multiplier?: number
          flat_fee?: number
          id?: string
          photo_required?: boolean
          price_multiplier?: number
          quote_required?: boolean
          requires_covered_area?: boolean
          requires_power?: boolean
          requires_water?: boolean
          service_catalog_id?: string | null
          size_tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          condition?: string
          created_at?: string
          duration_multiplier?: number
          flat_fee?: number
          id?: string
          photo_required?: boolean
          price_multiplier?: number
          quote_required?: boolean
          requires_covered_area?: boolean
          requires_power?: boolean
          requires_water?: boolean
          service_catalog_id?: string | null
          size_tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "detailing_pricing_rules_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_assignment_events: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string
          created_at: string
          duration_minutes: number | null
          id: string
          job_id: string
          job_source: string
          metadata: Json
          owner_user_id: string
          scheduled_date: string | null
          scheduled_time: string | null
          technician_id: string | null
          van_id: string | null
        }
        Insert: {
          action: string
          actor_role: string
          actor_user_id: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          job_id: string
          job_source: string
          metadata?: Json
          owner_user_id: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          technician_id?: string | null
          van_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          job_id?: string
          job_source?: string
          metadata?: Json
          owner_user_id?: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          technician_id?: string | null
          van_id?: string | null
        }
        Relationships: []
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
      dispatch_rules: {
        Row: {
          action: string
          active: boolean
          auto_execute: boolean
          condition: Json
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          active?: boolean
          auto_execute?: boolean
          condition?: Json
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          active?: boolean
          auto_execute?: boolean
          condition?: Json
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dispatch_runs: {
        Row: {
          created_at: string
          end_location_lat: number | null
          end_location_lng: number | null
          id: string
          run_date: string
          start_location_lat: number | null
          start_location_lng: number | null
          status: string
          technician_id: string
          total_distance_meters: number | null
          total_travel_time_seconds: number | null
          updated_at: string
          user_id: string
          van_id: string | null
        }
        Insert: {
          created_at?: string
          end_location_lat?: number | null
          end_location_lng?: number | null
          id?: string
          run_date: string
          start_location_lat?: number | null
          start_location_lng?: number | null
          status?: string
          technician_id: string
          total_distance_meters?: number | null
          total_travel_time_seconds?: number | null
          updated_at?: string
          user_id: string
          van_id?: string | null
        }
        Update: {
          created_at?: string
          end_location_lat?: number | null
          end_location_lng?: number | null
          id?: string
          run_date?: string
          start_location_lat?: number | null
          start_location_lng?: number | null
          status?: string
          technician_id?: string
          total_distance_meters?: number | null
          total_travel_time_seconds?: number | null
          updated_at?: string
          user_id?: string
          van_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_runs_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_runs_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      document_intake: {
        Row: {
          confidence: number | null
          created_at: string
          deleted_at: string | null
          extracted_vin: string | null
          file_name: string
          file_path: string
          file_size_bytes: number | null
          fleet_vehicle_id: string | null
          id: string
          mime_type: string
          notes: string | null
          parse_error: string | null
          parse_method: string | null
          parse_status: string
          parsed_json: Json | null
          profile: string
          promoted_expense_id: string | null
          promoted_fuel_log_id: string | null
          promoted_work_order_id: string | null
          raw_text: string | null
          rejection_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          uploaded_by_user_id: string | null
          user_id: string
          vin_valid: boolean | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          deleted_at?: string | null
          extracted_vin?: string | null
          file_name: string
          file_path: string
          file_size_bytes?: number | null
          fleet_vehicle_id?: string | null
          id?: string
          mime_type: string
          notes?: string | null
          parse_error?: string | null
          parse_method?: string | null
          parse_status?: string
          parsed_json?: Json | null
          profile?: string
          promoted_expense_id?: string | null
          promoted_fuel_log_id?: string | null
          promoted_work_order_id?: string | null
          raw_text?: string | null
          rejection_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          uploaded_by_user_id?: string | null
          user_id: string
          vin_valid?: boolean | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          deleted_at?: string | null
          extracted_vin?: string | null
          file_name?: string
          file_path?: string
          file_size_bytes?: number | null
          fleet_vehicle_id?: string | null
          id?: string
          mime_type?: string
          notes?: string | null
          parse_error?: string | null
          parse_method?: string | null
          parse_status?: string
          parsed_json?: Json | null
          profile?: string
          promoted_expense_id?: string | null
          promoted_fuel_log_id?: string | null
          promoted_work_order_id?: string | null
          raw_text?: string | null
          rejection_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          uploaded_by_user_id?: string | null
          user_id?: string
          vin_valid?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "document_intake_fleet_vehicle_id_fkey"
            columns: ["fleet_vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_intake_promoted_expense_id_fkey"
            columns: ["promoted_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_intake_promoted_fuel_log_fk"
            columns: ["promoted_fuel_log_id"]
            isOneToOne: false
            referencedRelation: "fleet_fuel_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_intake_promoted_work_order_id_fkey"
            columns: ["promoted_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          campaign_id: string | null
          created_at: string
          deleted_at: string | null
          email_type: string
          error_message: string | null
          id: string
          last_event: string | null
          last_event_at: string | null
          metadata: Json | null
          provider: string | null
          provider_message_id: string | null
          queue_id: string | null
          recipient_email: string
          recipient_name: string | null
          retry_recommended: boolean
          review_request_id: string | null
          source: string
          status: string
          subject: string | null
          suppression_state: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          last_event?: string | null
          last_event_at?: string | null
          metadata?: Json | null
          provider?: string | null
          provider_message_id?: string | null
          queue_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          retry_recommended?: boolean
          review_request_id?: string | null
          source?: string
          status?: string
          subject?: string | null
          suppression_state?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          last_event?: string | null
          last_event_at?: string | null
          metadata?: Json | null
          provider?: string | null
          provider_message_id?: string | null
          queue_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          retry_recommended?: boolean
          review_request_id?: string | null
          source?: string
          status?: string
          subject?: string | null
          suppression_state?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_marketing_campaigns: {
        Row: {
          click_count: number | null
          content: string
          conversion_count: number
          created_at: string
          delivered_count: number
          failed_count: number
          id: string
          last_engagement_at: string | null
          name: string
          open_count: number | null
          opt_out_count: number
          recipient_count: number | null
          recipient_ids: string[] | null
          recipient_type: string
          reply_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          click_count?: number | null
          content: string
          conversion_count?: number
          created_at?: string
          delivered_count?: number
          failed_count?: number
          id?: string
          last_engagement_at?: string | null
          name: string
          open_count?: number | null
          opt_out_count?: number
          recipient_count?: number | null
          recipient_ids?: string[] | null
          recipient_type?: string
          reply_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          click_count?: number | null
          content?: string
          conversion_count?: number
          created_at?: string
          delivered_count?: number
          failed_count?: number
          id?: string
          last_engagement_at?: string | null
          name?: string
          open_count?: number | null
          opt_out_count?: number
          recipient_count?: number | null
          recipient_ids?: string[] | null
          recipient_type?: string
          reply_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_queue: {
        Row: {
          appointment_id: string | null
          campaign_id: string | null
          created_at: string
          customer_id: string | null
          email_type: string
          error_message: string | null
          id: string
          last_event: string | null
          last_event_at: string | null
          metadata: Json | null
          priority: number
          provider_message_id: string | null
          recipient_email: string
          recipient_name: string | null
          retry_count: number
          review_request_id: string | null
          scheduled_for: string
          sent_at: string | null
          service_id: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          campaign_id?: string | null
          created_at?: string
          customer_id?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          last_event?: string | null
          last_event_at?: string | null
          metadata?: Json | null
          priority?: number
          provider_message_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          retry_count?: number
          review_request_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          service_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          campaign_id?: string | null
          created_at?: string
          customer_id?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          last_event?: string | null
          last_event_at?: string | null
          metadata?: Json | null
          priority?: number
          provider_message_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          retry_count?: number
          review_request_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          service_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          from_email: string | null
          from_name: string | null
          id: string
          imap_enabled: boolean
          imap_host: string | null
          imap_last_error: string | null
          imap_last_synced_at: string | null
          imap_last_uid: number
          imap_password_encrypted: string | null
          imap_port: number
          imap_secure: boolean
          imap_username: string | null
          last_test_at: string | null
          last_test_error: string | null
          last_test_status: string | null
          reply_to_email: string | null
          smtp_host: string | null
          smtp_password_encrypted: string | null
          smtp_port: number | null
          smtp_username: string | null
          updated_at: string | null
          use_custom_smtp: boolean | null
          user_id: string
          verified: boolean | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          imap_enabled?: boolean
          imap_host?: string | null
          imap_last_error?: string | null
          imap_last_synced_at?: string | null
          imap_last_uid?: number
          imap_password_encrypted?: string | null
          imap_port?: number
          imap_secure?: boolean
          imap_username?: string | null
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          reply_to_email?: string | null
          smtp_host?: string | null
          smtp_password_encrypted?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          updated_at?: string | null
          use_custom_smtp?: boolean | null
          user_id: string
          verified?: boolean | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          imap_enabled?: boolean
          imap_host?: string | null
          imap_last_error?: string | null
          imap_last_synced_at?: string | null
          imap_last_uid?: number
          imap_password_encrypted?: string | null
          imap_port?: number
          imap_secure?: boolean
          imap_username?: string | null
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          reply_to_email?: string | null
          smtp_host?: string | null
          smtp_password_encrypted?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          updated_at?: string | null
          use_custom_smtp?: boolean | null
          user_id?: string
          verified?: boolean | null
          verified_at?: string | null
        }
        Relationships: []
      }
      email_subscriptions: {
        Row: {
          consent_ip: unknown
          consent_text_snapshot: string | null
          consent_ts: string | null
          consent_user_agent: string | null
          created_at: string
          customer_id: string | null
          email: string
          id: string
          marketing_allowed: boolean
          source: string | null
          transactional_allowed: boolean
          unsubscribe_group: string | null
          unsubscribed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_ip?: unknown
          consent_text_snapshot?: string | null
          consent_ts?: string | null
          consent_user_agent?: string | null
          created_at?: string
          customer_id?: string | null
          email: string
          id?: string
          marketing_allowed?: boolean
          source?: string | null
          transactional_allowed?: boolean
          unsubscribe_group?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_ip?: unknown
          consent_text_snapshot?: string | null
          consent_ts?: string | null
          consent_user_agent?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string
          id?: string
          marketing_allowed?: boolean
          source?: string | null
          transactional_allowed?: boolean
          unsubscribe_group?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expense_activity: {
        Row: {
          actor_name: string | null
          actor_user_id: string
          created_at: string
          details: Json
          event_type: string
          expense_id: string
          id: string
          user_id: string
        }
        Insert: {
          actor_name?: string | null
          actor_user_id: string
          created_at?: string
          details?: Json
          event_type: string
          expense_id: string
          id?: string
          user_id: string
        }
        Update: {
          actor_name?: string | null
          actor_user_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          expense_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_activity_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          parent_id: string | null
          qbo_account_id: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          parent_id?: string | null
          qbo_account_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          parent_id?: string | null
          qbo_account_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_line_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string
          expense_id: string
          id: string
          line_total: number
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description: string
          expense_id: string
          id?: string
          line_total?: number
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string
          expense_id?: string
          id?: string
          line_total?: number
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_line_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_line_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          appointment_id: string | null
          approved_at: string | null
          approved_by: string | null
          category_id: string | null
          cleared_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_billable: boolean
          last4: string | null
          notes: string | null
          ocr_confidence: number | null
          ocr_raw_json: Json | null
          payment_method: string | null
          receipt_thumbnail_url: string | null
          receipt_url: string | null
          reference_number: string | null
          rejected_reason: string | null
          source_id: string | null
          source_type: string | null
          status: string
          submitted_by: string | null
          submitted_by_user_id: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          transaction_date: string
          updated_at: string
          user_id: string
          vendor_id: string | null
          vendor_name_raw: string
        }
        Insert: {
          appointment_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          cleared_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_billable?: boolean
          last4?: string | null
          notes?: string | null
          ocr_confidence?: number | null
          ocr_raw_json?: Json | null
          payment_method?: string | null
          receipt_thumbnail_url?: string | null
          receipt_url?: string | null
          reference_number?: string | null
          rejected_reason?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          submitted_by?: string | null
          submitted_by_user_id?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          transaction_date?: string
          updated_at?: string
          user_id: string
          vendor_id?: string | null
          vendor_name_raw: string
        }
        Update: {
          appointment_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          cleared_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_billable?: boolean
          last4?: string | null
          notes?: string | null
          ocr_confidence?: number | null
          ocr_raw_json?: Json | null
          payment_method?: string | null
          receipt_thumbnail_url?: string | null
          receipt_url?: string | null
          reference_number?: string | null
          rejected_reason?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          submitted_by?: string | null
          submitted_by_user_id?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          transaction_date?: string
          updated_at?: string
          user_id?: string
          vendor_id?: string | null
          vendor_name_raw?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      filter_applications: {
        Row: {
          brand: Database["public"]["Enums"]["filter_brand"]
          created_at: string
          engine: string
          engine_code: string | null
          filter_type: Database["public"]["Enums"]["filter_type"]
          id: string
          make: string
          model: string
          notes: string | null
          oem_number: string | null
          part_number: string
          part_number_alt: string | null
          updated_at: string
          year_end: number
          year_start: number
        }
        Insert: {
          brand?: Database["public"]["Enums"]["filter_brand"]
          created_at?: string
          engine?: string
          engine_code?: string | null
          filter_type: Database["public"]["Enums"]["filter_type"]
          id?: string
          make: string
          model: string
          notes?: string | null
          oem_number?: string | null
          part_number: string
          part_number_alt?: string | null
          updated_at?: string
          year_end: number
          year_start: number
        }
        Update: {
          brand?: Database["public"]["Enums"]["filter_brand"]
          created_at?: string
          engine?: string
          engine_code?: string | null
          filter_type?: Database["public"]["Enums"]["filter_type"]
          id?: string
          make?: string
          model?: string
          notes?: string | null
          oem_number?: string | null
          part_number?: string
          part_number_alt?: string | null
          updated_at?: string
          year_end?: number
          year_start?: number
        }
        Relationships: []
      }
      filter_cross_references: {
        Row: {
          confidence_score: number | null
          created_at: string
          filter_type: Database["public"]["Enums"]["filter_type"] | null
          id: string
          notes: string | null
          source_brand: Database["public"]["Enums"]["filter_brand"]
          source_part_number: string
          target_brand: Database["public"]["Enums"]["filter_brand"]
          target_part_number: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          filter_type?: Database["public"]["Enums"]["filter_type"] | null
          id?: string
          notes?: string | null
          source_brand: Database["public"]["Enums"]["filter_brand"]
          source_part_number: string
          target_brand: Database["public"]["Enums"]["filter_brand"]
          target_part_number: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          filter_type?: Database["public"]["Enums"]["filter_type"] | null
          id?: string
          notes?: string | null
          source_brand?: Database["public"]["Enums"]["filter_brand"]
          source_part_number?: string
          target_brand?: Database["public"]["Enums"]["filter_brand"]
          target_part_number?: string
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          appointment_id: string | null
          created_at: string
          customer_id: string | null
          fee_amount: number
          fleet_work_order_id: string | null
          gross_amount: number
          id: string
          net_amount: number
          payment_method: string | null
          payment_record_id: string | null
          recorded_at: string
          refund_amount: number
          service_id: string | null
          status: string
          stripe_payment_intent_id: string | null
          tax_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          customer_id?: string | null
          fee_amount?: number
          fleet_work_order_id?: string | null
          gross_amount?: number
          id?: string
          net_amount?: number
          payment_method?: string | null
          payment_record_id?: string | null
          recorded_at?: string
          refund_amount?: number
          service_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          tax_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          customer_id?: string | null
          fee_amount?: number
          fleet_work_order_id?: string | null
          gross_amount?: number
          id?: string
          net_amount?: number
          payment_method?: string | null
          payment_record_id?: string | null
          recorded_at?: string
          refund_amount?: number
          service_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          tax_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_payment_record_id_fkey"
            columns: ["payment_record_id"]
            isOneToOne: false
            referencedRelation: "cash_collection_receipts_v1"
            referencedColumns: ["payment_record_id"]
          },
          {
            foreignKeyName: "financial_transactions_payment_record_id_fkey"
            columns: ["payment_record_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_activity_logs: {
        Row: {
          action: string
          actor_role: string
          created_at: string
          details: Json | null
          fleet_work_order_id: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          actor_role?: string
          created_at?: string
          details?: Json | null
          fleet_work_order_id: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          actor_role?: string
          created_at?: string
          details?: Json | null
          fleet_work_order_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_activity_logs_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_approvals: {
        Row: {
          approval_type: string
          auto_approve_threshold: number | null
          auto_approved: boolean
          created_at: string
          description: string | null
          estimated_cost: number | null
          fleet_work_order_id: string
          id: string
          requested_by: string
          responded_at: string | null
          responded_by: string | null
          response_notes: string | null
          signature_url: string | null
          sla_deadline: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_type?: string
          auto_approve_threshold?: number | null
          auto_approved?: boolean
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          fleet_work_order_id: string
          id?: string
          requested_by?: string
          responded_at?: string | null
          responded_by?: string | null
          response_notes?: string | null
          signature_url?: string | null
          sla_deadline?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_type?: string
          auto_approve_threshold?: number | null
          auto_approved?: boolean
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          fleet_work_order_id?: string
          id?: string
          requested_by?: string
          responded_at?: string | null
          responded_by?: string | null
          response_notes?: string | null
          signature_url?: string | null
          sla_deadline?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_approvals_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_checkins: {
        Row: {
          accuracy_meters: number | null
          checkin_type: string
          created_at: string
          fleet_location_id: string | null
          fleet_work_order_id: string
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          checkin_type?: string
          created_at?: string
          fleet_location_id?: string | null
          fleet_work_order_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          checkin_type?: string
          created_at?: string
          fleet_location_id?: string | null
          fleet_work_order_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_checkins_fleet_location_id_fkey"
            columns: ["fleet_location_id"]
            isOneToOne: false
            referencedRelation: "fleet_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_checkins_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_clients: {
        Row: {
          address: string | null
          address_line_2: string | null
          ap_contact_email: string | null
          ap_contact_name: string | null
          ap_contact_phone: string | null
          auto_approve_threshold: number | null
          billing_email: string | null
          billing_notes: string | null
          booking_slug: string | null
          city: string | null
          communication_preference: string
          company_name: string
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          credit_status: string
          default_pricing_tier: string
          deleted_at: string | null
          fleet_manager_email: string | null
          fleet_manager_name: string | null
          fleet_manager_phone: string | null
          id: string
          intake_email_local_part: string | null
          internal_notes: string | null
          invoice_format: string | null
          monthly_vehicle_count: number | null
          notes: string | null
          payment_terms: string
          phone: string | null
          portal_access_enabled: boolean
          postal_code: string | null
          region: string | null
          requires_notes_format: boolean
          requires_photos: boolean
          requires_po: boolean
          service_notes: string | null
          state: string | null
          status: string
          tax_exempt: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          address_line_2?: string | null
          ap_contact_email?: string | null
          ap_contact_name?: string | null
          ap_contact_phone?: string | null
          auto_approve_threshold?: number | null
          billing_email?: string | null
          billing_notes?: string | null
          booking_slug?: string | null
          city?: string | null
          communication_preference?: string
          company_name: string
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          credit_status?: string
          default_pricing_tier?: string
          deleted_at?: string | null
          fleet_manager_email?: string | null
          fleet_manager_name?: string | null
          fleet_manager_phone?: string | null
          id?: string
          intake_email_local_part?: string | null
          internal_notes?: string | null
          invoice_format?: string | null
          monthly_vehicle_count?: number | null
          notes?: string | null
          payment_terms?: string
          phone?: string | null
          portal_access_enabled?: boolean
          postal_code?: string | null
          region?: string | null
          requires_notes_format?: boolean
          requires_photos?: boolean
          requires_po?: boolean
          service_notes?: string | null
          state?: string | null
          status?: string
          tax_exempt?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          address_line_2?: string | null
          ap_contact_email?: string | null
          ap_contact_name?: string | null
          ap_contact_phone?: string | null
          auto_approve_threshold?: number | null
          billing_email?: string | null
          billing_notes?: string | null
          booking_slug?: string | null
          city?: string | null
          communication_preference?: string
          company_name?: string
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          credit_status?: string
          default_pricing_tier?: string
          deleted_at?: string | null
          fleet_manager_email?: string | null
          fleet_manager_name?: string | null
          fleet_manager_phone?: string | null
          id?: string
          intake_email_local_part?: string | null
          internal_notes?: string | null
          invoice_format?: string | null
          monthly_vehicle_count?: number | null
          notes?: string | null
          payment_terms?: string
          phone?: string | null
          portal_access_enabled?: boolean
          postal_code?: string | null
          region?: string | null
          requires_notes_format?: boolean
          requires_photos?: boolean
          requires_po?: boolean
          service_notes?: string | null
          state?: string | null
          status?: string
          tax_exempt?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fleet_contacts: {
        Row: {
          approve_quotes: boolean
          can_approve_work: boolean
          communication_preference: string
          created_at: string
          deleted_at: string | null
          download_reports: boolean
          email: string | null
          fleet_client_id: string
          id: string
          is_primary: boolean
          manage_vehicles: boolean
          name: string
          phone: string | null
          receives_invoices: boolean
          receives_reports: boolean
          request_service: boolean
          role: string | null
          updated_at: string
          user_id: string
          view_service_history: boolean
          view_vehicles: boolean
        }
        Insert: {
          approve_quotes?: boolean
          can_approve_work?: boolean
          communication_preference?: string
          created_at?: string
          deleted_at?: string | null
          download_reports?: boolean
          email?: string | null
          fleet_client_id: string
          id?: string
          is_primary?: boolean
          manage_vehicles?: boolean
          name: string
          phone?: string | null
          receives_invoices?: boolean
          receives_reports?: boolean
          request_service?: boolean
          role?: string | null
          updated_at?: string
          user_id: string
          view_service_history?: boolean
          view_vehicles?: boolean
        }
        Update: {
          approve_quotes?: boolean
          can_approve_work?: boolean
          communication_preference?: string
          created_at?: string
          deleted_at?: string | null
          download_reports?: boolean
          email?: string | null
          fleet_client_id?: string
          id?: string
          is_primary?: boolean
          manage_vehicles?: boolean
          name?: string
          phone?: string | null
          receives_invoices?: boolean
          receives_reports?: boolean
          request_service?: boolean
          role?: string | null
          updated_at?: string
          user_id?: string
          view_service_history?: boolean
          view_vehicles?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fleet_contacts_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_contract_services: {
        Row: {
          billing_frequency: string | null
          created_at: string
          custom_label: string | null
          custom_price: number | null
          fleet_contract_id: string
          id: string
          is_active: boolean
          notes: string | null
          pricing_model: string
          service_catalog_id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_frequency?: string | null
          created_at?: string
          custom_label?: string | null
          custom_price?: number | null
          fleet_contract_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          pricing_model?: string
          service_catalog_id: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_frequency?: string | null
          created_at?: string
          custom_label?: string | null
          custom_price?: number | null
          fleet_contract_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          pricing_model?: string
          service_catalog_id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_contract_services_fleet_contract_id_fkey"
            columns: ["fleet_contract_id"]
            isOneToOne: false
            referencedRelation: "fleet_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_contract_services_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_contracts: {
        Row: {
          approval_threshold: number | null
          created_at: string
          end_date: string | null
          fleet_client_id: string
          id: string
          invoice_frequency: string
          is_active: boolean
          name: string
          notes: string | null
          pricing_rules: Json | null
          sla_hours: number | null
          start_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_threshold?: number | null
          created_at?: string
          end_date?: string | null
          fleet_client_id: string
          id?: string
          invoice_frequency?: string
          is_active?: boolean
          name: string
          notes?: string | null
          pricing_rules?: Json | null
          sla_hours?: number | null
          start_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_threshold?: number | null
          created_at?: string
          end_date?: string | null
          fleet_client_id?: string
          id?: string
          invoice_frequency?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          pricing_rules?: Json | null
          sla_hours?: number | null
          start_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_contracts_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_dispatch_delivery_outbox: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          status: string
          user_id: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event_type: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: string
          user_id: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      fleet_email_messages: {
        Row: {
          body_html: string | null
          body_text: string
          cc_emails: string[]
          created_at: string
          direction: string
          from_email: string
          from_name: string | null
          id: string
          imap_uid: number | null
          in_reply_to: string | null
          internet_message_id: string | null
          is_read: boolean
          received_at: string
          subject: string
          thread_key: string
          to_emails: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string
          cc_emails?: string[]
          created_at?: string
          direction: string
          from_email: string
          from_name?: string | null
          id?: string
          imap_uid?: number | null
          in_reply_to?: string | null
          internet_message_id?: string | null
          is_read?: boolean
          received_at?: string
          subject?: string
          thread_key: string
          to_emails?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          body_html?: string | null
          body_text?: string
          cc_emails?: string[]
          created_at?: string
          direction?: string
          from_email?: string
          from_name?: string | null
          id?: string
          imap_uid?: number | null
          in_reply_to?: string | null
          internet_message_id?: string | null
          is_read?: boolean
          received_at?: string
          subject?: string
          thread_key?: string
          to_emails?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fleet_fuel_logs: {
        Row: {
          created_at: string
          deleted_at: string | null
          fleet_vehicle_id: string | null
          fuel_date: string
          fuel_type: string | null
          gallons: number | null
          id: string
          notes: string | null
          odometer: number | null
          payment_method: string | null
          price_per_gallon: number | null
          reference_number: string | null
          source_document_id: string | null
          station_location: string | null
          station_name: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          fleet_vehicle_id?: string | null
          fuel_date?: string
          fuel_type?: string | null
          gallons?: number | null
          id?: string
          notes?: string | null
          odometer?: number | null
          payment_method?: string | null
          price_per_gallon?: number | null
          reference_number?: string | null
          source_document_id?: string | null
          station_location?: string | null
          station_name?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          fleet_vehicle_id?: string | null
          fuel_date?: string
          fuel_type?: string | null
          gallons?: number | null
          id?: string
          notes?: string | null
          odometer?: number | null
          payment_method?: string | null
          price_per_gallon?: number | null
          reference_number?: string | null
          source_document_id?: string | null
          station_location?: string | null
          station_name?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_fuel_logs_fleet_vehicle_id_fkey"
            columns: ["fleet_vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_fuel_logs_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "document_intake"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_intake_dead_letters: {
        Row: {
          attempts: number
          created_at: string
          error_code: string
          error_message: string
          id: string
          last_attempt_at: string
          payload: Json
          resolved_at: string | null
          source_record_id: string | null
          source_type: string
          status: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_code: string
          error_message: string
          id?: string
          last_attempt_at?: string
          payload?: Json
          resolved_at?: string | null
          source_record_id?: string | null
          source_type: string
          status?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error_code?: string
          error_message?: string
          id?: string
          last_attempt_at?: string
          payload?: Json
          resolved_at?: string | null
          source_record_id?: string | null
          source_type?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fleet_invoice_payments: {
        Row: {
          amount: number
          created_at: string
          fleet_work_order_id: string
          id: string
          notes: string | null
          paid_at: string
          payment_method: string
          reference: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fleet_work_order_id: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: string
          reference?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fleet_work_order_id?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: string
          reference?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_invoice_payments_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_jobs: {
        Row: {
          assigned_technician_id: string | null
          created_at: string
          fleet_client_id: string | null
          fleet_contract_id: string | null
          fleet_location_id: string | null
          id: string
          job_number: string | null
          notes: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          source_draft_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_technician_id?: string | null
          created_at?: string
          fleet_client_id?: string | null
          fleet_contract_id?: string | null
          fleet_location_id?: string | null
          id?: string
          job_number?: string | null
          notes?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          source_draft_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_technician_id?: string | null
          created_at?: string
          fleet_client_id?: string | null
          fleet_contract_id?: string | null
          fleet_location_id?: string | null
          id?: string
          job_number?: string | null
          notes?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          source_draft_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_jobs_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_jobs_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_jobs_fleet_contract_id_fkey"
            columns: ["fleet_contract_id"]
            isOneToOne: false
            referencedRelation: "fleet_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_jobs_fleet_location_id_fkey"
            columns: ["fleet_location_id"]
            isOneToOne: false
            referencedRelation: "fleet_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_jobs_source_draft_id_fkey"
            columns: ["source_draft_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_order_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_locations: {
        Row: {
          access_instructions: string | null
          address: string | null
          city: string | null
          created_at: string
          fleet_client_id: string
          geofence_enabled: boolean | null
          geofence_radius_meters: number | null
          id: string
          is_primary: boolean
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          postal_code: string | null
          service_window_end: string | null
          service_window_start: string | null
          site_contact_name: string | null
          site_contact_phone: string | null
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_instructions?: string | null
          address?: string | null
          city?: string | null
          created_at?: string
          fleet_client_id: string
          geofence_enabled?: boolean | null
          geofence_radius_meters?: number | null
          id?: string
          is_primary?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          postal_code?: string | null
          service_window_end?: string | null
          service_window_start?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_instructions?: string | null
          address?: string | null
          city?: string | null
          created_at?: string
          fleet_client_id?: string
          geofence_enabled?: boolean | null
          geofence_radius_meters?: number | null
          id?: string
          is_primary?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          postal_code?: string | null
          service_window_end?: string | null
          service_window_start?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_locations_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_operation_batch_items: {
        Row: {
          attempts: number
          batch_id: string
          compensation_action: string | null
          error_message: string | null
          id: string
          item_key: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          batch_id: string
          compensation_action?: string | null
          error_message?: string | null
          id?: string
          item_key: string
          payload?: Json
          status: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          batch_id?: string
          compensation_action?: string | null
          error_message?: string | null
          id?: string
          item_key?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_operation_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "fleet_operation_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_operation_batches: {
        Row: {
          completed_at: string | null
          context: Json
          error_message: string | null
          id: string
          idempotency_key: string | null
          operation_type: string
          retry_count: number
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          operation_type: string
          retry_count?: number
          started_at?: string
          status: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          context?: Json
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          operation_type?: string
          retry_count?: number
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      fleet_ops_events: {
        Row: {
          actor_id: string | null
          actor_role: string
          created_at: string
          details: Json | null
          event_category: string
          event_type: string
          fleet_client_id: string
          fleet_purchase_order_id: string | null
          fleet_vehicle_id: string | null
          fleet_work_order_id: string | null
          id: string
          summary: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          details?: Json | null
          event_category: string
          event_type: string
          fleet_client_id: string
          fleet_purchase_order_id?: string | null
          fleet_vehicle_id?: string | null
          fleet_work_order_id?: string | null
          id?: string
          summary: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          details?: Json | null
          event_category?: string
          event_type?: string
          fleet_client_id?: string
          fleet_purchase_order_id?: string | null
          fleet_vehicle_id?: string | null
          fleet_work_order_id?: string | null
          id?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_ops_events_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_ops_events_fleet_purchase_order_id_fkey"
            columns: ["fleet_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_ops_events_fleet_vehicle_id_fkey"
            columns: ["fleet_vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_ops_events_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_po_ledger_entries: {
        Row: {
          amount: number
          created_at: string
          entry_type: string
          fleet_purchase_order_id: string
          fleet_work_order_id: string | null
          id: string
          metadata: Json
          reason_code: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          entry_type: string
          fleet_purchase_order_id: string
          fleet_work_order_id?: string | null
          id?: string
          metadata?: Json
          reason_code?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          entry_type?: string
          fleet_purchase_order_id?: string
          fleet_work_order_id?: string | null
          id?: string
          metadata?: Json
          reason_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_po_ledger_entries_fleet_purchase_order_id_fkey"
            columns: ["fleet_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_po_ledger_entries_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_purchase_orders: {
        Row: {
          amount_authorized: number
          amount_consumed: number
          amount_limit: number | null
          amount_used: number
          created_at: string
          description: string | null
          expiry_date: string | null
          fleet_client_id: string
          id: string
          issued_date: string | null
          notes: string | null
          po_number: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_authorized?: number
          amount_consumed?: number
          amount_limit?: number | null
          amount_used?: number
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          fleet_client_id: string
          id?: string
          issued_date?: string | null
          notes?: string | null
          po_number: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_authorized?: number
          amount_consumed?: number
          amount_limit?: number | null
          amount_used?: number
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          fleet_client_id?: string
          id?: string
          issued_date?: string | null
          notes?: string | null
          po_number?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_purchase_orders_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_schedule_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          fleet_work_order_id: string
          id: string
          next_schedule: Json
          previous_schedule: Json | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          fleet_work_order_id: string
          id?: string
          next_schedule: Json
          previous_schedule?: Json | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          fleet_work_order_id?: string
          id?: string
          next_schedule?: Json
          previous_schedule?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_schedule_events_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_service_request_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          quarantine_status: string
          request_id: string
          size_bytes: number | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          quarantine_status?: string
          request_id: string
          size_bytes?: number | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          quarantine_status?: string
          request_id?: string
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_service_request_channel_links: {
        Row: {
          channel_type: string
          created_at: string
          external_record_id: string
          external_thread_key: string | null
          id: string
          request_id: string
          user_id: string
        }
        Insert: {
          channel_type: string
          created_at?: string
          external_record_id: string
          external_thread_key?: string | null
          id?: string
          request_id: string
          user_id: string
        }
        Update: {
          channel_type?: string
          created_at?: string
          external_record_id?: string
          external_thread_key?: string | null
          id?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_request_channel_links_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_service_request_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          request_id: string
          to_status: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          metadata?: Json
          request_id: string
          to_status?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          request_id?: string
          to_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_service_request_match_candidates: {
        Row: {
          confidence: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string
          entity_id: string
          entity_type: string
          id: string
          reasons: Json
          request_id: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          entity_id: string
          entity_type: string
          id?: string
          reasons?: Json
          request_id: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reasons?: Json
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_request_match_candidates_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_service_requests: {
        Row: {
          assigned_to: string | null
          claimed_at: string | null
          closed_at: string | null
          created_at: string
          customer_notes: string | null
          duplicate_of_request_id: string | null
          first_response_at: string | null
          fleet_client_id: string | null
          fleet_contact_id: string | null
          fleet_location_id: string | null
          fleet_vehicle_id: string | null
          fleet_work_order_id: string | null
          id: string
          internal_notes: string | null
          match_confidence: number | null
          match_status: string
          preferred_date: string | null
          preferred_window_end: string | null
          preferred_window_start: string | null
          priority: string
          received_at: string
          request_summary: string | null
          requester_email: string | null
          requester_name: string | null
          requester_role: string | null
          safety_flags: Json
          service_address: string | null
          sla_due_at: string | null
          source_metadata: Json
          source_record_id: string | null
          source_thread_key: string | null
          source_type: string
          status: string
          subject: string
          updated_at: string
          user_id: string
          vehicle_drivable: boolean | null
          version: number
          work_order_draft_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          claimed_at?: string | null
          closed_at?: string | null
          created_at?: string
          customer_notes?: string | null
          duplicate_of_request_id?: string | null
          first_response_at?: string | null
          fleet_client_id?: string | null
          fleet_contact_id?: string | null
          fleet_location_id?: string | null
          fleet_vehicle_id?: string | null
          fleet_work_order_id?: string | null
          id?: string
          internal_notes?: string | null
          match_confidence?: number | null
          match_status?: string
          preferred_date?: string | null
          preferred_window_end?: string | null
          preferred_window_start?: string | null
          priority?: string
          received_at?: string
          request_summary?: string | null
          requester_email?: string | null
          requester_name?: string | null
          requester_role?: string | null
          safety_flags?: Json
          service_address?: string | null
          sla_due_at?: string | null
          source_metadata?: Json
          source_record_id?: string | null
          source_thread_key?: string | null
          source_type?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
          vehicle_drivable?: boolean | null
          version?: number
          work_order_draft_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          claimed_at?: string | null
          closed_at?: string | null
          created_at?: string
          customer_notes?: string | null
          duplicate_of_request_id?: string | null
          first_response_at?: string | null
          fleet_client_id?: string | null
          fleet_contact_id?: string | null
          fleet_location_id?: string | null
          fleet_vehicle_id?: string | null
          fleet_work_order_id?: string | null
          id?: string
          internal_notes?: string | null
          match_confidence?: number | null
          match_status?: string
          preferred_date?: string | null
          preferred_window_end?: string | null
          preferred_window_start?: string | null
          priority?: string
          received_at?: string
          request_summary?: string | null
          requester_email?: string | null
          requester_name?: string | null
          requester_role?: string | null
          safety_flags?: Json
          service_address?: string | null
          sla_due_at?: string | null
          source_metadata?: Json
          source_record_id?: string | null
          source_thread_key?: string | null
          source_type?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
          vehicle_drivable?: boolean | null
          version?: number
          work_order_draft_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_requests_duplicate_of_request_id_fkey"
            columns: ["duplicate_of_request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_fleet_contact_id_fkey"
            columns: ["fleet_contact_id"]
            isOneToOne: false
            referencedRelation: "fleet_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_fleet_location_id_fkey"
            columns: ["fleet_location_id"]
            isOneToOne: false
            referencedRelation: "fleet_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_fleet_vehicle_id_fkey"
            columns: ["fleet_vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_work_order_draft_id_fkey"
            columns: ["work_order_draft_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_order_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_service_rules: {
        Row: {
          base_labor_package: string
          base_price: number
          created_at: string
          estimated_duration_minutes: number | null
          fleet_client_id: string | null
          id: string
          includes: Json | null
          interval_miles: number
          interval_months: number
          is_active: boolean
          package_code: string | null
          package_label: string | null
          service_class: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_labor_package?: string
          base_price?: number
          created_at?: string
          estimated_duration_minutes?: number | null
          fleet_client_id?: string | null
          id?: string
          includes?: Json | null
          interval_miles?: number
          interval_months?: number
          is_active?: boolean
          package_code?: string | null
          package_label?: string | null
          service_class: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_labor_package?: string
          base_price?: number
          created_at?: string
          estimated_duration_minutes?: number | null
          fleet_client_id?: string | null
          id?: string
          includes?: Json | null
          interval_miles?: number
          interval_months?: number
          is_active?: boolean
          package_code?: string | null
          package_label?: string | null
          service_class?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_rules_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_service_schedules: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_labor_package: string | null
          created_at: string
          draft_work_order_id: string | null
          due_date: string | null
          due_mileage: number | null
          estimated_price: number | null
          fleet_client_id: string | null
          fleet_vehicle_id: string
          id: string
          proposed_scheduled_date: string | null
          proposed_scheduled_time: string | null
          queue_status: string
          route_batch_key: string | null
          rule_id: string | null
          service_class: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_labor_package?: string | null
          created_at?: string
          draft_work_order_id?: string | null
          due_date?: string | null
          due_mileage?: number | null
          estimated_price?: number | null
          fleet_client_id?: string | null
          fleet_vehicle_id: string
          id?: string
          proposed_scheduled_date?: string | null
          proposed_scheduled_time?: string | null
          queue_status?: string
          route_batch_key?: string | null
          rule_id?: string | null
          service_class: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_labor_package?: string | null
          created_at?: string
          draft_work_order_id?: string | null
          due_date?: string | null
          due_mileage?: number | null
          estimated_price?: number | null
          fleet_client_id?: string | null
          fleet_vehicle_id?: string
          id?: string
          proposed_scheduled_date?: string | null
          proposed_scheduled_time?: string | null
          queue_status?: string
          route_batch_key?: string | null
          rule_id?: string | null
          service_class?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_schedules_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_schedules_fleet_vehicle_id_fkey"
            columns: ["fleet_vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_schedules_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_tekmetric_syncs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_details: Json | null
          errors_count: number | null
          fleet_client_id: string | null
          id: string
          records_synced: number | null
          started_at: string | null
          status: string
          sync_type: string
          synced_from: string | null
          synced_to: string | null
          tekmetric_shop_id: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_details?: Json | null
          errors_count?: number | null
          fleet_client_id?: string | null
          id?: string
          records_synced?: number | null
          started_at?: string | null
          status?: string
          sync_type?: string
          synced_from?: string | null
          synced_to?: string | null
          tekmetric_shop_id?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_details?: Json | null
          errors_count?: number | null
          fleet_client_id?: string | null
          id?: string
          records_synced?: number | null
          started_at?: string | null
          status?: string
          sync_type?: string
          synced_from?: string | null
          synced_to?: string | null
          tekmetric_shop_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_tekmetric_syncs_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vehicles: {
        Row: {
          color: string | null
          created_at: string
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          deleted_at: string | null
          due_status: string
          engine: string | null
          fleet_client_id: string
          fleet_contract_id: string | null
          fleet_location_id: string | null
          fuel_type: string | null
          id: string
          image_url: string | null
          import_batch_id: string | null
          last_service_date: string | null
          last_service_mileage: number | null
          license_plate: string | null
          make: string | null
          mileage: number | null
          model: string | null
          next_service_date: string | null
          next_service_mileage: number | null
          notes: string | null
          origin_source: string | null
          status: string
          tekmetric_vehicle_id: string | null
          unit_number: string | null
          updated_at: string
          user_id: string
          vin: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          deleted_at?: string | null
          due_status?: string
          engine?: string | null
          fleet_client_id: string
          fleet_contract_id?: string | null
          fleet_location_id?: string | null
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          import_batch_id?: string | null
          last_service_date?: string | null
          last_service_mileage?: number | null
          license_plate?: string | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          next_service_date?: string | null
          next_service_mileage?: number | null
          notes?: string | null
          origin_source?: string | null
          status?: string
          tekmetric_vehicle_id?: string | null
          unit_number?: string | null
          updated_at?: string
          user_id: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          deleted_at?: string | null
          due_status?: string
          engine?: string | null
          fleet_client_id?: string
          fleet_contract_id?: string | null
          fleet_location_id?: string | null
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          import_batch_id?: string | null
          last_service_date?: string | null
          last_service_mileage?: number | null
          license_plate?: string | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          next_service_date?: string | null
          next_service_mileage?: number | null
          notes?: string | null
          origin_source?: string | null
          status?: string
          tekmetric_vehicle_id?: string | null
          unit_number?: string | null
          updated_at?: string
          user_id?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicles_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_fleet_contract_id_fkey"
            columns: ["fleet_contract_id"]
            isOneToOne: false
            referencedRelation: "fleet_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_fleet_location_id_fkey"
            columns: ["fleet_location_id"]
            isOneToOne: false
            referencedRelation: "fleet_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_work_order_draft_attachments: {
        Row: {
          created_at: string
          draft_id: string
          id: string
          label: string | null
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_id: string
          id?: string
          label?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          draft_id?: string
          id?: string
          label?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_work_order_draft_attachments_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_order_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_work_order_drafts: {
        Row: {
          add_ons: Json
          billing_method: string | null
          contract_id: string | null
          conversion_id: string | null
          created_at: string
          created_by: string
          created_from: string | null
          customer_id: string | null
          estimated_discount: number | null
          estimated_subtotal: number | null
          estimated_tax: number | null
          estimated_total: number | null
          expires_at: string
          id: string
          location_id: string | null
          notes: string | null
          po_number: string | null
          promoted_work_order_id: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          selected_vehicles: Json
          service_package: Json | null
          source_type: string
          status: string
          technician_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          add_ons?: Json
          billing_method?: string | null
          contract_id?: string | null
          conversion_id?: string | null
          created_at?: string
          created_by: string
          created_from?: string | null
          customer_id?: string | null
          estimated_discount?: number | null
          estimated_subtotal?: number | null
          estimated_tax?: number | null
          estimated_total?: number | null
          expires_at?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          po_number?: string | null
          promoted_work_order_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          selected_vehicles?: Json
          service_package?: Json | null
          source_type?: string
          status?: string
          technician_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          add_ons?: Json
          billing_method?: string | null
          contract_id?: string | null
          conversion_id?: string | null
          created_at?: string
          created_by?: string
          created_from?: string | null
          customer_id?: string | null
          estimated_discount?: number | null
          estimated_subtotal?: number | null
          estimated_tax?: number | null
          estimated_total?: number | null
          expires_at?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          po_number?: string | null
          promoted_work_order_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          selected_vehicles?: Json
          service_package?: Json | null
          source_type?: string
          status?: string
          technician_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_work_order_drafts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "fleet_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_order_drafts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_order_drafts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "fleet_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_order_drafts_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_work_order_line_items: {
        Row: {
          created_at: string
          description: string
          fleet_contract_service_id: string | null
          fleet_vehicle_id: string | null
          fleet_work_order_id: string
          id: string
          inventory_item_id: string | null
          labor_hours: number | null
          line_type: string
          part_number: string | null
          price_source: string
          quantity: number
          service_catalog_id: string | null
          sort_order: number
          taxable: boolean
          total: number
          unit_price: number
          updated_at: string
          user_id: string
          van_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          fleet_contract_service_id?: string | null
          fleet_vehicle_id?: string | null
          fleet_work_order_id: string
          id?: string
          inventory_item_id?: string | null
          labor_hours?: number | null
          line_type?: string
          part_number?: string | null
          price_source?: string
          quantity?: number
          service_catalog_id?: string | null
          sort_order?: number
          taxable?: boolean
          total?: number
          unit_price?: number
          updated_at?: string
          user_id: string
          van_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          fleet_contract_service_id?: string | null
          fleet_vehicle_id?: string | null
          fleet_work_order_id?: string
          id?: string
          inventory_item_id?: string | null
          labor_hours?: number | null
          line_type?: string
          part_number?: string | null
          price_source?: string
          quantity?: number
          service_catalog_id?: string | null
          sort_order?: number
          taxable?: boolean
          total?: number
          unit_price?: number
          updated_at?: string
          user_id?: string
          van_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_work_order_line_items_fleet_contract_service_id_fkey"
            columns: ["fleet_contract_service_id"]
            isOneToOne: false
            referencedRelation: "fleet_contract_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_order_line_items_fleet_vehicle_id_fkey"
            columns: ["fleet_vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_order_line_items_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_order_line_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_order_line_items_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_order_line_items_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_work_order_pos: {
        Row: {
          amount_applied: number
          created_at: string
          fleet_purchase_order_id: string
          fleet_work_order_id: string
          id: string
        }
        Insert: {
          amount_applied?: number
          created_at?: string
          fleet_purchase_order_id: string
          fleet_work_order_id: string
          id?: string
        }
        Update: {
          amount_applied?: number
          created_at?: string
          fleet_purchase_order_id?: string
          fleet_work_order_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_work_order_pos_fleet_purchase_order_id_fkey"
            columns: ["fleet_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_order_pos_fleet_work_order_id_fkey"
            columns: ["fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_work_order_validation: {
        Row: {
          blocking: boolean
          created_at: string
          details: Json | null
          draft_id: string
          id: string
          message: string | null
          passed: boolean
          severity: string
          user_id: string
          validation_type: string
        }
        Insert: {
          blocking?: boolean
          created_at?: string
          details?: Json | null
          draft_id: string
          id?: string
          message?: string | null
          passed?: boolean
          severity?: string
          user_id: string
          validation_type: string
        }
        Update: {
          blocking?: boolean
          created_at?: string
          details?: Json | null
          draft_id?: string
          id?: string
          message?: string | null
          passed?: boolean
          severity?: string
          user_id?: string
          validation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_work_order_validation_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_order_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_work_orders: {
        Row: {
          accepted_at: string | null
          approval_required: boolean
          approval_threshold: number | null
          arrived_at: string | null
          assigned_technician_id: string | null
          assigned_van_id: string | null
          checkin_geo: Json | null
          checkout_geo: Json | null
          completed_at: string | null
          completion_status: string | null
          completion_vin_captured: string | null
          completion_vin_matched: boolean | null
          compliance_invoice_format_ok: boolean
          compliance_notes_ok: boolean
          compliance_photos_attached: boolean
          compliance_po_attached: boolean
          created_at: string
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          description: string | null
          digital_signature_url: string | null
          en_route_at: string | null
          external_po: string | null
          fleet_client_id: string
          fleet_contract_id: string | null
          fleet_job_id: string | null
          fleet_location_id: string | null
          fleet_purchase_order_id: string | null
          fleet_vehicle_id: string
          id: string
          import_batch_id: string | null
          internal_po: string | null
          invoice_balance_due: number
          invoice_id: string | null
          invoice_paid_amount: number
          invoice_status: string | null
          invoiced_at: string | null
          labor_hours: number | null
          mileage_at_service: number | null
          next_service_date: string | null
          next_service_mileage: number | null
          notes: string | null
          odometer_in: number | null
          odometer_out: number | null
          order_number: string | null
          origin_source: string | null
          paid_at: string | null
          parts_used: Json | null
          payment_record_id: string | null
          photos: string[] | null
          po_authorization_status: string
          po_number: string | null
          priority: string
          required_skill: string | null
          scheduled_date: string | null
          scheduled_duration_minutes: number
          scheduled_time: string | null
          service_type: string | null
          signature_captured_at: string | null
          sla_deadline: string | null
          source: string | null
          source_draft_id: string | null
          source_request_id: string | null
          source_schedule_id: string | null
          started_at: string | null
          status: string
          submitted_at: string | null
          subtotal: number | null
          tax_amount: number | null
          technician_notes: string | null
          tekmetric_ro_id: string | null
          tekmetric_synced_at: string | null
          total: number | null
          updated_at: string
          user_id: string
          vin: string | null
        }
        Insert: {
          accepted_at?: string | null
          approval_required?: boolean
          approval_threshold?: number | null
          arrived_at?: string | null
          assigned_technician_id?: string | null
          assigned_van_id?: string | null
          checkin_geo?: Json | null
          checkout_geo?: Json | null
          completed_at?: string | null
          completion_status?: string | null
          completion_vin_captured?: string | null
          completion_vin_matched?: boolean | null
          compliance_invoice_format_ok?: boolean
          compliance_notes_ok?: boolean
          compliance_photos_attached?: boolean
          compliance_po_attached?: boolean
          created_at?: string
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          description?: string | null
          digital_signature_url?: string | null
          en_route_at?: string | null
          external_po?: string | null
          fleet_client_id: string
          fleet_contract_id?: string | null
          fleet_job_id?: string | null
          fleet_location_id?: string | null
          fleet_purchase_order_id?: string | null
          fleet_vehicle_id: string
          id?: string
          import_batch_id?: string | null
          internal_po?: string | null
          invoice_balance_due?: number
          invoice_id?: string | null
          invoice_paid_amount?: number
          invoice_status?: string | null
          invoiced_at?: string | null
          labor_hours?: number | null
          mileage_at_service?: number | null
          next_service_date?: string | null
          next_service_mileage?: number | null
          notes?: string | null
          odometer_in?: number | null
          odometer_out?: number | null
          order_number?: string | null
          origin_source?: string | null
          paid_at?: string | null
          parts_used?: Json | null
          payment_record_id?: string | null
          photos?: string[] | null
          po_authorization_status?: string
          po_number?: string | null
          priority?: string
          required_skill?: string | null
          scheduled_date?: string | null
          scheduled_duration_minutes?: number
          scheduled_time?: string | null
          service_type?: string | null
          signature_captured_at?: string | null
          sla_deadline?: string | null
          source?: string | null
          source_draft_id?: string | null
          source_request_id?: string | null
          source_schedule_id?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          technician_notes?: string | null
          tekmetric_ro_id?: string | null
          tekmetric_synced_at?: string | null
          total?: number | null
          updated_at?: string
          user_id: string
          vin?: string | null
        }
        Update: {
          accepted_at?: string | null
          approval_required?: boolean
          approval_threshold?: number | null
          arrived_at?: string | null
          assigned_technician_id?: string | null
          assigned_van_id?: string | null
          checkin_geo?: Json | null
          checkout_geo?: Json | null
          completed_at?: string | null
          completion_status?: string | null
          completion_vin_captured?: string | null
          completion_vin_matched?: boolean | null
          compliance_invoice_format_ok?: boolean
          compliance_notes_ok?: boolean
          compliance_photos_attached?: boolean
          compliance_po_attached?: boolean
          created_at?: string
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          description?: string | null
          digital_signature_url?: string | null
          en_route_at?: string | null
          external_po?: string | null
          fleet_client_id?: string
          fleet_contract_id?: string | null
          fleet_job_id?: string | null
          fleet_location_id?: string | null
          fleet_purchase_order_id?: string | null
          fleet_vehicle_id?: string
          id?: string
          import_batch_id?: string | null
          internal_po?: string | null
          invoice_balance_due?: number
          invoice_id?: string | null
          invoice_paid_amount?: number
          invoice_status?: string | null
          invoiced_at?: string | null
          labor_hours?: number | null
          mileage_at_service?: number | null
          next_service_date?: string | null
          next_service_mileage?: number | null
          notes?: string | null
          odometer_in?: number | null
          odometer_out?: number | null
          order_number?: string | null
          origin_source?: string | null
          paid_at?: string | null
          parts_used?: Json | null
          payment_record_id?: string | null
          photos?: string[] | null
          po_authorization_status?: string
          po_number?: string | null
          priority?: string
          required_skill?: string | null
          scheduled_date?: string | null
          scheduled_duration_minutes?: number
          scheduled_time?: string | null
          service_type?: string | null
          signature_captured_at?: string | null
          sla_deadline?: string | null
          source?: string | null
          source_draft_id?: string | null
          source_request_id?: string | null
          source_schedule_id?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          technician_notes?: string | null
          tekmetric_ro_id?: string | null
          tekmetric_synced_at?: string | null
          total?: number | null
          updated_at?: string
          user_id?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_work_orders_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_assigned_van_id_fkey"
            columns: ["assigned_van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_fleet_client_id_fkey"
            columns: ["fleet_client_id"]
            isOneToOne: false
            referencedRelation: "fleet_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_fleet_contract_id_fkey"
            columns: ["fleet_contract_id"]
            isOneToOne: false
            referencedRelation: "fleet_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_fleet_job_id_fkey"
            columns: ["fleet_job_id"]
            isOneToOne: false
            referencedRelation: "fleet_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_fleet_location_id_fkey"
            columns: ["fleet_location_id"]
            isOneToOne: false
            referencedRelation: "fleet_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_fleet_purchase_order_id_fkey"
            columns: ["fleet_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_fleet_vehicle_id_fkey"
            columns: ["fleet_vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_source_draft_id_fkey"
            columns: ["source_draft_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_order_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_orders_source_schedule_id_fkey"
            columns: ["source_schedule_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_rules: {
        Row: {
          action_type: string
          campaign_id: string | null
          churn_risk_filter: string[] | null
          conversions: number | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          description: string | null
          email_content: string | null
          email_subject: string | null
          email_template_id: string | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          max_value_filter: number | null
          min_value_filter: number | null
          name: string
          preset_key: string | null
          segment_filter: string[] | null
          service_type_filter: string[] | null
          sms_content: string | null
          task_assignee_id: string | null
          task_description: string | null
          task_title: string | null
          times_triggered: number | null
          trigger_days: number | null
          trigger_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          campaign_id?: string | null
          churn_risk_filter?: string[] | null
          conversions?: number | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          description?: string | null
          email_content?: string | null
          email_subject?: string | null
          email_template_id?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          max_value_filter?: number | null
          min_value_filter?: number | null
          name: string
          preset_key?: string | null
          segment_filter?: string[] | null
          service_type_filter?: string[] | null
          sms_content?: string | null
          task_assignee_id?: string | null
          task_description?: string | null
          task_title?: string | null
          times_triggered?: number | null
          trigger_days?: number | null
          trigger_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          campaign_id?: string | null
          churn_risk_filter?: string[] | null
          conversions?: number | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          description?: string | null
          email_content?: string | null
          email_subject?: string | null
          email_template_id?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          max_value_filter?: number | null
          min_value_filter?: number | null
          name?: string
          preset_key?: string | null
          segment_filter?: string[] | null
          service_type_filter?: string[] | null
          sms_content?: string | null
          task_assignee_id?: string | null
          task_description?: string | null
          task_title?: string | null
          times_triggered?: number | null
          trigger_days?: number | null
          trigger_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      geofence_events: {
        Row: {
          confidence: number
          created_at: string
          event_type: string
          geofence_id: string
          id: string
          location_event_id: string | null
          occurred_at: string
          received_at: string
          resource_id: string
          source: string
          user_id: string
        }
        Insert: {
          confidence: number
          created_at?: string
          event_type: string
          geofence_id: string
          id?: string
          location_event_id?: string | null
          occurred_at: string
          received_at?: string
          resource_id: string
          source: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          event_type?: string
          geofence_id?: string
          id?: string
          location_event_id?: string | null
          occurred_at?: string
          received_at?: string
          resource_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofence_events_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_location_event_id_fkey"
            columns: ["location_event_id"]
            isOneToOne: false
            referencedRelation: "location_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      geofences: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          job_id: string | null
          job_source: string | null
          latitude: number
          longitude: number
          policy_version: string
          purpose: string
          radius_meters: number
          resource_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          job_id?: string | null
          job_source?: string | null
          latitude: number
          longitude: number
          policy_version?: string
          purpose: string
          radius_meters: number
          resource_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          job_id?: string | null
          job_source?: string | null
          latitude?: number
          longitude?: number
          policy_version?: string
          purpose?: string
          radius_meters?: number
          resource_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofences_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
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
          token_expires_at: string
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
      google_insights_connections: {
        Row: {
          access_token_encrypted: string | null
          analytics_property_id: string | null
          analytics_property_name: string | null
          business_account_id: string | null
          business_account_name: string | null
          business_location_id: string | null
          business_location_name: string | null
          created_at: string
          granted_scopes: string[]
          last_sync_error: string | null
          last_synced_at: string | null
          oauth_state: string | null
          oauth_state_expires_at: string | null
          refresh_token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          analytics_property_id?: string | null
          analytics_property_name?: string | null
          business_account_id?: string | null
          business_account_name?: string | null
          business_location_id?: string | null
          business_location_name?: string | null
          created_at?: string
          granted_scopes?: string[]
          last_sync_error?: string | null
          last_synced_at?: string | null
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          analytics_property_id?: string | null
          analytics_property_name?: string | null
          business_account_id?: string | null
          business_account_name?: string | null
          business_location_id?: string | null
          business_location_name?: string | null
          created_at?: string
          granted_scopes?: string[]
          last_sync_error?: string | null
          last_synced_at?: string | null
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          created_at: string
          failure_count: number
          id: string
          metadata: Json | null
          source_name: string
          source_type: string
          status: string
          success_count: number
          total_rows: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failure_count?: number
          id?: string
          metadata?: Json | null
          source_name: string
          source_type?: string
          status?: string
          success_count?: number
          total_rows?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failure_count?: number
          id?: string
          metadata?: Json | null
          source_name?: string
          source_type?: string
          status?: string
          success_count?: number
          total_rows?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
        Relationships: []
      }
      inspection_items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_required: boolean | null
          name: string
          sort_order: number | null
          template_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean | null
          name: string
          sort_order?: number | null
          template_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean | null
          name?: string
          sort_order?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_results: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          image_url: string | null
          inspection_id: string
          item_category: string | null
          item_name: string
          notes: string | null
          sort_order: number | null
          status: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          inspection_id: string
          item_category?: string | null
          item_name: string
          notes?: string | null
          sort_order?: number | null
          status?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          inspection_id?: string
          item_category?: string | null
          item_name?: string
          notes?: string | null
          sort_order?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_results_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_results_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "service_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_templates: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      intake_questions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          options: Json | null
          question_text: string
          question_type: string
          sort_order: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          options?: Json | null
          question_text: string
          question_type?: string
          sort_order?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          options?: Json | null
          question_text?: string
          question_type?: string
          sort_order?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      internal_invocation_config: {
        Row: {
          cron_secret: string
          functions_base_url: string
          id: boolean
          updated_at: string
        }
        Insert: {
          cron_secret: string
          functions_base_url: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          cron_secret?: string
          functions_base_url?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category: string | null
          created_at: string
          data_origin: Database["public"]["Enums"]["data_origin_type"]
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
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
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
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
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
        Relationships: [
          {
            foreignKeyName: "inventory_items_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_ledger_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_type: string
          id: string
          idempotency_key: string
          inventory_item_id: string
          job_id: string | null
          job_source: string | null
          note: string | null
          owner_user_id: string
          quantity: number
          technician_id: string | null
          unit: string | null
          van_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_type: string
          id?: string
          idempotency_key: string
          inventory_item_id: string
          job_id?: string | null
          job_source?: string | null
          note?: string | null
          owner_user_id: string
          quantity: number
          technician_id?: string | null
          unit?: string | null
          van_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_type?: string
          id?: string
          idempotency_key?: string
          inventory_item_id?: string
          job_id?: string | null
          job_source?: string | null
          note?: string | null
          owner_user_id?: string
          quantity?: number
          technician_id?: string | null
          unit?: string | null
          van_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_entries_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_entries_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          appointment_id: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          inventory_item_id: string
          notes: string | null
          quantity: number
          released_at: string | null
          reserved_at: string
          source: string
          status: string
          unit: string
          updated_at: string
          user_id: string
          van_id: string | null
          work_order_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          inventory_item_id: string
          notes?: string | null
          quantity?: number
          released_at?: string | null
          reserved_at?: string
          source?: string
          status?: string
          unit?: string
          updated_at?: string
          user_id: string
          van_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          inventory_item_id?: string
          notes?: string | null
          quantity?: number
          released_at?: string | null
          reserved_at?: string
          source?: string
          status?: string
          unit?: string
          updated_at?: string
          user_id?: string
          van_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_restock_requests: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          fulfilled_at: string | null
          id: string
          items: Json
          note: string | null
          owner_user_id: string
          requested_by: string | null
          status: string
          technician_id: string | null
          updated_at: string
          van_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          items?: Json
          note?: string | null
          owner_user_id: string
          requested_by?: string | null
          status?: string
          technician_id?: string | null
          updated_at?: string
          van_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          items?: Json
          note?: string | null
          owner_user_id?: string
          requested_by?: string | null
          status?: string
          technician_id?: string | null
          updated_at?: string
          van_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_restock_requests_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lifecycle_events: {
        Row: {
          amount: number | null
          created_at: string
          details: Json
          event_type: string
          id: string
          idempotency_key: string | null
          invoice_id: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          idempotency_key?: string | null
          invoice_id: string
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lifecycle_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          description: string
          display_order: number
          id: string
          invoice_id: string
          license_plate: string | null
          line_total: number
          odometer_measure: string | null
          oil_capacity: string | null
          oil_filter: string | null
          oil_type: string | null
          quantity: number
          service_catalog_id: string | null
          source_fleet_work_order_id: string | null
          unit_price: number
          updated_at: string
          user_id: string
          vehicle_engine: string | null
          vehicle_id: string | null
          vehicle_make: string | null
          vehicle_mileage: number | null
          vehicle_model: string | null
          vehicle_trim: string | null
          vehicle_year: number | null
          vin: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          description: string
          display_order?: number
          id?: string
          invoice_id: string
          license_plate?: string | null
          line_total?: number
          odometer_measure?: string | null
          oil_capacity?: string | null
          oil_filter?: string | null
          oil_type?: string | null
          quantity?: number
          service_catalog_id?: string | null
          source_fleet_work_order_id?: string | null
          unit_price?: number
          updated_at?: string
          user_id: string
          vehicle_engine?: string | null
          vehicle_id?: string | null
          vehicle_make?: string | null
          vehicle_mileage?: number | null
          vehicle_model?: string | null
          vehicle_trim?: string | null
          vehicle_year?: number | null
          vin?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          description?: string
          display_order?: number
          id?: string
          invoice_id?: string
          license_plate?: string | null
          line_total?: number
          odometer_measure?: string | null
          oil_capacity?: string | null
          oil_filter?: string | null
          oil_type?: string | null
          quantity?: number
          service_catalog_id?: string | null
          source_fleet_work_order_id?: string | null
          unit_price?: number
          updated_at?: string
          user_id?: string
          vehicle_engine?: string | null
          vehicle_id?: string | null
          vehicle_make?: string | null
          vehicle_mileage?: number | null
          vehicle_model?: string | null
          vehicle_trim?: string | null
          vehicle_year?: number | null
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_source_fleet_work_order_id_fkey"
            columns: ["source_fleet_work_order_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          workspace_id: string
          customer_id: string
          vehicle_id: string | null
          work_order_id: string | null
          status: string
          invoice_number: number
          subtotal: number
          tax_total: number
          total: number
          amount_paid: number
          due_at: string | null
          issued_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          /** @deprecated Read-adapter compatibility only; not a live invoices column. */
          user_id?: string | null
          /** @deprecated Read-adapter compatibility only; not a live invoices column. */
          bill_to_type?: string | null
          /** @deprecated Read-adapter compatibility only; not a live invoices column. */
          fleet_client_id?: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          customer_id: string
          vehicle_id?: string | null
          work_order_id?: string | null
          status?: string
          invoice_number: number
          subtotal?: number
          tax_total?: number
          total?: number
          amount_paid?: number
          due_at?: string | null
          issued_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          customer_id?: string
          vehicle_id?: string | null
          work_order_id?: string | null
          status?: string
          invoice_number?: number
          subtotal?: number
          tax_total?: number
          total?: number
          amount_paid?: number
          due_at?: string | null
          issued_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_charges: {
        Row: {
          appointment_id: string
          created_at: string
          currency: string
          fee_cents: number
          finalized_at: string
          finalized_by: string | null
          id: string
          metadata: Json
          service_id: string | null
          source: string
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          user_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          currency?: string
          fee_cents?: number
          finalized_at?: string
          finalized_by?: string | null
          id?: string
          metadata?: Json
          service_id?: string | null
          source?: string
          subtotal_cents: number
          tax_cents?: number
          total_cents: number
          user_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          currency?: string
          fee_cents?: number
          finalized_at?: string
          finalized_by?: string | null
          id?: string
          metadata?: Json
          service_id?: string | null
          source?: string
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_charges_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_charges_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      job_execution_checklists: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          evidence_url: string | null
          id: string
          is_required: boolean
          job_id: string
          job_source: string
          notes: string | null
          requires_photo: boolean
          status: string
          step_key: string
          step_name: string
          step_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          evidence_url?: string | null
          id?: string
          is_required?: boolean
          job_id: string
          job_source?: string
          notes?: string | null
          requires_photo?: boolean
          status?: string
          step_key: string
          step_name: string
          step_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          evidence_url?: string | null
          id?: string
          is_required?: boolean
          job_id?: string
          job_source?: string
          notes?: string | null
          requires_photo?: boolean
          status?: string
          step_key?: string
          step_name?: string
          step_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_message_deliveries: {
        Row: {
          attempt_count: number
          channel: string
          claimed_at: string | null
          created_at: string
          delivered_at: string | null
          id: string
          last_error: string | null
          message_id: string
          next_attempt_at: string
          owner_user_id: string
          provider_message_id: string | null
          recipient: string
          status: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          channel: string
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          message_id: string
          next_attempt_at?: string
          owner_user_id: string
          provider_message_id?: string | null
          recipient: string
          status?: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          message_id?: string
          next_attempt_at?: string
          owner_user_id?: string
          provider_message_id?: string | null
          recipient?: string
          status?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_message_deliveries_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "job_thread_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_message_deliveries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "job_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          appointment_id: string
          caption: string | null
          captured_at: string | null
          created_at: string | null
          file_name: string | null
          file_size: number | null
          id: string
          is_required: boolean | null
          location: Json | null
          photo_type: string
          storage_path: string
          technician_id: string | null
          user_id: string
        }
        Insert: {
          appointment_id: string
          caption?: string | null
          captured_at?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          is_required?: boolean | null
          location?: Json | null
          photo_type: string
          storage_path: string
          technician_id?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string
          caption?: string | null
          captured_at?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          is_required?: boolean | null
          location?: Json | null
          photo_type?: string
          storage_path?: string
          technician_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      job_queue: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload_jsonb: Json | null
          priority: number
          run_at: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          job_type: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload_jsonb?: Json | null
          priority?: number
          run_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload_jsonb?: Json | null
          priority?: number
          run_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_thread_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          metadata: Json
          thread_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          metadata?: Json
          thread_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_thread_events_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "job_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      job_thread_exceptions: {
        Row: {
          attachments: Json
          created_at: string
          created_by: string
          exception_type: string
          id: string
          job_id: string | null
          note: string | null
          resolved_at: string | null
          thread_id: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          created_by: string
          exception_type: string
          id?: string
          job_id?: string | null
          note?: string | null
          resolved_at?: string | null
          thread_id: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          created_by?: string
          exception_type?: string
          id?: string
          job_id?: string | null
          note?: string | null
          resolved_at?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_thread_exceptions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "job_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      job_thread_messages: {
        Row: {
          attachments: Json
          channel: string
          client_message_id: string | null
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          message_type: string
          recipient: string | null
          sender_id: string
          sender_role: Database["public"]["Enums"]["job_thread_participant_role"]
          thread_id: string
        }
        Insert: {
          attachments?: Json
          channel?: string
          client_message_id?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          recipient?: string | null
          sender_id: string
          sender_role?: Database["public"]["Enums"]["job_thread_participant_role"]
          thread_id: string
        }
        Update: {
          attachments?: Json
          channel?: string
          client_message_id?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          recipient?: string | null
          sender_id?: string
          sender_role?: Database["public"]["Enums"]["job_thread_participant_role"]
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_thread_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "job_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      job_thread_participants: {
        Row: {
          created_at: string
          id: string
          last_read_at: string | null
          removed_at: string | null
          role: Database["public"]["Enums"]["job_thread_participant_role"]
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_read_at?: string | null
          removed_at?: string | null
          role?: Database["public"]["Enums"]["job_thread_participant_role"]
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_read_at?: string | null
          removed_at?: string | null
          role?: Database["public"]["Enums"]["job_thread_participant_role"]
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "job_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      job_threads: {
        Row: {
          appointment_id: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          fleet_work_order_id: string | null
          id: string
          last_message_at: string | null
          owner_user_id: string
          title: string | null
          type: Database["public"]["Enums"]["job_thread_type"]
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          fleet_work_order_id?: string | null
          id?: string
          last_message_at?: string | null
          owner_user_id: string
          title?: string | null
          type?: Database["public"]["Enums"]["job_thread_type"]
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          fleet_work_order_id?: string | null
          id?: string
          last_message_at?: string | null
          owner_user_id?: string
          title?: string | null
          type?: Database["public"]["Enums"]["job_thread_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_threads_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          is_locked: boolean
          memo: string | null
          period_month: string
          posted_at: string | null
          posted_by: string | null
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          is_locked?: boolean
          memo?: string | null
          period_month: string
          posted_at?: string | null
          posted_by?: string | null
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          is_locked?: boolean
          memo?: string | null
          period_month?: string
          posted_at?: string | null
          posted_by?: string | null
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_lines: {
        Row: {
          account_id: string
          appointment_id: string | null
          class_id: string | null
          created_at: string
          credit: number
          debit: number
          expense_id: string | null
          id: string
          invoice_id: string | null
          journal_entry_id: string
          location_id: string | null
          payment_record_id: string | null
          payout_id: string | null
        }
        Insert: {
          account_id: string
          appointment_id?: string | null
          class_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          expense_id?: string | null
          id?: string
          invoice_id?: string | null
          journal_entry_id: string
          location_id?: string | null
          payment_record_id?: string | null
          payout_id?: string | null
        }
        Update: {
          account_id?: string
          appointment_id?: string | null
          class_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          expense_id?: string | null
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string
          location_id?: string | null
          payment_record_id?: string | null
          payout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_payment_record_id_fkey"
            columns: ["payment_record_id"]
            isOneToOne: false
            referencedRelation: "cash_collection_receipts_v1"
            referencedColumns: ["payment_record_id"]
          },
          {
            foreignKeyName: "journal_lines_payment_record_id_fkey"
            columns: ["payment_record_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_items: {
        Row: {
          created_at: string
          description: string
          hours: number
          id: string
          rate: number
          service_id: string
          total_price: number
        }
        Insert: {
          created_at?: string
          description: string
          hours?: number
          id?: string
          rate?: number
          service_id: string
          total_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          hours?: number
          id?: string
          rate?: number
          service_id?: string
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "labor_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          browser: string | null
          current_page: string | null
          device: string | null
          id: string
          last_seen: string
          referrer: string | null
          session_id: string
          started_at: string
          tenant_id: string
          user_id: string | null
          visitor_id: string
        }
        Insert: {
          browser?: string | null
          current_page?: string | null
          device?: string | null
          id?: string
          last_seen?: string
          referrer?: string | null
          session_id: string
          started_at?: string
          tenant_id: string
          user_id?: string | null
          visitor_id: string
        }
        Update: {
          browser?: string | null
          current_page?: string | null
          device?: string | null
          id?: string
          last_seen?: string
          referrer?: string | null
          session_id?: string
          started_at?: string
          tenant_id?: string
          user_id?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      location_events: {
        Row: {
          accuracy_meters: number | null
          altitude_meters: number | null
          captured_at: string
          client_sequence: number | null
          created_at: string
          heading_degrees: number | null
          id: string
          idempotency_key: string
          latitude: number
          longitude: number
          navigation_session_id: string | null
          quality_flags: Json
          received_at: string
          rejected_reason: string | null
          resource_id: string
          source: string
          speed_mps: number | null
          technician_id: string | null
          trip_id: string | null
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          altitude_meters?: number | null
          captured_at: string
          client_sequence?: number | null
          created_at?: string
          heading_degrees?: number | null
          id?: string
          idempotency_key?: string
          latitude: number
          longitude: number
          navigation_session_id?: string | null
          quality_flags?: Json
          received_at?: string
          rejected_reason?: string | null
          resource_id: string
          source: string
          speed_mps?: number | null
          technician_id?: string | null
          trip_id?: string | null
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          altitude_meters?: number | null
          captured_at?: string
          client_sequence?: number | null
          created_at?: string
          heading_degrees?: number | null
          id?: string
          idempotency_key?: string
          latitude?: number
          longitude?: number
          navigation_session_id?: string | null
          quality_flags?: Json
          received_at?: string
          rejected_reason?: string | null
          resource_id?: string
          source?: string
          speed_mps?: number | null
          technician_id?: string | null
          trip_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_events_navigation_session_id_fkey"
            columns: ["navigation_session_id"]
            isOneToOne: false
            referencedRelation: "navigation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_events_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_events_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      location_history: {
        Row: {
          accuracy: number | null
          activity_type: string | null
          altitude: number | null
          appointment_id: string | null
          heading: number | null
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          speed: number | null
          technician_id: string
        }
        Insert: {
          accuracy?: number | null
          activity_type?: string | null
          altitude?: number | null
          appointment_id?: string | null
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          speed?: number | null
          technician_id: string
        }
        Update: {
          accuracy?: number | null
          activity_type?: string | null
          altitude?: number | null
          appointment_id?: string | null
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          speed?: number | null
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_history_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_history_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      location_navigation_settings: {
        Row: {
          background_location_enabled: boolean
          created_at: string
          customer_tracking_enabled: boolean
          native_guidance_enabled: boolean
          pilot_note: string | null
          routing_profile: string
          updated_at: string
          updated_by: string | null
          user_id: string
          web_guidance_enabled: boolean
        }
        Insert: {
          background_location_enabled?: boolean
          created_at?: string
          customer_tracking_enabled?: boolean
          native_guidance_enabled?: boolean
          pilot_note?: string | null
          routing_profile?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          web_guidance_enabled?: boolean
        }
        Update: {
          background_location_enabled?: boolean
          created_at?: string
          customer_tracking_enabled?: boolean
          native_guidance_enabled?: boolean
          pilot_note?: string | null
          routing_profile?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          web_guidance_enabled?: boolean
        }
        Relationships: []
      }
      location_quality: {
        Row: {
          address_type: string | null
          created_at: string
          entered_address: string | null
          entrance_latitude: number | null
          entrance_longitude: number | null
          id: string
          job_id: string
          job_source: string
          latitude: number | null
          longitude: number | null
          mapbox_feature_id: string | null
          metadata: Json
          normalized_address: string | null
          overridden_at: string | null
          overridden_by: string | null
          override_reason: string | null
          persistence_mode: string
          quality_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_type?: string | null
          created_at?: string
          entered_address?: string | null
          entrance_latitude?: number | null
          entrance_longitude?: number | null
          id?: string
          job_id: string
          job_source: string
          latitude?: number | null
          longitude?: number | null
          mapbox_feature_id?: string | null
          metadata?: Json
          normalized_address?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          persistence_mode?: string
          quality_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_type?: string | null
          created_at?: string
          entered_address?: string | null
          entrance_latitude?: number | null
          entrance_longitude?: number | null
          id?: string
          job_id?: string
          job_source?: string
          latitude?: number | null
          longitude?: number | null
          mapbox_feature_id?: string | null
          metadata?: Json
          normalized_address?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          persistence_mode?: string
          quality_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      location_share_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          job_id: string
          job_source: string
          navigation_session_id: string | null
          precision_mode: string
          revoked_at: string | null
          status: string
          token_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          job_id: string
          job_source: string
          navigation_session_id?: string | null
          precision_mode?: string
          revoked_at?: string | null
          status?: string
          token_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          job_id?: string
          job_source?: string
          navigation_session_id?: string | null
          precision_mode?: string
          revoked_at?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_share_sessions_navigation_session_id_fkey"
            columns: ["navigation_session_id"]
            isOneToOne: false
            referencedRelation: "navigation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          lifetime_points_earned: number
          lifetime_spend_cents: number
          points_balance: number
          program_id: string
          status: string
          tier: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
          visit_count: number
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          lifetime_points_earned?: number
          lifetime_spend_cents?: number
          points_balance?: number
          program_id: string
          status?: string
          tier?: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
          visit_count?: number
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          lifetime_points_earned?: number
          lifetime_spend_cents?: number
          points_balance?: number
          program_id?: string
          status?: string
          tier?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_automation_runs: {
        Row: {
          appointment_id: string | null
          created_at: string
          error_message: string | null
          id: string
          result_jsonb: Json
          run_type: string
          status: string
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          result_jsonb?: Json
          run_type?: string
          status: string
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          result_jsonb?: Json
          run_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_automation_runs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_backfill_runs: {
        Row: {
          actor_id: string | null
          applied_count: number
          batch_limit: number
          created_at: string
          duplicate_count: number
          eligible_count: number
          expected_points: number
          failed_count: number
          finished_at: string | null
          from_completed_at: string | null
          id: string
          last_appointment_id: string | null
          missing_customer_count: number
          mode: string
          result_jsonb: Json
          scanned_count: number
          skipped_count: number
          started_at: string
          status: string
          to_completed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          applied_count?: number
          batch_limit?: number
          created_at?: string
          duplicate_count?: number
          eligible_count?: number
          expected_points?: number
          failed_count?: number
          finished_at?: string | null
          from_completed_at?: string | null
          id?: string
          last_appointment_id?: string | null
          missing_customer_count?: number
          mode: string
          result_jsonb?: Json
          scanned_count?: number
          skipped_count?: number
          started_at?: string
          status?: string
          to_completed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          applied_count?: number
          batch_limit?: number
          created_at?: string
          duplicate_count?: number
          eligible_count?: number
          expected_points?: number
          failed_count?: number
          finished_at?: string | null
          from_completed_at?: string | null
          id?: string
          last_appointment_id?: string | null
          missing_customer_count?: number
          mode?: string
          result_jsonb?: Json
          scanned_count?: number
          skipped_count?: number
          started_at?: string
          status?: string
          to_completed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_corrections: {
        Row: {
          account_id: string | null
          actor_id: string
          appointment_id: string | null
          correction_type: string
          created_at: string
          customer_id: string | null
          event_id: string | null
          id: string
          metadata_jsonb: Json
          new_points_balance: number | null
          new_reward_status:
            | Database["public"]["Enums"]["loyalty_reward_status"]
            | null
          points_delta: number
          previous_points_balance: number | null
          previous_reward_status:
            | Database["public"]["Enums"]["loyalty_reward_status"]
            | null
          reason_code: string
          reason_note: string | null
          reward_instance_id: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          actor_id: string
          appointment_id?: string | null
          correction_type: string
          created_at?: string
          customer_id?: string | null
          event_id?: string | null
          id?: string
          metadata_jsonb?: Json
          new_points_balance?: number | null
          new_reward_status?:
            | Database["public"]["Enums"]["loyalty_reward_status"]
            | null
          points_delta?: number
          previous_points_balance?: number | null
          previous_reward_status?:
            | Database["public"]["Enums"]["loyalty_reward_status"]
            | null
          reason_code: string
          reason_note?: string | null
          reward_instance_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          actor_id?: string
          appointment_id?: string | null
          correction_type?: string
          created_at?: string
          customer_id?: string | null
          event_id?: string | null
          id?: string
          metadata_jsonb?: Json
          new_points_balance?: number | null
          new_reward_status?:
            | Database["public"]["Enums"]["loyalty_reward_status"]
            | null
          points_delta?: number
          previous_points_balance?: number | null
          previous_reward_status?:
            | Database["public"]["Enums"]["loyalty_reward_status"]
            | null
          reason_code?: string
          reason_note?: string | null
          reward_instance_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_corrections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_corrections_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_corrections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_corrections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "loyalty_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_corrections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "provider_loyalty_ledger"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "loyalty_corrections_reward_instance_id_fkey"
            columns: ["reward_instance_id"]
            isOneToOne: false
            referencedRelation: "loyalty_reward_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_events: {
        Row: {
          account_id: string
          appointment_id: string | null
          balance_after: number | null
          created_at: string
          credit_delta_cents: number
          customer_id: string | null
          event_type: Database["public"]["Enums"]["loyalty_event_type"]
          id: string
          idempotency_key: string | null
          metadata_jsonb: Json | null
          occurred_at: string
          points_delta: number
          service_id: string | null
          source_event_id: string | null
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          account_id: string
          appointment_id?: string | null
          balance_after?: number | null
          created_at?: string
          credit_delta_cents?: number
          customer_id?: string | null
          event_type: Database["public"]["Enums"]["loyalty_event_type"]
          id?: string
          idempotency_key?: string | null
          metadata_jsonb?: Json | null
          occurred_at?: string
          points_delta?: number
          service_id?: string | null
          source_event_id?: string | null
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          account_id?: string
          appointment_id?: string | null
          balance_after?: number | null
          created_at?: string
          credit_delta_cents?: number
          customer_id?: string | null
          event_type?: Database["public"]["Enums"]["loyalty_event_type"]
          id?: string
          idempotency_key?: string | null
          metadata_jsonb?: Json | null
          occurred_at?: string
          points_delta?: number
          service_id?: string | null
          source_event_id?: string | null
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_events_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_events_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "loyalty_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_events_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "provider_loyalty_ledger"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "loyalty_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          created_at: string
          earn_rules_jsonb: Json | null
          id: string
          name: string
          scope: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          earn_rules_jsonb?: Json | null
          id?: string
          name: string
          scope?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          earn_rules_jsonb?: Json | null
          id?: string
          name?: string
          scope?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_reward_instances: {
        Row: {
          account_id: string | null
          applied_at: string | null
          appointment_id: string | null
          cancelled_at: string | null
          created_at: string
          customer_id: string | null
          discount_cents: number
          expires_at: string | null
          id: string
          idempotency_key: string | null
          issued_at: string
          redeemed_at: string | null
          redemption_metadata_jsonb: Json
          reservation_expires_at: string | null
          reserved_at: string | null
          reward_id: string
          service_id: string | null
          source_event_id: string | null
          status: Database["public"]["Enums"]["loyalty_reward_status"]
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          account_id?: string | null
          applied_at?: string | null
          appointment_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_id?: string | null
          discount_cents?: number
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          redeemed_at?: string | null
          redemption_metadata_jsonb?: Json
          reservation_expires_at?: string | null
          reserved_at?: string | null
          reward_id: string
          service_id?: string | null
          source_event_id?: string | null
          status?: Database["public"]["Enums"]["loyalty_reward_status"]
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          account_id?: string | null
          applied_at?: string | null
          appointment_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_id?: string | null
          discount_cents?: number
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          redeemed_at?: string | null
          redemption_metadata_jsonb?: Json
          reservation_expires_at?: string | null
          reserved_at?: string | null
          reward_id?: string
          service_id?: string | null
          source_event_id?: string | null
          status?: Database["public"]["Enums"]["loyalty_reward_status"]
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_reward_instances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_reward_instances_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_reward_instances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_reward_instances_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_reward_instances_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_reward_instances_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "loyalty_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_reward_instances_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "provider_loyalty_ledger"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "loyalty_reward_instances_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          config_jsonb: Json | null
          created_at: string
          description: string | null
          id: string
          name: string
          points_required: number
          program_id: string
          reward_type: Database["public"]["Enums"]["loyalty_reward_type"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config_jsonb?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          points_required?: number
          program_id: string
          reward_type: Database["public"]["Enums"]["loyalty_reward_type"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config_jsonb?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          points_required?: number
          program_id?: string
          reward_type?: Database["public"]["Enums"]["loyalty_reward_type"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_intervals: {
        Row: {
          created_at: string
          default_interval_miles: number | null
          default_interval_months: number | null
          description: string | null
          id: string
          priority: string
          service_type: string
          title: string
        }
        Insert: {
          created_at?: string
          default_interval_miles?: number | null
          default_interval_months?: number | null
          description?: string | null
          id?: string
          priority?: string
          service_type: string
          title: string
        }
        Update: {
          created_at?: string
          default_interval_miles?: number | null
          default_interval_months?: number | null
          description?: string | null
          id?: string
          priority?: string
          service_type?: string
          title?: string
        }
        Relationships: []
      }
      maintenance_schedules: {
        Row: {
          created_at: string
          description: string | null
          engine: string | null
          id: string
          interval_miles: number | null
          interval_months: number | null
          make: string
          model: string | null
          priority: string | null
          service_type: string
          severe_interval_miles: number | null
          severe_interval_months: number | null
          source: string | null
          updated_at: string
          year_end: number
          year_start: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          engine?: string | null
          id?: string
          interval_miles?: number | null
          interval_months?: number | null
          make: string
          model?: string | null
          priority?: string | null
          service_type: string
          severe_interval_miles?: number | null
          severe_interval_months?: number | null
          source?: string | null
          updated_at?: string
          year_end: number
          year_start: number
        }
        Update: {
          created_at?: string
          description?: string | null
          engine?: string | null
          id?: string
          interval_miles?: number | null
          interval_months?: number | null
          make?: string
          model?: string | null
          priority?: string | null
          service_type?: string
          severe_interval_miles?: number | null
          severe_interval_months?: number | null
          source?: string | null
          updated_at?: string
          year_end?: number
          year_start?: number
        }
        Relationships: []
      }
      message_bundles: {
        Row: {
          bundle_key: string | null
          channel: string
          created_at: string
          credit_units: number | null
          id: string
          included_units: number
          is_active: boolean
          name: string
          price_cents: number
          renewal_period: string
          updated_at: string
        }
        Insert: {
          bundle_key?: string | null
          channel: string
          created_at?: string
          credit_units?: number | null
          id?: string
          included_units: number
          is_active?: boolean
          name: string
          price_cents: number
          renewal_period?: string
          updated_at?: string
        }
        Update: {
          bundle_key?: string | null
          channel?: string
          created_at?: string
          credit_units?: number | null
          id?: string
          included_units?: number
          is_active?: boolean
          name?: string
          price_cents?: number
          renewal_period?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_events: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          event_type: string
          id: string
          ledger_id: string | null
          occurred_at: string
          provider: string
          provider_event_id: string | null
          provider_status: string | null
          raw_payload_hash: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          ledger_id?: string | null
          occurred_at?: string
          provider: string
          provider_event_id?: string | null
          provider_status?: string | null
          raw_payload_hash?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          ledger_id?: string | null
          occurred_at?: string
          provider?: string
          provider_event_id?: string | null
          provider_status?: string | null
          raw_payload_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_events_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "message_usage_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      message_usage_ledger: {
        Row: {
          appointment_id: string | null
          billed_amount_cents: number | null
          body_preview: string | null
          campaign_id: string | null
          channel: string
          created_at: string
          credit_source: string | null
          customer_id: string | null
          direction: string
          error_message: string | null
          finalized_at: string | null
          id: string
          idempotency_key: string | null
          message_class: string
          message_type: string | null
          provider: string
          provider_message_id: string | null
          recipient_email: string | null
          recipient_hash: string | null
          recipient_last4: string | null
          reserved_segments: number
          segments: number
          status: string
          unit_cost_cents: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          billed_amount_cents?: number | null
          body_preview?: string | null
          campaign_id?: string | null
          channel: string
          created_at?: string
          credit_source?: string | null
          customer_id?: string | null
          direction: string
          error_message?: string | null
          finalized_at?: string | null
          id?: string
          idempotency_key?: string | null
          message_class: string
          message_type?: string | null
          provider: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_hash?: string | null
          recipient_last4?: string | null
          reserved_segments?: number
          segments?: number
          status?: string
          unit_cost_cents?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          billed_amount_cents?: number | null
          body_preview?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          credit_source?: string | null
          customer_id?: string | null
          direction?: string
          error_message?: string | null
          finalized_at?: string | null
          id?: string
          idempotency_key?: string | null
          message_class?: string
          message_type?: string | null
          provider?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_hash?: string | null
          recipient_last4?: string | null
          reserved_segments?: number
          segments?: number
          status?: string
          unit_cost_cents?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messaging_delivery_events: {
        Row: {
          channel: string
          created_at: string
          event_type: string
          id: string
          message_id: string | null
          occurred_at: string
          payload_jsonb: Json | null
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          event_type: string
          id?: string
          message_id?: string | null
          occurred_at?: string
          payload_jsonb?: Json | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          message_id?: string | null
          occurred_at?: string
          payload_jsonb?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      messaging_templates: {
        Row: {
          body_template: string
          channel: string
          created_at: string
          id: string
          is_active: boolean
          subject_template: string | null
          template_key: string
          updated_at: string
          user_id: string
          variables_jsonb: Json | null
          version: number
        }
        Insert: {
          body_template: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          subject_template?: string | null
          template_key: string
          updated_at?: string
          user_id: string
          variables_jsonb?: Json | null
          version?: number
        }
        Update: {
          body_template?: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          subject_template?: string | null
          template_key?: string
          updated_at?: string
          user_id?: string
          variables_jsonb?: Json | null
          version?: number
        }
        Relationships: []
      }
      mobile_app_install_events: {
        Row: {
          actor_user_id: string | null
          id: string
          installed_at: string
          release_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          id?: string
          installed_at?: string
          release_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          id?: string
          installed_at?: string
          release_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_app_install_events_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "mobile_app_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_app_releases: {
        Row: {
          artifact_sha256: string | null
          artifact_url: string
          build_number: number
          channel: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          platform: string
          release_notes: string | null
          status: string
          updated_at: string
          user_id: string
          version: string
        }
        Insert: {
          artifact_sha256?: string | null
          artifact_url: string
          build_number: number
          channel?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          platform: string
          release_notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
          version: string
        }
        Update: {
          artifact_sha256?: string | null
          artifact_url?: string
          build_number?: number
          channel?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          platform?: string
          release_notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      navigation_session_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          idempotency_key: string
          navigation_session_id: string
          occurred_at: string
          payload: Json
          received_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          idempotency_key?: string
          navigation_session_id: string
          occurred_at: string
          payload?: Json
          received_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          navigation_session_id?: string
          occurred_at?: string
          payload?: Json
          received_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "navigation_session_events_navigation_session_id_fkey"
            columns: ["navigation_session_id"]
            isOneToOne: false
            referencedRelation: "navigation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      navigation_sessions: {
        Row: {
          created_at: string
          destination_label: string
          destination_latitude: number
          destination_longitude: number
          ended_at: string | null
          id: string
          job_id: string
          job_source: string
          last_eta_at: string | null
          last_eta_seconds: number | null
          last_event_at: string | null
          metadata: Json
          planned_distance_meters: number | null
          planned_duration_seconds: number | null
          reroute_count: number
          resource_id: string
          selected_route_id: string | null
          started_at: string | null
          status: string
          technician_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination_label: string
          destination_latitude: number
          destination_longitude: number
          ended_at?: string | null
          id?: string
          job_id: string
          job_source: string
          last_eta_at?: string | null
          last_eta_seconds?: number | null
          last_event_at?: string | null
          metadata?: Json
          planned_distance_meters?: number | null
          planned_duration_seconds?: number | null
          reroute_count?: number
          resource_id: string
          selected_route_id?: string | null
          started_at?: string | null
          status?: string
          technician_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination_label?: string
          destination_latitude?: number
          destination_longitude?: number
          ended_at?: string | null
          id?: string
          job_id?: string
          job_source?: string
          last_eta_at?: string | null
          last_eta_seconds?: number | null
          last_event_at?: string | null
          metadata?: Json
          planned_distance_meters?: number | null
          planned_duration_seconds?: number | null
          reroute_count?: number
          resource_id?: string
          selected_route_id?: string | null
          started_at?: string | null
          status?: string
          technician_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "navigation_sessions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "navigation_sessions_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          error: string | null
          id: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          subscriber_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subscriber_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "newsletter_scheduled_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_campaign_recipients_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "newsletter_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_events: {
        Row: {
          event_type: string
          id: string
          ip: string | null
          metadata: Json
          occurred_at: string
          provider_message_id: string | null
          source: string | null
          subscriber_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          event_type: string
          id?: string
          ip?: string | null
          metadata?: Json
          occurred_at?: string
          provider_message_id?: string | null
          source?: string | null
          subscriber_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          event_type?: string
          id?: string
          ip?: string | null
          metadata?: Json
          occurred_at?: string
          provider_message_id?: string | null
          source?: string | null
          subscriber_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_events_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "newsletter_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_scheduled_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          failed_count: number
          finished_at: string | null
          html: string
          id: string
          preview_text: string | null
          segment: string
          send_at: string
          sent_count: number
          skipped_count: number
          started_at: string | null
          status: string
          subject: string
          text_body: string | null
          total_recipients: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          failed_count?: number
          finished_at?: string | null
          html: string
          id?: string
          preview_text?: string | null
          segment?: string
          send_at: string
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          subject: string
          text_body?: string | null
          total_recipients?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          failed_count?: number
          finished_at?: string | null
          html?: string
          id?: string
          preview_text?: string | null
          segment?: string
          send_at?: string
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          subject?: string
          text_body?: string | null
          total_recipients?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      newsletter_sent_log: {
        Row: {
          clicked_at: string | null
          cycle_month: string
          id: string
          opened_at: string | null
          sent_at: string | null
          sequence_id: string | null
          status: string | null
          subscriber_id: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          clicked_at?: string | null
          cycle_month?: string
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          sequence_id?: string | null
          status?: string | null
          subscriber_id?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          clicked_at?: string | null
          cycle_month?: string
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          sequence_id?: string | null
          status?: string | null
          subscriber_id?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_sent_log_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "newsletter_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_sent_log_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "newsletter_subscribers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_sent_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "newsletter_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_sequences: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          start_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          start_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          start_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          consent_at: string | null
          consent_ip: string | null
          consent_user_agent: string | null
          customer_id: string | null
          deleted_at: string | null
          email: string
          email_normalized: string | null
          id: string
          preferences: Json
          segment: string
          source: string
          status: string | null
          subscribed_at: string | null
          subscriber_name: string | null
          unsubscribe_token: string
          unsubscribed_at: string | null
          updated_at: string
          user_id: string
          utm: Json
        }
        Insert: {
          consent_at?: string | null
          consent_ip?: string | null
          consent_user_agent?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          email: string
          email_normalized?: string | null
          id?: string
          preferences?: Json
          segment?: string
          source?: string
          status?: string | null
          subscribed_at?: string | null
          subscriber_name?: string | null
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
          user_id: string
          utm?: Json
        }
        Update: {
          consent_at?: string | null
          consent_ip?: string | null
          consent_user_agent?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          email?: string
          email_normalized?: string | null
          id?: string
          preferences?: Json
          segment?: string
          source?: string
          status?: string | null
          subscribed_at?: string | null
          subscriber_name?: string | null
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_templates: {
        Row: {
          content: string
          created_at: string | null
          holiday_theme: string | null
          id: string
          is_active: boolean | null
          month_number: number
          preview_text: string | null
          seasonal_theme: string | null
          sequence_id: string | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          holiday_theme?: string | null
          id?: string
          is_active?: boolean | null
          month_number: number
          preview_text?: string | null
          seasonal_theme?: string | null
          sequence_id?: string | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          holiday_theme?: string | null
          id?: string
          is_active?: boolean | null
          month_number?: number
          preview_text?: string | null
          seasonal_theme?: string | null
          sequence_id?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_templates_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "newsletter_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_welcome_enrollments: {
        Row: {
          created_at: string
          current_step: number
          id: string
          last_error: string | null
          next_send_at: string
          status: string
          subscriber_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_step?: number
          id?: string
          last_error?: string | null
          next_send_at?: string
          status?: string
          subscriber_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_step?: number
          id?: string
          last_error?: string | null
          next_send_at?: string
          status?: string
          subscriber_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_welcome_enrollments_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: true
            referencedRelation: "newsletter_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      oil_reset_procedures: {
        Row: {
          created_at: string
          id: string
          make: string
          method: string
          model: string
          notes: string | null
          source: string
          steps: Json
          trim_or_engine: string
          updated_at: string
          year_end: number
          year_start: number
        }
        Insert: {
          created_at?: string
          id?: string
          make: string
          method?: string
          model?: string
          notes?: string | null
          source?: string
          steps?: Json
          trim_or_engine?: string
          updated_at?: string
          year_end: number
          year_start: number
        }
        Update: {
          created_at?: string
          id?: string
          make?: string
          method?: string
          model?: string
          notes?: string | null
          source?: string
          steps?: Json
          trim_or_engine?: string
          updated_at?: string
          year_end?: number
          year_start?: number
        }
        Relationships: []
      }
      onboarding_site_imports: {
        Row: {
          created_at: string
          id: string
          payload: Json
          source_url: string
          status: string
          updated_at: string
          user_id: string
          warnings: Json
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          source_url: string
          status?: string
          updated_at?: string
          user_id: string
          warnings?: Json
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          source_url?: string
          status?: string
          updated_at?: string
          user_id?: string
          warnings?: Json
        }
        Relationships: []
      }
      operational_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json
          fingerprint: string
          id: string
          resolved_at: string | null
          severity: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json
          fingerprint: string
          id?: string
          resolved_at?: string | null
          severity: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json
          fingerprint?: string
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      parts_catalog: {
        Row: {
          brand: string | null
          category: string
          cost_per_unit: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          part_number: string | null
          quantity_on_hand: number
          reorder_level: number
          subcategory: string | null
          unit_type: string
          updated_at: string
          user_id: string
          vendor_id: string | null
          viscosity: string | null
        }
        Insert: {
          brand?: string | null
          category: string
          cost_per_unit?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          part_number?: string | null
          quantity_on_hand?: number
          reorder_level?: number
          subcategory?: string | null
          unit_type?: string
          updated_at?: string
          user_id: string
          vendor_id?: string | null
          viscosity?: string | null
        }
        Update: {
          brand?: string | null
          category?: string
          cost_per_unit?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          part_number?: string | null
          quantity_on_hand?: number
          reorder_level?: number
          subcategory?: string | null
          unit_type?: string
          updated_at?: string
          user_id?: string
          vendor_id?: string | null
          viscosity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_catalog_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_transactions: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          notes: string | null
          part_id: string
          quantity: number
          transaction_type: string
          unit_cost: number | null
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          part_id: string
          quantity: number
          transaction_type: string
          unit_cost?: number | null
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          part_id?: string
          quantity?: number
          transaction_type?: string
          unit_cost?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_transactions_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          allocated_at: string
          allocated_by: string | null
          amount_cents: number
          id: string
          job_charge_id: string
          metadata: Json
          receipt_event_id: string
          user_id: string
        }
        Insert: {
          allocated_at?: string
          allocated_by?: string | null
          amount_cents: number
          id?: string
          job_charge_id: string
          metadata?: Json
          receipt_event_id: string
          user_id: string
        }
        Update: {
          allocated_at?: string
          allocated_by?: string | null
          amount_cents?: number
          id?: string
          job_charge_id?: string
          metadata?: Json
          receipt_event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_job_charge_id_fkey"
            columns: ["job_charge_id"]
            isOneToOne: false
            referencedRelation: "job_charge_balances_v1"
            referencedColumns: ["job_charge_id"]
          },
          {
            foreignKeyName: "payment_allocations_job_charge_id_fkey"
            columns: ["job_charge_id"]
            isOneToOne: false
            referencedRelation: "job_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_receipt_event_id_fkey"
            columns: ["receipt_event_id"]
            isOneToOne: false
            referencedRelation: "receipt_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_receipt_event_id_fkey"
            columns: ["receipt_event_id"]
            isOneToOne: false
            referencedRelation: "unallocated_receipts_v1"
            referencedColumns: ["receipt_event_id"]
          },
        ]
      }
      payment_provider_customers: {
        Row: {
          created_at: string
          customer_id: string
          external_customer_id: string
          external_customer_reference: string | null
          id: string
          last_synced_at: string
          metadata: Json
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          external_customer_id: string
          external_customer_reference?: string | null
          id?: string
          last_synced_at?: string
          metadata?: Json
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          external_customer_id?: string
          external_customer_reference?: string | null
          id?: string
          last_synced_at?: string
          metadata?: Json
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_customers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_records: {
        Row: {
          appointment_id: string
          attempt_count: number
          created_at: string
          customer_id: string | null
          dead_letter: boolean
          external_customer_id: string | null
          external_invoice_id: string | null
          external_order_id: string | null
          external_payment_id: string | null
          external_transaction_id: string | null
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          last_error: string | null
          metadata: Json
          next_retry_at: string | null
          payment_record_id: string | null
          provider: string
          sync_mode: string
          sync_status: string
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          attempt_count?: number
          created_at?: string
          customer_id?: string | null
          dead_letter?: boolean
          external_customer_id?: string | null
          external_invoice_id?: string | null
          external_order_id?: string | null
          external_payment_id?: string | null
          external_transaction_id?: string | null
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          metadata?: Json
          next_retry_at?: string | null
          payment_record_id?: string | null
          provider: string
          sync_mode: string
          sync_status?: string
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          attempt_count?: number
          created_at?: string
          customer_id?: string | null
          dead_letter?: boolean
          external_customer_id?: string | null
          external_invoice_id?: string | null
          external_order_id?: string | null
          external_payment_id?: string | null
          external_transaction_id?: string | null
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          metadata?: Json
          next_retry_at?: string | null
          payment_record_id?: string | null
          provider?: string
          sync_mode?: string
          sync_status?: string
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_provider_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_provider_records_payment_record_id_fkey"
            columns: ["payment_record_id"]
            isOneToOne: false
            referencedRelation: "cash_collection_receipts_v1"
            referencedColumns: ["payment_record_id"]
          },
          {
            foreignKeyName: "payment_provider_records_payment_record_id_fkey"
            columns: ["payment_record_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_sync_logs: {
        Row: {
          appointment_id: string
          attempt_number: number
          context: Json
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          provider: string
          provider_record_id: string
          status: string
          sync_mode: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          attempt_number: number
          context?: Json
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          provider: string
          provider_record_id: string
          status: string
          sync_mode: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          attempt_number?: number
          context?: Json
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          provider?: string
          provider_record_id?: string
          status?: string
          sync_mode?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_sync_logs_provider_record_id_fkey"
            columns: ["provider_record_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_records"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_throttle: {
        Row: {
          bucket_capacity: number
          concurrency_cap: number
          created_at: string
          id: string
          last_refill_at: string
          provider: string
          refill_per_second: number
          tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bucket_capacity?: number
          concurrency_cap?: number
          created_at?: string
          id?: string
          last_refill_at?: string
          provider: string
          refill_per_second?: number
          tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bucket_capacity?: number
          concurrency_cap?: number
          created_at?: string
          id?: string
          last_refill_at?: string
          provider?: string
          refill_per_second?: number
          tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          workspace_id: string
          invoice_id: string | null
          customer_id: string | null
          provider: string | null
          provider_payment_id: string | null
          status: string
          amount: number
          currency_code: string
          paid_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          /** @deprecated Read-adapter compatibility only; not a public.payments column. */
          appointment_id?: string | null
          /** @deprecated Read-adapter compatibility only; not a public.payments column. */
          currency?: string | null
          /** @deprecated Read-adapter compatibility only; not a public.payments column. */
          customer_name?: string | null
          /** @deprecated Read-adapter compatibility only; not a public.payments column. */
          customer_email?: string | null
          /** @deprecated Read-adapter compatibility only; not a public.payments column. */
          payment_type?: string | null
          /** @deprecated Read-adapter compatibility only; not a public.payments column. */
          metadata?: Json | null
          /** @deprecated Read-adapter compatibility only; not a public.payments column. */
          refund_amount?: number | null
          /** @deprecated Read-adapter compatibility only; not a public.payments column. */
          tax_amount?: number | null
          /** @deprecated Read-adapter compatibility only; not a public.payments column. */
          user_id?: string | null
          /** @deprecated Read-adapter compatibility only; not a public.payments column. */
          deleted_at?: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          invoice_id?: string | null
          customer_id?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          status?: string
          amount: number
          currency_code?: string
          paid_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          invoice_id?: string | null
          customer_id?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          status?: string
          amount?: number
          currency_code?: string
          paid_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount: number
          cleared_at: string | null
          created_at: string
          fee: number
          id: string
          method: string
          payout_fee_amount: number
          settled_at: string | null
          source_id: string | null
          source_type: string | null
          status: string
          stripe_payout_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          cleared_at?: string | null
          created_at?: string
          fee?: number
          id?: string
          method?: string
          payout_fee_amount?: number
          settled_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          stripe_payout_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          cleared_at?: string | null
          created_at?: string
          fee?: number
          id?: string
          method?: string
          payout_fee_amount?: number
          settled_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          stripe_payout_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      phone_coupon_overrides: {
        Row: {
          created_at: string
          custom_description: string | null
          custom_discount_type: string | null
          custom_discount_value: number | null
          custom_min_order_amount: number | null
          customer_id: string
          disabled: boolean
          id: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_description?: string | null
          custom_discount_type?: string | null
          custom_discount_value?: number | null
          custom_min_order_amount?: number | null
          customer_id: string
          disabled?: boolean
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_description?: string | null
          custom_discount_type?: string | null
          custom_discount_value?: number | null
          custom_min_order_amount?: number | null
          customer_id?: string
          disabled?: boolean
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_coupon_overrides_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_plans: {
        Row: {
          badge_color: string | null
          badge_label: string | null
          billing_interval: string
          created_at: string
          description: string | null
          display_name: string
          display_order: number
          has_ai_assistant: boolean
          has_ai_routing: boolean
          has_carfax_integration: boolean
          has_dispatch_engine: boolean
          has_fleet_os: boolean
          has_invoicing_basic: boolean
          has_invoicing_full: boolean
          has_marketing_automation: boolean
          has_public_booking: boolean
          has_pwa_offline: boolean
          has_quickbooks_sync: boolean
          has_stripe_payments: boolean
          has_technician_os: boolean
          highlight: boolean
          id: string
          is_active: boolean
          is_contact_sales: boolean
          max_appointments_per_month: number | null
          max_customers: number | null
          max_technician_seats: number | null
          min_platform_fee_cents: number
          name: string
          platform_fee_bps: number
          price_cents: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          support_level: string | null
          tax_compliance_level: string | null
          trial_period_days: number
          updated_at: string
        }
        Insert: {
          badge_color?: string | null
          badge_label?: string | null
          billing_interval?: string
          created_at?: string
          description?: string | null
          display_name: string
          display_order?: number
          has_ai_assistant?: boolean
          has_ai_routing?: boolean
          has_carfax_integration?: boolean
          has_dispatch_engine?: boolean
          has_fleet_os?: boolean
          has_invoicing_basic?: boolean
          has_invoicing_full?: boolean
          has_marketing_automation?: boolean
          has_public_booking?: boolean
          has_pwa_offline?: boolean
          has_quickbooks_sync?: boolean
          has_stripe_payments?: boolean
          has_technician_os?: boolean
          highlight?: boolean
          id?: string
          is_active?: boolean
          is_contact_sales?: boolean
          max_appointments_per_month?: number | null
          max_customers?: number | null
          max_technician_seats?: number | null
          min_platform_fee_cents?: number
          name: string
          platform_fee_bps?: number
          price_cents?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          support_level?: string | null
          tax_compliance_level?: string | null
          trial_period_days?: number
          updated_at?: string
        }
        Update: {
          badge_color?: string | null
          badge_label?: string | null
          billing_interval?: string
          created_at?: string
          description?: string | null
          display_name?: string
          display_order?: number
          has_ai_assistant?: boolean
          has_ai_routing?: boolean
          has_carfax_integration?: boolean
          has_dispatch_engine?: boolean
          has_fleet_os?: boolean
          has_invoicing_basic?: boolean
          has_invoicing_full?: boolean
          has_marketing_automation?: boolean
          has_public_booking?: boolean
          has_pwa_offline?: boolean
          has_quickbooks_sync?: boolean
          has_stripe_payments?: boolean
          has_technician_os?: boolean
          highlight?: boolean
          id?: string
          is_active?: boolean
          is_contact_sales?: boolean
          max_appointments_per_month?: number | null
          max_customers?: number | null
          max_technician_seats?: number | null
          min_platform_fee_cents?: number
          name?: string
          platform_fee_bps?: number
          price_cents?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          support_level?: string | null
          tax_compliance_level?: string | null
          trial_period_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      platform_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          status: string
          stripe_event_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          stripe_event_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      privacy_incident_notification_queue: {
        Row: {
          customer_id: string | null
          id: string
          incident_type: string
          notification_channel: string
          notification_status: string
          payload: Json
          queued_at: string
          reason: string | null
          sent_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          customer_id?: string | null
          id?: string
          incident_type: string
          notification_channel?: string
          notification_status?: string
          payload?: Json
          queued_at?: string
          reason?: string | null
          sent_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          customer_id?: string | null
          id?: string
          incident_type?: string
          notification_channel?: string
          notification_status?: string
          payload?: Json
          queued_at?: string
          reason?: string | null
          sent_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "privacy_incident_notification_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_keys: {
        Row: {
          created_at: string
          id: string
          private_key: string
          public_key: string
          subject: string
        }
        Insert: {
          created_at?: string
          id?: string
          private_key: string
          public_key: string
          subject: string
        }
        Update: {
          created_at?: string
          id?: string
          private_key?: string
          public_key?: string
          subject?: string
        }
        Relationships: []
      }
      qbo_entity_mappings: {
        Row: {
          created_at: string | null
          entity_type: string
          id: string
          last_synced_at: string | null
          local_id: string
          qbo_id: string
          sync_error: string | null
          sync_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          id?: string
          last_synced_at?: string | null
          local_id: string
          qbo_id: string
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          id?: string
          last_synced_at?: string | null
          local_id?: string
          qbo_id?: string
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      qbo_sync_log: {
        Row: {
          completed_at: string | null
          created_at: string | null
          direction: string
          entity_type: string | null
          error_details: Json | null
          id: string
          records_failed: number | null
          records_synced: number | null
          started_at: string | null
          status: string
          sync_type: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          direction: string
          entity_type?: string | null
          error_details?: Json | null
          id?: string
          records_failed?: number | null
          records_synced?: number | null
          started_at?: string | null
          status: string
          sync_type: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          direction?: string
          entity_type?: string | null
          error_details?: Json | null
          id?: string
          records_failed?: number | null
          records_synced?: number | null
          started_at?: string | null
          status?: string
          sync_type?: string
          user_id?: string
        }
        Relationships: []
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
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          inventory_item_id?: string | null
          quantity?: number
          quote_id: string
          total_price: number
          unit_price: number
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
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          converted_quote_id: string | null
          created_at: string
          estimate_avg: number | null
          estimate_high: number | null
          estimate_low: number | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          notes: string | null
          pricing_tier: string
          repair_title: string | null
          shop_price: number | null
          source: string
          status: string
          updated_at: string
          user_id: string
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
          vin: string | null
        }
        Insert: {
          converted_quote_id?: string | null
          created_at?: string
          estimate_avg?: number | null
          estimate_high?: number | null
          estimate_low?: number | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          pricing_tier?: string
          repair_title?: string | null
          shop_price?: number | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          vin?: string | null
        }
        Update: {
          converted_quote_id?: string | null
          created_at?: string
          estimate_avg?: number | null
          estimate_high?: number | null
          estimate_low?: number | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          pricing_tier?: string
          repair_title?: string | null
          shop_price?: number | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          vin?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          created_at: string
          customer_id: string | null
          description: string
          estimate_market_avg: number | null
          estimate_source: string | null
          estimate_tier: string | null
          id: string
          labor_cost: number | null
          labor_hours: number | null
          notes: string | null
          parts_cost: number | null
          quote_date: string
          quote_number: string
          status: string
          total_cost: number
          updated_at: string
          user_id: string
          valid_until: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          description: string
          estimate_market_avg?: number | null
          estimate_source?: string | null
          estimate_tier?: string | null
          id?: string
          labor_cost?: number | null
          labor_hours?: number | null
          notes?: string | null
          parts_cost?: number | null
          quote_date?: string
          quote_number: string
          status?: string
          total_cost: number
          updated_at?: string
          user_id: string
          valid_until?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          description?: string
          estimate_market_avg?: number | null
          estimate_source?: string | null
          estimate_tier?: string | null
          id?: string
          labor_cost?: number | null
          labor_hours?: number | null
          notes?: string | null
          parts_cost?: number | null
          quote_date?: string
          quote_number?: string
          status?: string
          total_cost?: number
          updated_at?: string
          user_id?: string
          valid_until?: string | null
          vehicle_id?: string | null
        }
        Relationships: []
      }
      rate_limit_entries: {
        Row: {
          key: string
          request_count: number
          window_start: string
        }
        Insert: {
          key: string
          request_count?: number
          window_start?: string
        }
        Update: {
          key?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      receipt_events: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          created_at: string
          currency: string
          event_type: string
          external_reference: string | null
          id: string
          metadata: Json
          method: string | null
          occurred_at: string
          payment_record_id: string | null
          recorded_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          event_type: string
          external_reference?: string | null
          id?: string
          metadata?: Json
          method?: string | null
          occurred_at?: string
          payment_record_id?: string | null
          recorded_by?: string | null
          status: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          event_type?: string
          external_reference?: string | null
          id?: string
          metadata?: Json
          method?: string | null
          occurred_at?: string
          payment_record_id?: string | null
          recorded_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_events_payment_record_id_fkey"
            columns: ["payment_record_id"]
            isOneToOne: false
            referencedRelation: "cash_collection_receipts_v1"
            referencedColumns: ["payment_record_id"]
          },
          {
            foreignKeyName: "receipt_events_payment_record_id_fkey"
            columns: ["payment_record_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_items: {
        Row: {
          actual_amount: number | null
          created_at: string
          expected_amount: number | null
          id: string
          notes: string | null
          reconciliation_run_id: string
          source_id: string | null
          source_type: string
          status: string
          variance_amount: number | null
        }
        Insert: {
          actual_amount?: number | null
          created_at?: string
          expected_amount?: number | null
          id?: string
          notes?: string | null
          reconciliation_run_id: string
          source_id?: string | null
          source_type: string
          status?: string
          variance_amount?: number | null
        }
        Update: {
          actual_amount?: number | null
          created_at?: string
          expected_amount?: number | null
          id?: string
          notes?: string | null
          reconciliation_run_id?: string
          source_id?: string | null
          source_type?: string
          status?: string
          variance_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_items_reconciliation_run_id_fkey"
            columns: ["reconciliation_run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_runs: {
        Row: {
          created_at: string
          id: string
          period_month: string
          source: string
          status: string
          user_id: string
          variance_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          period_month: string
          source: string
          status?: string
          user_id: string
          variance_amount?: number
        }
        Update: {
          created_at?: string
          id?: string
          period_month?: string
          source?: string
          status?: string
          user_id?: string
          variance_amount?: number
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          amount: number
          autopost: boolean
          category_id: string | null
          created_at: string
          day_of_month: number | null
          end_date: string | null
          frequency: string
          id: string
          interval_count: number
          is_active: boolean
          last_generated_at: string | null
          last_generated_expense_id: string | null
          last4: string | null
          name: string
          next_due_date: string
          notes: string | null
          payment_method: string | null
          start_date: string
          updated_at: string
          user_id: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          amount: number
          autopost?: boolean
          category_id?: string | null
          created_at?: string
          day_of_month?: number | null
          end_date?: string | null
          frequency: string
          id?: string
          interval_count?: number
          is_active?: boolean
          last_generated_at?: string | null
          last_generated_expense_id?: string | null
          last4?: string | null
          name: string
          next_due_date: string
          notes?: string | null
          payment_method?: string | null
          start_date?: string
          updated_at?: string
          user_id: string
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          amount?: number
          autopost?: boolean
          category_id?: string | null
          created_at?: string
          day_of_month?: number | null
          end_date?: string | null
          frequency?: string
          id?: string
          interval_count?: number
          is_active?: boolean
          last_generated_at?: string | null
          last_generated_expense_id?: string | null
          last4?: string | null
          name?: string
          next_due_date?: string
          notes?: string | null
          payment_method?: string | null
          start_date?: string
          updated_at?: string
          user_id?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_services: {
        Row: {
          created_at: string
          customer_id: string | null
          frequency: string
          id: string
          interval: number
          is_active: boolean
          next_due_date: string
          service_catalog_id: string
          start_date: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          frequency: string
          id?: string
          interval?: number
          is_active?: boolean
          next_due_date: string
          service_catalog_id: string
          start_date: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          frequency?: string
          id?: string
          interval?: number
          is_active?: boolean
          next_due_date?: string
          service_catalog_id?: string
          start_date?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_services_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_services_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_services_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      resend_email_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          id: string
          internal_status: string
          occurred_at: string
          payload: Json
          provider: string
          provider_message_id: string | null
          recipient_email: string | null
          retry_recommended: boolean
          subject: string | null
          suppression_state: boolean
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          internal_status: string
          occurred_at: string
          payload: Json
          provider?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          retry_recommended?: boolean
          subject?: string | null
          suppression_state?: boolean
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          internal_status?: string
          occurred_at?: string
          payload?: Json
          provider?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          retry_recommended?: boolean
          subject?: string | null
          suppression_state?: boolean
        }
        Relationships: []
      }
      resource_live_locations: {
        Row: {
          accuracy_meters: number | null
          captured_at: string
          freshness_status: string
          heading_degrees: number | null
          latitude: number
          longitude: number
          quality_flags: Json
          received_at: string
          resource_id: string
          source: string
          speed_mps: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          captured_at: string
          freshness_status?: string
          heading_degrees?: number | null
          latitude: number
          longitude: number
          quality_flags?: Json
          received_at?: string
          resource_id: string
          source: string
          speed_mps?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          captured_at?: string
          freshness_status?: string
          heading_degrees?: number | null
          latitude?: number
          longitude?: number
          quality_flags?: Json
          received_at?: string
          resource_id?: string
          source?: string
          speed_mps?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_live_locations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          availability_status: string
          capabilities: Json
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          resource_type: string
          technician_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          availability_status?: string
          capabilities?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          resource_type: string
          technician_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          availability_status?: string
          capabilities?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          resource_type?: string
          technician_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_action_executions: {
        Row: {
          action_type: string
          campaign_enrollment_id: string | null
          created_at: string
          customer_id: string | null
          executed_at: string | null
          id: string
          result_jsonb: Json | null
          rule_id: string | null
          scheduled_for: string | null
          signal_id: string | null
          source_event_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          campaign_enrollment_id?: string | null
          created_at?: string
          customer_id?: string | null
          executed_at?: string | null
          id?: string
          result_jsonb?: Json | null
          rule_id?: string | null
          scheduled_for?: string | null
          signal_id?: string | null
          source_event_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          campaign_enrollment_id?: string | null
          created_at?: string
          customer_id?: string | null
          executed_at?: string | null
          id?: string
          result_jsonb?: Json | null
          rule_id?: string | null
          scheduled_for?: string | null
          signal_id?: string | null
          source_event_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_action_executions_campaign_enrollment_id_fkey"
            columns: ["campaign_enrollment_id"]
            isOneToOne: false
            referencedRelation: "retention_campaign_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_action_executions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_action_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_action_executions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "retention_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_action_executions_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "retention_events"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_backfill_markers: {
        Row: {
          created_at: string
          job_key: string
          last_cursor: string | null
          mismatch_count: number
          notes_jsonb: Json
          processed_count: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          job_key: string
          last_cursor?: string | null
          mismatch_count?: number
          notes_jsonb?: Json
          processed_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          job_key?: string
          last_cursor?: string | null
          mismatch_count?: number
          notes_jsonb?: Json
          processed_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      retention_campaign_enrollments: {
        Row: {
          campaign_id: string
          created_at: string
          current_step: number
          customer_id: string | null
          entered_at: string
          exit_reason: string | null
          exited_at: string | null
          id: string
          status: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          current_step?: number
          customer_id?: string | null
          entered_at?: string
          exit_reason?: string | null
          exited_at?: string | null
          id?: string
          status?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          current_step?: number
          customer_id?: string | null
          entered_at?: string
          exit_reason?: string | null
          exited_at?: string | null
          id?: string
          status?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_campaign_enrollments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "retention_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_campaign_enrollments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_campaign_enrollments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_campaign_steps: {
        Row: {
          action_config_jsonb: Json | null
          action_type: string
          campaign_id: string
          created_at: string
          delay_amount: number
          delay_unit: string
          id: string
          step_order: number
        }
        Insert: {
          action_config_jsonb?: Json | null
          action_type: string
          campaign_id: string
          created_at?: string
          delay_amount?: number
          delay_unit?: string
          id?: string
          step_order?: number
        }
        Update: {
          action_config_jsonb?: Json | null
          action_type?: string
          campaign_id?: string
          created_at?: string
          delay_amount?: number
          delay_unit?: string
          id?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "retention_campaign_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "retention_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_campaigns: {
        Row: {
          campaign_type: Database["public"]["Enums"]["retention_campaign_type"]
          created_at: string
          entry_rules_jsonb: Json | null
          id: string
          name: string
          status: string
          trigger_signal: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_type: Database["public"]["Enums"]["retention_campaign_type"]
          created_at?: string
          entry_rules_jsonb?: Json | null
          id?: string
          name: string
          status?: string
          trigger_signal?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_type?: Database["public"]["Enums"]["retention_campaign_type"]
          created_at?: string
          entry_rules_jsonb?: Json | null
          id?: string
          name?: string
          status?: string
          trigger_signal?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      retention_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          created_at: string
          customer_id: string | null
          event_name: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          payload_jsonb: Json | null
          processed_at: string | null
          processing_error: string | null
          schema_version: number
          source_system: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          created_at?: string
          customer_id?: string | null
          event_name: string
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          payload_jsonb?: Json | null
          processed_at?: string | null
          processing_error?: string | null
          schema_version?: number
          source_system?: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          created_at?: string
          customer_id?: string | null
          event_name?: string
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          payload_jsonb?: Json | null
          processed_at?: string | null
          processing_error?: string | null
          schema_version?: number
          source_system?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_signal_definitions: {
        Row: {
          action_policy: string
          created_at: string
          definition_version: number
          description: string | null
          evaluator_version: number
          is_active: boolean
          label: string
          retired_reason: string | null
          signal_type: string
          subject_kind: string
          updated_at: string
        }
        Insert: {
          action_policy?: string
          created_at?: string
          definition_version?: number
          description?: string | null
          evaluator_version?: number
          is_active?: boolean
          label: string
          retired_reason?: string | null
          signal_type: string
          subject_kind?: string
          updated_at?: string
        }
        Update: {
          action_policy?: string
          created_at?: string
          definition_version?: number
          description?: string | null
          evaluator_version?: number
          is_active?: boolean
          label?: string
          retired_reason?: string | null
          signal_type?: string
          subject_kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      retention_signal_transitions: {
        Row: {
          actor_id: string | null
          actor_kind: string
          evidence_jsonb: Json
          id: string
          new_status: string
          occurred_at: string
          old_status: string | null
          reason_code: string | null
          signal_id: string
          signal_type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          evidence_jsonb?: Json
          id?: string
          new_status: string
          occurred_at?: string
          old_status?: string | null
          reason_code?: string | null
          signal_id: string
          signal_type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          evidence_jsonb?: Json
          id?: string
          new_status?: string
          occurred_at?: string
          old_status?: string | null
          reason_code?: string | null
          signal_id?: string
          signal_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_signal_transitions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "retention_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_signals: {
        Row: {
          created_at: string
          customer_id: string | null
          decision_key: string | null
          definition_version: number
          detected_at: string
          id: string
          payload_jsonb: Json | null
          policy_version: number | null
          resolution_reason: string | null
          resolved_at: string | null
          score: number | null
          signal_type: string
          source_event_id: string | null
          source_fact_id: string | null
          status: Database["public"]["Enums"]["retention_signal_status"]
          suppressed_at: string | null
          suppression_reason: string | null
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          decision_key?: string | null
          definition_version?: number
          detected_at?: string
          id?: string
          payload_jsonb?: Json | null
          policy_version?: number | null
          resolution_reason?: string | null
          resolved_at?: string | null
          score?: number | null
          signal_type: string
          source_event_id?: string | null
          source_fact_id?: string | null
          status?: Database["public"]["Enums"]["retention_signal_status"]
          suppressed_at?: string | null
          suppression_reason?: string | null
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          decision_key?: string | null
          definition_version?: number
          detected_at?: string
          id?: string
          payload_jsonb?: Json | null
          policy_version?: number | null
          resolution_reason?: string | null
          resolved_at?: string | null
          score?: number | null
          signal_type?: string
          source_event_id?: string | null
          source_fact_id?: string | null
          status?: Database["public"]["Enums"]["retention_signal_status"]
          suppressed_at?: string | null
          suppression_reason?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_signals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_signals_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "retention_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_signals_source_fact_id_fkey"
            columns: ["source_fact_id"]
            isOneToOne: false
            referencedRelation: "retention_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_signals_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_vehicle_profiles: {
        Row: {
          avg_days_between_services: number | null
          avg_miles_between_services: number | null
          created_at: string
          customer_id: string | null
          days_overdue: number | null
          engagement_score: number | null
          last_recalculated_at: string | null
          last_service_date: string | null
          last_service_id: string | null
          last_service_mileage: number | null
          lifecycle_status: Database["public"]["Enums"]["vehicle_lifecycle_status"]
          miles_overdue: number | null
          predicted_next_service_date: string | null
          predicted_next_service_mileage: number | null
          updated_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          avg_days_between_services?: number | null
          avg_miles_between_services?: number | null
          created_at?: string
          customer_id?: string | null
          days_overdue?: number | null
          engagement_score?: number | null
          last_recalculated_at?: string | null
          last_service_date?: string | null
          last_service_id?: string | null
          last_service_mileage?: number | null
          lifecycle_status?: Database["public"]["Enums"]["vehicle_lifecycle_status"]
          miles_overdue?: number | null
          predicted_next_service_date?: string | null
          predicted_next_service_mileage?: number | null
          updated_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          avg_days_between_services?: number | null
          avg_miles_between_services?: number | null
          created_at?: string
          customer_id?: string | null
          days_overdue?: number | null
          engagement_score?: number | null
          last_recalculated_at?: string | null
          last_service_date?: string | null
          last_service_id?: string | null
          last_service_mileage?: number | null
          lifecycle_status?: Database["public"]["Enums"]["vehicle_lifecycle_status"]
          miles_overdue?: number | null
          predicted_next_service_date?: string | null
          predicted_next_service_mileage?: number | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_vehicle_profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_vehicle_profiles_last_service_id_fkey"
            columns: ["last_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_vehicle_profiles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          channel: string | null
          clicked_at: string | null
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          email_queue_id: string | null
          error_message: string | null
          id: string
          platform: string
          recipient_email: string
          recipient_name: string | null
          review_url_clicked_at: string | null
          send_at: string | null
          sent_at: string | null
          service_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          clicked_at?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          email_queue_id?: string | null
          error_message?: string | null
          id?: string
          platform?: string
          recipient_email: string
          recipient_name?: string | null
          review_url_clicked_at?: string | null
          send_at?: string | null
          sent_at?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string | null
          clicked_at?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          email_queue_id?: string | null
          error_message?: string | null
          id?: string
          platform?: string
          recipient_email?: string
          recipient_name?: string | null
          review_url_clicked_at?: string | null
          send_at?: string | null
          sent_at?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      route_estimates: {
        Row: {
          actual_distance_meters: number | null
          actual_duration_seconds: number | null
          calculated_at: string
          created_at: string
          distance_meters: number | null
          duration_seconds: number | null
          eta_at: string | null
          id: string
          job_id: string | null
          job_source: string | null
          metadata: Json
          navigation_session_id: string | null
          profile: string
          user_id: string
          variance_reason: string | null
        }
        Insert: {
          actual_distance_meters?: number | null
          actual_duration_seconds?: number | null
          calculated_at?: string
          created_at?: string
          distance_meters?: number | null
          duration_seconds?: number | null
          eta_at?: string | null
          id?: string
          job_id?: string | null
          job_source?: string | null
          metadata?: Json
          navigation_session_id?: string | null
          profile?: string
          user_id: string
          variance_reason?: string | null
        }
        Update: {
          actual_distance_meters?: number | null
          actual_duration_seconds?: number | null
          calculated_at?: string
          created_at?: string
          distance_meters?: number | null
          duration_seconds?: number | null
          eta_at?: string | null
          id?: string
          job_id?: string | null
          job_source?: string | null
          metadata?: Json
          navigation_session_id?: string | null
          profile?: string
          user_id?: string
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_estimates_navigation_session_id_fkey"
            columns: ["navigation_session_id"]
            isOneToOne: false
            referencedRelation: "navigation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      route_stops: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          created_at: string
          dispatch_run_id: string
          distance_to_next_meters: number | null
          estimated_arrival: string | null
          estimated_duration_minutes: number | null
          id: string
          sequence_order: number
          status: string
          travel_time_to_next_seconds: number | null
          updated_at: string
          work_order_id: string
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          created_at?: string
          dispatch_run_id: string
          distance_to_next_meters?: number | null
          estimated_arrival?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          sequence_order: number
          status?: string
          travel_time_to_next_seconds?: number | null
          updated_at?: string
          work_order_id: string
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          created_at?: string
          dispatch_run_id?: string
          distance_to_next_meters?: number | null
          estimated_arrival?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          sequence_order?: number
          status?: string
          travel_time_to_next_seconds?: number | null
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_dispatch_run_id_fkey"
            columns: ["dispatch_run_id"]
            isOneToOne: false
            referencedRelation: "dispatch_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_follow_ups: {
        Row: {
          conversion_value: number | null
          converted: boolean | null
          created_at: string | null
          customer_id: string | null
          declined_service_id: string | null
          email_opened: boolean | null
          email_sent: boolean | null
          error_message: string | null
          executed_at: string | null
          id: string
          link_clicked: boolean | null
          priority: number | null
          rule_id: string | null
          scheduled_for: string
          status: string | null
          trigger_data: Json
          trigger_entity_id: string | null
          trigger_entity_type: string | null
          trigger_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          conversion_value?: number | null
          converted?: boolean | null
          created_at?: string | null
          customer_id?: string | null
          declined_service_id?: string | null
          email_opened?: boolean | null
          email_sent?: boolean | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          link_clicked?: boolean | null
          priority?: number | null
          rule_id?: string | null
          scheduled_for: string
          status?: string | null
          trigger_data?: Json
          trigger_entity_id?: string | null
          trigger_entity_type?: string | null
          trigger_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          conversion_value?: number | null
          converted?: boolean | null
          created_at?: string | null
          customer_id?: string | null
          declined_service_id?: string | null
          email_opened?: boolean | null
          email_sent?: boolean | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          link_clicked?: boolean | null
          priority?: number | null
          rule_id?: string | null
          scheduled_for?: string
          status?: string | null
          trigger_data?: Json
          trigger_entity_id?: string | null
          trigger_entity_type?: string | null
          trigger_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_follow_ups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_follow_ups_declined_service_id_fkey"
            columns: ["declined_service_id"]
            isOneToOne: false
            referencedRelation: "declined_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_follow_ups_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "follow_up_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_templates: {
        Row: {
          auto_follow_up_days: number | null
          color: string | null
          description: string | null
          icon: string | null
          id: string
          max_days_since_service: number | null
          max_lifetime_value: number | null
          max_total_services: number | null
          min_days_since_service: number | null
          min_lifetime_value: number | null
          min_total_services: number | null
          name: string
          priority: number | null
        }
        Insert: {
          auto_follow_up_days?: number | null
          color?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          max_days_since_service?: number | null
          max_lifetime_value?: number | null
          max_total_services?: number | null
          min_days_since_service?: number | null
          min_lifetime_value?: number | null
          min_total_services?: number | null
          name: string
          priority?: number | null
        }
        Update: {
          auto_follow_up_days?: number | null
          color?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          max_days_since_service?: number | null
          max_lifetime_value?: number | null
          max_total_services?: number | null
          min_days_since_service?: number | null
          min_lifetime_value?: number | null
          min_total_services?: number | null
          name?: string
          priority?: number | null
        }
        Relationships: []
      }
      service_assets: {
        Row: {
          asset_id: string
          caption: string | null
          created_at: string
          id: string
          service_id: string
          user_id: string
        }
        Insert: {
          asset_id: string
          caption?: string | null
          created_at?: string
          id?: string
          service_id: string
          user_id: string
        }
        Update: {
          asset_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          service_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_assets_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          allows_manual_fitment: boolean
          category: string | null
          category_id: string | null
          configuration_schema_version: number
          created_at: string
          default_price: number
          description: string | null
          estimated_duration: number | null
          id: string
          inspection_template_id: string | null
          is_active: boolean
          is_upsell: boolean
          labor_rate: number | null
          name: string
          notes: string | null
          parts_required: string | null
          pricing_mode: string
          required_filter_type:
            | Database["public"]["Enums"]["filter_type"]
            | null
          requires_fitment_lookup: boolean
          requires_inventory_selection: boolean
          requires_tire_quantity: boolean
          service_intent: string | null
          service_vertical: string
          skill_level: string | null
          sort_order: number | null
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allows_manual_fitment?: boolean
          category?: string | null
          category_id?: string | null
          configuration_schema_version?: number
          created_at?: string
          default_price?: number
          description?: string | null
          estimated_duration?: number | null
          id?: string
          inspection_template_id?: string | null
          is_active?: boolean
          is_upsell?: boolean
          labor_rate?: number | null
          name: string
          notes?: string | null
          parts_required?: string | null
          pricing_mode?: string
          required_filter_type?:
            | Database["public"]["Enums"]["filter_type"]
            | null
          requires_fitment_lookup?: boolean
          requires_inventory_selection?: boolean
          requires_tire_quantity?: boolean
          service_intent?: string | null
          service_vertical?: string
          skill_level?: string | null
          sort_order?: number | null
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allows_manual_fitment?: boolean
          category?: string | null
          category_id?: string | null
          configuration_schema_version?: number
          created_at?: string
          default_price?: number
          description?: string | null
          estimated_duration?: number | null
          id?: string
          inspection_template_id?: string | null
          is_active?: boolean
          is_upsell?: boolean
          labor_rate?: number | null
          name?: string
          notes?: string | null
          parts_required?: string | null
          pricing_mode?: string
          required_filter_type?:
            | Database["public"]["Enums"]["filter_type"]
            | null
          requires_fitment_lookup?: boolean
          requires_inventory_selection?: boolean
          requires_tire_quantity?: boolean
          service_intent?: string | null
          service_vertical?: string
          skill_level?: string | null
          sort_order?: number | null
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_catalog_inspection_template_id_fkey"
            columns: ["inspection_template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_catalog_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "service_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog_benchmarks: {
        Row: {
          captured_at: string
          created_at: string
          dealer_avg: number
          dealer_high: number
          dealer_low: number
          id: string
          independent_avg: number
          independent_high: number
          independent_low: number
          repair_title: string
          service_catalog_id: string
          shop_price: number | null
          updated_at: string
          user_id: string
          vehicle_label: string | null
          vin: string | null
        }
        Insert: {
          captured_at?: string
          created_at?: string
          dealer_avg?: number
          dealer_high?: number
          dealer_low?: number
          id?: string
          independent_avg?: number
          independent_high?: number
          independent_low?: number
          repair_title: string
          service_catalog_id: string
          shop_price?: number | null
          updated_at?: string
          user_id: string
          vehicle_label?: string | null
          vin?: string | null
        }
        Update: {
          captured_at?: string
          created_at?: string
          dealer_avg?: number
          dealer_high?: number
          dealer_low?: number
          id?: string
          independent_avg?: number
          independent_high?: number
          independent_low?: number
          repair_title?: string
          service_catalog_id?: string
          shop_price?: number | null
          updated_at?: string
          user_id?: string
          vehicle_label?: string | null
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_benchmarks_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog_parts: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          is_required: boolean
          notes: string | null
          quantity: number | null
          service_catalog_id: string
          unit: string
          updated_at: string
          use_vehicle_oil_capacity: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          is_required?: boolean
          notes?: string | null
          quantity?: number | null
          service_catalog_id: string
          unit?: string
          updated_at?: string
          use_vehicle_oil_capacity?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          is_required?: boolean
          notes?: string | null
          quantity?: number | null
          service_catalog_id?: string
          unit?: string
          updated_at?: string
          use_vehicle_oil_capacity?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_parts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_catalog_parts_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          booking_requirements: string[]
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          shows_fluid_specs: boolean
          sort_order: number | null
          vehicle_selector: string
        }
        Insert: {
          booking_requirements?: string[]
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id: string
          name: string
          parent_id?: string | null
          shows_fluid_specs?: boolean
          sort_order?: number | null
          vehicle_selector?: string
        }
        Update: {
          booking_requirements?: string[]
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          shows_fluid_specs?: boolean
          sort_order?: number | null
          vehicle_selector?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      service_images: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          image_type: string | null
          image_url: string
          service_id: string
          sort_order: number | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          image_type?: string | null
          image_url: string
          service_id: string
          sort_order?: number | null
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          image_type?: string | null
          image_url?: string
          service_id?: string
          sort_order?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_images_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_inspections: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          inspection_date: string
          inspector_name: string | null
          notes: string | null
          service_id: string | null
          status: string | null
          template_id: string | null
          template_name: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          inspection_date?: string
          inspector_name?: string | null
          notes?: string | null
          service_id?: string | null
          status?: string | null
          template_id?: string | null
          template_name: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          inspection_date?: string
          inspector_name?: string | null
          notes?: string | null
          service_id?: string | null
          status?: string | null
          template_id?: string | null
          template_name?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_inspections_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_inspections_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_inspections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_inspections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_items: {
        Row: {
          created_at: string
          description: string
          id: string
          inventory_item_id: string | null
          quantity: number
          service_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          inventory_item_id?: string | null
          quantity?: number
          service_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          inventory_item_id?: string | null
          quantity?: number
          service_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_package_items: {
        Row: {
          created_at: string | null
          id: string
          override_price: number | null
          package_id: string
          quantity: number | null
          service_catalog_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          override_price?: number | null
          package_id: string
          quantity?: number | null
          service_catalog_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          override_price?: number | null
          package_id?: string
          quantity?: number | null
          service_catalog_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_package_items_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      service_package_template_items: {
        Row: {
          created_at: string | null
          id: string
          item_description: string | null
          item_name: string
          package_template_id: string
          quantity: number | null
          service_template_id: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_description?: string | null
          item_name: string
          package_template_id: string
          quantity?: number | null
          service_template_id?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_description?: string | null
          item_name?: string
          package_template_id?: string
          quantity?: number | null
          service_template_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_package_template_items_package_template_id_fkey"
            columns: ["package_template_id"]
            isOneToOne: false
            referencedRelation: "service_package_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_package_template_items_service_template_id_fkey"
            columns: ["service_template_id"]
            isOneToOne: false
            referencedRelation: "service_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      service_package_templates: {
        Row: {
          created_at: string | null
          description: string | null
          discount_type: string
          discount_value: number
          estimated_duration: number | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          estimated_duration?: number | null
          id: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          estimated_duration?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      service_packages: {
        Row: {
          created_at: string | null
          description: string | null
          discount_type: string | null
          discount_value: number | null
          estimated_duration: number | null
          id: string
          is_active: boolean | null
          name: string
          package_price: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          estimated_duration?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          package_price?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          estimated_duration?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          package_price?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      service_playbook_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          service_category: string
          sort_order: number
          steps: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          service_category: string
          sort_order?: number
          steps?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          service_category?: string
          sort_order?: number
          steps?: Json
        }
        Relationships: []
      }
      service_playbooks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          service_catalog_id: string | null
          steps: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          service_catalog_id?: string | null
          steps?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          service_catalog_id?: string | null
          steps?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_playbooks_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reminders: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          last_service_date: string | null
          last_service_id: string | null
          mileage_interval: number | null
          reminder_date: string
          sent_at: string | null
          service_type: string
          status: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          last_service_date?: string | null
          last_service_id?: string | null
          mileage_interval?: number | null
          reminder_date: string
          sent_at?: string | null
          service_type: string
          status?: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          last_service_date?: string | null
          last_service_id?: string | null
          mileage_interval?: number | null
          reminder_date?: string
          sent_at?: string | null
          service_type?: string
          status?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reminders_last_service_id_fkey"
            columns: ["last_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reminders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_template_dependencies: {
        Row: {
          auto_add: boolean | null
          created_at: string | null
          dependency_type: string
          depends_on_service_id: string
          id: string
          required: boolean | null
          service_id: string
        }
        Insert: {
          auto_add?: boolean | null
          created_at?: string | null
          dependency_type: string
          depends_on_service_id: string
          id?: string
          required?: boolean | null
          service_id: string
        }
        Update: {
          auto_add?: boolean | null
          created_at?: string | null
          dependency_type?: string
          depends_on_service_id?: string
          id?: string
          required?: boolean | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_template_dependencies_depends_on_service_id_fkey"
            columns: ["depends_on_service_id"]
            isOneToOne: false
            referencedRelation: "service_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_template_dependencies_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      service_templates: {
        Row: {
          allows_manual_fitment: boolean
          category_id: string | null
          created_at: string | null
          default_price: number | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          is_upsell: boolean
          labor_rate: number | null
          name: string
          notes: string | null
          parts_required: string[] | null
          pricing_mode: string
          requires_fitment_lookup: boolean
          requires_inventory_selection: boolean
          requires_tire_quantity: boolean
          service_intent: string | null
          service_vertical: string
          skill_level: string | null
          sort_order: number
        }
        Insert: {
          allows_manual_fitment?: boolean
          category_id?: string | null
          created_at?: string | null
          default_price?: number | null
          description?: string | null
          duration_minutes?: number | null
          id: string
          is_active?: boolean | null
          is_upsell?: boolean
          labor_rate?: number | null
          name: string
          notes?: string | null
          parts_required?: string[] | null
          pricing_mode?: string
          requires_fitment_lookup?: boolean
          requires_inventory_selection?: boolean
          requires_tire_quantity?: boolean
          service_intent?: string | null
          service_vertical?: string
          skill_level?: string | null
          sort_order?: number
        }
        Update: {
          allows_manual_fitment?: boolean
          category_id?: string | null
          created_at?: string | null
          default_price?: number | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_upsell?: boolean
          labor_rate?: number | null
          name?: string
          notes?: string | null
          parts_required?: string[] | null
          pricing_mode?: string
          requires_fitment_lookup?: boolean
          requires_inventory_selection?: boolean
          requires_tire_quantity?: boolean
          service_intent?: string | null
          service_vertical?: string
          skill_level?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      service_timeline: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          service_id: string
          status: string
          timestamp: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          service_id: string
          status: string
          timestamp?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          service_id?: string
          status?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_timeline_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_zones: {
        Row: {
          boundary_geojson: Json | null
          center_lat: number | null
          center_lng: number | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          priority: number
          radius_miles: number | null
          updated_at: string
          user_id: string
          zip_codes: string[] | null
          zone_type: string
        }
        Insert: {
          boundary_geojson?: Json | null
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          radius_miles?: number | null
          updated_at?: string
          user_id: string
          zip_codes?: string[] | null
          zone_type?: string
        }
        Update: {
          boundary_geojson?: Json | null
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          radius_miles?: number | null
          updated_at?: string
          user_id?: string
          zip_codes?: string[] | null
          zone_type?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          appointment_id: string | null
          completed_at: string | null
          created_at: string
          customer_id: string | null
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          description: string
          discount_amount: number | null
          discount_type: string | null
          duration_minutes: number | null
          id: string
          import_batch_id: string | null
          labor_cost: number | null
          labor_hours: number | null
          license_plate: string | null
          mileage: number | null
          notes: string | null
          odometer_measure: string | null
          oil_quarts_used: number | null
          origin_source: string | null
          paid_amount: number | null
          parts_cost: number | null
          parts_used: string | null
          payment_status: string | null
          service_date: string
          service_number: string | null
          service_type: string
          shop_supplies: number | null
          started_at: string | null
          status: string
          tax_amount: number | null
          tax_rate: number | null
          technician: string | null
          total_cost: number
          updated_at: string
          user_id: string
          vehicle_engine: string | null
          vehicle_id: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_trim: string | null
          vehicle_year: number | null
          vin_captured: string | null
        }
        Insert: {
          appointment_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          description: string
          discount_amount?: number | null
          discount_type?: string | null
          duration_minutes?: number | null
          id?: string
          import_batch_id?: string | null
          labor_cost?: number | null
          labor_hours?: number | null
          license_plate?: string | null
          mileage?: number | null
          notes?: string | null
          odometer_measure?: string | null
          oil_quarts_used?: number | null
          origin_source?: string | null
          paid_amount?: number | null
          parts_cost?: number | null
          parts_used?: string | null
          payment_status?: string | null
          service_date?: string
          service_number?: string | null
          service_type: string
          shop_supplies?: number | null
          started_at?: string | null
          status?: string
          tax_amount?: number | null
          tax_rate?: number | null
          technician?: string | null
          total_cost: number
          updated_at?: string
          user_id: string
          vehicle_engine?: string | null
          vehicle_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_trim?: string | null
          vehicle_year?: number | null
          vin_captured?: string | null
        }
        Update: {
          appointment_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          description?: string
          discount_amount?: number | null
          discount_type?: string | null
          duration_minutes?: number | null
          id?: string
          import_batch_id?: string | null
          labor_cost?: number | null
          labor_hours?: number | null
          license_plate?: string | null
          mileage?: number | null
          notes?: string | null
          odometer_measure?: string | null
          oil_quarts_used?: number | null
          origin_source?: string | null
          paid_amount?: number | null
          parts_cost?: number | null
          parts_used?: string | null
          payment_status?: string | null
          service_date?: string
          service_number?: string | null
          service_type?: string
          shop_supplies?: number | null
          started_at?: string | null
          status?: string
          tax_amount?: number | null
          tax_rate?: number | null
          technician?: string | null
          total_cost?: number
          updated_at?: string
          user_id?: string
          vehicle_engine?: string | null
          vehicle_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_trim?: string | null
          vehicle_year?: number | null
          vin_captured?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_services_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_credit_purchases: {
        Row: {
          amount_cents: number | null
          bundle_key: string
          created_at: string
          id: string
          kind: string
          stripe_ref: string
          units: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number | null
          bundle_key: string
          created_at?: string
          id?: string
          kind: string
          stripe_ref: string
          units: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number | null
          bundle_key?: string
          created_at?: string
          id?: string
          kind?: string
          stripe_ref?: string
          units?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_inbound: {
        Row: {
          correlation_data: string | null
          created_at: string
          from_number: string
          id: string
          message_id: string | null
          message_text: string
          provider: string
          received_at: string
          to_number: string
          user_id: string
        }
        Insert: {
          correlation_data?: string | null
          created_at?: string
          from_number: string
          id?: string
          message_id?: string | null
          message_text: string
          provider?: string
          received_at?: string
          to_number: string
          user_id: string
        }
        Update: {
          correlation_data?: string | null
          created_at?: string
          from_number?: string
          id?: string
          message_id?: string | null
          message_text?: string
          provider?: string
          received_at?: string
          to_number?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          appointment_id: string | null
          correlation_id: string | null
          created_at: string
          deleted_at: string | null
          delivered_at: string | null
          direction: string
          error_message: string | null
          failed_at: string | null
          from_number: string | null
          id: string
          message_body: string | null
          message_type: string | null
          provider: string | null
          provider_error_code: string | null
          provider_status: string | null
          recipient_hash: string | null
          status: string
          to_number: string | null
          to_number_last4: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          correlation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          failed_at?: string | null
          from_number?: string | null
          id?: string
          message_body?: string | null
          message_type?: string | null
          provider?: string | null
          provider_error_code?: string | null
          provider_status?: string | null
          recipient_hash?: string | null
          status?: string
          to_number?: string | null
          to_number_last4?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          correlation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          failed_at?: string | null
          from_number?: string | null
          id?: string
          message_body?: string | null
          message_type?: string | null
          provider?: string | null
          provider_error_code?: string | null
          provider_status?: string | null
          recipient_hash?: string | null
          status?: string
          to_number?: string | null
          to_number_last4?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_opt_outs: {
        Row: {
          created_at: string
          id: string
          opted_in_at: string | null
          opted_out_at: string
          phone_hash: string
          phone_last4: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          opted_in_at?: string | null
          opted_out_at?: string
          phone_hash: string
          phone_last4?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          opted_in_at?: string | null
          opted_out_at?: string
          phone_hash?: string
          phone_last4?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_preferences: {
        Row: {
          cancellation_enabled: boolean
          confirmation_enabled: boolean
          created_at: string
          reminder_enabled: boolean
          reminder_hours_before: number
          reschedule_enabled: boolean
          template_cancellation: string | null
          template_confirmation: string | null
          template_reminder: string | null
          template_reschedule: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancellation_enabled?: boolean
          confirmation_enabled?: boolean
          created_at?: string
          reminder_enabled?: boolean
          reminder_hours_before?: number
          reschedule_enabled?: boolean
          template_cancellation?: string | null
          template_confirmation?: string | null
          template_reminder?: string | null
          template_reschedule?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancellation_enabled?: boolean
          confirmation_enabled?: boolean
          created_at?: string
          reminder_enabled?: boolean
          reminder_hours_before?: number
          reschedule_enabled?: boolean
          template_cancellation?: string | null
          template_confirmation?: string | null
          template_reminder?: string | null
          template_reschedule?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_subscriptions: {
        Row: {
          consent_ip: unknown
          consent_source: string | null
          consent_status: string
          consent_text_snapshot: string | null
          consent_ts: string | null
          consent_user_agent: string | null
          created_at: string
          customer_id: string | null
          id: string
          jurisdiction: string | null
          marketing_allowed: boolean
          opt_in_ts: string | null
          opt_out_keyword: string | null
          opt_out_ts: string | null
          phone_hash: string
          phone_last4: string | null
          transactional_allowed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_ip?: unknown
          consent_source?: string | null
          consent_status?: string
          consent_text_snapshot?: string | null
          consent_ts?: string | null
          consent_user_agent?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          jurisdiction?: string | null
          marketing_allowed?: boolean
          opt_in_ts?: string | null
          opt_out_keyword?: string | null
          opt_out_ts?: string | null
          phone_hash: string
          phone_last4?: string | null
          transactional_allowed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_ip?: unknown
          consent_source?: string | null
          consent_status?: string
          consent_text_snapshot?: string | null
          consent_ts?: string | null
          consent_user_agent?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          jurisdiction?: string | null
          marketing_allowed?: boolean
          opt_in_ts?: string | null
          opt_out_keyword?: string | null
          opt_out_ts?: string | null
          phone_hash?: string
          phone_last4?: string | null
          transactional_allowed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_plan_templates: {
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
          included_services_description: Json
          is_active: boolean
          max_services_per_cycle: number | null
          name: string
          price: number
          price_max: number | null
          price_min: number | null
          tier: string
          updated_at: string
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
          included_services_description?: Json
          is_active?: boolean
          max_services_per_cycle?: number | null
          name: string
          price?: number
          price_max?: number | null
          price_min?: number | null
          tier?: string
          updated_at?: string
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
          included_services_description?: Json
          is_active?: boolean
          max_services_per_cycle?: number | null
          name?: string
          price?: number
          price_max?: number | null
          price_min?: number | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
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
      subscription_usage: {
        Row: {
          appointments_count: number
          created_at: string
          customers_count: number
          id: string
          updated_at: string
          usage_month: string
          user_id: string
        }
        Insert: {
          appointments_count?: number
          created_at?: string
          customers_count?: number
          id?: string
          updated_at?: string
          usage_month: string
          user_id: string
        }
        Update: {
          appointments_count?: number
          created_at?: string
          customers_count?: number
          id?: string
          updated_at?: string
          usage_month?: string
          user_id?: string
        }
        Relationships: []
      }
      tax_rates: {
        Row: {
          city: string | null
          city_rate: number | null
          combined_rate: number | null
          county: string | null
          county_rate: number | null
          created_at: string | null
          effective_date: string | null
          expires_date: string | null
          id: string
          is_active: boolean | null
          postal_code: string | null
          special_rate: number | null
          state_code: string
          state_rate: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          city_rate?: number | null
          combined_rate?: number | null
          county?: string | null
          county_rate?: number | null
          created_at?: string | null
          effective_date?: string | null
          expires_date?: string | null
          id?: string
          is_active?: boolean | null
          postal_code?: string | null
          special_rate?: number | null
          state_code: string
          state_rate?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          city_rate?: number | null
          combined_rate?: number | null
          county?: string | null
          county_rate?: number | null
          created_at?: string | null
          effective_date?: string | null
          expires_date?: string | null
          id?: string
          is_active?: boolean | null
          postal_code?: string | null
          special_rate?: number | null
          state_code?: string
          state_rate?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invitation_token: string
          name: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invitation_token?: string
          name: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invitation_token?: string
          name?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_user_links: {
        Row: {
          created_at: string
          id: string
          invitation_id: string | null
          member_user_id: string
          owner_user_id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitation_id?: string | null
          member_user_id: string
          owner_user_id: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invitation_id?: string | null
          member_user_id?: string
          owner_user_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_user_links_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "team_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
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
        Relationships: []
      }
      technician_appraisals: {
        Row: {
          areas_for_improvement: string | null
          comments: string | null
          created_at: string
          customer_service_rating: number | null
          goals_for_next_period: string | null
          id: string
          is_signed_by_tech: boolean | null
          overall_rating: number | null
          reliability_rating: number | null
          review_date: string
          review_period_end: string | null
          review_period_start: string | null
          reviewer_id: string | null
          signed_at: string | null
          strengths: string | null
          technical_proficiency_rating: number | null
          technician_comments: string | null
          technician_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          areas_for_improvement?: string | null
          comments?: string | null
          created_at?: string
          customer_service_rating?: number | null
          goals_for_next_period?: string | null
          id?: string
          is_signed_by_tech?: boolean | null
          overall_rating?: number | null
          reliability_rating?: number | null
          review_date: string
          review_period_end?: string | null
          review_period_start?: string | null
          reviewer_id?: string | null
          signed_at?: string | null
          strengths?: string | null
          technical_proficiency_rating?: number | null
          technician_comments?: string | null
          technician_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          areas_for_improvement?: string | null
          comments?: string | null
          created_at?: string
          customer_service_rating?: number | null
          goals_for_next_period?: string | null
          id?: string
          is_signed_by_tech?: boolean | null
          overall_rating?: number | null
          reliability_rating?: number | null
          review_date?: string
          review_period_end?: string | null
          review_period_start?: string | null
          reviewer_id?: string | null
          signed_at?: string | null
          strengths?: string | null
          technical_proficiency_rating?: number | null
          technician_comments?: string | null
          technician_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_appraisals_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_availability: {
        Row: {
          created_at: string
          end_time: string
          id: string
          is_available: boolean | null
          max_jobs_per_day: number | null
          service_radius_miles: number | null
          start_time: string
          technician_id: string
          updated_at: string
          user_id: string
          weekday: string
        }
        Insert: {
          created_at?: string
          end_time?: string
          id?: string
          is_available?: boolean | null
          max_jobs_per_day?: number | null
          service_radius_miles?: number | null
          start_time?: string
          technician_id: string
          updated_at?: string
          user_id: string
          weekday: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          is_available?: boolean | null
          max_jobs_per_day?: number | null
          service_radius_miles?: number | null
          start_time?: string
          technician_id?: string
          updated_at?: string
          user_id?: string
          weekday?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_availability_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_blackout_dates: {
        Row: {
          blackout_date: string
          created_at: string
          id: string
          reason: string | null
          technician_id: string
          user_id: string
        }
        Insert: {
          blackout_date: string
          created_at?: string
          id?: string
          reason?: string | null
          technician_id: string
          user_id: string
        }
        Update: {
          blackout_date?: string
          created_at?: string
          id?: string
          reason?: string | null
          technician_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_blackout_dates_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_daily_load: {
        Row: {
          actual_hours: number | null
          created_at: string
          id: string
          jobs_completed: number | null
          jobs_scheduled: number | null
          load_date: string
          overtime_hours: number | null
          revenue_generated: number | null
          scheduled_hours: number | null
          technician_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_hours?: number | null
          created_at?: string
          id?: string
          jobs_completed?: number | null
          jobs_scheduled?: number | null
          load_date: string
          overtime_hours?: number | null
          revenue_generated?: number | null
          scheduled_hours?: number | null
          technician_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_hours?: number | null
          created_at?: string
          id?: string
          jobs_completed?: number | null
          jobs_scheduled?: number | null
          load_date?: string
          overtime_hours?: number | null
          revenue_generated?: number | null
          scheduled_hours?: number | null
          technician_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_daily_load_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          document_name: string
          document_type: string
          expiry_date: string | null
          expiry_enforced_at: string | null
          file_url: string
          id: string
          metadata: Json | null
          status: string | null
          technician_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          document_name: string
          document_type: string
          expiry_date?: string | null
          expiry_enforced_at?: string | null
          file_url: string
          id?: string
          metadata?: Json | null
          status?: string | null
          technician_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          document_name?: string
          document_type?: string
          expiry_date?: string | null
          expiry_enforced_at?: string | null
          file_url?: string
          id?: string
          metadata?: Json | null
          status?: string | null
          technician_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_documents_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_emergency_contacts: {
        Row: {
          contact_name: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean | null
          phone: string
          relationship: string | null
          technician_id: string
          user_id: string
        }
        Insert: {
          contact_name: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean | null
          phone: string
          relationship?: string | null
          technician_id: string
          user_id: string
        }
        Update: {
          contact_name?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean | null
          phone?: string
          relationship?: string | null
          technician_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_emergency_contacts_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_incidents: {
        Row: {
          at_fault: boolean | null
          attachments: string[] | null
          created_at: string
          damage_amount: number | null
          description: string
          id: string
          incident_date: string
          incident_type: string
          reported_to_insurance: boolean | null
          resolution_notes: string | null
          resolution_status: string | null
          resolved_at: string | null
          technician_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          at_fault?: boolean | null
          attachments?: string[] | null
          created_at?: string
          damage_amount?: number | null
          description: string
          id?: string
          incident_date: string
          incident_type: string
          reported_to_insurance?: boolean | null
          resolution_notes?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          technician_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          at_fault?: boolean | null
          attachments?: string[] | null
          created_at?: string
          damage_amount?: number | null
          description?: string
          id?: string
          incident_date?: string
          incident_type?: string
          reported_to_insurance?: boolean | null
          resolution_notes?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          technician_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_incidents_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_inventory_usage: {
        Row: {
          appointment_id: string | null
          created_at: string
          filter_part_number: string | null
          filter_used: boolean | null
          id: string
          notes: string | null
          oil_quarts_used: number | null
          oil_type: string | null
          other_materials: Json | null
          parts_cost: number | null
          service_date: string
          service_id: string | null
          technician_id: string
          user_id: string
          waste_oil_collected_quarts: number | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          filter_part_number?: string | null
          filter_used?: boolean | null
          id?: string
          notes?: string | null
          oil_quarts_used?: number | null
          oil_type?: string | null
          other_materials?: Json | null
          parts_cost?: number | null
          service_date?: string
          service_id?: string | null
          technician_id: string
          user_id: string
          waste_oil_collected_quarts?: number | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          filter_part_number?: string | null
          filter_used?: boolean | null
          id?: string
          notes?: string | null
          oil_quarts_used?: number | null
          oil_type?: string | null
          other_materials?: Json | null
          parts_cost?: number | null
          service_date?: string
          service_id?: string | null
          technician_id?: string
          user_id?: string
          waste_oil_collected_quarts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "technician_inventory_usage_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_inventory_usage_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_inventory_usage_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_job_logs: {
        Row: {
          after_photos: string[] | null
          appointment_id: string | null
          before_photos: string[] | null
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          customer_rating: number | null
          id: string
          on_site_time_minutes: number | null
          parts_cost: number | null
          revenue_generated: number | null
          service_id: string | null
          status: string | null
          status_notes: string | null
          technician_id: string
          total_time_minutes: number | null
          travel_time_minutes: number | null
          updated_at: string
          upsell_amount: number | null
          user_id: string
        }
        Insert: {
          after_photos?: string[] | null
          appointment_id?: string | null
          before_photos?: string[] | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          customer_rating?: number | null
          id?: string
          on_site_time_minutes?: number | null
          parts_cost?: number | null
          revenue_generated?: number | null
          service_id?: string | null
          status?: string | null
          status_notes?: string | null
          technician_id: string
          total_time_minutes?: number | null
          travel_time_minutes?: number | null
          updated_at?: string
          upsell_amount?: number | null
          user_id: string
        }
        Update: {
          after_photos?: string[] | null
          appointment_id?: string | null
          before_photos?: string[] | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          customer_rating?: number | null
          id?: string
          on_site_time_minutes?: number | null
          parts_cost?: number | null
          revenue_generated?: number | null
          service_id?: string | null
          status?: string | null
          status_notes?: string | null
          technician_id?: string
          total_time_minutes?: number | null
          travel_time_minutes?: number | null
          updated_at?: string
          upsell_amount?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_job_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_job_logs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_job_logs_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          denial_reason: string | null
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          start_date: string
          status: string | null
          technician_id: string
          total_days: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          denial_reason?: string | null
          end_date: string
          id?: string
          leave_type: string
          reason?: string | null
          start_date: string
          status?: string | null
          technician_id: string
          total_days?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          denial_reason?: string | null
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          start_date?: string
          status?: string | null
          technician_id?: string
          total_days?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_leave_requests_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_lifecycle_events: {
        Row: {
          actor_user_id: string
          created_at: string
          details: Json
          event_type: string
          id: string
          technician_id: string
          user_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          technician_id: string
          user_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          technician_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_lifecycle_events_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_notification_preferences: {
        Row: {
          created_at: string
          customer_email_enabled: boolean
          customer_sms_enabled: boolean
          dispatch_push_enabled: boolean
          offline_cache_enabled: boolean
          push_notifications_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_email_enabled?: boolean
          customer_sms_enabled?: boolean
          dispatch_push_enabled?: boolean
          offline_cache_enabled?: boolean
          push_notifications_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_email_enabled?: boolean
          customer_sms_enabled?: boolean
          dispatch_push_enabled?: boolean
          offline_cache_enabled?: boolean
          push_notifications_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      technician_onboarding_tasks: {
        Row: {
          category: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          due_date: string | null
          id: string
          is_completed: boolean | null
          notes: string | null
          task_name: string
          technician_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          task_name: string
          technician_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          task_name?: string
          technician_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_onboarding_tasks_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_payroll_cycles: {
        Row: {
          base_pay: number | null
          bonuses: number | null
          commission_earned: number | null
          created_at: string
          cycle_end: string
          cycle_start: string
          deductions: number | null
          final_payout: number | null
          gross_revenue_generated: number | null
          id: string
          notes: string | null
          overtime_hours: number | null
          overtime_pay: number | null
          payout_date: string | null
          payout_status: string | null
          regular_hours: number | null
          technician_id: string
          total_hours: number | null
          total_jobs: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_pay?: number | null
          bonuses?: number | null
          commission_earned?: number | null
          created_at?: string
          cycle_end: string
          cycle_start: string
          deductions?: number | null
          final_payout?: number | null
          gross_revenue_generated?: number | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          overtime_pay?: number | null
          payout_date?: string | null
          payout_status?: string | null
          regular_hours?: number | null
          technician_id: string
          total_hours?: number | null
          total_jobs?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_pay?: number | null
          bonuses?: number | null
          commission_earned?: number | null
          created_at?: string
          cycle_end?: string
          cycle_start?: string
          deductions?: number | null
          final_payout?: number | null
          gross_revenue_generated?: number | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          overtime_pay?: number | null
          payout_date?: string | null
          payout_status?: string | null
          regular_hours?: number | null
          technician_id?: string
          total_hours?: number | null
          total_jobs?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_payroll_cycles_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_skills: {
        Row: {
          certification_level: string | null
          certification_number: string | null
          certified_by: string | null
          created_at: string
          expiration_date: string | null
          id: string
          is_active: boolean | null
          issue_date: string | null
          notes: string | null
          skill_type: string
          technician_id: string
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          certification_level?: string | null
          certification_number?: string | null
          certified_by?: string | null
          created_at?: string
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          issue_date?: string | null
          notes?: string | null
          skill_type: string
          technician_id: string
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          certification_level?: string | null
          certification_number?: string | null
          certified_by?: string | null
          created_at?: string
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          issue_date?: string | null
          notes?: string | null
          skill_type?: string
          technician_id?: string
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "technician_skills_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_transition_idempotency_keys: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          job_id: string
          job_source: string
          next_status: string
          result: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          job_id: string
          job_source?: string
          next_status: string
          result?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          job_id?: string
          job_source?: string
          next_status?: string
          result?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      technicians: {
        Row: {
          account_status: string
          address: string | null
          assigned_at: string | null
          auth_user_id: string | null
          avatar_url: string | null
          avg_job_duration_minutes: number | null
          background_check_status: string | null
          base_hourly_rate: number | null
          bio: string | null
          callback_rate: number | null
          certifications: Json | null
          commission_percentage: number | null
          created_at: string
          current_location: Json | null
          customer_rating_avg: number | null
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          deactivated_at: string | null
          deactivated_by: string | null
          deleted_at: string | null
          display_name: string | null
          drivers_license_expiry: string | null
          drivers_license_number: string | null
          drivers_license_url: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_type: string | null
          hire_date: string | null
          home_lat: number | null
          home_lng: number | null
          home_zip: string | null
          hourly_rate: number | null
          id: string
          import_batch_id: string | null
          insurance_verified: boolean | null
          invitation_id: string | null
          is_active: boolean | null
          jobs_completed_mtd: number | null
          last_location_update: string | null
          license_expiration_date: string | null
          location_tracking_enabled: boolean | null
          max_daily_capacity_hours: number | null
          max_jobs_per_day: number | null
          name: string
          offboarding_notes: string | null
          origin_source: string | null
          overtime_rate: number | null
          payroll_type: string | null
          performance_score: number | null
          phone: string | null
          redo_rate: number | null
          retained_auth_user_id: string | null
          revenue_generated_mtd: number | null
          service_radius_miles: number | null
          skills: string[] | null
          status: string
          team_id: string | null
          updated_at: string
          upsell_rate: number | null
          user_id: string
          weekly_capacity_hours: number | null
          working_hours: Json | null
        }
        Insert: {
          account_status?: string
          address?: string | null
          assigned_at?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          avg_job_duration_minutes?: number | null
          background_check_status?: string | null
          base_hourly_rate?: number | null
          bio?: string | null
          callback_rate?: number | null
          certifications?: Json | null
          commission_percentage?: number | null
          created_at?: string
          current_location?: Json | null
          customer_rating_avg?: number | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          deactivated_at?: string | null
          deactivated_by?: string | null
          deleted_at?: string | null
          display_name?: string | null
          drivers_license_expiry?: string | null
          drivers_license_number?: string | null
          drivers_license_url?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string | null
          hire_date?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_zip?: string | null
          hourly_rate?: number | null
          id?: string
          import_batch_id?: string | null
          insurance_verified?: boolean | null
          invitation_id?: string | null
          is_active?: boolean | null
          jobs_completed_mtd?: number | null
          last_location_update?: string | null
          license_expiration_date?: string | null
          location_tracking_enabled?: boolean | null
          max_daily_capacity_hours?: number | null
          max_jobs_per_day?: number | null
          name: string
          offboarding_notes?: string | null
          origin_source?: string | null
          overtime_rate?: number | null
          payroll_type?: string | null
          performance_score?: number | null
          phone?: string | null
          redo_rate?: number | null
          retained_auth_user_id?: string | null
          revenue_generated_mtd?: number | null
          service_radius_miles?: number | null
          skills?: string[] | null
          status?: string
          team_id?: string | null
          updated_at?: string
          upsell_rate?: number | null
          user_id: string
          weekly_capacity_hours?: number | null
          working_hours?: Json | null
        }
        Update: {
          account_status?: string
          address?: string | null
          assigned_at?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          avg_job_duration_minutes?: number | null
          background_check_status?: string | null
          base_hourly_rate?: number | null
          bio?: string | null
          callback_rate?: number | null
          certifications?: Json | null
          commission_percentage?: number | null
          created_at?: string
          current_location?: Json | null
          customer_rating_avg?: number | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          deactivated_at?: string | null
          deactivated_by?: string | null
          deleted_at?: string | null
          display_name?: string | null
          drivers_license_expiry?: string | null
          drivers_license_number?: string | null
          drivers_license_url?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string | null
          hire_date?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_zip?: string | null
          hourly_rate?: number | null
          id?: string
          import_batch_id?: string | null
          insurance_verified?: boolean | null
          invitation_id?: string | null
          is_active?: boolean | null
          jobs_completed_mtd?: number | null
          last_location_update?: string | null
          license_expiration_date?: string | null
          location_tracking_enabled?: boolean | null
          max_daily_capacity_hours?: number | null
          max_jobs_per_day?: number | null
          name?: string
          offboarding_notes?: string | null
          origin_source?: string | null
          overtime_rate?: number | null
          payroll_type?: string | null
          performance_score?: number | null
          phone?: string | null
          redo_rate?: number | null
          retained_auth_user_id?: string | null
          revenue_generated_mtd?: number | null
          service_radius_miles?: number | null
          skills?: string[] | null
          status?: string
          team_id?: string | null
          updated_at?: string
          upsell_rate?: number | null
          user_id?: string
          weekly_capacity_hours?: number | null
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "technicians_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technicians_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "team_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technicians_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_message_credits: {
        Row: {
          channel: string
          created_at: string
          id: string
          included_units: number
          period_end: string
          period_start: string
          purchased_units: number
          reserved_units: number
          updated_at: string
          used_units: number
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          included_units?: number
          period_end: string
          period_start: string
          purchased_units?: number
          reserved_units?: number
          updated_at?: string
          used_units?: number
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          included_units?: number
          period_end?: string
          period_start?: string
          purchased_units?: number
          reserved_units?: number
          updated_at?: string
          used_units?: number
          user_id?: string
        }
        Relationships: []
      }
      tenant_tracking_settings: {
        Row: {
          created_at: string
          custom_body_script: string | null
          custom_head_script: string | null
          enabled: boolean
          ga4_measurement_id: string | null
          google_ads_conversion_label: string | null
          google_ads_id: string | null
          id: string
          meta_pixel_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_body_script?: string | null
          custom_head_script?: string | null
          enabled?: boolean
          ga4_measurement_id?: string | null
          google_ads_conversion_label?: string | null
          google_ads_id?: string | null
          id?: string
          meta_pixel_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_body_script?: string | null
          custom_head_script?: string | null
          enabled?: boolean
          ga4_measurement_id?: string | null
          google_ads_conversion_label?: string | null
          google_ads_id?: string | null
          id?: string
          meta_pixel_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          content: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          deleted_at: string | null
          featured: boolean | null
          id: string
          provider_replied_at: string | null
          provider_reply: string | null
          rating: number | null
          service_id: string | null
          status: string
          submission_token: string | null
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          deleted_at?: string | null
          featured?: boolean | null
          id?: string
          provider_replied_at?: string | null
          provider_reply?: string | null
          rating?: number | null
          service_id?: string | null
          status?: string
          submission_token?: string | null
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          deleted_at?: string | null
          featured?: boolean | null
          id?: string
          provider_replied_at?: string | null
          provider_reply?: string | null
          rating?: number | null
          service_id?: string | null
          status?: string
          submission_token?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonials_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          break_duration_minutes: number | null
          break_end: string | null
          break_start: string | null
          clock_in: string
          clock_in_location: Json | null
          clock_out: string | null
          clock_out_location: Json | null
          created_at: string
          edit_reason: string | null
          id: string
          notes: string | null
          overtime_hours: number | null
          regular_hours: number | null
          status: string
          technician_id: string | null
          total_hours: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          break_duration_minutes?: number | null
          break_end?: string | null
          break_start?: string | null
          clock_in: string
          clock_in_location?: Json | null
          clock_out?: string | null
          clock_out_location?: Json | null
          created_at?: string
          edit_reason?: string | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          regular_hours?: number | null
          status?: string
          technician_id?: string | null
          total_hours?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          break_duration_minutes?: number | null
          break_end?: string | null
          break_start?: string | null
          clock_in?: string
          clock_in_location?: Json | null
          clock_out?: string | null
          clock_out_location?: Json | null
          created_at?: string
          edit_reason?: string | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          regular_hours?: number | null
          status?: string
          technician_id?: string | null
          total_hours?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_entries_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      tire_service_pricing_rules: {
        Row: {
          alignment_price: number
          allows_manual_fitment: boolean
          allows_staggered_fitment: boolean
          base_installation_price: number
          created_at: string
          disposal_price: number
          duration_minutes_per_tire: number
          id: string
          maximum_quantity: number
          minimum_quantity: number
          mount_balance_price: number
          requires_fitment_lookup: boolean
          requires_inventory_selection: boolean
          service_catalog_id: string
          tpms_service_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          alignment_price?: number
          allows_manual_fitment?: boolean
          allows_staggered_fitment?: boolean
          base_installation_price?: number
          created_at?: string
          disposal_price?: number
          duration_minutes_per_tire?: number
          id?: string
          maximum_quantity?: number
          minimum_quantity?: number
          mount_balance_price?: number
          requires_fitment_lookup?: boolean
          requires_inventory_selection?: boolean
          service_catalog_id: string
          tpms_service_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          alignment_price?: number
          allows_manual_fitment?: boolean
          allows_staggered_fitment?: boolean
          base_installation_price?: number
          created_at?: string
          disposal_price?: number
          duration_minutes_per_tire?: number
          id?: string
          maximum_quantity?: number
          minimum_quantity?: number
          mount_balance_price?: number
          requires_fitment_lookup?: boolean
          requires_inventory_selection?: boolean
          service_catalog_id?: string
          tpms_service_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tire_service_pricing_rules_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      training_credit_applications: {
        Row: {
          amount_cents: number
          applied_at: string | null
          completion_id: string
          created_at: string
          currency: string
          error: string | null
          id: string
          idempotency_key: string
          status: string
          stripe_balance_txn_id: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          applied_at?: string | null
          completion_id: string
          created_at?: string
          currency?: string
          error?: string | null
          id?: string
          idempotency_key: string
          status?: string
          stripe_balance_txn_id?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          applied_at?: string | null
          completion_id?: string
          created_at?: string
          currency?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          status?: string
          stripe_balance_txn_id?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_credit_applications_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "training_module_completions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_module_completions: {
        Row: {
          completed_at: string
          created_at: string
          credit_error: string | null
          credit_status: Database["public"]["Enums"]["training_credit_status"]
          id: string
          module_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          credit_error?: string | null
          credit_status?: Database["public"]["Enums"]["training_credit_status"]
          id?: string
          module_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          credit_error?: string | null
          credit_status?: Database["public"]["Enums"]["training_credit_status"]
          id?: string
          module_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_module_completions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          reward_cents: number
          slug: string
          sort_order: number
          surface: Database["public"]["Enums"]["training_surface"]
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          reward_cents?: number
          slug: string
          sort_order?: number
          surface: Database["public"]["Enums"]["training_surface"]
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          reward_cents?: number
          slug?: string
          sort_order?: number
          surface?: Database["public"]["Enums"]["training_surface"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_reward_policy: {
        Row: {
          applies_to: Database["public"]["Enums"]["training_credit_applies_to"]
          created_at: string
          currency: string
          enabled: boolean
          id: string
          lifetime_cap_cents: number
          monthly_cap_cents: number
          singleton: boolean
          updated_at: string
        }
        Insert: {
          applies_to?: Database["public"]["Enums"]["training_credit_applies_to"]
          created_at?: string
          currency?: string
          enabled?: boolean
          id?: string
          lifetime_cap_cents?: number
          monthly_cap_cents?: number
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["training_credit_applies_to"]
          created_at?: string
          currency?: string
          enabled?: boolean
          id?: string
          lifetime_cap_cents?: number
          monthly_cap_cents?: number
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      trip_segments: {
        Row: {
          adjustment_reason: string | null
          confirmed_by: string | null
          created_at: string
          ended_at: string | null
          id: string
          job_id: string | null
          job_source: string | null
          metadata: Json
          navigation_session_id: string | null
          original_ended_at: string | null
          original_started_at: string | null
          segment_type: string
          source: string
          started_at: string
          status: string
          technician_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          adjustment_reason?: string | null
          confirmed_by?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          job_id?: string | null
          job_source?: string | null
          metadata?: Json
          navigation_session_id?: string | null
          original_ended_at?: string | null
          original_started_at?: string | null
          segment_type: string
          source: string
          started_at: string
          status?: string
          technician_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          adjustment_reason?: string | null
          confirmed_by?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          job_id?: string | null
          job_source?: string | null
          metadata?: Json
          navigation_session_id?: string | null
          original_ended_at?: string | null
          original_started_at?: string | null
          segment_type?: string
          source?: string
          started_at?: string
          status?: string
          technician_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_segments_navigation_session_id_fkey"
            columns: ["navigation_session_id"]
            isOneToOne: false
            referencedRelation: "navigation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_segments_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
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
      user_vin_lookups: {
        Row: {
          created_at: string
          id: string
          source: string | null
          user_id: string
          vin: string
          vin_cache_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          source?: string | null
          user_id: string
          vin: string
          vin_cache_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          source?: string | null
          user_id?: string
          vin?: string
          vin_cache_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_vin_lookups_vin_cache_id_fkey"
            columns: ["vin_cache_id"]
            isOneToOne: false
            referencedRelation: "vin_decode_cache"
            referencedColumns: ["id"]
          },
        ]
      }
      user_workspace_preferences: {
        Row: {
          owner_user_id: string
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          owner_user_id: string
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          owner_user_id?: string
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      van_inventory: {
        Row: {
          id: string
          inventory_item_id: string
          last_restocked_at: string | null
          min_quantity: number
          quantity: number
          unit: string
          updated_at: string
          van_id: string
        }
        Insert: {
          id?: string
          inventory_item_id: string
          last_restocked_at?: string | null
          min_quantity?: number
          quantity?: number
          unit?: string
          updated_at?: string
          van_id: string
        }
        Update: {
          id?: string
          inventory_item_id?: string
          last_restocked_at?: string | null
          min_quantity?: number
          quantity?: number
          unit?: string
          updated_at?: string
          van_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_inventory_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_inventory_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      van_inventory_transfers: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          notes: string | null
          quantity: number
          transfer_type: string
          user_id: string
          van_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          notes?: string | null
          quantity: number
          transfer_type?: string
          user_id: string
          van_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          notes?: string | null
          quantity?: number
          transfer_type?: string
          user_id?: string
          van_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_inventory_transfers_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_inventory_transfers_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      van_routes: {
        Row: {
          created_at: string | null
          date: string
          id: string
          optimized_order: Json | null
          total_distance_miles: number | null
          user_id: string
          van_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          optimized_order?: Json | null
          total_distance_miles?: number | null
          user_id: string
          van_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          optimized_order?: Json | null
          total_distance_miles?: number | null
          user_id?: string
          van_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_routes_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      van_territories: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          van_id: string
          zip_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          van_id: string
          zip_code: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          van_id?: string
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_territories_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      vans: {
        Row: {
          assigned_technician_id: string | null
          capacity_notes: string | null
          color: string | null
          created_at: string
          current_location: Json | null
          equipment_list: Json | null
          id: string
          insurance_expiry: string | null
          is_active: boolean
          last_location_update: string | null
          last_service_date: string | null
          license_plate: string | null
          make: string | null
          model: string | null
          name: string
          next_service_date: string | null
          odometer_miles: number | null
          status: string
          updated_at: string
          user_id: string
          vin: string | null
          year: number | null
        }
        Insert: {
          assigned_technician_id?: string | null
          capacity_notes?: string | null
          color?: string | null
          created_at?: string
          current_location?: Json | null
          equipment_list?: Json | null
          id?: string
          insurance_expiry?: string | null
          is_active?: boolean
          last_location_update?: string | null
          last_service_date?: string | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          name: string
          next_service_date?: string | null
          odometer_miles?: number | null
          status?: string
          updated_at?: string
          user_id: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          assigned_technician_id?: string | null
          capacity_notes?: string | null
          color?: string | null
          created_at?: string
          current_location?: Json | null
          equipment_list?: Json | null
          id?: string
          insurance_expiry?: string | null
          is_active?: boolean
          last_location_update?: string | null
          last_service_date?: string | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          name?: string
          next_service_date?: string | null
          odometer_miles?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vans_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_import_audit_log: {
        Row: {
          actor_id: string
          batch_id: string
          created_at: string
          details: Json
          event_type: string
          id: string
          row_id: string | null
        }
        Insert: {
          actor_id: string
          batch_id: string
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          row_id?: string | null
        }
        Update: {
          actor_id?: string
          batch_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          row_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_import_audit_log_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "vehicle_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_import_audit_log_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "vehicle_import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_import_batches: {
        Row: {
          committed_rows: number
          context_payload: Json
          created_at: string
          created_by: string
          duplicate_rows: number
          error_rows: number
          headers_payload: Json
          id: string
          mapping_payload: Json
          parsed_rows: number
          ready_rows: number
          source_file_name: string
          source_file_type: string
          status: string
          total_rows: number
          updated_at: string
          warning_rows: number
        }
        Insert: {
          committed_rows?: number
          context_payload?: Json
          created_at?: string
          created_by: string
          duplicate_rows?: number
          error_rows?: number
          headers_payload?: Json
          id?: string
          mapping_payload?: Json
          parsed_rows?: number
          ready_rows?: number
          source_file_name: string
          source_file_type: string
          status?: string
          total_rows?: number
          updated_at?: string
          warning_rows?: number
        }
        Update: {
          committed_rows?: number
          context_payload?: Json
          created_at?: string
          created_by?: string
          duplicate_rows?: number
          error_rows?: number
          headers_payload?: Json
          id?: string
          mapping_payload?: Json
          parsed_rows?: number
          ready_rows?: number
          source_file_name?: string
          source_file_type?: string
          status?: string
          total_rows?: number
          updated_at?: string
          warning_rows?: number
        }
        Relationships: []
      }
      vehicle_import_rows: {
        Row: {
          batch_id: string
          commit_status: string
          created_at: string
          decode_status: string
          decoded_payload: Json | null
          duplicate_status: string
          existing_vehicle_id: string | null
          id: string
          mapped_payload: Json
          normalized_payload: Json
          previous_validation_status: string | null
          raw_payload: Json
          resolution_payload: Json | null
          row_index: number
          spec_payload: Json | null
          updated_at: string
          validation_messages: Json
          validation_status: string
        }
        Insert: {
          batch_id: string
          commit_status: string
          created_at?: string
          decode_status: string
          decoded_payload?: Json | null
          duplicate_status: string
          existing_vehicle_id?: string | null
          id?: string
          mapped_payload?: Json
          normalized_payload?: Json
          previous_validation_status?: string | null
          raw_payload?: Json
          resolution_payload?: Json | null
          row_index: number
          spec_payload?: Json | null
          updated_at?: string
          validation_messages?: Json
          validation_status: string
        }
        Update: {
          batch_id?: string
          commit_status?: string
          created_at?: string
          decode_status?: string
          decoded_payload?: Json | null
          duplicate_status?: string
          existing_vehicle_id?: string | null
          id?: string
          mapped_payload?: Json
          normalized_payload?: Json
          previous_validation_status?: string | null
          raw_payload?: Json
          resolution_payload?: Json | null
          row_index?: number
          spec_payload?: Json | null
          updated_at?: string
          validation_messages?: Json
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "vehicle_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_import_rows_existing_vehicle_id_fkey"
            columns: ["existing_vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_intelligence_profiles: {
        Row: {
          created_at: string
          derived_defaults: Json
          effective_defaults: Json | null
          id: string
          override_defaults: Json | null
          source_profile: Json
          updated_at: string
          user_id: string
          vehicle_id: string
          vin: string | null
        }
        Insert: {
          created_at?: string
          derived_defaults?: Json
          effective_defaults?: Json | null
          id?: string
          override_defaults?: Json | null
          source_profile?: Json
          updated_at?: string
          user_id: string
          vehicle_id: string
          vin?: string | null
        }
        Update: {
          created_at?: string
          derived_defaults?: Json
          effective_defaults?: Json | null
          id?: string
          override_defaults?: Json | null
          source_profile?: Json
          updated_at?: string
          user_id?: string
          vehicle_id?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_intelligence_profiles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_part_assignments: {
        Row: {
          brand: string | null
          created_at: string
          fleet_vehicle_id: string | null
          id: string
          inventory_item_id: string | null
          is_required: boolean
          notes: string | null
          oem_number: string | null
          part_category: string
          part_number: string
          quantity: number
          unit: string | null
          updated_at: string
          user_id: string
          vehicle_id: string | null
          vehicle_kind: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          fleet_vehicle_id?: string | null
          id?: string
          inventory_item_id?: string | null
          is_required?: boolean
          notes?: string | null
          oem_number?: string | null
          part_category: string
          part_number: string
          quantity?: number
          unit?: string | null
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
          vehicle_kind: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          fleet_vehicle_id?: string | null
          id?: string
          inventory_item_id?: string | null
          is_required?: boolean
          notes?: string | null
          oem_number?: string | null
          part_category?: string
          part_number?: string
          quantity?: number
          unit?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
          vehicle_kind?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_part_assignments_fleet_vehicle_id_fkey"
            columns: ["fleet_vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_part_assignments_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_part_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_recommendations: {
        Row: {
          created_at: string
          created_from_service_id: string | null
          description: string | null
          dismissed_at: string | null
          due_date: string | null
          due_mileage: number | null
          id: string
          interval_miles: number | null
          interval_months: number | null
          is_dismissed: boolean
          last_service_date: string | null
          last_service_mileage: number | null
          priority: string
          recommendation_type: string
          title: string
          updated_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_from_service_id?: string | null
          description?: string | null
          dismissed_at?: string | null
          due_date?: string | null
          due_mileage?: number | null
          id?: string
          interval_miles?: number | null
          interval_months?: number | null
          is_dismissed?: boolean
          last_service_date?: string | null
          last_service_mileage?: number | null
          priority?: string
          recommendation_type: string
          title: string
          updated_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_from_service_id?: string | null
          description?: string | null
          dismissed_at?: string | null
          due_date?: string | null
          due_mileage?: number | null
          id?: string
          interval_miles?: number | null
          interval_months?: number | null
          is_dismissed?: boolean
          last_service_date?: string | null
          last_service_mileage?: number | null
          priority?: string
          recommendation_type?: string
          title?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      vehicle_repairs_api_audit_logs: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          user_id: string | null
          vin: string
          was_cached: boolean
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          user_id?: string | null
          vin: string
          was_cached?: boolean
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          user_id?: string | null
          vin?: string
          was_cached?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_repairs_api_audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_repairs_cache: {
        Row: {
          created_at: string
          currency: string | null
          id: string
          make: string
          model: string
          raw_data: Json
          updated_at: string
          vin: string
          year: number
        }
        Insert: {
          created_at?: string
          currency?: string | null
          id?: string
          make: string
          model: string
          raw_data: Json
          updated_at?: string
          vin: string
          year: number
        }
        Update: {
          created_at?: string
          currency?: string | null
          id?: string
          make?: string
          model?: string
          raw_data?: Json
          updated_at?: string
          vin?: string
          year?: number
        }
        Relationships: []
      }
      vehicle_specifications: {
        Row: {
          additional_specs: Json | null
          air_filter: string | null
          brake_fluid: string | null
          cabin_filter: string | null
          coolant_type: string | null
          created_at: string
          engine: string | null
          fuel_filter: string | null
          id: string
          make: string
          model: string
          oil_capacity: string | null
          oil_filter: string | null
          oil_type: string | null
          source: string | null
          tire_size: string | null
          transmission_fluid: string | null
          updated_at: string
          wiper_blade_driver: string | null
          wiper_blade_passenger: string | null
          wiper_blade_rear: string | null
          year: number
        }
        Insert: {
          additional_specs?: Json | null
          air_filter?: string | null
          brake_fluid?: string | null
          cabin_filter?: string | null
          coolant_type?: string | null
          created_at?: string
          engine?: string | null
          fuel_filter?: string | null
          id?: string
          make: string
          model: string
          oil_capacity?: string | null
          oil_filter?: string | null
          oil_type?: string | null
          source?: string | null
          tire_size?: string | null
          transmission_fluid?: string | null
          updated_at?: string
          wiper_blade_driver?: string | null
          wiper_blade_passenger?: string | null
          wiper_blade_rear?: string | null
          year: number
        }
        Update: {
          additional_specs?: Json | null
          air_filter?: string | null
          brake_fluid?: string | null
          cabin_filter?: string | null
          coolant_type?: string | null
          created_at?: string
          engine?: string | null
          fuel_filter?: string | null
          id?: string
          make?: string
          model?: string
          oil_capacity?: string | null
          oil_filter?: string | null
          oil_type?: string | null
          source?: string | null
          tire_size?: string | null
          transmission_fluid?: string | null
          updated_at?: string
          wiper_blade_driver?: string | null
          wiper_blade_passenger?: string | null
          wiper_blade_rear?: string | null
          year?: number
        }
        Relationships: []
      }
      vehicle_specs_cache: {
        Row: {
          confidence_score: number | null
          created_at: string
          engine: string | null
          id: string
          make: string
          model: string
          oil_capacity: string | null
          oil_plug_torque: string | null
          oil_type: string | null
          source: string
          transmission_fluid: string | null
          updated_at: string
          year: number
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          engine?: string | null
          id?: string
          make: string
          model: string
          oil_capacity?: string | null
          oil_plug_torque?: string | null
          oil_type?: string | null
          source?: string
          transmission_fluid?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          engine?: string | null
          id?: string
          make?: string
          model?: string
          oil_capacity?: string | null
          oil_plug_torque?: string | null
          oil_type?: string | null
          source?: string
          transmission_fluid?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          customer_id: string | null
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          deleted_at: string | null
          engine: string | null
          id: string
          image_url: string | null
          import_batch_id: string | null
          license_plate: string | null
          make: string
          mileage: number | null
          model: string
          notes: string | null
          odometer_measure: string | null
          oil_capacity: string | null
          oil_type: string | null
          origin_source: string | null
          plate_state: string | null
          tire_load_index: string | null
          tire_size: string | null
          tire_size_front: string | null
          tire_size_rear: string | null
          tire_size_source: string | null
          tire_speed_rating: string | null
          updated_at: string
          user_id: string
          vin: string | null
          year: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          customer_id?: string | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          deleted_at?: string | null
          engine?: string | null
          id?: string
          image_url?: string | null
          import_batch_id?: string | null
          license_plate?: string | null
          make: string
          mileage?: number | null
          model: string
          notes?: string | null
          odometer_measure?: string | null
          oil_capacity?: string | null
          oil_type?: string | null
          origin_source?: string | null
          plate_state?: string | null
          tire_load_index?: string | null
          tire_size?: string | null
          tire_size_front?: string | null
          tire_size_rear?: string | null
          tire_size_source?: string | null
          tire_speed_rating?: string | null
          updated_at?: string
          user_id: string
          vin?: string | null
          year: number
        }
        Update: {
          color?: string | null
          created_at?: string
          customer_id?: string | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          deleted_at?: string | null
          engine?: string | null
          id?: string
          image_url?: string | null
          import_batch_id?: string | null
          license_plate?: string | null
          make?: string
          mileage?: number | null
          model?: string
          notes?: string | null
          odometer_measure?: string | null
          oil_capacity?: string | null
          oil_type?: string | null
          origin_source?: string | null
          plate_state?: string | null
          tire_load_index?: string | null
          tire_size?: string | null
          tire_size_front?: string | null
          tire_size_rear?: string | null
          tire_size_source?: string | null
          tire_speed_rating?: string | null
          updated_at?: string
          user_id?: string
          vin?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_aliases: {
        Row: {
          alias_pattern: string
          created_at: string
          id: string
          is_system: boolean
          match_priority: number
          user_id: string
          vendor_id: string
        }
        Insert: {
          alias_pattern: string
          created_at?: string
          id?: string
          is_system?: boolean
          match_priority?: number
          user_id: string
          vendor_id: string
        }
        Update: {
          alias_pattern?: string
          created_at?: string
          id?: string
          is_system?: boolean
          match_priority?: number
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_aliases_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          account_number: string | null
          address: string | null
          created_at: string
          default_category_id: string | null
          email: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          name: string
          normalized_name: string
          notes: string | null
          phone: string | null
          times_seen: number
          updated_at: string
          user_id: string
          vendor_type: string | null
        }
        Insert: {
          account_number?: string | null
          address?: string | null
          created_at?: string
          default_category_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          name: string
          normalized_name: string
          notes?: string | null
          phone?: string | null
          times_seen?: number
          updated_at?: string
          user_id: string
          vendor_type?: string | null
        }
        Update: {
          account_number?: string | null
          address?: string | null
          created_at?: string
          default_category_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          name?: string
          normalized_name?: string
          notes?: string | null
          phone?: string | null
          times_seen?: number
          updated_at?: string
          user_id?: string
          vendor_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      vin_decode_cache: {
        Row: {
          body_class: string | null
          created_at: string
          decoded_at: string
          doors: number | null
          drive_type: string | null
          engine: string | null
          engine_code: string | null
          fuel_type: string | null
          id: string
          make: string | null
          model: string | null
          raw_response: Json | null
          transmission: string | null
          trim: string | null
          vin: string
          year: number | null
        }
        Insert: {
          body_class?: string | null
          created_at?: string
          decoded_at?: string
          doors?: number | null
          drive_type?: string | null
          engine?: string | null
          engine_code?: string | null
          fuel_type?: string | null
          id?: string
          make?: string | null
          model?: string | null
          raw_response?: Json | null
          transmission?: string | null
          trim?: string | null
          vin: string
          year?: number | null
        }
        Update: {
          body_class?: string | null
          created_at?: string
          decoded_at?: string
          doors?: number | null
          drive_type?: string | null
          engine?: string | null
          engine_code?: string | null
          fuel_type?: string | null
          id?: string
          make?: string | null
          model?: string | null
          raw_response?: Json | null
          transmission?: string | null
          trim?: string | null
          vin?: string
          year?: number | null
        }
        Relationships: []
      }
      visitor_presence: {
        Row: {
          browser: string | null
          connected_at: string
          country: string | null
          created_at: string
          current_path: string | null
          device_type: string | null
          disconnected_at: string | null
          heartbeat_at: string
          id: string
          last_activity_at: string
          primary_tab: boolean
          referrer: string | null
          session_id: string
          state: string
          tenant_id: string
          visitor_id: string
        }
        Insert: {
          browser?: string | null
          connected_at?: string
          country?: string | null
          created_at?: string
          current_path?: string | null
          device_type?: string | null
          disconnected_at?: string | null
          heartbeat_at?: string
          id?: string
          last_activity_at?: string
          primary_tab?: boolean
          referrer?: string | null
          session_id: string
          state?: string
          tenant_id: string
          visitor_id: string
        }
        Update: {
          browser?: string | null
          connected_at?: string
          country?: string | null
          created_at?: string
          current_path?: string | null
          device_type?: string | null
          disconnected_at?: string | null
          heartbeat_at?: string
          id?: string
          last_activity_at?: string
          primary_tab?: boolean
          referrer?: string | null
          session_id?: string
          state?: string
          tenant_id?: string
          visitor_id?: string
        }
        Relationships: []
      }
      voice_agent_usage: {
        Row: {
          business_user_id: string
          conversation_id: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          tool_calls_count: number | null
          user_id: string
        }
        Insert: {
          business_user_id: string
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          tool_calls_count?: number | null
          user_id: string
        }
        Update: {
          business_user_id?: string
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          tool_calls_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      weather_blocks: {
        Row: {
          blocked_date: string
          created_at: string
          end_time: string | null
          id: string
          location_label: string | null
          reason: string
          scope: string
          source: string
          start_time: string | null
          user_id: string
        }
        Insert: {
          blocked_date: string
          created_at?: string
          end_time?: string | null
          id?: string
          location_label?: string | null
          reason: string
          scope?: string
          source?: string
          start_time?: string | null
          user_id: string
        }
        Update: {
          blocked_date?: string
          created_at?: string
          end_time?: string | null
          id?: string
          location_label?: string | null
          reason?: string
          scope?: string
          source?: string
          start_time?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weather_risk_logs: {
        Row: {
          appointment_id: string
          decision: string
          evaluated_at: string
          id: string
          reason: string | null
          risk_level: string
          risk_score: number
          snapshot_id: string | null
          user_id: string
        }
        Insert: {
          appointment_id: string
          decision: string
          evaluated_at?: string
          id?: string
          reason?: string | null
          risk_level: string
          risk_score?: number
          snapshot_id?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string
          decision?: string
          evaluated_at?: string
          id?: string
          reason?: string | null
          risk_level?: string
          risk_score?: number
          snapshot_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weather_risk_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_risk_logs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "weather_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_snapshots: {
        Row: {
          fetched_at: string
          forecast_time: string
          id: string
          location_lat: number
          location_lng: number
          precipitation_amount: number
          precipitation_probability: number
          risk_score: number
          source: string
          temperature_c: number | null
          weather_code: number | null
          wind_kph: number | null
        }
        Insert: {
          fetched_at?: string
          forecast_time: string
          id?: string
          location_lat: number
          location_lng: number
          precipitation_amount?: number
          precipitation_probability?: number
          risk_score?: number
          source?: string
          temperature_c?: number | null
          weather_code?: number | null
          wind_kph?: number | null
        }
        Update: {
          fetched_at?: string
          forecast_time?: string
          id?: string
          location_lat?: number
          location_lng?: number
          precipitation_amount?: number
          precipitation_probability?: number
          risk_score?: number
          source?: string
          temperature_c?: number | null
          weather_code?: number | null
          wind_kph?: number | null
        }
        Relationships: []
      }
      webhook_event_logs: {
        Row: {
          attempts: number
          created_at: string
          error_details: Json | null
          error_message: string | null
          event_type: string
          id: string
          last_attempt_at: string | null
          max_attempts: number
          payload: Json
          processed_at: string | null
          related_record_id: string | null
          related_record_type: string | null
          replayed_at: string | null
          replayed_by: string | null
          status: string
          stripe_event_id: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_details?: Json | null
          error_message?: string | null
          event_type: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          payload: Json
          processed_at?: string | null
          related_record_id?: string | null
          related_record_type?: string | null
          replayed_at?: string | null
          replayed_by?: string | null
          status?: string
          stripe_event_id: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error_details?: Json | null
          error_message?: string | null
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          payload?: Json
          processed_at?: string | null
          related_record_id?: string | null
          related_record_type?: string | null
          replayed_at?: string | null
          replayed_by?: string | null
          status?: string
          stripe_event_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      work_order_checklist_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          evidence_url: string | null
          execution_phase: string
          id: string
          is_mandatory: boolean
          is_unlocked: boolean
          notes: string | null
          playbook_id: string | null
          requires_photo: boolean
          status: string
          step_name: string
          step_order: number
          work_order_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          evidence_url?: string | null
          execution_phase?: string
          id?: string
          is_mandatory?: boolean
          is_unlocked?: boolean
          notes?: string | null
          playbook_id?: string | null
          requires_photo?: boolean
          status?: string
          step_name: string
          step_order?: number
          work_order_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          evidence_url?: string | null
          execution_phase?: string
          id?: string
          is_mandatory?: boolean
          is_unlocked?: boolean
          notes?: string | null
          playbook_id?: string | null
          requires_photo?: boolean
          status?: string
          step_name?: string
          step_order?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_checklist_items_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "service_playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_checklist_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          appointment_id: string | null
          completed_at: string | null
          created_at: string
          customer_id: string | null
          customer_notes: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          execution_phase: string
          id: string
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          mileage_captured: number | null
          order_number: string
          requires_mileage: boolean
          requires_signature: boolean
          requires_vin: boolean
          signature_url: string | null
          started_at: string | null
          status: string
          tech_notes: string | null
          technician_id: string | null
          updated_at: string
          user_id: string
          van_id: string | null
          vehicle_id: string | null
          vin_captured: string | null
        }
        Insert: {
          appointment_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_notes?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          execution_phase?: string
          id?: string
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          mileage_captured?: number | null
          order_number?: string
          requires_mileage?: boolean
          requires_signature?: boolean
          requires_vin?: boolean
          signature_url?: string | null
          started_at?: string | null
          status?: string
          tech_notes?: string | null
          technician_id?: string | null
          updated_at?: string
          user_id: string
          van_id?: string | null
          vehicle_id?: string | null
          vin_captured?: string | null
        }
        Update: {
          appointment_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_notes?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          execution_phase?: string
          id?: string
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          mileage_captured?: number | null
          order_number?: string
          requires_mileage?: boolean
          requires_signature?: boolean
          requires_vin?: boolean
          signature_url?: string | null
          started_at?: string | null
          status?: string
          tech_notes?: string | null
          technician_id?: string | null
          updated_at?: string
          user_id?: string
          van_id?: string | null
          vehicle_id?: string | null
          vin_captured?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_users: {
        Row: { workspace_id: string; customer_id: string; user_id: string; is_primary: boolean; created_at: string; updated_at: string }
        Insert: { workspace_id: string; customer_id: string; user_id: string; is_primary?: boolean; created_at?: string; updated_at?: string }
        Update: { workspace_id?: string; customer_id?: string; user_id?: string; is_primary?: boolean; created_at?: string; updated_at?: string }
        Relationships: []
      }
      invitation_events: {
        Row: { id: string; invitation_id: string; workspace_id: string; event_type: string; actor_user_id: string | null; metadata: Json; created_at: string }
        Insert: { id?: string; invitation_id: string; workspace_id: string; event_type: string; actor_user_id?: string | null; metadata?: Json; created_at?: string }
        Update: { id?: string; invitation_id?: string; workspace_id?: string; event_type?: string; actor_user_id?: string | null; metadata?: Json; created_at?: string }
        Relationships: []
      }
      invitations: {
        Row: { id: string; workspace_id: string; customer_id: string | null; invited_email: string; invited_role: Database["public"]["Enums"]["member_role"]; token_hash: string; expires_at: string; accepted_at: string | null; accepted_by: string | null; revoked_at: string | null; created_by: string; created_at: string; updated_at: string }
        Insert: { id?: string; workspace_id: string; customer_id?: string | null; invited_email: string; invited_role: Database["public"]["Enums"]["member_role"]; token_hash: string; expires_at: string; accepted_at?: string | null; accepted_by?: string | null; revoked_at?: string | null; created_by: string; created_at?: string; updated_at?: string }
        Update: { id?: string; workspace_id?: string; customer_id?: string | null; invited_email?: string; invited_role?: Database["public"]["Enums"]["member_role"]; token_hash?: string; expires_at?: string; accepted_at?: string | null; accepted_by?: string | null; revoked_at?: string | null; created_by?: string; created_at?: string; updated_at?: string }
        Relationships: []
      }
    }
    Views: {
      campaign_message_rollups: {
        Row: {
          accepted_count: number | null
          campaign_id: string | null
          click_count: number | null
          conversion_count: number | null
          delivered_count: number | null
          failed_count: number | null
          last_engagement_at: string | null
          open_count: number | null
          opt_out_count: number | null
          reply_count: number | null
          sent_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      cash_collection_receipts_v1: {
        Row: {
          appointment_id: string | null
          collected_at: string | null
          collected_cents: number | null
          currency: string | null
          data_origin: Database["public"]["Enums"]["data_origin_type"] | null
          metadata: Json | null
          net_collected_cents: number | null
          payment_record_id: string | null
          payment_status: string | null
          payment_type: string | null
          refunded_cents: number | null
          tax_amount: number | null
          user_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          collected_at?: never
          collected_cents?: never
          currency?: string | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"] | null
          metadata?: Json | null
          net_collected_cents?: never
          payment_record_id?: string | null
          payment_status?: never
          payment_type?: string | null
          refunded_cents?: never
          tax_amount?: number | null
          user_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          collected_at?: never
          collected_cents?: never
          currency?: string | null
          data_origin?: Database["public"]["Enums"]["data_origin_type"] | null
          metadata?: Json | null
          net_collected_cents?: never
          payment_record_id?: string | null
          payment_status?: never
          payment_type?: string | null
          refunded_cents?: never
          tax_amount?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_drawer_variance_v1: {
        Row: {
          closed_at: string | null
          counted_cents: number | null
          expected_cents: number | null
          id: string | null
          opened_at: string | null
          user_id: string | null
          variance_cents: number | null
        }
        Insert: {
          closed_at?: string | null
          counted_cents?: number | null
          expected_cents?: number | null
          id?: string | null
          opened_at?: string | null
          user_id?: string | null
          variance_cents?: never
        }
        Update: {
          closed_at?: string | null
          counted_cents?: number | null
          expected_cents?: number | null
          id?: string | null
          opened_at?: string | null
          user_id?: string | null
          variance_cents?: never
        }
        Relationships: []
      }
      collected_cash_v1: {
        Row: {
          collection_date: string | null
          currency: string | null
          net_collected_cents: number | null
          user_id: string | null
        }
        Relationships: []
      }
      database_production_safety_audit_view: {
        Row: {
          report: Json | null
        }
        Relationships: []
      }
      dispatch_operational_jobs_v1: {
        Row: {
          assigned_at: string | null
          assigned_technician_id: string | null
          assigned_technician_name: string | null
          assigned_van_id: string | null
          assigned_van_name: string | null
          canonical_state: string | null
          customer_name: string | null
          customer_phone: string | null
          dispatch_notes: string | null
          dispatch_status: string | null
          duration_minutes: number | null
          estimated_cost: number | null
          estimated_duration_minutes: number | null
          fleet_job_id: string | null
          fleet_job_number: string | null
          fleet_job_vehicle_count: number | null
          guest_name: string | null
          guest_phone: string | null
          job_id: string | null
          job_priority: string | null
          last_event_at: string | null
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_catalog_name: string | null
          source: string | null
          source_freshness_ms: number | null
          status: string | null
          title: string | null
          user_id: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
        }
        Relationships: []
      }
      job_charge_balances_v1: {
        Row: {
          adjustment_cents: number | null
          allocated_cents: number | null
          appointment_id: string | null
          balance_due_cents: number | null
          currency: string | null
          job_charge_id: string | null
          original_charge_cents: number | null
          payment_status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_charges_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      processor_payout_reconciliation_v1: {
        Row: {
          currency: string | null
          expected_payout_cents: number | null
          reconciliation_date: string | null
          recorded_payout_cents: number | null
          user_id: string | null
        }
        Relationships: []
      }
      provider_loyalty_ledger: {
        Row: {
          account_id: string | null
          appointment_id: string | null
          appointment_status: string | null
          balance_after: number | null
          created_at: string | null
          credit_delta_cents: number | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          event_id: string | null
          event_type: Database["public"]["Enums"]["loyalty_event_type"] | null
          idempotency_key: string | null
          metadata_jsonb: Json | null
          occurred_at: string | null
          points_delta: number | null
          scheduled_date: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_rewards_health: {
        Row: {
          account_balance_mismatch_count: number | null
          negative_balance_count: number | null
          open_automation_issue_count: number | null
          points_earned_events_24h: number | null
          redeemed_rewards_24h: number | null
          stale_reservation_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      provider_rewards_observability: {
        Row: {
          appointment_id: string | null
          automation_run_id: string | null
          created_at: string | null
          error_message: string | null
          result_jsonb: Json | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          automation_run_id?: string | null
          created_at?: string | null
          error_message?: string | null
          result_jsonb?: Json | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          automation_run_id?: string | null
          created_at?: string | null
          error_message?: string | null
          result_jsonb?: Json | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_automation_runs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_booking_profiles: {
        Row: {
          booking_slug: string | null
          business_name: string | null
          closing_time: string | null
          opening_time: string | null
          stripe_charges_enabled: boolean | null
          user_id: string | null
          working_days: string[] | null
        }
        Insert: {
          booking_slug?: string | null
          business_name?: string | null
          closing_time?: string | null
          opening_time?: string | null
          stripe_charges_enabled?: boolean | null
          user_id?: string | null
          working_days?: string[] | null
        }
        Update: {
          booking_slug?: string | null
          business_name?: string | null
          closing_time?: string | null
          opening_time?: string | null
          stripe_charges_enabled?: boolean | null
          user_id?: string | null
          working_days?: string[] | null
        }
        Relationships: []
      }
      unallocated_receipts_v1: {
        Row: {
          allocated_cents: number | null
          amount_cents: number | null
          appointment_id: string | null
          currency: string | null
          occurred_at: string | null
          receipt_event_id: string | null
          unallocated_cents: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_team_invitation: {
        Args: { p_invitation_token: string }
        Returns: Json
      }
      adjust_loyalty_points: {
        Args: {
          p_actor_id: string
          p_appointment_id?: string
          p_customer_id: string
          p_idempotency_key?: string
          p_points_delta: number
          p_provider_id: string
          p_reason_code: string
          p_reason_note?: string
        }
        Returns: Json
      }
      adjust_van_inventory_quantity_v1: {
        Args: { p_delta: number; p_item_id: string }
        Returns: Json
      }
      advance_checklist_step: {
        Args: { p_evidence_url?: string; p_item_id: string; p_notes?: string }
        Returns: Json
      }
      advance_job_execution_step_v1: {
        Args: {
          p_evidence_url?: string
          p_notes?: string
          p_status: string
          p_step_id: string
        }
        Returns: Json
      }
      advance_recurring_due_date: {
        Args: { p_current: string; p_frequency: string; p_interval: number }
        Returns: string
      }
      apply_appointment_rewards: {
        Args: { p_actor_id?: string; p_appointment_id: string }
        Returns: Json
      }
      apply_booking_reward: {
        Args: {
          p_appointment_id: string
          p_idempotency_key?: string
          p_payment_record_id?: string
          p_reward_instance_id: string
          p_subtotal_cents?: number
          p_tax_cents?: number
        }
        Returns: Json
      }
      apply_sms_credit_purchase_v1: {
        Args: {
          p_amount_cents?: number
          p_bundle_key: string
          p_kind: string
          p_stripe_ref: string
          p_units: number
          p_user_id: string
        }
        Returns: Json
      }
      apply_work_order_parts_v1: {
        Args: { p_lines: Json; p_work_order_id: string }
        Returns: Json
      }
      approve_fleet_work_order_draft: {
        Args: { _draft_id: string }
        Returns: Json
      }
      assign_appointment_job_v1: {
        Args: {
          p_appointment_id: string
          p_notes?: string
          p_technician_id?: string
          p_unassign?: boolean
          p_van_id?: string
        }
        Returns: Json
      }
      assign_customer_segment: {
        Args: { p_customer_id: string }
        Returns: string
      }
      assign_dispatch_job_v1: {
        Args: {
          p_date?: string
          p_duration_minutes?: number
          p_expected_updated_at?: string
          p_job_id: string
          p_job_source: string
          p_notes?: string
          p_start?: string
          p_technician_id?: string
          p_van_id?: string
        }
        Returns: Json
      }
      assign_fleet_job_v1: {
        Args: {
          p_date: string
          p_duration_minutes?: number
          p_job_id: string
          p_start: string
          p_technician_id: string
        }
        Returns: Json
      }
      assign_fleet_work_order_dispatch_v1: {
        Args: {
          p_date?: string
          p_duration_minutes?: number
          p_expected_updated_at?: string
          p_start?: string
          p_technician_id?: string
          p_unassign?: boolean
          p_van_id?: string
          p_work_order_id: string
        }
        Returns: Json
      }
      assign_fleet_work_order_slot_v1: {
        Args: {
          p_date: string
          p_duration_minutes: number
          p_expected_updated_at: string
          p_start: string
          p_technician_id: string
          p_work_order_id: string
        }
        Returns: {
          accepted_at: string | null
          approval_required: boolean
          approval_threshold: number | null
          arrived_at: string | null
          assigned_technician_id: string | null
          assigned_van_id: string | null
          checkin_geo: Json | null
          checkout_geo: Json | null
          completed_at: string | null
          completion_status: string | null
          completion_vin_captured: string | null
          completion_vin_matched: boolean | null
          compliance_invoice_format_ok: boolean
          compliance_notes_ok: boolean
          compliance_photos_attached: boolean
          compliance_po_attached: boolean
          created_at: string
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          description: string | null
          digital_signature_url: string | null
          en_route_at: string | null
          external_po: string | null
          fleet_client_id: string
          fleet_contract_id: string | null
          fleet_job_id: string | null
          fleet_location_id: string | null
          fleet_purchase_order_id: string | null
          fleet_vehicle_id: string
          id: string
          import_batch_id: string | null
          internal_po: string | null
          invoice_balance_due: number
          invoice_id: string | null
          invoice_paid_amount: number
          invoice_status: string | null
          invoiced_at: string | null
          labor_hours: number | null
          mileage_at_service: number | null
          next_service_date: string | null
          next_service_mileage: number | null
          notes: string | null
          odometer_in: number | null
          odometer_out: number | null
          order_number: string | null
          origin_source: string | null
          paid_at: string | null
          parts_used: Json | null
          payment_record_id: string | null
          photos: string[] | null
          po_authorization_status: string
          po_number: string | null
          priority: string
          required_skill: string | null
          scheduled_date: string | null
          scheduled_duration_minutes: number
          scheduled_time: string | null
          service_type: string | null
          signature_captured_at: string | null
          sla_deadline: string | null
          source: string | null
          source_draft_id: string | null
          source_request_id: string | null
          source_schedule_id: string | null
          started_at: string | null
          status: string
          submitted_at: string | null
          subtotal: number | null
          tax_amount: number | null
          technician_notes: string | null
          tekmetric_ro_id: string | null
          tekmetric_synced_at: string | null
          total: number | null
          updated_at: string
          user_id: string
          vin: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fleet_work_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_technician: {
        Args: {
          p_appointment_id: string
          p_notes?: string
          p_technician_id: string
        }
        Returns: undefined
      }
      assign_van_by_zip: {
        Args: { p_user_id: string; p_zip_code: string }
        Returns: string
      }
      auto_dispatch_public_booking_v1: {
        Args: {
          p_appointment_id: string
          p_business_user_id: string
          p_notes?: string
          p_zip_code?: string
        }
        Returns: Json
      }
      auto_seed_subscription_plans_for_user: {
        Args: { p_user_id: string }
        Returns: number
      }
      book_appointment_safe: {
        Args: {
          p_business_user_id: string
          p_description?: string
          p_duration_minutes: number
          p_estimated_cost?: number
          p_guest_email: string
          p_guest_name: string
          p_guest_phone?: string
          p_intake_responses?: Json
          p_notes?: string
          p_scheduled_date: string
          p_scheduled_time: string
          p_service_catalog_id?: string
          p_status?: string
          p_tax_amount?: number
          p_terms_accepted_at?: string
          p_title: string
          p_vehicle_id?: string
        }
        Returns: string
      }
      calculate_appointment_tax: {
        Args: { estimated_cost: number; owner_user_id: string }
        Returns: number
      }
      calculate_location_tax_rate: {
        Args: {
          p_city?: string
          p_postal_code?: string
          p_state: string
          p_user_id: string
        }
        Returns: number
      }
      calculate_reward_discount_cents: {
        Args: { p_reward_id: string; p_subtotal_cents?: number }
        Returns: number
      }
      calculate_technician_performance_score: {
        Args: { p_technician_id: string }
        Returns: number
      }
      can_manage_location_workspace: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      can_manage_team_os: { Args: { p_owner: string }; Returns: boolean }
      can_manage_workspace_data: {
        Args: { _owner_user_id: string }
        Returns: boolean
      }
      can_operate_fleet_workspace_v1: {
        Args: { p_owner_user_id: string }
        Returns: boolean
      }
      can_read_location_resource: {
        Args: { p_resource_id: string; p_user_id: string }
        Returns: boolean
      }
      can_read_navigation_session: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      cancel_appointment_by_token: {
        Args: { p_cancellation_reason?: string; p_management_token: string }
        Returns: Json
      }
      cancel_booking_reward: {
        Args: {
          p_appointment_id?: string
          p_reason?: string
          p_reward_instance_id: string
        }
        Returns: Json
      }
      cancel_loyalty_reward_instance: {
        Args: {
          p_actor_id: string
          p_reason_code: string
          p_reason_note?: string
          p_reward_instance_id: string
        }
        Returns: Json
      }
      check_customer_email: {
        Args: { p_email: string }
        Returns: {
          customer_name: string
          has_account: boolean
        }[]
      }
      check_rate_limit_db: {
        Args: {
          p_key: string
          p_max_requests?: number
          p_window_seconds?: number
        }
        Returns: Json
      }
      check_revenue_reconciliation: {
        Args: {
          p_tolerance?: number
          p_user_id: string
          p_window_days?: number
        }
        Returns: undefined
      }
      claim_fleet_dispatch_outbox_v1: {
        Args: { p_limit?: number }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          status: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "fleet_dispatch_delivery_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_fleet_service_request_v1: {
        Args: { p_request_id: string; p_version: number }
        Returns: {
          assigned_to: string | null
          claimed_at: string | null
          closed_at: string | null
          created_at: string
          customer_notes: string | null
          duplicate_of_request_id: string | null
          first_response_at: string | null
          fleet_client_id: string | null
          fleet_contact_id: string | null
          fleet_location_id: string | null
          fleet_vehicle_id: string | null
          fleet_work_order_id: string | null
          id: string
          internal_notes: string | null
          match_confidence: number | null
          match_status: string
          preferred_date: string | null
          preferred_window_end: string | null
          preferred_window_start: string | null
          priority: string
          received_at: string
          request_summary: string | null
          requester_email: string | null
          requester_name: string | null
          requester_role: string | null
          safety_flags: Json
          service_address: string | null
          sla_due_at: string | null
          source_metadata: Json
          source_record_id: string | null
          source_thread_key: string | null
          source_type: string
          status: string
          subject: string
          updated_at: string
          user_id: string
          vehicle_drivable: boolean | null
          version: number
          work_order_draft_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fleet_service_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_job_message_deliveries_v1: {
        Args: { p_limit?: number }
        Returns: Json[]
      }
      cleanup_expired_documents: {
        Args: never
        Returns: {
          hard_deleted_count: number
          marked_expired_count: number
        }[]
      }
      cleanup_rate_limit_entries: { Args: never; Returns: number }
      clock_in: { Args: { p_location?: Json }; Returns: string }
      clock_out: { Args: { p_location?: Json }; Returns: undefined }
      complete_appointment_with_rewards: {
        Args: { p_actor_id?: string; p_appointment_id: string }
        Returns: Json
      }
      complete_appointment_with_service_record:
        | {
            Args: {
              p_additional_notes?: string
              p_appointment_id: string
              p_filter_parts?: string
              p_labor_hours?: number
              p_mileage?: number
              p_oil_quarts_used?: number
              p_shop_supplies?: number
              p_technician?: string
              p_vin?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_additional_notes?: string
              p_appointment_id: string
              p_filter_parts?: string
              p_idempotency_key?: string
              p_labor_hours?: number
              p_mileage?: number
              p_oil_quarts_used?: number
              p_shop_supplies?: number
              p_technician?: string
              p_vin?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_additional_notes?: string
              p_appointment_id: string
              p_filter_parts?: string
              p_idempotency_key?: string
              p_labor_hours?: number
              p_mileage?: number
              p_oil_quarts_used?: number
              p_oil_type?: string
              p_shop_supplies?: number
              p_technician?: string
              p_vin?: string
            }
            Returns: Json
          }
      complete_fleet_work_order_v1: {
        Args: {
          p_arrival_photo_url?: string
          p_completion_photo_url?: string
          p_idempotency_key?: string
          p_mileage?: number
          p_notes?: string
          p_parts_used?: Json
          p_vin?: string
          p_work_order_id: string
        }
        Returns: Json
      }
      consume_appointment_reservations: {
        Args: { p_appointment_id: string; p_override_qty_qt?: number }
        Returns: {
          consumed_quantity: number
          inventory_item_id: string
          reservation_id: string
          source: string
          unit: string
        }[]
      }
      consume_provider_token: {
        Args: { p_cost?: number; p_provider: string; p_user_id: string }
        Returns: Json
      }
      consume_sms_credits_v1: {
        Args: {
          p_appointment_id?: string
          p_body_preview?: string
          p_campaign_id?: string
          p_customer_id?: string
          p_idempotency_key: string
          p_message_class: string
          p_message_type?: string
          p_provider?: string
          p_recipient_hash?: string
          p_recipient_last4?: string
          p_segments: number
          p_user_id: string
        }
        Returns: Json
      }
      consume_work_order_parts_v1: {
        Args: { p_work_order_id: string }
        Returns: Json
      }
      convert_fleet_service_request_to_draft_v1: {
        Args: { p_request_id: string; p_version: number }
        Returns: string
      }
      convert_oil_volume: {
        Args: { p_from_unit: string; p_qty: number; p_to_unit: string }
        Returns: number
      }
      count_provider_in_flight: {
        Args: { p_provider: string; p_user_id: string }
        Returns: number
      }
      create_customer_account:
        | {
            Args: {
              p_email: string
              p_full_name?: string
              p_phone?: string
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_email: string
              p_full_name?: string
              p_phone?: string
              p_provider_id?: string
              p_user_id: string
            }
            Returns: string
          }
      create_fleet_consolidated_invoice: {
        Args: {
          _invoice_number?: string
          _notes?: string
          _processing_fee_enabled?: boolean
          _processing_fee_type?: string
          _processing_fee_value?: number
          _tax_enabled?: boolean
          _tax_rate?: number
          _work_order_ids: string[]
        }
        Returns: {
          invoice_id: string
          invoice_number: string
          line_item_count: number
          subtotal: number
          total: number
          work_order_count: number
        }[]
      }
      create_fleet_consolidated_invoice_v2: {
        Args: {
          _invoice_number?: string
          _notes?: string
          _processing_fee_enabled?: boolean
          _processing_fee_type?: string
          _processing_fee_value?: number
          _tax_enabled?: boolean
          _tax_rate?: number
          _work_order_ids: string[]
        }
        Returns: {
          invoice_id: string
          invoice_number: string
          line_item_count: number
          subtotal: number
          total: number
          work_order_count: number
        }[]
      }
      create_fleet_consolidated_invoice_v3: {
        Args: {
          _invoice_number?: string
          _notes?: string
          _processing_fee_enabled?: boolean
          _processing_fee_type?: string
          _processing_fee_value?: number
          _tax_enabled?: boolean
          _tax_rate?: number
          _work_order_ids: string[]
        }
        Returns: {
          invoice_id: string
          invoice_number: string
          line_item_count: number
          subtotal: number
          total: number
          work_order_count: number
        }[]
      }
      create_fleet_job_for_work_orders_v1: {
        Args: { p_notes?: string; p_work_order_ids: string[] }
        Returns: Json
      }
      create_fleet_portal_service_request_v1: {
        Args: {
          p_client_id: string
          p_priority?: string
          p_subject: string
          p_summary: string
          p_vehicle_id: string
        }
        Returns: string
      }
      create_fleet_request_from_email_v1: {
        Args: { p_disposition?: string; p_message_id: string }
        Returns: string
      }
      create_internal_fleet_service_request_v1: {
        Args: {
          p_fleet_client_id?: string
          p_fleet_vehicle_id?: string
          p_subject: string
          p_summary?: string
        }
        Returns: string
      }
      create_inventory_restock_request_v1: {
        Args: { p_items: Json; p_note?: string; p_van_id: string }
        Returns: string
      }
      create_team_os_technician_v1: {
        Args: {
          p_email?: string
          p_name: string
          p_phone?: string
          p_profile?: Json
          p_role?: string
          p_send_invite?: boolean
        }
        Returns: Json
      }
      cron_tick_15min: { Args: never; Returns: undefined }
      cron_tick_5min: { Args: never; Returns: undefined }
      cron_tick_hourly: { Args: never; Returns: undefined }
      cron_tick_minute: { Args: never; Returns: undefined }
      cron_tick_nightly: { Args: never; Returns: undefined }
      cron_try_invoke: {
        Args: { p_body?: Json; p_function_name: string }
        Returns: undefined
      }
      current_tech_business_user_id: { Args: never; Returns: string }
      current_workspace_owner_user_id: { Args: never; Returns: string }
      customers_in_radius: {
        Args: {
          p_lat: number
          p_lng: number
          p_radius_miles: number
          p_user_id: string
        }
        Returns: {
          id: string
        }[]
      }
      database_production_safety_audit: { Args: never; Returns: Json }
      decrement_inventory_quantity: {
        Args: { p_item_id: string; p_quantity: number }
        Returns: number
      }
      decrypt_google_calendar_token: {
        Args: { encrypted_token: string }
        Returns: string
      }
      decrypt_smtp_password: {
        Args: { encrypted_password: string }
        Returns: string
      }
      decrypt_square_token: {
        Args: { p_encrypted: string; p_key: string }
        Returns: string
      }
      deliver_fleet_dispatch_outbox_v1: {
        Args: { p_outbox_id: string }
        Returns: undefined
      }
      dry_run_rewards_backfill: {
        Args: {
          p_from_completed_at?: string
          p_limit?: number
          p_provider_id: string
          p_to_completed_at?: string
        }
        Returns: Json
      }
      emit_retention_event: {
        Args: {
          p_aggregate_id: string
          p_aggregate_type: string
          p_customer_id?: string
          p_event_name: string
          p_payload?: Json
          p_user_id: string
          p_vehicle_id?: string
        }
        Returns: string
      }
      encrypt_google_calendar_token: {
        Args: { plain_token: string }
        Returns: string
      }
      encrypt_smtp_password: {
        Args: { plain_password: string }
        Returns: string
      }
      encrypt_square_token: {
        Args: { p_key: string; p_token: string }
        Returns: string
      }
      end_break: { Args: never; Returns: undefined }
      enqueue_appointment_reminders: { Args: never; Returns: number }
      enqueue_monthly_newsletter_emails: {
        Args: { p_run_at?: string }
        Returns: number
      }
      ensure_admin_technician_record: { Args: never; Returns: undefined }
      ensure_direct_thread: {
        Args: { p_other_user_id: string }
        Returns: string
      }
      ensure_job_execution_checklist_v1: {
        Args: { p_job_id: string; p_source: string }
        Returns: number
      }
      ensure_job_thread: {
        Args: { p_created_by: string; p_job_id: string; p_job_source: string }
        Returns: string
      }
      ensure_sms_credit_period_v1: {
        Args: { p_user_id: string }
        Returns: {
          channel: string
          created_at: string
          id: string
          included_units: number
          period_end: string
          period_start: string
          purchased_units: number
          reserved_units: number
          updated_at: string
          used_units: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_message_credits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      execute_rewards_backfill_batch: {
        Args: {
          p_actor_id: string
          p_from_completed_at?: string
          p_limit?: number
          p_provider_id: string
          p_resume_after_appointment_id?: string
          p_to_completed_at?: string
        }
        Returns: Json
      }
      finalize_sms_credits_v1: {
        Args: {
          p_error?: string
          p_ledger_id: string
          p_provider_message_id?: string
          p_refund?: boolean
          p_success: boolean
        }
        Returns: undefined
      }
      fleet_workspace_role_v1: {
        Args: { p_owner_user_id: string }
        Returns: string
      }
      get_appointment_by_token: {
        Args: { p_business_slug: string; p_management_token: string }
        Returns: {
          allow_cancellation: boolean
          allow_rescheduling: boolean
          business_name: string
          cancellation_window_hours: number
          created_at: string
          description: string
          duration_minutes: number
          estimated_cost: number
          guest_email: string
          guest_name: string
          guest_phone: string
          id: string
          notes: string
          reschedule_window_hours: number
          scheduled_date: string
          scheduled_time: string
          service_catalog_id: string
          status: string
          tax_amount: number
          title: string
        }[]
      }
      get_appointments_pending_calendar_sync: {
        Args: { p_user_id: string }
        Returns: {
          business_timezone: string
          customer_email: string
          customer_name: string
          customer_phone: string
          description: string
          duration_minutes: number
          id: string
          location_address: string
          notes: string
          owner_user_id: string
          scheduled_date: string
          scheduled_time: string
          service_names: string
          status: string
          technician_name: string
          title: string
          vehicle_label: string
          vehicle_vin: string
        }[]
      }
      get_automation_job_health_v1: {
        Args: never
        Returns: {
          active: boolean
          cadence_note: string
          criticality: string
          cron_expression: string
          function_name: string
          is_scheduled: boolean
          is_stale: boolean
          job_name: string
          last_http_body: string
          last_http_status: number
          last_run_started_at: string
          last_run_status: string
          minutes_since_last_run: number
          owner: string
          recent_failures: number
          recent_runs: number
          trigger_kind: string
        }[]
      }
      get_booked_slots: {
        Args: { booking_date: string; business_user_id: string }
        Returns: {
          duration_minutes: number
          scheduled_time: string
        }[]
      }
      get_customer_portal_appointments: {
        Args: never
        Returns: {
          actual_end_time: string
          actual_start_time: string
          assigned_at: string
          created_at: string
          description: string
          duration_minutes: number
          estimated_cost: number
          guest_name: string
          id: string
          location_address: string
          management_token: string
          notes: string
          payment_status: string
          scheduled_date: string
          scheduled_time: string
          service_catalog_name: string
          status: string
          title: string
        }[]
      }
      get_customer_rewards_dashboard: {
        Args: { p_customer_account_id?: string }
        Returns: Json
      }
      get_directory_provider_profile: {
        Args: { booking_slug_param: string }
        Returns: {
          booking_slug: string
          business_name: string
          city: string
          cover_image_url: string
          google_review_url: string
          logo_url: string
          marketplace_description: string
          phone: string
          postal_code: string
          service_address: string
          service_radius_miles: number
          state: string
          user_id: string
          website_url: string
          yelp_review_url: string
        }[]
      }
      get_eligible_technicians: {
        Args: {
          p_date: string
          p_duration_minutes: number
          p_required_skill?: string
          p_time: string
          p_user_id: string
          p_zip_code?: string
        }
        Returns: {
          email: string
          jobs_today: number
          max_daily_capacity_hours: number
          name: string
          performance_score: number
          scheduled_hours_today: number
          skill_match: boolean
          status: string
          technician_id: string
        }[]
      }
      get_fleet_dispatch_health_v1: { Args: never; Returns: Json }
      get_fleet_dispatch_next_actions_v1: {
        Args: { p_limit?: number }
        Returns: Json
      }
      get_fleet_mail_connection: {
        Args: { p_user_id: string }
        Returns: {
          from_email: string
          from_name: string
          imap_enabled: boolean
          imap_host: string
          imap_last_error: string
          imap_last_synced_at: string
          imap_last_uid: number
          imap_password: string
          imap_port: number
          imap_secure: boolean
          imap_username: string
          reply_to_email: string
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_username: string
          use_custom_smtp: boolean
        }[]
      }
      get_fleet_manager_portal_v1: {
        Args: { p_client_id?: string }
        Returns: Json
      }
      get_fleet_operations_failures_v1: {
        Args: { p_limit?: number }
        Returns: Json
      }
      get_fleet_resource_capacity_v1: {
        Args: { p_date: string }
        Returns: {
          available_end: string
          available_minutes: number
          available_start: string
          is_blacked_out: boolean
          jobs_scheduled: number
          max_jobs: number
          remaining_minutes: number
          scheduled_minutes: number
          technician_id: string
          technician_name: string
        }[]
      }
      get_geo_appointments_for_date: {
        Args: { p_date: string; p_user_id: string }
        Returns: {
          appointment_id: string
          duration_minutes: number
          location_lat: number
          location_lng: number
          scheduled_time: string
          technician_id: string
          travel_minutes: number
        }[]
      }
      get_newsletter_subscriber_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_next_newsletter_template: {
        Args: { p_sequence_id: string }
        Returns: {
          content: string
          holiday_theme: string
          id: string
          month_number: number
          preview_text: string
          seasonal_theme: string
          subject: string
        }[]
      }
      get_platform_plan_for_user: {
        Args: { p_user_id: string }
        Returns: {
          badge_color: string | null
          badge_label: string | null
          billing_interval: string
          created_at: string
          description: string | null
          display_name: string
          display_order: number
          has_ai_assistant: boolean
          has_ai_routing: boolean
          has_carfax_integration: boolean
          has_dispatch_engine: boolean
          has_fleet_os: boolean
          has_invoicing_basic: boolean
          has_invoicing_full: boolean
          has_marketing_automation: boolean
          has_public_booking: boolean
          has_pwa_offline: boolean
          has_quickbooks_sync: boolean
          has_stripe_payments: boolean
          has_technician_os: boolean
          highlight: boolean
          id: string
          is_active: boolean
          is_contact_sales: boolean
          max_appointments_per_month: number | null
          max_customers: number | null
          max_technician_seats: number | null
          min_platform_fee_cents: number
          name: string
          platform_fee_bps: number
          price_cents: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          support_level: string | null
          tax_compliance_level: string | null
          trial_period_days: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_platform_stats: { Args: never; Returns: Json }
      get_provider_rewards_ledger: {
        Args: {
          p_appointment_id?: string
          p_customer_id?: string
          p_event_type?: Database["public"]["Enums"]["loyalty_event_type"]
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_provider_id: string
          p_to?: string
        }
        Returns: Json
      }
      public_booking_book_appointment: {
        Args: {
          p_booking_slug: string
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
      public_booking_insert_services: {
        Args: { p_booking_slug: string; p_appointment_id: string; p_services: Json }
        Returns: number
      }
      public_booking_record_payment_intent_v2: {
        Args: {
          p_amount: number
          p_appointment_id: string
          p_booking_slug: string
          p_currency: string
          p_customer_email: string
          p_customer_name: string
          p_subtotal: number
          p_tax_amount: number
          p_tax_rate: number
        }
        Returns: string
      }
      public_booking_save_configuration: {
        Args: { p_booking_slug: string; p_appointment_id: string; p_configuration: Json }
        Returns: undefined
      }
      public_booking_set_vehicle_tire_spec_v2: {
        Args: {
          p_booking_slug: string
          p_customer_email: string
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
      public_booking_upsert_customer: {
        Args: { p_address?: string; p_booking_slug: string; p_email: string; p_name: string; p_phone?: string }
        Returns: string
      }
      public_booking_upsert_vehicle: {
        Args: {
          p_booking_slug: string
          p_customer_email: string
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
      get_public_blocked_dates:
        | {
            Args: { p_business_user_id: string }
            Returns: {
              blocked_date: string
              reason: string
            }[]
          }
        | {
            Args: { p_business_user_id: string; p_customer_account_id?: string }
            Returns: {
              blocked_date: string
              reason: string
            }[]
          }
      get_public_booking_profile: {
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
      get_public_detailing_pricing_rules: {
        Args: { p_business_user_id: string }
        Returns: {
          condition: string
          duration_multiplier: number
          flat_fee: number
          id: string
          photo_required: boolean
          price_multiplier: number
          quote_required: boolean
          requires_covered_area: boolean
          requires_power: boolean
          requires_water: boolean
          service_catalog_id: string
          size_tier: string
        }[]
      }
      get_public_intake_questions: {
        Args: { business_user_id: string }
        Returns: {
          id: string
          is_required: boolean
          options: Json
          question_text: string
          question_type: string
          sort_order: number
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
      get_public_tire_inventory: {
        Args: { p_business_user_id: string; p_tire_size: string }
        Returns: {
          available_quantity: number
          id: string
          image_url: string
          name: string
          sell_price: number
          sku: string
          tire_load_index: string
          tire_position: string
          tire_season: string
          tire_size: string
          tire_speed_rating: string
        }[]
      }
      get_public_tire_service_pricing: {
        Args: { p_business_user_id: string }
        Returns: {
          alignment_price: number
          allows_manual_fitment: boolean
          allows_staggered_fitment: boolean
          base_installation_price: number
          disposal_price: number
          duration_minutes_per_tire: number
          maximum_quantity: number
          minimum_quantity: number
          mount_balance_price: number
          requires_fitment_lookup: boolean
          requires_inventory_selection: boolean
          service_catalog_id: string
          tpms_service_price: number
        }[]
      }
      get_required_part_categories: {
        Args: { p_service_catalog_id: string }
        Returns: string[]
      }
      get_rewards_operations_summary: {
        Args: { p_provider_id: string }
        Returns: Json
      }
      get_rewards_production_health: {
        Args: { p_provider_id: string }
        Returns: Json
      }
      get_rewards_rollout_readiness: {
        Args: { p_provider_id: string }
        Returns: Json
      }
      get_stale_calendar_events: {
        Args: { p_user_id: string }
        Returns: {
          appointment_id: string
          calendar_id: string
          google_event_id: string
        }[]
      }
      get_team_invitation: {
        Args: { p_token: string }
        Returns: {
          business_name: string
          email: string
          expires_at: string
          id: string
          name: string
          role: string
          status: string
        }[]
      }
      get_team_os_technician_snapshot_v1: {
        Args: { p_from: string; p_to: string }
        Returns: {
          access_state: string
          active_skill_count: number
          assigned_van_id: string
          assigned_van_name: string
          available_minutes: number
          collected_revenue: number
          completed_jobs: number
          compliance_issue_count: number
          current_job: Json
          data_fresh_at: string
          employment_state: string
          expiring_skill_count: number
          field_status: string
          next_job: Json
          onboarding_open_count: number
          productive_minutes: number
          technician_id: string
          utilization: number
          workspace_user_id: string
        }[]
      }
      get_technician_app_context_v1: { Args: never; Returns: Json }
      get_technician_job_workspace_v1: {
        Args: { p_job_id: string }
        Returns: Json
      }
      get_technician_job_workspace_v2: {
        Args: { p_job_id: string }
        Returns: Json
      }
      get_technician_session_v2: { Args: never; Returns: Json }
      get_user_email_settings: {
        Args: { p_user_id: string }
        Returns: {
          from_email: string
          from_name: string
          reply_to_email: string
          smtp_host: string
          smtp_password_decrypted: string
          smtp_port: number
          smtp_username: string
          use_custom_smtp: boolean
          verified: boolean
        }[]
      }
      get_user_plan: {
        Args: { p_user_id: string }
        Returns: {
          current_period_end: string
          features: Json
          grace_period_ends_at: string
          max_appointments: number
          max_customers: number
          max_technicians: number
          plan_display_name: string
          plan_name: string
          status: string
        }[]
      }
      get_user_plan_features: { Args: { p_user_id: string }; Returns: Json }
      get_vehicle_part_suggestions_v1: {
        Args: { p_vehicle_id: string; p_vehicle_kind: string }
        Returns: {
          brand: string
          inventory_item_id: string
          is_required: boolean
          oem_number: string
          part_category: string
          part_number: string
          quantity: number
          source: string
        }[]
      }
      get_vehicle_spec_makes: {
        Args: { selected_year: number }
        Returns: {
          make: string
        }[]
      }
      get_vehicle_spec_models: {
        Args: { selected_make: string; selected_year: number }
        Returns: {
          model: string
        }[]
      }
      get_vehicle_spec_years: {
        Args: never
        Returns: {
          year: number
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
      get_workspace_brand_v1: {
        Args: { p_workspace_user_id: string }
        Returns: {
          address: string
          brand_background_color: string
          brand_font_family: string
          brand_primary_color: string
          brand_secondary_color: string
          business_name: string
          city: string
          email: string
          logo_url: string
          phone: string
          state: string
          website_url: string
        }[]
      }
      get_workspace_email_connection_status: {
        Args: never
        Returns: {
          from_email: string
          imap_configured: boolean
          imap_enabled: boolean
          imap_host: string
          imap_last_error: string
          imap_last_synced_at: string
          imap_username: string
          smtp_configured: boolean
          smtp_host: string
          smtp_username: string
          updated_at: string
          use_custom_smtp: boolean
          workspace_user_id: string
        }[]
      }
      has_platform_feature: {
        Args: { p_feature: string; p_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_access: {
        Args: { _owner_user_id: string; _roles: string[] }
        Returns: boolean
      }
      increment_usage: {
        Args: { p_metric: string; p_user_id: string }
        Returns: Json
      }
      ingest_fleet_service_request_v1: {
        Args: {
          p_fleet_client_id?: string
          p_fleet_location_id?: string
          p_fleet_vehicle_id?: string
          p_requester_email?: string
          p_requester_name?: string
          p_source_metadata?: Json
          p_source_record_id: string
          p_source_type: string
          p_subject: string
          p_summary: string
          p_user_id: string
        }
        Returns: string
      }
      ingest_fleet_website_request_v1: {
        Args: {
          p_idempotency_key: string
          p_preferred_date?: string
          p_requester_email: string
          p_requester_name: string
          p_source_metadata?: Json
          p_subject: string
          p_summary: string
          p_user_id: string
        }
        Returns: string
      }
      ingest_location_event_batch: { Args: { p_events: Json }; Returns: Json }
      insert_booking_appointment_services: {
        Args: { p_appointment_id: string; p_services: Json }
        Returns: undefined
      }
      invoke_internal_function: {
        Args: { p_body?: Json; p_function_name: string }
        Returns: number
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_job_execution_actor: {
        Args: { _job_id: string; _job_source: string; _owner: string }
        Returns: boolean
      }
      is_job_thread_participant: {
        Args: { _thread_id: string }
        Returns: boolean
      }
      is_team_manager_of: { Args: { _owner_id: string }; Returns: boolean }
      is_weather_guard_slot_blocked: {
        Args: {
          p_business_user_id: string
          p_duration_minutes?: number
          p_scheduled_date: string
          p_scheduled_time: string
        }
        Returns: {
          blocked: boolean
          reason: string
        }[]
      }
      is_workspace_member: {
        Args: { _owner_user_id: string }
        Returns: boolean
      }
      log_cash_drawer_event: {
        Args: {
          p_amount?: number
          p_appointment_id?: string
          p_event_type: string
          p_payment_id?: string
          p_payment_method?: string
          p_reason?: string
          p_trigger_type: string
        }
        Returns: string
      }
      lookup_booking_rewards: {
        Args: {
          p_customer_account_id?: string
          p_email?: string
          p_provider_id: string
        }
        Returns: Json
      }
      lookup_vehicle_parts: {
        Args: { p_make: string; p_model: string; p_year: number }
        Returns: {
          brand: Database["public"]["Enums"]["filter_brand"]
          engine: string
          filter_type: Database["public"]["Enums"]["filter_type"]
          notes: string
          oem_number: string
          part_number: string
          part_number_alt: string
        }[]
      }
      manage_team_os_technician_access_v1: {
        Args: {
          p_action: string
          p_notes?: string
          p_reassign_to?: string
          p_role?: string
          p_technician_id: string
        }
        Returns: Json
      }
      mark_job_thread_read_v1: {
        Args: { p_thread_id: string }
        Returns: undefined
      }
      match_vendor_by_name: {
        Args: { p_raw_name: string; p_user_id: string }
        Returns: {
          default_category_id: string
          match_score: number
          match_source: string
          vendor_id: string
          vendor_name: string
        }[]
      }
      notify_abandoned_booking: { Args: { row_id: string }; Returns: undefined }
      override_loyalty_reward_expiration: {
        Args: {
          p_actor_id: string
          p_expires_at: string
          p_reason_code: string
          p_reason_note?: string
          p_reward_instance_id: string
        }
        Returns: Json
      }
      parse_oil_capacity_qt: { Args: { p_text: string }; Returns: number }
      populate_user_service_catalog: {
        Args: { p_user_id: string }
        Returns: number
      }
      populate_user_service_packages: {
        Args: { p_user_id: string }
        Returns: number
      }
      process_due_recurring_expenses: {
        Args: { p_user_id: string }
        Returns: number
      }
      promote_abandoned_bookings_to_signals: { Args: never; Returns: number }
      promote_fleet_work_order_draft_v2: {
        Args: { p_draft_id: string }
        Returns: string[]
      }
      prune_stale_live_sessions: { Args: never; Returns: undefined }
      public_has_voice_agent: {
        Args: { booking_slug_param: string }
        Returns: boolean
      }
      recalc_retention_vehicle_profile: {
        Args: { p_vehicle_id: string }
        Returns: undefined
      }
      recalculate_customer_ltv: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      recompute_po_totals: {
        Args: { p_po_id: string; p_user_id: string }
        Returns: undefined
      }
      record_auth_security_event_v1: {
        Args: { p_event_type: string; p_metadata?: Json }
        Returns: undefined
      }
      record_fleet_invoice_payment:
        | {
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
        | {
            Args: {
              p_amount: number
              p_notes?: string
              p_payment_method?: string
              p_reference?: string
              p_work_order_id: string
            }
            Returns: {
              amount_paid: number
              balance_due: number
              payment_status: string
            }[]
          }
      record_inventory_movement_v1: {
        Args: {
          p_entry_type: string
          p_idempotency_key: string
          p_job_id?: string
          p_job_source?: string
          p_note?: string
          p_quantity: number
          p_van_inventory_id: string
        }
        Returns: Json
      }
      record_job_message_delivery_result_v1: {
        Args: {
          p_delivery_id: string
          p_error?: string
          p_max_attempts?: number
          p_provider_message_id?: string
          p_success: boolean
        }
        Returns: undefined
      }
      record_manual_payment_atomic: {
        Args: {
          p_amount: number
          p_caller_user_id?: string
          p_notes?: string
          p_payment_id: string
          p_payment_method: string
          p_waive_fees?: boolean
          p_waive_remaining?: boolean
          p_waive_tax?: boolean
        }
        Returns: Json
      }
      record_public_booking_payment_intent_v1: {
        Args: {
          p_amount: number
          p_appointment_id: string
          p_business_user_id: string
          p_currency?: string
          p_customer_email?: string
          p_customer_name?: string
          p_subtotal: number
          p_tax_amount?: number
          p_tax_rate?: number
        }
        Returns: string
      }
      redeem_booking_reward: {
        Args: {
          p_appointment_id: string
          p_idempotency_key?: string
          p_payment_record_id?: string
          p_reward_instance_id: string
        }
        Returns: Json
      }
      refresh_campaign_message_rollups: {
        Args: { p_campaign_id?: string }
        Returns: number
      }
      refresh_fleet_due_status: {
        Args: { p_user_id?: string }
        Returns: {
          updated_vehicles: number
          upserted_schedules: number
        }[]
      }
      refund_sms_segments: {
        Args: { p_segments: number; p_user_id: string }
        Returns: undefined
      }
      release_appointment_reservations: {
        Args: { p_appointment_id: string }
        Returns: number
      }
      release_expired_reward_reservations: {
        Args: { p_limit?: number }
        Returns: Json
      }
      replace_detailing_pricing_rules: {
        Args: { p_rules: Json }
        Returns: number
      }
      replace_detailing_pricing_rules_for_service: {
        Args: { p_rules: Json; p_service_catalog_id: string }
        Returns: number
      }
      replay_fleet_intake_dead_letter_v1: {
        Args: { p_dead_letter_id: string }
        Returns: string
      }
      reschedule_appointment_by_token: {
        Args: {
          p_management_token: string
          p_new_date: string
          p_new_time: string
        }
        Returns: Json
      }
      reschedule_fleet_work_order_v1: {
        Args: {
          p_date: string
          p_expected_updated_at: string
          p_start: string
          p_work_order_id: string
        }
        Returns: {
          accepted_at: string | null
          approval_required: boolean
          approval_threshold: number | null
          arrived_at: string | null
          assigned_technician_id: string | null
          assigned_van_id: string | null
          checkin_geo: Json | null
          checkout_geo: Json | null
          completed_at: string | null
          completion_status: string | null
          completion_vin_captured: string | null
          completion_vin_matched: boolean | null
          compliance_invoice_format_ok: boolean
          compliance_notes_ok: boolean
          compliance_photos_attached: boolean
          compliance_po_attached: boolean
          created_at: string
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          description: string | null
          digital_signature_url: string | null
          en_route_at: string | null
          external_po: string | null
          fleet_client_id: string
          fleet_contract_id: string | null
          fleet_job_id: string | null
          fleet_location_id: string | null
          fleet_purchase_order_id: string | null
          fleet_vehicle_id: string
          id: string
          import_batch_id: string | null
          internal_po: string | null
          invoice_balance_due: number
          invoice_id: string | null
          invoice_paid_amount: number
          invoice_status: string | null
          invoiced_at: string | null
          labor_hours: number | null
          mileage_at_service: number | null
          next_service_date: string | null
          next_service_mileage: number | null
          notes: string | null
          odometer_in: number | null
          odometer_out: number | null
          order_number: string | null
          origin_source: string | null
          paid_at: string | null
          parts_used: Json | null
          payment_record_id: string | null
          photos: string[] | null
          po_authorization_status: string
          po_number: string | null
          priority: string
          required_skill: string | null
          scheduled_date: string | null
          scheduled_duration_minutes: number
          scheduled_time: string | null
          service_type: string | null
          signature_captured_at: string | null
          sla_deadline: string | null
          source: string | null
          source_draft_id: string | null
          source_request_id: string | null
          source_schedule_id: string | null
          started_at: string | null
          status: string
          submitted_at: string | null
          subtotal: number | null
          tax_amount: number | null
          technician_notes: string | null
          tekmetric_ro_id: string | null
          tekmetric_synced_at: string | null
          total: number | null
          updated_at: string
          user_id: string
          vin: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fleet_work_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_booking_reward: {
        Args: {
          p_appointment_id: string
          p_customer_email?: string
          p_idempotency_key?: string
          p_provider_id: string
          p_reservation_minutes?: number
          p_reward_instance_id: string
        }
        Returns: Json
      }
      reserve_oil_for_appointment: {
        Args: {
          p_appointment_id: string
          p_expires_in_hours?: number
          p_inventory_item_id: string
          p_quantity_qt: number
          p_van_id?: string
        }
        Returns: {
          reservation_id: string
          reserved_quantity: number
          resolved_van_id: string
          shortage: number
          source: string
        }[]
      }
      reserve_parts_for_appointment: {
        Args: {
          p_appointment_id: string
          p_expires_in_hours?: number
          p_items?: Json
          p_van_id?: string
        }
        Returns: {
          inventory_item_id: string
          reservation_id: string
          reserved_quantity: number
          shortage: number
          source: string
          unit: string
        }[]
      }
      reserve_sms_segments: {
        Args: { p_segments: number; p_user_id: string }
        Returns: boolean
      }
      reserve_tire_inventory_for_appointment: {
        Args: {
          p_appointment_id: string
          p_business_user_id: string
          p_inventory_item_id: string
          p_quantity: number
        }
        Returns: string
      }
      resolve_fleet_work_order_draft_pricing: {
        Args: { _draft_id: string }
        Returns: Json
      }
      resolve_oil_reset_procedure_v1: {
        Args: { p_make: string; p_model: string; p_year: number }
        Returns: {
          make: string
          method: string
          model: string
          notes: string
          steps: Json
          trim_or_engine: string
        }[]
      }
      resolve_rewards_customer_identity: {
        Args: {
          p_appointment_id?: string
          p_customer_account_id?: string
          p_customer_id?: string
          p_email?: string
          p_link_appointment?: boolean
          p_provider_id: string
        }
        Returns: {
          appointment_linked: boolean
          candidate_count: number
          customer_account_id: string
          customer_id: string
          display_name: string
          is_ambiguous: boolean
          masked_email: string
          match_source: string
          match_status: string
          normalized_email: string
          provider_id: string
        }[]
      }
      resolve_service_zone: {
        Args: { p_lat: number; p_lng: number; p_user_id: string }
        Returns: {
          distance_miles: number
          zone_id: string
          zone_name: string
          zone_type: string
        }[]
      }
      resolve_vehicle_filters_v1: {
        Args: {
          p_engine?: string
          p_make: string
          p_model: string
          p_vehicle_id?: string
          p_vehicle_kind?: string
          p_year: number
        }
        Returns: {
          brand: string
          confidence: number
          engine: string
          oem_number: string
          part_category: string
          part_number: string
          part_number_alt: string
          quantity: number
          source: string
          substitutes: Json
        }[]
      }
      respond_fleet_portal_approval_v1: {
        Args: { p_approval_id: string; p_notes?: string; p_status: string }
        Returns: undefined
      }
      restock_van: {
        Args: {
          p_item_id: string
          p_notes?: string
          p_quantity: number
          p_van_id: string
        }
        Returns: string
      }
      retention_canonical_signal_type: {
        Args: { p_signal_type: string }
        Returns: string
      }
      retry_appointment_rewards_application: {
        Args: {
          p_actor_id: string
          p_appointment_id: string
          p_reason_code: string
          p_reason_note?: string
        }
        Returns: Json
      }
      retry_fleet_operational_failure_v1: {
        Args: { p_id: string; p_kind: string }
        Returns: undefined
      }
      retry_job_message_delivery_v1: {
        Args: { p_delivery_id: string }
        Returns: undefined
      }
      sanitize_tracking_script: { Args: { p_script: string }; Returns: string }
      save_appointment_booking_configuration: {
        Args: {
          p_appointment_id: string
          p_business_user_id: string
          p_configuration: Json
        }
        Returns: string
      }
      save_technician_fleet_job_notes_v1: {
        Args: { p_job_id: string; p_notes: string }
        Returns: undefined
      }
      schedule_follow_up: {
        Args: {
          p_customer_id: string
          p_declined_service_id?: string
          p_rule_id: string
          p_scheduled_for: string
          p_trigger_entity_id?: string
          p_trigger_entity_type?: string
          p_trigger_type: string
        }
        Returns: string
      }
      search_fleet_dispatch_v1: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          entity_id: string
          entity_type: string
          fleet_client_id: string
          fleet_location_id: string
          search_rank: number
          subtitle: string
          title: string
        }[]
      }
      search_public_providers: {
        Args: { p_limit?: number; p_offset?: number; search_text?: string }
        Returns: {
          booking_slug: string
          booking_url: string
          business_name: string
          city: string
          description: string
          logo_url: string
          postal_code: string
          service_address: string
          state: string
          total_count: number
          user_id: string
        }[]
      }
      seed_default_automation_rules: {
        Args: { p_user_id: string }
        Returns: number
      }
      seed_default_customer_segments: {
        Args: { p_user_id: string }
        Returns: number
      }
      seed_default_dispatch_rules: {
        Args: { _user_id: string }
        Returns: undefined
      }
      seed_default_expense_categories: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      seed_default_follow_up_rules: {
        Args: { p_user_id: string }
        Returns: number
      }
      seed_default_parts_catalog: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      seed_default_tax_rates: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      seed_default_vendors: { Args: { p_user_id: string }; Returns: undefined }
      select_active_workspace_v1: {
        Args: { p_owner_user_id: string; p_role?: string }
        Returns: {
          landing_path: string
          role: string
          workspace_user_id: string
        }[]
      }
      send_internal_thread_message_v1: {
        Args: { p_attachments?: Json; p_content: string; p_thread_id: string }
        Returns: string
      }
      send_job_thread_message_v2: {
        Args: {
          p_attachments?: Json
          p_channel?: string
          p_client_message_id?: string
          p_content: string
          p_job_id: string
          p_job_source: string
          p_recipient?: string
        }
        Returns: Json
      }
      set_vehicle_tire_spec_v1: {
        Args: {
          p_business_user_id: string
          p_tire_load_index?: string
          p_tire_size?: string
          p_tire_size_front?: string
          p_tire_size_rear?: string
          p_tire_size_source?: string
          p_tire_speed_rating?: string
          p_vehicle_id: string
        }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sms_credit_balance_v1: { Args: { p_user_id: string }; Returns: Json }
      soft_delete_business_profile: {
        Args: { _profile_id: string; _reason?: string }
        Returns: undefined
      }
      soft_delete_customer_preference: {
        Args: { _preference_id: string; _reason?: string }
        Returns: undefined
      }
      soft_delete_email_setting: {
        Args: { _reason?: string; _setting_id: string }
        Returns: undefined
      }
      soft_delete_follow_up_rule: {
        Args: { _reason?: string; _rule_id: string }
        Returns: undefined
      }
      soft_delete_invoice: {
        Args: { _invoice_id: string; _reason?: string }
        Returns: undefined
      }
      soft_delete_invoice_line_item: {
        Args: { _line_item_id: string; _reason?: string }
        Returns: undefined
      }
      soft_delete_invoice_line_items_for_invoice: {
        Args: { _invoice_id: string; _reason?: string }
        Returns: number
      }
      soft_delete_payment_record: {
        Args: { _payment_id: string; _reason?: string }
        Returns: {
          amount: number
          appointment_id: string | null
          cleared_at: string | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          id: string
          import_batch_id: string | null
          invoice_sent_at: string | null
          metadata: Json | null
          origin_source: string | null
          payment_type: string | null
          platform_fee: number | null
          pricing_snapshot: Json | null
          processor_fee_amount: number
          refund_amount: number | null
          refund_reason: string | null
          refunded_at: string | null
          settled_at: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          stripe_connected_account_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          subtotal: number | null
          tax_amount: number | null
          tax_breakdown: Json | null
          tax_rate: number | null
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      soft_delete_service: {
        Args: { _reason?: string; _service_id: string }
        Returns: undefined
      }
      soft_delete_work_order: {
        Args: { _reason?: string; _work_order_id: string }
        Returns: undefined
      }
      start_appointment_job: {
        Args: { p_appointment_id: string }
        Returns: Json
      }
      start_break: { Args: never; Returns: undefined }
      subscribe_to_newsletter: {
        Args: {
          p_email: string
          p_ip?: string
          p_name?: string
          p_segment?: string
          p_source?: string
          p_user_agent?: string
          p_utm?: Json
          p_workspace_user_id: string
        }
        Returns: {
          status: string
          subscriber_id: string
          unsubscribe_token: string
        }[]
      }
      sync_automation_schedule: {
        Args: never
        Returns: {
          action: string
          job_name: string
        }[]
      }
      team_os_access_state: {
        Args: {
          p_account_status: string
          p_auth_user_id: string
          p_invitation_id: string
        }
        Returns: string
      }
      tech_lifecycle_stage: {
        Args: { _dispatch_status: string; _status: string }
        Returns: string
      }
      tech_transition_allowed: {
        Args: { _from: string; _to: string }
        Returns: boolean
      }
      technician_transition_job_v1: {
        Args: {
          p_expected_updated_at?: string
          p_idempotency_key?: string
          p_job_id: string
          p_next_status: string
          p_notes?: string
          p_source: string
        }
        Returns: Json
      }
      track_declined_service: {
        Args: {
          p_appointment_id?: string
          p_catalog_item_id?: string
          p_customer_id: string
          p_decline_reason?: string
          p_estimated_cost: number
          p_notes?: string
          p_recommended_service: string
          p_urgency?: string
          p_vehicle_id: string
        }
        Returns: string
      }
      transfer_inventory_to_van: {
        Args: {
          p_idempotency_key?: string
          p_item_id: string
          p_quantity: number
          p_van_id: string
        }
        Returns: Json
      }
      transition_fleet_work_order: {
        Args: {
          p_actor_role?: string
          p_details?: Json
          p_reason_code?: string
          p_target_status: string
          p_work_order_id: string
        }
        Returns: {
          new_status: string
          old_status: string
        }[]
      }
      unsubscribe_newsletter_by_token: {
        Args: { p_token: string }
        Returns: boolean
      }
      update_customer_stats: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      update_dispatch_status: {
        Args: {
          p_appointment_id: string
          p_location?: Json
          p_notes?: string
          p_status: string
        }
        Returns: undefined
      }
      update_technician_fleet_job_status_v1: {
        Args: { p_job_id: string; p_notes?: string; p_status: string }
        Returns: Json
      }
      update_technician_location: {
        Args: {
          p_accuracy?: number
          p_appointment_id?: string
          p_heading?: number
          p_latitude: number
          p_longitude: number
          p_speed?: number
        }
        Returns: undefined
      }
      upsert_booking_vehicle:
        | {
            Args: {
              p_business_user_id: string
              p_customer_id: string
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
        | {
            Args: {
              p_business_user_id: string
              p_customer_id: string
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
        | {
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
      upsert_operational_alert: {
        Args: {
          p_alert_type: string
          p_details?: Json
          p_fingerprint: string
          p_severity: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_service_package: {
        Args: {
          p_description?: string
          p_discount_type?: string
          p_discount_value?: number
          p_estimated_duration?: number
          p_is_active?: boolean
          p_items?: Json
          p_name?: string
          p_package_id?: string
          p_package_price?: number
        }
        Returns: string
      }
      validate_fleet_work_order_draft: {
        Args: { _draft_id: string }
        Returns: {
          blocking: boolean
          key: string
          message: string
          passed: boolean
          severity: string
          validation_type: string
        }[]
      }
      validate_phone_coupon: {
        Args: { _business_user_id: string; _phone: string }
        Returns: {
          code: string
          description: string
          discount_type: string
          discount_value: number
          min_order_amount: number
        }[]
      }
      validate_rewards_launch_signoff: {
        Args: { p_provider_id: string }
        Returns: Json
      }
      workspace_staff_role: {
        Args: { _owner_user_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "manager"
        | "dispatcher"
        | "technician"
      automation_trigger_kind:
        | "cron"
        | "webhook"
        | "db_trigger"
        | "user_action"
        | "manual"
      data_origin_type: "system_created" | "legacy_import" | "integration"
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
      job_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "dead_letter"
        | "cancelled"
      job_thread_participant_role:
        | "admin"
        | "manager"
        | "dispatcher"
        | "technician"
      job_thread_type: "job" | "direct"
      loyalty_event_type:
        | "points_earned"
        | "points_redeemed"
        | "tier_changed"
        | "reward_unlocked"
        | "reward_redeemed"
        | "manual_adjustment"
      loyalty_reward_status:
        | "issued"
        | "redeemed"
        | "expired"
        | "cancelled"
        | "reserved"
        | "applied"
      loyalty_reward_type:
        | "credit"
        | "free_service"
        | "discount_percent"
        | "discount_fixed"
        | "priority_booking"
      member_role:
        | "owner" | "admin" | "manager" | "service_advisor" | "technician" | "dispatcher" | "receptionist" | "fleet_manager" | "viewer" | "customer"
      retention_campaign_type:
        | "reminder"
        | "winback"
        | "upsell"
        | "renewal"
        | "loyalty"
      retention_signal_status:
        | "detected"
        | "active"
        | "suppressed"
        | "resolved"
        | "expired"
      training_credit_applies_to: "subscription" | "services" | "both"
      training_credit_status:
        | "pending"
        | "applied"
        | "failed"
        | "disabled"
        | "capped"
      training_surface: "fleet_os" | "customer_portal"
      vehicle_lifecycle_status:
        | "active"
        | "due_soon"
        | "overdue"
        | "at_risk"
        | "lost"
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
      app_role: [
        "admin",
        "moderator",
        "user",
        "manager",
        "dispatcher",
        "technician",
      ],
      automation_trigger_kind: [
        "cron",
        "webhook",
        "db_trigger",
        "user_action",
        "manual",
      ],
      data_origin_type: ["system_created", "legacy_import", "integration"],
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
      job_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "dead_letter",
        "cancelled",
      ],
      job_thread_participant_role: [
        "admin",
        "manager",
        "dispatcher",
        "technician",
      ],
      job_thread_type: ["job", "direct"],
      loyalty_event_type: [
        "points_earned",
        "points_redeemed",
        "tier_changed",
        "reward_unlocked",
        "reward_redeemed",
        "manual_adjustment",
      ],
      loyalty_reward_status: [
        "issued",
        "redeemed",
        "expired",
        "cancelled",
        "reserved",
        "applied",
      ],
      loyalty_reward_type: [
        "credit",
        "free_service",
        "discount_percent",
        "discount_fixed",
        "priority_booking",
      ],
      member_role: ["owner", "admin", "manager", "service_advisor", "technician", "dispatcher", "receptionist", "fleet_manager", "viewer", "customer"],
      retention_campaign_type: [
        "reminder",
        "winback",
        "upsell",
        "renewal",
        "loyalty",
      ],
      retention_signal_status: [
        "detected",
        "active",
        "suppressed",
        "resolved",
        "expired",
      ],
      training_credit_applies_to: ["subscription", "services", "both"],
      training_credit_status: [
        "pending",
        "applied",
        "failed",
        "disabled",
        "capped",
      ],
      training_surface: ["fleet_os", "customer_portal"],
      vehicle_lifecycle_status: [
        "active",
        "due_soon",
        "overdue",
        "at_risk",
        "lost",
      ],
    },
  },
} as const
