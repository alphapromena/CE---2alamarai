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
      activity_photos: {
        Row: {
          created_at: string
          daily_report_id: string
          exif_minimal: Json | null
          id: string
          photo_kind: Database["public"]["Enums"]["activity_photo_kind"]
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          daily_report_id: string
          exif_minimal?: Json | null
          id?: string
          photo_kind: Database["public"]["Enums"]["activity_photo_kind"]
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          daily_report_id?: string
          exif_minimal?: Json | null
          id?: string
          photo_kind?: Database["public"]["Enums"]["activity_photo_kind"]
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_photos_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          attendance_id: string | null
          campaign_id: string | null
          created_at: string
          id: string
          location_id: string | null
          message_key: string
          message_params: Json
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          status: Database["public"]["Enums"]["alert_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          attendance_id?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          message_key: string
          message_params?: Json
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: Database["public"]["Enums"]["alert_type"]
          attendance_id?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          message_key?: string
          message_params?: Json
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string
          campaign_id: string
          check_in_distance_m: number | null
          check_in_exif_minimal: Json | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_photo_path: string | null
          check_in_time: string | null
          check_out_distance_m: number | null
          check_out_exif_minimal: Json | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_photo_path: string | null
          check_out_time: string | null
          created_at: string
          id: string
          idempotency_key_check_in: string | null
          idempotency_key_check_out: string | null
          is_within_geofence: boolean
          location_id: string
          notes: string | null
          override_at: string | null
          override_by: string | null
          override_reason: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          supervisor_override: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_date?: string
          campaign_id: string
          check_in_distance_m?: number | null
          check_in_exif_minimal?: Json | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_photo_path?: string | null
          check_in_time?: string | null
          check_out_distance_m?: number | null
          check_out_exif_minimal?: Json | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_photo_path?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          idempotency_key_check_in?: string | null
          idempotency_key_check_out?: string | null
          is_within_geofence?: boolean
          location_id: string
          notes?: string | null
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          supervisor_override?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_date?: string
          campaign_id?: string
          check_in_distance_m?: number | null
          check_in_exif_minimal?: Json | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_photo_path?: string | null
          check_in_time?: string | null
          check_out_distance_m?: number | null
          check_out_exif_minimal?: Json | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_photo_path?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          idempotency_key_check_in?: string | null
          idempotency_key_check_out?: string | null
          is_within_geofence?: boolean
          location_id?: string
          notes?: string | null
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          supervisor_override?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_campaign_location_fk"
            columns: ["campaign_id", "location_id"]
            isOneToOne: false
            referencedRelation: "campaign_locations"
            referencedColumns: ["campaign_id", "location_id"]
          },
          {
            foreignKeyName: "attendance_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_json: Json | null
          before_json: Json | null
          entity: string
          entity_id: string | null
          id: number
          ip: unknown
          ts: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          ip?: unknown
          ts?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          ip?: unknown
          ts?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      break_requests: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          approved_duration_minutes: number | null
          approved_start: string | null
          attendance_id: string | null
          campaign_id: string
          created_at: string
          duration_minutes: number
          id: string
          idempotency_key: string
          location_id: string | null
          promoter_id: string
          reason: string | null
          requested_start: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_reason: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["break_request_status"]
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          approved_duration_minutes?: number | null
          approved_start?: string | null
          attendance_id?: string | null
          campaign_id: string
          created_at?: string
          duration_minutes: number
          id?: string
          idempotency_key: string
          location_id?: string | null
          promoter_id: string
          reason?: string | null
          requested_start: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_reason?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["break_request_status"]
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          approved_duration_minutes?: number | null
          approved_start?: string | null
          attendance_id?: string | null
          campaign_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          idempotency_key?: string
          location_id?: string | null
          promoter_id?: string
          reason?: string | null
          requested_start?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_reason?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["break_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_requests_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_requests_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_requests_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_requests_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_locations: {
        Row: {
          campaign_id: string
          created_at: string
          location_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          location_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_locations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          kpi_config: Json
          name_i18n: Json
          objectives: string | null
          start_date: string
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          kpi_config?: Json
          name_i18n: Json
          objectives?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          kpi_config?: Json
          name_i18n?: Json
          objectives?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name_i18n: Json
          region_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name_i18n: Json
          region_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name_i18n?: Json
          region_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          name_i18n: Json
          show_promoter_alerts: boolean
          show_promoter_full_profile: boolean
          show_promoter_names: boolean
          show_promoter_photos: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          name_i18n?: Json
          show_promoter_alerts?: boolean
          show_promoter_full_profile?: boolean
          show_promoter_names?: boolean
          show_promoter_photos?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          name_i18n?: Json
          show_promoter_alerts?: boolean
          show_promoter_full_profile?: boolean
          show_promoter_names?: boolean
          show_promoter_photos?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      competitor_mentions: {
        Row: {
          brand: string
          context: string | null
          created_at: string
          feedback_id: string
          id: string
          sentiment: Database["public"]["Enums"]["feedback_sentiment"] | null
        }
        Insert: {
          brand: string
          context?: string | null
          created_at?: string
          feedback_id: string
          id?: string
          sentiment?: Database["public"]["Enums"]["feedback_sentiment"] | null
        }
        Update: {
          brand?: string
          context?: string | null
          created_at?: string
          feedback_id?: string
          id?: string
          sentiment?: Database["public"]["Enums"]["feedback_sentiment"] | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_mentions_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "consumer_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      consumer_feedback: {
        Row: {
          body: string
          campaign_id: string
          category: Database["public"]["Enums"]["feedback_category"]
          created_at: string
          daily_report_id: string | null
          id: string
          idempotency_key: string
          location_id: string
          promoter_user_id: string
          sentiment: Database["public"]["Enums"]["feedback_sentiment"] | null
          supervisor_visit_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          campaign_id: string
          category: Database["public"]["Enums"]["feedback_category"]
          created_at?: string
          daily_report_id?: string | null
          id?: string
          idempotency_key: string
          location_id: string
          promoter_user_id: string
          sentiment?: Database["public"]["Enums"]["feedback_sentiment"] | null
          supervisor_visit_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          campaign_id?: string
          category?: Database["public"]["Enums"]["feedback_category"]
          created_at?: string
          daily_report_id?: string | null
          id?: string
          idempotency_key?: string
          location_id?: string
          promoter_user_id?: string
          sentiment?: Database["public"]["Enums"]["feedback_sentiment"] | null
          supervisor_visit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumer_feedback_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumer_feedback_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumer_feedback_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumer_feedback_promoter_user_id_fkey"
            columns: ["promoter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumer_feedback_supervisor_visit_id_fkey"
            columns: ["supervisor_visit_id"]
            isOneToOne: false
            referencedRelation: "supervisor_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          campaign_id: string
          contacts: number
          created_at: string
          engaged: number
          id: string
          idempotency_key: string
          location_id: string
          notes: string | null
          promoter_user_id: string
          report_date: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sales_total: number
          samples_total: number
          status: Database["public"]["Enums"]["daily_report_status"]
          submitted_at: string | null
          total_traffic: number | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          contacts?: number
          created_at?: string
          engaged?: number
          id?: string
          idempotency_key: string
          location_id: string
          notes?: string | null
          promoter_user_id: string
          report_date?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_total?: number
          samples_total?: number
          status?: Database["public"]["Enums"]["daily_report_status"]
          submitted_at?: string | null
          total_traffic?: number | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          contacts?: number
          created_at?: string
          engaged?: number
          id?: string
          idempotency_key?: string
          location_id?: string
          notes?: string | null
          promoter_user_id?: string
          report_date?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_total?: number
          samples_total?: number
          status?: Database["public"]["Enums"]["daily_report_status"]
          submitted_at?: string | null
          total_traffic?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_campaign_location_fk"
            columns: ["campaign_id", "location_id"]
            isOneToOne: false
            referencedRelation: "campaign_locations"
            referencedColumns: ["campaign_id", "location_id"]
          },
          {
            foreignKeyName: "daily_reports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_promoter_user_id_fkey"
            columns: ["promoter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          client_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          format: Database["public"]["Enums"]["export_format"]
          id: string
          idempotency_key: string
          requested_by: string
          result_path: string | null
          result_size_bytes: number | null
          scope: Json
          started_at: string | null
          status: Database["public"]["Enums"]["export_status"]
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          format: Database["public"]["Enums"]["export_format"]
          id?: string
          idempotency_key: string
          requested_by: string
          result_path?: string | null
          result_size_bytes?: number | null
          scope: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_status"]
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          format?: Database["public"]["Enums"]["export_format"]
          id?: string
          idempotency_key?: string
          requested_by?: string
          result_path?: string | null
          result_size_bytes?: number | null
          scope?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_status"]
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_audit: {
        Row: {
          admin_id: string | null
          created_at: string
          fail_count: number
          id: string
          success_count: number
          target: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          fail_count?: number
          id?: string
          success_count?: number
          target: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          fail_count?: number
          id?: string
          success_count?: number
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_audit_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_reputation: {
        Row: {
          checked_at: string
          fraud_score: number | null
          id: string
          ip_address: unknown
          is_proxy: boolean | null
          is_tor: boolean | null
          is_vpn: boolean | null
          raw_response: Json | null
          reported_country: string | null
          reported_region: string | null
        }
        Insert: {
          checked_at?: string
          fraud_score?: number | null
          id?: string
          ip_address: unknown
          is_proxy?: boolean | null
          is_tor?: boolean | null
          is_vpn?: boolean | null
          raw_response?: Json | null
          reported_country?: string | null
          reported_region?: string | null
        }
        Update: {
          checked_at?: string
          fraud_score?: number | null
          id?: string
          ip_address?: unknown
          is_proxy?: boolean | null
          is_tor?: boolean | null
          is_vpn?: boolean | null
          raw_response?: Json | null
          reported_country?: string | null
          reported_region?: string | null
        }
        Relationships: []
      }
      kpi_snapshots: {
        Row: {
          computation_version: number
          computed_at: string
          conversion_rate: number | null
          created_at: string
          daily_report_id: string
          engagement_rate: number | null
          id: string
          interaction_rate: number | null
          sample_to_conversion_rate: number | null
          sampling_rate: number | null
          sampling_rate_denominator: string | null
          sku_contributions: Json
          updated_at: string
        }
        Insert: {
          computation_version?: number
          computed_at?: string
          conversion_rate?: number | null
          created_at?: string
          daily_report_id: string
          engagement_rate?: number | null
          id?: string
          interaction_rate?: number | null
          sample_to_conversion_rate?: number | null
          sampling_rate?: number | null
          sampling_rate_denominator?: string | null
          sku_contributions?: Json
          updated_at?: string
        }
        Update: {
          computation_version?: number
          computed_at?: string
          conversion_rate?: number | null
          created_at?: string
          daily_report_id?: string
          engagement_rate?: number | null
          id?: string
          interaction_rate?: number | null
          sample_to_conversion_rate?: number | null
          sampling_rate?: number | null
          sampling_rate_denominator?: string | null
          sku_contributions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_snapshots_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: true
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      location_pings: {
        Row: {
          accuracy_m: number | null
          attendance_id: string
          battery_pct: number | null
          captured_at: string
          created_at: string
          id: string
          lat: number
          lng: number
          promoter_id: string
        }
        Insert: {
          accuracy_m?: number | null
          attendance_id: string
          battery_pct?: number | null
          captured_at?: string
          created_at?: string
          id?: string
          lat: number
          lng: number
          promoter_id: string
        }
        Update: {
          accuracy_m?: number | null
          attendance_id?: string
          battery_pct?: number | null
          captured_at?: string
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          promoter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_pings_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_pings_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          city_id: string
          created_at: string
          geofence_radius_m: number
          id: string
          lat: number
          lng: number
          name_i18n: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city_id: string
          created_at?: string
          geofence_radius_m?: number
          id?: string
          lat: number
          lng: number
          name_i18n: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city_id?: string
          created_at?: string
          geofence_radius_m?: number
          id?: string
          lat?: number
          lng?: number
          name_i18n?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          alert_id: string | null
          break_request_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          break_request_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          alert_id?: string | null
          break_request_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          payload?: Json
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_break_request_id_fkey"
            columns: ["break_request_id"]
            isOneToOne: false
            referencedRelation: "break_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_snapshots: {
        Row: {
          campaign_id: string
          computation_version: number
          computed_at: string
          contacts: number
          conversion_rate: number | null
          created_at: string
          engaged: number
          engagement_rate: number | null
          id: string
          interaction_rate: number | null
          period_end: string
          period_kind: Database["public"]["Enums"]["performance_period_kind"]
          period_start: string
          rank_in_scope: number | null
          reports_count: number
          sales_total: number
          sample_to_conversion_rate: number | null
          samples_total: number
          sampling_rate: number | null
          sampling_rate_denominator: string | null
          scope_id: string
          scope_kind: Database["public"]["Enums"]["performance_scope_kind"]
          scope_size: number | null
          sku_contributions: Json
          tier: Database["public"]["Enums"]["performance_tier"] | null
          tier_high_threshold: number | null
          tier_medium_threshold: number | null
          tier_metric: string
          tier_metric_value: number | null
          total_traffic: number | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          computation_version?: number
          computed_at?: string
          contacts?: number
          conversion_rate?: number | null
          created_at?: string
          engaged?: number
          engagement_rate?: number | null
          id?: string
          interaction_rate?: number | null
          period_end: string
          period_kind: Database["public"]["Enums"]["performance_period_kind"]
          period_start: string
          rank_in_scope?: number | null
          reports_count?: number
          sales_total?: number
          sample_to_conversion_rate?: number | null
          samples_total?: number
          sampling_rate?: number | null
          sampling_rate_denominator?: string | null
          scope_id: string
          scope_kind: Database["public"]["Enums"]["performance_scope_kind"]
          scope_size?: number | null
          sku_contributions?: Json
          tier?: Database["public"]["Enums"]["performance_tier"] | null
          tier_high_threshold?: number | null
          tier_medium_threshold?: number | null
          tier_metric?: string
          tier_metric_value?: number | null
          total_traffic?: number | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          computation_version?: number
          computed_at?: string
          contacts?: number
          conversion_rate?: number | null
          created_at?: string
          engaged?: number
          engagement_rate?: number | null
          id?: string
          interaction_rate?: number | null
          period_end?: string
          period_kind?: Database["public"]["Enums"]["performance_period_kind"]
          period_start?: string
          rank_in_scope?: number | null
          reports_count?: number
          sales_total?: number
          sample_to_conversion_rate?: number | null
          samples_total?: number
          sampling_rate?: number | null
          sampling_rate_denominator?: string | null
          scope_id?: string
          scope_kind?: Database["public"]["Enums"]["performance_scope_kind"]
          scope_size?: number | null
          sku_contributions?: Json
          tier?: Database["public"]["Enums"]["performance_tier"] | null
          tier_high_threshold?: number | null
          tier_medium_threshold?: number | null
          tier_metric?: string
          tier_metric_value?: number | null
          total_traffic?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          assigned_locations: string[]
          client_id: string | null
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          must_change_password: boolean
          phone: string | null
          preferred_language: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_locations?: string[]
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          id: string
          must_change_password?: boolean
          phone?: string | null
          preferred_language?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_locations?: string[]
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          must_change_password?: boolean
          phone?: string | null
          preferred_language?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      regions: {
        Row: {
          active: boolean
          country_code: string
          created_at: string
          id: string
          name_i18n: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          country_code: string
          created_at?: string
          id?: string
          name_i18n: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          country_code?: string
          created_at?: string
          id?: string
          name_i18n?: Json
          updated_at?: string
        }
        Relationships: []
      }
      sales_entries: {
        Row: {
          created_at: string
          daily_report_id: string
          id: string
          sales: number
          samples: number
          sku_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_report_id: string
          id?: string
          sales?: number
          samples?: number
          sku_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_report_id?: string
          id?: string
          sales?: number
          samples?: number
          sku_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_entries_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          active: boolean
          cadence: Database["public"]["Enums"]["scheduled_report_cadence"]
          client_id: string | null
          created_at: string
          created_by: string
          day_of_week_utc: number | null
          description: string | null
          format: Database["public"]["Enums"]["export_format"]
          hour_utc: number
          id: string
          last_job_id: string | null
          last_run_at: string | null
          name: string
          scope: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          cadence: Database["public"]["Enums"]["scheduled_report_cadence"]
          client_id?: string | null
          created_at?: string
          created_by: string
          day_of_week_utc?: number | null
          description?: string | null
          format: Database["public"]["Enums"]["export_format"]
          hour_utc?: number
          id?: string
          last_job_id?: string | null
          last_run_at?: string | null
          name: string
          scope: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          cadence?: Database["public"]["Enums"]["scheduled_report_cadence"]
          client_id?: string | null
          created_at?: string
          created_by?: string
          day_of_week_utc?: number | null
          description?: string | null
          format?: Database["public"]["Enums"]["export_format"]
          hour_utc?: number
          id?: string
          last_job_id?: string | null
          last_run_at?: string | null
          name?: string
          scope?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_reports_last_job_id_fkey"
            columns: ["last_job_id"]
            isOneToOne: false
            referencedRelation: "export_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          active: boolean
          campaign_id: string
          created_at: string
          days_of_week: number[]
          end_time: string
          id: string
          location_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          campaign_id: string
          created_at?: string
          days_of_week?: number[]
          end_time: string
          id?: string
          location_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          campaign_id?: string
          created_at?: string
          days_of_week?: number[]
          end_time?: string
          id?: string
          location_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_campaign_location_fk"
            columns: ["campaign_id", "location_id"]
            isOneToOne: false
            referencedRelation: "campaign_locations"
            referencedColumns: ["campaign_id", "location_id"]
          },
          {
            foreignKeyName: "shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      skus: {
        Row: {
          active: boolean
          campaign_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["sku_kind"]
          name_i18n: Json
          stock_allocated: number
          target: number
          unit_i18n: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          campaign_id: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["sku_kind"]
          name_i18n: Json
          stock_allocated?: number
          target?: number
          unit_i18n: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          campaign_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["sku_kind"]
          name_i18n?: Json
          stock_allocated?: number
          target?: number
          unit_i18n?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skus_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          campaign_id: string
          correction_of: string | null
          created_at: string
          from_entity_id: string | null
          from_entity_type: Database["public"]["Enums"]["stock_entity_type"]
          id: string
          idempotency_key: string
          location_id: string | null
          movement_kind: Database["public"]["Enums"]["stock_movement_kind"]
          quantity: number
          reallocation_group_id: string | null
          reason: string | null
          sku_id: string
          to_entity_id: string | null
          to_entity_type: Database["public"]["Enums"]["stock_entity_type"]
          user_id: string
        }
        Insert: {
          campaign_id: string
          correction_of?: string | null
          created_at?: string
          from_entity_id?: string | null
          from_entity_type: Database["public"]["Enums"]["stock_entity_type"]
          id?: string
          idempotency_key: string
          location_id?: string | null
          movement_kind: Database["public"]["Enums"]["stock_movement_kind"]
          quantity: number
          reallocation_group_id?: string | null
          reason?: string | null
          sku_id: string
          to_entity_id?: string | null
          to_entity_type: Database["public"]["Enums"]["stock_entity_type"]
          user_id: string
        }
        Update: {
          campaign_id?: string
          correction_of?: string | null
          created_at?: string
          from_entity_id?: string | null
          from_entity_type?: Database["public"]["Enums"]["stock_entity_type"]
          id?: string
          idempotency_key?: string
          location_id?: string | null
          movement_kind?: Database["public"]["Enums"]["stock_movement_kind"]
          quantity?: number
          reallocation_group_id?: string | null
          reason?: string | null
          sku_id?: string
          to_entity_id?: string | null
          to_entity_type?: Database["public"]["Enums"]["stock_entity_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_correction_of_fkey"
            columns: ["correction_of"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reconciliations: {
        Row: {
          campaign_id: string
          created_at: string
          details: Json
          entity_id: string | null
          id: string
          note: string | null
          reconciled_at: string
          reconciled_by: string
          scope: Database["public"]["Enums"]["stock_reconciliation_scope"]
          status: Database["public"]["Enums"]["stock_reconciliation_status"]
          supersedes: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          id?: string
          note?: string | null
          reconciled_at?: string
          reconciled_by: string
          scope: Database["public"]["Enums"]["stock_reconciliation_scope"]
          status: Database["public"]["Enums"]["stock_reconciliation_status"]
          supersedes?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          id?: string
          note?: string | null
          reconciled_at?: string
          reconciled_by?: string
          scope?: Database["public"]["Enums"]["stock_reconciliation_scope"]
          status?: Database["public"]["Enums"]["stock_reconciliation_status"]
          supersedes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_reconciliations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reconciliations_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reconciliations_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "stock_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_visits: {
        Row: {
          campaign_id: string
          created_at: string
          distance_m: number
          exif_minimal: Json | null
          id: string
          idempotency_key: string
          is_within_geofence: boolean
          lat: number
          lng: number
          location_id: string
          notes: string | null
          outcome: Database["public"]["Enums"]["supervisor_visit_outcome"]
          photo_path: string
          promoter_id: string | null
          supervisor_id: string
          updated_at: string
          visited_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          distance_m: number
          exif_minimal?: Json | null
          id?: string
          idempotency_key: string
          is_within_geofence: boolean
          lat: number
          lng: number
          location_id: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["supervisor_visit_outcome"]
          photo_path: string
          promoter_id?: string | null
          supervisor_id: string
          updated_at?: string
          visited_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          distance_m?: number
          exif_minimal?: Json | null
          id?: string
          idempotency_key?: string
          is_within_geofence?: boolean
          lat?: number
          lng?: number
          location_id?: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["supervisor_visit_outcome"]
          photo_path?: string
          promoter_id?: string | null
          supervisor_id?: string
          updated_at?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_visits_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_visits_campaign_location_fk"
            columns: ["campaign_id", "location_id"]
            isOneToOne: false
            referencedRelation: "campaign_locations"
            referencedColumns: ["campaign_id", "location_id"]
          },
          {
            foreignKeyName: "supervisor_visits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_visits_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_visits_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to_user_id: string
          campaign_id: string
          cancelled_at: string | null
          cancelled_reason: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description_i18n: Json | null
          due_date: string | null
          id: string
          idempotency_key: string
          location_id: string
          status: Database["public"]["Enums"]["task_status"]
          title_i18n: Json
          updated_at: string
        }
        Insert: {
          assigned_to_user_id: string
          campaign_id: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description_i18n?: Json | null
          due_date?: string | null
          id?: string
          idempotency_key: string
          location_id: string
          status?: Database["public"]["Enums"]["task_status"]
          title_i18n: Json
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string
          campaign_id?: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description_i18n?: Json | null
          due_date?: string | null
          id?: string
          idempotency_key?: string
          location_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title_i18n?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_campaign_location_fk"
            columns: ["campaign_id", "location_id"]
            isOneToOne: false
            referencedRelation: "campaign_locations"
            referencedColumns: ["campaign_id", "location_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_assignments: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          location_id: string
          role_scope: Database["public"]["Enums"]["user_role"]
          shift_id: string | null
          starts_on: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          location_id: string
          role_scope: Database["public"]["Enums"]["user_role"]
          shift_id?: string | null
          starts_on?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          location_id?: string
          role_scope?: Database["public"]["Enums"]["user_role"]
          shift_id?: string | null
          starts_on?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      performance_latest: {
        Row: {
          campaign_id: string | null
          computation_version: number | null
          computed_at: string | null
          contacts: number | null
          conversion_rate: number | null
          created_at: string | null
          engaged: number | null
          engagement_rate: number | null
          id: string | null
          interaction_rate: number | null
          period_end: string | null
          period_kind:
            | Database["public"]["Enums"]["performance_period_kind"]
            | null
          period_start: string | null
          rank_in_scope: number | null
          reports_count: number | null
          sales_total: number | null
          sample_to_conversion_rate: number | null
          samples_total: number | null
          sampling_rate: number | null
          sampling_rate_denominator: string | null
          scope_id: string | null
          scope_kind:
            | Database["public"]["Enums"]["performance_scope_kind"]
            | null
          scope_size: number | null
          sku_contributions: Json | null
          tier: Database["public"]["Enums"]["performance_tier"] | null
          tier_high_threshold: number | null
          tier_medium_threshold: number | null
          tier_metric: string | null
          tier_metric_value: number | null
          total_traffic: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_balances: {
        Row: {
          balance: number | null
          campaign_id: string | null
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["stock_entity_type"] | null
          sku_id: string | null
          total_in: number | null
          total_out: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_get_user_emails: {
        Args: { p_user_ids?: string[] }
        Returns: {
          email: string
          id: string
        }[]
      }
      check_rate_limit: {
        Args: {
          p_key: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          count: number
          reset_at: string
        }[]
      }
      correct_stock_movement: {
        Args: {
          p_idempotency_key: string
          p_new_quantity: number
          p_original_movement_id: string
          p_reason: string
          p_user_id: string
        }
        Returns: string[]
      }
      current_client_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_supervisor_visible_promoter_ids: {
        Args: never
        Returns: string[]
      }
      current_user_locations: { Args: never; Returns: string[] }
      current_user_visible_campaigns: { Args: never; Returns: string[] }
      gc_location_pings: { Args: never; Returns: number }
      gc_rate_limits: { Args: never; Returns: number }
      is_active: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      reallocate_stock: {
        Args: {
          p_campaign_id: string
          p_from_entity_id: string
          p_from_entity_type: Database["public"]["Enums"]["stock_entity_type"]
          p_idempotency_key: string
          p_location_id: string
          p_quantity: number
          p_reason: string
          p_sku_id: string
          p_to_entity_id: string
          p_to_entity_type: Database["public"]["Enums"]["stock_entity_type"]
          p_user_id: string
        }
        Returns: string
      }
      sync_assigned_locations: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      activity_photo_kind: "setup" | "during" | "end_of_shift"
      alert_severity: "info" | "warning" | "critical"
      alert_status: "open" | "acknowledged" | "resolved" | "dismissed"
      alert_type:
        | "late_check_in"
        | "absent"
        | "early_leave"
        | "missing_check_out"
        | "geofence_violation"
        | "geofence_override_requested"
        | "low_stock"
        | "over_consumption"
        | "reconciliation_mismatch"
        | "no_usage"
        | "low_performance"
        | "no_activity"
        | "location_trust_low"
      attendance_status:
        | "checked_in"
        | "checked_out"
        | "late"
        | "absent"
        | "early_leave"
        | "missing_checkout"
      break_request_status: "pending" | "approved" | "rejected" | "modified"
      campaign_status: "planned" | "active" | "completed" | "cancelled"
      daily_report_status: "draft" | "submitted" | "approved" | "rejected"
      export_format: "csv_zip" | "xlsx"
      export_status: "queued" | "running" | "done" | "failed"
      feedback_category:
        | "service"
        | "product"
        | "complaint"
        | "suggestion"
        | "other"
      feedback_sentiment: "positive" | "neutral" | "negative"
      notification_kind:
        | "alert_new"
        | "break_requested"
        | "break_approved"
        | "break_rejected"
        | "break_modified"
        | "system"
        | "export_ready"
      performance_period_kind: "daily" | "weekly" | "campaign_to_date"
      performance_scope_kind: "promoter" | "location" | "campaign"
      performance_tier: "top" | "medium" | "low"
      scheduled_report_cadence: "daily" | "weekly" | "end_of_campaign"
      sku_kind: "sample" | "giveaway" | "sale_unit"
      stock_entity_type:
        | "warehouse"
        | "supervisor"
        | "promoter"
        | "location"
        | "consumer"
      stock_movement_kind:
        | "allocation"
        | "distribution"
        | "reallocation"
        | "usage"
        | "return"
        | "correction"
      stock_reconciliation_scope: "supervisor" | "location" | "campaign"
      stock_reconciliation_status: "matched" | "mismatched" | "resolved"
      supervisor_visit_outcome: "ok" | "issue_found" | "coaching" | "other"
      task_status: "open" | "in_progress" | "done" | "cancelled"
      user_role: "admin" | "supervisor" | "promoter" | "client"
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
      activity_photo_kind: ["setup", "during", "end_of_shift"],
      alert_severity: ["info", "warning", "critical"],
      alert_status: ["open", "acknowledged", "resolved", "dismissed"],
      alert_type: [
        "late_check_in",
        "absent",
        "early_leave",
        "missing_check_out",
        "geofence_violation",
        "geofence_override_requested",
        "low_stock",
        "over_consumption",
        "reconciliation_mismatch",
        "no_usage",
        "low_performance",
        "no_activity",
        "location_trust_low",
      ],
      attendance_status: [
        "checked_in",
        "checked_out",
        "late",
        "absent",
        "early_leave",
        "missing_checkout",
      ],
      break_request_status: ["pending", "approved", "rejected", "modified"],
      campaign_status: ["planned", "active", "completed", "cancelled"],
      daily_report_status: ["draft", "submitted", "approved", "rejected"],
      export_format: ["csv_zip", "xlsx"],
      export_status: ["queued", "running", "done", "failed"],
      feedback_category: [
        "service",
        "product",
        "complaint",
        "suggestion",
        "other",
      ],
      feedback_sentiment: ["positive", "neutral", "negative"],
      notification_kind: [
        "alert_new",
        "break_requested",
        "break_approved",
        "break_rejected",
        "break_modified",
        "system",
        "export_ready",
      ],
      performance_period_kind: ["daily", "weekly", "campaign_to_date"],
      performance_scope_kind: ["promoter", "location", "campaign"],
      performance_tier: ["top", "medium", "low"],
      scheduled_report_cadence: ["daily", "weekly", "end_of_campaign"],
      sku_kind: ["sample", "giveaway", "sale_unit"],
      stock_entity_type: [
        "warehouse",
        "supervisor",
        "promoter",
        "location",
        "consumer",
      ],
      stock_movement_kind: [
        "allocation",
        "distribution",
        "reallocation",
        "usage",
        "return",
        "correction",
      ],
      stock_reconciliation_scope: ["supervisor", "location", "campaign"],
      stock_reconciliation_status: ["matched", "mismatched", "resolved"],
      supervisor_visit_outcome: ["ok", "issue_found", "coaching", "other"],
      task_status: ["open", "in_progress", "done", "cancelled"],
      user_role: ["admin", "supervisor", "promoter", "client"],
    },
  },
} as const
