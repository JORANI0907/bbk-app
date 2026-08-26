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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_activity_logs: {
        Row: {
          agent_type: string | null
          created_at: string | null
          cwd: string | null
          duration_ms: number | null
          event_type: string
          id: string
          message: string | null
          parent_agent_id: string | null
          session_id: string
          tool_name: string | null
        }
        Insert: {
          agent_type?: string | null
          created_at?: string | null
          cwd?: string | null
          duration_ms?: number | null
          event_type: string
          id?: string
          message?: string | null
          parent_agent_id?: string | null
          session_id: string
          tool_name?: string | null
        }
        Update: {
          agent_type?: string | null
          created_at?: string | null
          cwd?: string | null
          duration_ms?: number | null
          event_type?: string
          id?: string
          message?: string | null
          parent_agent_id?: string | null
          session_id?: string
          tool_name?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      application_photos: {
        Row: {
          application_id: string
          created_at: string | null
          drive_file_id: string
          id: string
          photo_type: string
          thumbnail_link: string | null
          web_view_link: string
        }
        Insert: {
          application_id: string
          created_at?: string | null
          drive_file_id: string
          id?: string
          photo_type?: string
          thumbnail_link?: string | null
          web_view_link: string
        }
        Update: {
          application_id?: string
          created_at?: string | null
          drive_file_id?: string
          id?: string
          photo_type?: string
          thumbnail_link?: string | null
          web_view_link?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          clock_in: string | null
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_in_photo_file_id: string | null
          clock_in_photo_url: string | null
          clock_out: string | null
          clock_out_lat: number | null
          clock_out_lng: number | null
          clock_out_photo_file_id: string | null
          clock_out_photo_url: string | null
          id: string
          notes: string | null
          status: string | null
          work_date: string
          worker_id: string | null
          worker_name: string | null
        }
        Insert: {
          clock_in?: string | null
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_in_photo_file_id?: string | null
          clock_in_photo_url?: string | null
          clock_out?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          clock_out_photo_file_id?: string | null
          clock_out_photo_url?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          work_date: string
          worker_id?: string | null
          worker_name?: string | null
        }
        Update: {
          clock_in?: string | null
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_in_photo_file_id?: string | null
          clock_in_photo_url?: string | null
          clock_out?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          clock_out_photo_file_id?: string | null
          clock_out_photo_url?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          work_date?: string
          worker_id?: string | null
          worker_name?: string | null
        }
        Relationships: []
      }
      attendance_alerts: {
        Row: {
          admin_notified_at: string | null
          alert_type: string
          application_id: string
          detected_at: string
          id: string
          worker_notified_at: string | null
        }
        Insert: {
          admin_notified_at?: string | null
          alert_type: string
          application_id: string
          detected_at?: string
          id?: string
          worker_notified_at?: string | null
        }
        Update: {
          admin_notified_at?: string | null
          alert_type?: string
          application_id?: string
          detected_at?: string
          id?: string
          worker_notified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_alerts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "service_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_analysis: {
        Row: {
          analyzed_at: string | null
          auction_item_id: string | null
          cost_breakdown: Json | null
          estimated_total_cost: number | null
          id: string
          inherited_rights: Json | null
          investment_memo: string | null
          legal_ground_right: Json | null
          lessee_risk: Json | null
          lien_risk: Json | null
          liquidation_reference_right: string | null
          raw_analysis: string | null
          risk_level: string | null
          risk_summary: string | null
        }
        Insert: {
          analyzed_at?: string | null
          auction_item_id?: string | null
          cost_breakdown?: Json | null
          estimated_total_cost?: number | null
          id?: string
          inherited_rights?: Json | null
          investment_memo?: string | null
          legal_ground_right?: Json | null
          lessee_risk?: Json | null
          lien_risk?: Json | null
          liquidation_reference_right?: string | null
          raw_analysis?: string | null
          risk_level?: string | null
          risk_summary?: string | null
        }
        Update: {
          analyzed_at?: string | null
          auction_item_id?: string | null
          cost_breakdown?: Json | null
          estimated_total_cost?: number | null
          id?: string
          inherited_rights?: Json | null
          investment_memo?: string | null
          legal_ground_right?: Json | null
          lessee_risk?: Json | null
          lien_risk?: Json | null
          liquidation_reference_right?: string | null
          raw_analysis?: string | null
          risk_level?: string | null
          risk_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_analysis_auction_item_id_fkey"
            columns: ["auction_item_id"]
            isOneToOne: true
            referencedRelation: "auction_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_analysis_auction_item_id_fkey"
            columns: ["auction_item_id"]
            isOneToOne: true
            referencedRelation: "auction_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_items: {
        Row: {
          address: string | null
          appraisal_amount: number | null
          appraisal_summary: string | null
          bid_date: string | null
          case_number: string
          claim_amount: number | null
          court: string | null
          crawled_at: string | null
          created_at: string | null
          division: string | null
          fail_count: number | null
          id: string
          item_note: string | null
          item_type: string | null
          min_bid_amount: number | null
          min_bid_rate: number | null
          parties: Json | null
        }
        Insert: {
          address?: string | null
          appraisal_amount?: number | null
          appraisal_summary?: string | null
          bid_date?: string | null
          case_number: string
          claim_amount?: number | null
          court?: string | null
          crawled_at?: string | null
          created_at?: string | null
          division?: string | null
          fail_count?: number | null
          id?: string
          item_note?: string | null
          item_type?: string | null
          min_bid_amount?: number | null
          min_bid_rate?: number | null
          parties?: Json | null
        }
        Update: {
          address?: string | null
          appraisal_amount?: number | null
          appraisal_summary?: string | null
          bid_date?: string | null
          case_number?: string
          claim_amount?: number | null
          court?: string | null
          crawled_at?: string | null
          created_at?: string | null
          division?: string | null
          fail_count?: number | null
          id?: string
          item_note?: string | null
          item_type?: string | null
          min_bid_amount?: number | null
          min_bid_rate?: number | null
          parties?: Json | null
        }
        Relationships: []
      }
      calendar_tokens: {
        Row: {
          created_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_snapshots: {
        Row: {
          as_of: string
          balance: number | null
          created_at: string
          id: string
          logged_by: string | null
          next30_outflow: number | null
          receivables_over90: number | null
          receivables_total: number | null
        }
        Insert: {
          as_of: string
          balance?: number | null
          created_at?: string
          id?: string
          logged_by?: string | null
          next30_outflow?: number | null
          receivables_over90?: number | null
          receivables_total?: number | null
        }
        Update: {
          as_of?: string
          balance?: number | null
          created_at?: string
          id?: string
          logged_by?: string | null
          next30_outflow?: number | null
          receivables_over90?: number | null
          receivables_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_snapshots_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          category: string | null
          cause: string | null
          content: string
          created_at: string
          customer_id: string
          id: string
          is_rework: boolean
          logged_by: string
          occurred_at: string
          resolved_at: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          cause?: string | null
          content: string
          created_at?: string
          customer_id: string
          id?: string
          is_rework?: boolean
          logged_by: string
          occurred_at: string
          resolved_at?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          cause?: string | null
          content?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_rework?: boolean
          logged_by?: string
          occurred_at?: string
          resolved_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      closing_checklists: {
        Row: {
          completed_at: string | null
          condition_score: number | null
          created_at: string | null
          customer_comment: string | null
          customer_rating: number | null
          door_lock_check: boolean | null
          electric_check: boolean | null
          garbage_disposal: boolean | null
          gas_valve_check: boolean | null
          id: string
          recommended_services: Json
          schedule_id: string | null
          security_check: boolean | null
        }
        Insert: {
          completed_at?: string | null
          condition_score?: number | null
          created_at?: string | null
          customer_comment?: string | null
          customer_rating?: number | null
          door_lock_check?: boolean | null
          electric_check?: boolean | null
          garbage_disposal?: boolean | null
          gas_valve_check?: boolean | null
          id?: string
          recommended_services?: Json
          schedule_id?: string | null
          security_check?: boolean | null
        }
        Update: {
          completed_at?: string | null
          condition_score?: number | null
          created_at?: string | null
          customer_comment?: string | null
          customer_rating?: number | null
          door_lock_check?: boolean | null
          electric_check?: boolean | null
          garbage_disposal?: boolean | null
          gas_valve_check?: boolean | null
          id?: string
          recommended_services?: Json
          schedule_id?: string | null
          security_check?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "closing_checklists_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: true
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      company_intent: {
        Row: {
          always_1: string | null
          always_2: string | null
          always_3: string | null
          id: number
          intent_1: string
          intent_1_tradeoff: string | null
          intent_2: string
          intent_2_tradeoff: string | null
          intent_3: string
          intent_3_tradeoff: string | null
          never_1: string | null
          never_2: string | null
          never_3: string | null
          purpose: string
          safe_days_start_date: string
          updated_at: string
          year: number
        }
        Insert: {
          always_1?: string | null
          always_2?: string | null
          always_3?: string | null
          id: number
          intent_1?: string
          intent_1_tradeoff?: string | null
          intent_2?: string
          intent_2_tradeoff?: string | null
          intent_3?: string
          intent_3_tradeoff?: string | null
          never_1?: string | null
          never_2?: string | null
          never_3?: string | null
          purpose?: string
          safe_days_start_date?: string
          updated_at?: string
          year?: number
        }
        Update: {
          always_1?: string | null
          always_2?: string | null
          always_3?: string | null
          id?: number
          intent_1?: string
          intent_1_tradeoff?: string | null
          intent_2?: string
          intent_2_tradeoff?: string | null
          intent_3?: string
          intent_3_tradeoff?: string | null
          never_1?: string | null
          never_2?: string | null
          never_3?: string | null
          purpose?: string
          safe_days_start_date?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      contract_templates: {
        Row: {
          created_at: string | null
          custom_vars: Json | null
          description: string | null
          html_body: string
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          var_config: Json | null
        }
        Insert: {
          created_at?: string | null
          custom_vars?: Json | null
          description?: string | null
          html_body?: string
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          var_config?: Json | null
        }
        Update: {
          created_at?: string | null
          custom_vars?: Json | null
          description?: string | null
          html_body?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          var_config?: Json | null
        }
        Relationships: []
      }
      contract_variables: {
        Row: {
          auto_field: string | null
          created_at: string | null
          description: string | null
          id: string
          is_system: boolean
          label: string
          mode: string
          name: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          auto_field?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          label: string
          mode: string
          name: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          auto_field?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          label?: string
          mode?: string
          name?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          admin_signature: string | null
          admin_signed_at: string | null
          annual_price: number | null
          application_id: string | null
          article14_agree: boolean | null
          article8_agree: boolean | null
          contract_snapshot: Json | null
          contract_type: string
          contract_year: number | null
          created_at: string | null
          customer_agreed_at: string | null
          customer_id: string | null
          customer_ip: string | null
          customer_phone: string | null
          customer_signature: string | null
          customer_signer_name: string | null
          deleted_at: string | null
          discount_rate: number | null
          end_date: string | null
          id: string
          monthly_price: number | null
          otp_code: string | null
          otp_expires_at: string | null
          selected_items: Json
          service_grade: string | null
          signed_pdf_url: string | null
          signing_status: string | null
          signing_token: string | null
          start_date: string | null
          status: string | null
          subscription_plan: string | null
          template_id: string | null
          token_expires_at: string | null
          updated_at: string | null
          visit_frequency: string | null
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          admin_signature?: string | null
          admin_signed_at?: string | null
          annual_price?: number | null
          application_id?: string | null
          article14_agree?: boolean | null
          article8_agree?: boolean | null
          contract_snapshot?: Json | null
          contract_type?: string
          contract_year?: number | null
          created_at?: string | null
          customer_agreed_at?: string | null
          customer_id?: string | null
          customer_ip?: string | null
          customer_phone?: string | null
          customer_signature?: string | null
          customer_signer_name?: string | null
          deleted_at?: string | null
          discount_rate?: number | null
          end_date?: string | null
          id?: string
          monthly_price?: number | null
          otp_code?: string | null
          otp_expires_at?: string | null
          selected_items?: Json
          service_grade?: string | null
          signed_pdf_url?: string | null
          signing_status?: string | null
          signing_token?: string | null
          start_date?: string | null
          status?: string | null
          subscription_plan?: string | null
          template_id?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          visit_frequency?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          admin_signature?: string | null
          admin_signed_at?: string | null
          annual_price?: number | null
          application_id?: string | null
          article14_agree?: boolean | null
          article8_agree?: boolean | null
          contract_snapshot?: Json | null
          contract_type?: string
          contract_year?: number | null
          created_at?: string | null
          customer_agreed_at?: string | null
          customer_id?: string | null
          customer_ip?: string | null
          customer_phone?: string | null
          customer_signature?: string | null
          customer_signer_name?: string | null
          deleted_at?: string | null
          discount_rate?: number | null
          end_date?: string | null
          id?: string
          monthly_price?: number | null
          otp_code?: string | null
          otp_expires_at?: string | null
          selected_items?: Json
          service_grade?: string | null
          signed_pdf_url?: string | null
          signing_status?: string | null
          signing_token?: string | null
          start_date?: string | null
          status?: string | null
          subscription_plan?: string | null
          template_id?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          visit_frequency?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_billing_records: {
        Row: {
          amount: number
          billing_key_used: string | null
          billing_period: string
          created_at: string | null
          customer_id: string | null
          failed_reason: string | null
          id: string
          paid_at: string | null
          payment_method: string
          portone_payment_id: string | null
          retry_count: number | null
          status: string
          triggered_at: string | null
          triggered_by: string | null
          virtual_account_bank: string | null
          virtual_account_expired_at: string | null
          virtual_account_number: string | null
        }
        Insert: {
          amount: number
          billing_key_used?: string | null
          billing_period: string
          created_at?: string | null
          customer_id?: string | null
          failed_reason?: string | null
          id?: string
          paid_at?: string | null
          payment_method: string
          portone_payment_id?: string | null
          retry_count?: number | null
          status?: string
          triggered_at?: string | null
          triggered_by?: string | null
          virtual_account_bank?: string | null
          virtual_account_expired_at?: string | null
          virtual_account_number?: string | null
        }
        Update: {
          amount?: number
          billing_key_used?: string | null
          billing_period?: string
          created_at?: string | null
          customer_id?: string | null
          failed_reason?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string
          portone_payment_id?: string | null
          retry_count?: number | null
          status?: string
          triggered_at?: string | null
          triggered_by?: string | null
          virtual_account_bank?: string | null
          virtual_account_expired_at?: string | null
          virtual_account_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_billing_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_requests: {
        Row: {
          content: string
          created_at: string
          customer_id: string
          id: string
          is_read: boolean
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          customer_id: string
          id?: string
          is_read?: boolean
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_read?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          access_method: string | null
          account_number: string | null
          account_user_id: string | null
          address: string
          address_detail: string | null
          admin_notes: string | null
          agreement_ip_address: string | null
          agreement_user_agent: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_user_id: string | null
          assigned_worker_id: string | null
          balance: number | null
          balance_paid_at: string | null
          balance_payment_url: string | null
          balance_portone_id: string | null
          billing_amount: number | null
          billing_card_url: string | null
          billing_cycle: string | null
          billing_day: number | null
          billing_key: string | null
          billing_last_billed_at: string | null
          billing_monthly_amount: number | null
          billing_next_date: string | null
          billing_paid_months: number[] | null
          billing_portone_id: string | null
          billing_start_date: string | null
          billing_trigger: string | null
          billing_unit_price: number | null
          billing_yearly_amount: number | null
          building_access: string | null
          business_hours_end: string | null
          business_hours_start: string | null
          business_name: string
          business_number: string | null
          card_cancel_reason: string | null
          card_cancelled_at: string | null
          card_registered_at: string | null
          care_manual: Json | null
          care_scope: string | null
          circulation_type: string | null
          construction_time: string | null
          contact_name: string
          contact_phone: string
          contact_phone_2: string | null
          contract_drive_url: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string | null
          customer_type: string | null
          deleted_at: string | null
          deposit: number | null
          deposit_paid_at: string | null
          deposit_payment_url: string | null
          deposit_portone_id: string | null
          disposition: string | null
          door_password: string | null
          drive_folder_url: string | null
          elevator: string | null
          email: string | null
          gas_location: string | null
          grade: string | null
          id: string
          injection_cycle_months: string | null
          latitude: number | null
          longitude: number | null
          meeting_time: string | null
          next_visit_date: string | null
          notes: string | null
          notification_log: Json | null
          parking_info: string | null
          paused_at: string | null
          paused_by: string | null
          payment_date: number | null
          payment_method: string | null
          payment_status: Json | null
          payment_status_detail: string | null
          phone_notify_1: boolean | null
          phone_notify_2: boolean | null
          pipeline_status: string | null
          platform_nickname: string | null
          power_location: string | null
          pre_meeting_done: boolean | null
          privacy_agreed_at: string | null
          progress_status: string | null
          recurring_payment_agreed_at: string | null
          rotation_type: string | null
          schedule_generation_day: number | null
          special_notes: string | null
          status: string | null
          supply_amount: number | null
          tax_invoice_issued: boolean | null
          tax_invoice_required: boolean | null
          terms_agreed_at: string | null
          unit_price: number | null
          updated_at: string | null
          user_id: string | null
          vat: number | null
          visit_count_per_month: number | null
          visit_cycle: string | null
          visit_cycle_config: Json | null
          visit_cycle_unit: string | null
          visit_cycle_value: number | null
          visit_interval_days: number | null
          visit_monthly_count: string | null
          visit_monthly_dates: number[] | null
          visit_option: string | null
          visit_schedule_type: string | null
          visit_weekdays: number[] | null
          yearly_billing_day: number | null
          yearly_billing_month: number | null
        }
        Insert: {
          access_method?: string | null
          account_number?: string | null
          account_user_id?: string | null
          address: string
          address_detail?: string | null
          admin_notes?: string | null
          agreement_ip_address?: string | null
          agreement_user_agent?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_user_id?: string | null
          assigned_worker_id?: string | null
          balance?: number | null
          balance_paid_at?: string | null
          balance_payment_url?: string | null
          balance_portone_id?: string | null
          billing_amount?: number | null
          billing_card_url?: string | null
          billing_cycle?: string | null
          billing_day?: number | null
          billing_key?: string | null
          billing_last_billed_at?: string | null
          billing_monthly_amount?: number | null
          billing_next_date?: string | null
          billing_paid_months?: number[] | null
          billing_portone_id?: string | null
          billing_start_date?: string | null
          billing_trigger?: string | null
          billing_unit_price?: number | null
          billing_yearly_amount?: number | null
          building_access?: string | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          business_name: string
          business_number?: string | null
          card_cancel_reason?: string | null
          card_cancelled_at?: string | null
          card_registered_at?: string | null
          care_manual?: Json | null
          care_scope?: string | null
          circulation_type?: string | null
          construction_time?: string | null
          contact_name: string
          contact_phone: string
          contact_phone_2?: string | null
          contract_drive_url?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          customer_type?: string | null
          deleted_at?: string | null
          deposit?: number | null
          deposit_paid_at?: string | null
          deposit_payment_url?: string | null
          deposit_portone_id?: string | null
          disposition?: string | null
          door_password?: string | null
          drive_folder_url?: string | null
          elevator?: string | null
          email?: string | null
          gas_location?: string | null
          grade?: string | null
          id?: string
          injection_cycle_months?: string | null
          latitude?: number | null
          longitude?: number | null
          meeting_time?: string | null
          next_visit_date?: string | null
          notes?: string | null
          notification_log?: Json | null
          parking_info?: string | null
          paused_at?: string | null
          paused_by?: string | null
          payment_date?: number | null
          payment_method?: string | null
          payment_status?: Json | null
          payment_status_detail?: string | null
          phone_notify_1?: boolean | null
          phone_notify_2?: boolean | null
          pipeline_status?: string | null
          platform_nickname?: string | null
          power_location?: string | null
          pre_meeting_done?: boolean | null
          privacy_agreed_at?: string | null
          progress_status?: string | null
          recurring_payment_agreed_at?: string | null
          rotation_type?: string | null
          schedule_generation_day?: number | null
          special_notes?: string | null
          status?: string | null
          supply_amount?: number | null
          tax_invoice_issued?: boolean | null
          tax_invoice_required?: boolean | null
          terms_agreed_at?: string | null
          unit_price?: number | null
          updated_at?: string | null
          user_id?: string | null
          vat?: number | null
          visit_count_per_month?: number | null
          visit_cycle?: string | null
          visit_cycle_config?: Json | null
          visit_cycle_unit?: string | null
          visit_cycle_value?: number | null
          visit_interval_days?: number | null
          visit_monthly_count?: string | null
          visit_monthly_dates?: number[] | null
          visit_option?: string | null
          visit_schedule_type?: string | null
          visit_weekdays?: number[] | null
          yearly_billing_day?: number | null
          yearly_billing_month?: number | null
        }
        Update: {
          access_method?: string | null
          account_number?: string | null
          account_user_id?: string | null
          address?: string
          address_detail?: string | null
          admin_notes?: string | null
          agreement_ip_address?: string | null
          agreement_user_agent?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_user_id?: string | null
          assigned_worker_id?: string | null
          balance?: number | null
          balance_paid_at?: string | null
          balance_payment_url?: string | null
          balance_portone_id?: string | null
          billing_amount?: number | null
          billing_card_url?: string | null
          billing_cycle?: string | null
          billing_day?: number | null
          billing_key?: string | null
          billing_last_billed_at?: string | null
          billing_monthly_amount?: number | null
          billing_next_date?: string | null
          billing_paid_months?: number[] | null
          billing_portone_id?: string | null
          billing_start_date?: string | null
          billing_trigger?: string | null
          billing_unit_price?: number | null
          billing_yearly_amount?: number | null
          building_access?: string | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          business_name?: string
          business_number?: string | null
          card_cancel_reason?: string | null
          card_cancelled_at?: string | null
          card_registered_at?: string | null
          care_manual?: Json | null
          care_scope?: string | null
          circulation_type?: string | null
          construction_time?: string | null
          contact_name?: string
          contact_phone?: string
          contact_phone_2?: string | null
          contract_drive_url?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          customer_type?: string | null
          deleted_at?: string | null
          deposit?: number | null
          deposit_paid_at?: string | null
          deposit_payment_url?: string | null
          deposit_portone_id?: string | null
          disposition?: string | null
          door_password?: string | null
          drive_folder_url?: string | null
          elevator?: string | null
          email?: string | null
          gas_location?: string | null
          grade?: string | null
          id?: string
          injection_cycle_months?: string | null
          latitude?: number | null
          longitude?: number | null
          meeting_time?: string | null
          next_visit_date?: string | null
          notes?: string | null
          notification_log?: Json | null
          parking_info?: string | null
          paused_at?: string | null
          paused_by?: string | null
          payment_date?: number | null
          payment_method?: string | null
          payment_status?: Json | null
          payment_status_detail?: string | null
          phone_notify_1?: boolean | null
          phone_notify_2?: boolean | null
          pipeline_status?: string | null
          platform_nickname?: string | null
          power_location?: string | null
          pre_meeting_done?: boolean | null
          privacy_agreed_at?: string | null
          progress_status?: string | null
          recurring_payment_agreed_at?: string | null
          rotation_type?: string | null
          schedule_generation_day?: number | null
          special_notes?: string | null
          status?: string | null
          supply_amount?: number | null
          tax_invoice_issued?: boolean | null
          tax_invoice_required?: boolean | null
          terms_agreed_at?: string | null
          unit_price?: number | null
          updated_at?: string | null
          user_id?: string | null
          vat?: number | null
          visit_count_per_month?: number | null
          visit_cycle?: string | null
          visit_cycle_config?: Json | null
          visit_cycle_unit?: string | null
          visit_cycle_value?: number | null
          visit_interval_days?: number | null
          visit_monthly_count?: string | null
          visit_monthly_dates?: number[] | null
          visit_option?: string | null
          visit_schedule_type?: string | null
          visit_weekdays?: number[] | null
          yearly_billing_day?: number | null
          yearly_billing_month?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_account_user_id_fkey"
            columns: ["account_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      deadlines: {
        Row: {
          category: string
          consequence: string
          created_at: string
          done_at: string | null
          due_date: string
          id: string
          related_site_id: string | null
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          consequence: string
          created_at?: string
          done_at?: string | null
          due_date: string
          id?: string
          related_site_id?: string | null
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          consequence?: string
          created_at?: string
          done_at?: string | null
          due_date?: string
          id?: string
          related_site_id?: string | null
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_customer_rates: {
        Row: {
          created_at: string | null
          customer_id: string
          employee_id: string
          employee_type: string
          id: string
          rate: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          employee_id: string
          employee_type: string
          id?: string
          rate?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          employee_id?: string
          employee_type?: string
          id?: string
          rate?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_customer_rates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_pay_config: {
        Row: {
          created_at: string | null
          employee_id: string
          employee_type: string
          extra_bonus: number
          id: string
          monthly_salary: number
          pay_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          employee_type: string
          extra_bonus?: number
          id?: string
          monthly_salary?: number
          pay_type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          employee_type?: string
          extra_bonus?: number
          id?: string
          monthly_salary?: number
          pay_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      employee_service_rates: {
        Row: {
          created_at: string | null
          employee_id: string
          employee_type: string
          id: string
          rate: number
          service_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          employee_type: string
          id?: string
          rate?: number
          service_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          employee_type?: string
          id?: string
          rate?: number
          service_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          accent_from: string | null
          accent_to: string | null
          badge_color: string | null
          badge_text: string | null
          benefits: Json | null
          created_at: string | null
          cta_label: string | null
          cta_type: string | null
          cta_value: string | null
          description: string | null
          end_date: string | null
          id: string
          is_featured: boolean | null
          slug: string
          sort_order: number | null
          start_date: string | null
          status: string
          subtitle: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          accent_from?: string | null
          accent_to?: string | null
          badge_color?: string | null
          badge_text?: string | null
          benefits?: Json | null
          created_at?: string | null
          cta_label?: string | null
          cta_type?: string | null
          cta_value?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_featured?: boolean | null
          slug: string
          sort_order?: number | null
          start_date?: string | null
          status?: string
          subtitle?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          accent_from?: string | null
          accent_to?: string | null
          badge_color?: string | null
          badge_text?: string | null
          benefits?: Json | null
          created_at?: string | null
          cta_label?: string | null
          cta_type?: string | null
          cta_value?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_featured?: boolean | null
          slug?: string
          sort_order?: number | null
          start_date?: string | null
          status?: string
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      finance_records: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          group_name: string | null
          id: string
          name: string
          note: string | null
          updated_at: string | null
          year_month: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string | null
          group_name?: string | null
          id?: string
          name: string
          note?: string | null
          updated_at?: string | null
          year_month: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          group_name?: string | null
          id?: string
          name?: string
          note?: string | null
          updated_at?: string | null
          year_month?: string
        }
        Relationships: []
      }
      finance_type_mappings: {
        Row: {
          category: string
          created_at: string | null
          group_name: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          group_name: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          group_name?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fitness_chat_sessions: {
        Row: {
          created_at: string | null
          id: string
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      fitness_coach_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          session_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          session_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fitness_coach_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "fitness_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fitness_diet: {
        Row: {
          breakfast: string | null
          calories: number | null
          carbs_g: number | null
          created_at: string | null
          date: string
          dinner: string | null
          fat_g: number | null
          id: string
          lunch: string | null
          memo: string | null
          protein_g: number | null
          snack: string | null
          updated_at: string | null
          water_l: number | null
        }
        Insert: {
          breakfast?: string | null
          calories?: number | null
          carbs_g?: number | null
          created_at?: string | null
          date: string
          dinner?: string | null
          fat_g?: number | null
          id?: string
          lunch?: string | null
          memo?: string | null
          protein_g?: number | null
          snack?: string | null
          updated_at?: string | null
          water_l?: number | null
        }
        Update: {
          breakfast?: string | null
          calories?: number | null
          carbs_g?: number | null
          created_at?: string | null
          date?: string
          dinner?: string | null
          fat_g?: number | null
          id?: string
          lunch?: string | null
          memo?: string | null
          protein_g?: number | null
          snack?: string | null
          updated_at?: string | null
          water_l?: number | null
        }
        Relationships: []
      }
      fitness_diet_plan: {
        Row: {
          breakfast: string | null
          calories: number
          carbs_g: number
          created_at: string | null
          dinner: string | null
          fat_g: number
          id: string
          lunch: string | null
          memo: string | null
          protein_g: number
          snack: string | null
          updated_at: string | null
          water_l: number
        }
        Insert: {
          breakfast?: string | null
          calories?: number
          carbs_g?: number
          created_at?: string | null
          dinner?: string | null
          fat_g?: number
          id?: string
          lunch?: string | null
          memo?: string | null
          protein_g?: number
          snack?: string | null
          updated_at?: string | null
          water_l?: number
        }
        Update: {
          breakfast?: string | null
          calories?: number
          carbs_g?: number
          created_at?: string | null
          dinner?: string | null
          fat_g?: number
          id?: string
          lunch?: string | null
          memo?: string | null
          protein_g?: number
          snack?: string | null
          updated_at?: string | null
          water_l?: number
        }
        Relationships: []
      }
      fitness_exercises: {
        Row: {
          created_at: string | null
          id: string
          is_compound: boolean | null
          muscle_group: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_compound?: boolean | null
          muscle_group: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_compound?: boolean | null
          muscle_group?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      fitness_feedback: {
        Row: {
          content: string
          created_at: string | null
          focus: string
          id: string
          type: string
        }
        Insert: {
          content: string
          created_at?: string | null
          focus: string
          id?: string
          type: string
        }
        Update: {
          content?: string
          created_at?: string | null
          focus?: string
          id?: string
          type?: string
        }
        Relationships: []
      }
      fitness_profile: {
        Row: {
          age: number | null
          experience_level: string | null
          goal: string | null
          height_cm: number | null
          id: string
          notes: string | null
          updated_at: string | null
          weekly_days: number | null
          weight_kg: number | null
        }
        Insert: {
          age?: number | null
          experience_level?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          notes?: string | null
          updated_at?: string | null
          weekly_days?: number | null
          weight_kg?: number | null
        }
        Update: {
          age?: number | null
          experience_level?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          notes?: string | null
          updated_at?: string | null
          weekly_days?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      fitness_program_splits: {
        Row: {
          created_at: string | null
          id: string
          name: string
          program_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          program_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          program_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fitness_program_splits_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "fitness_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      fitness_programs: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fitness_sessions: {
        Row: {
          condition: number | null
          created_at: string | null
          date: string
          duration_min: number | null
          id: string
          is_completed: boolean | null
          memo: string | null
          program_name: string
          split_id: string | null
          split_name: string
          updated_at: string | null
        }
        Insert: {
          condition?: number | null
          created_at?: string | null
          date: string
          duration_min?: number | null
          id?: string
          is_completed?: boolean | null
          memo?: string | null
          program_name?: string
          split_id?: string | null
          split_name?: string
          updated_at?: string | null
        }
        Update: {
          condition?: number | null
          created_at?: string | null
          date?: string
          duration_min?: number | null
          id?: string
          is_completed?: boolean | null
          memo?: string | null
          program_name?: string
          split_id?: string | null
          split_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fitness_sessions_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "fitness_program_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      fitness_sets: {
        Row: {
          created_at: string | null
          exercise_id: string | null
          exercise_name: string
          id: string
          reps: number
          rpe: number | null
          session_id: string
          set_number: number
          weight_kg: number
        }
        Insert: {
          created_at?: string | null
          exercise_id?: string | null
          exercise_name: string
          id?: string
          reps?: number
          rpe?: number | null
          session_id: string
          set_number: number
          weight_kg?: number
        }
        Update: {
          created_at?: string | null
          exercise_id?: string | null
          exercise_name?: string
          id?: string
          reps?: number
          rpe?: number | null
          session_id?: string
          set_number?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "fitness_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "fitness_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fitness_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "fitness_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fitness_split_exercises: {
        Row: {
          exercise_id: string
          id: string
          sort_order: number | null
          split_id: string
          target_reps: string | null
          target_sets: number | null
        }
        Insert: {
          exercise_id: string
          id?: string
          sort_order?: number | null
          split_id: string
          target_reps?: string | null
          target_sets?: number | null
        }
        Update: {
          exercise_id?: string
          id?: string
          sort_order?: number | null
          split_id?: string
          target_reps?: string | null
          target_sets?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fitness_split_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "fitness_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fitness_split_exercises_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "fitness_program_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_branch_map: {
        Row: {
          created_at: string | null
          customer_id: string
          display_order: number | null
          franchise_hq_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          display_order?: number | null
          franchise_hq_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          display_order?: number | null
          franchise_hq_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchise_branch_map_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_branch_map_franchise_hq_id_fkey"
            columns: ["franchise_hq_id"]
            isOneToOne: false
            referencedRelation: "franchise_hq"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_hq: {
        Row: {
          brand_name: string
          business_number: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          manager_name: string | null
          manager_phone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          brand_name: string
          business_number?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          manager_name?: string | null
          manager_phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          brand_name?: string
          business_number?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          manager_name?: string | null
          manager_phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_hq_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      functions: {
        Row: {
          backup_user_id: string | null
          code: string
          kind: string
          name: string
          owner_user_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          backup_user_id?: string | null
          code: string
          kind: string
          name: string
          owner_user_id?: string | null
          sort_order: number
          updated_at?: string
        }
        Update: {
          backup_user_id?: string | null
          code?: string
          kind?: string
          name?: string
          owner_user_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "functions_backup_user_id_fkey"
            columns: ["backup_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "functions_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      in_app_notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string
          customer_id: string | null
          id: string
          is_read: boolean
          metadata: Json
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          body: string
          created_at?: string
          customer_id?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          body?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_app_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_reports: {
        Row: {
          action_taken: string | null
          admin_comment: string | null
          admin_comment_at: string | null
          admin_comment_by: string | null
          author_id: string
          author_name: string
          created_at: string | null
          description: string
          id: string
          incident_date: string
          location: string | null
          status: string
          type: string
          updated_at: string | null
          worker_read_at: string | null
        }
        Insert: {
          action_taken?: string | null
          admin_comment?: string | null
          admin_comment_at?: string | null
          admin_comment_by?: string | null
          author_id: string
          author_name: string
          created_at?: string | null
          description: string
          id?: string
          incident_date: string
          location?: string | null
          status?: string
          type: string
          updated_at?: string | null
          worker_read_at?: string | null
        }
        Update: {
          action_taken?: string | null
          admin_comment?: string | null
          admin_comment_at?: string | null
          admin_comment_by?: string | null
          author_id?: string
          author_name?: string
          created_at?: string | null
          description?: string
          id?: string
          incident_date?: string
          location?: string | null
          status?: string
          type?: string
          updated_at?: string | null
          worker_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_reports_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          category: string
          current_qty: number
          id: string
          image_url: string | null
          item_name: string
          last_updated: string | null
          min_qty: number | null
          unit: string
        }
        Insert: {
          category: string
          current_qty?: number
          id?: string
          image_url?: string | null
          item_name: string
          last_updated?: string | null
          min_qty?: number | null
          unit: string
        }
        Update: {
          category?: string
          current_qty?: number
          id?: string
          image_url?: string | null
          item_name?: string
          last_updated?: string | null
          min_qty?: number | null
          unit?: string
        }
        Relationships: []
      }
      inventory_logs: {
        Row: {
          change_type: string
          created_at: string | null
          id: string
          inventory_id: string | null
          note: string | null
          photo_url: string | null
          quantity: number
          schedule_id: string | null
          worker_id: string | null
          worker_name: string | null
        }
        Insert: {
          change_type: string
          created_at?: string | null
          id?: string
          inventory_id?: string | null
          note?: string | null
          photo_url?: string | null
          quantity: number
          schedule_id?: string | null
          worker_id?: string | null
          worker_name?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string | null
          id?: string
          inventory_id?: string | null
          note?: string | null
          photo_url?: string | null
          quantity?: number
          schedule_id?: string | null
          worker_id?: string | null
          worker_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_logs: {
        Row: {
          application_ids: string[]
          billing_ids: string[] | null
          count: number
          file_url: string
          id: string
          is_active: boolean
          issued_at: string
          issued_by: string
          source: string | null
          spreadsheet_id: string
          supplier_id: string | null
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          application_ids?: string[]
          billing_ids?: string[] | null
          count: number
          file_url: string
          id?: string
          is_active?: boolean
          issued_at?: string
          issued_by?: string
          source?: string | null
          spreadsheet_id: string
          supplier_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          application_ids?: string[]
          billing_ids?: string[] | null
          count?: number
          file_url?: string
          id?: string
          is_active?: boolean
          issued_at?: string
          issued_by?: string
          source?: string | null
          spreadsheet_id?: string
          supplier_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_logs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "tax_invoice_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      life_goal_annual_mappings: {
        Row: {
          annual_period_key: string
          created_at: string | null
          id: string
          life_goal_id: string | null
          note: string | null
        }
        Insert: {
          annual_period_key: string
          created_at?: string | null
          id?: string
          life_goal_id?: string | null
          note?: string | null
        }
        Update: {
          annual_period_key?: string
          created_at?: string | null
          id?: string
          life_goal_id?: string | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "life_goal_annual_mappings_life_goal_id_fkey"
            columns: ["life_goal_id"]
            isOneToOne: false
            referencedRelation: "life_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      life_goals: {
        Row: {
          age_group: string
          birthday: string | null
          created_at: string | null
          description: string | null
          end_value: number | null
          goal_type: string | null
          id: string
          notion_id: string | null
          progress: string | null
          sort_order: number | null
          start_value: number | null
          target_date: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          age_group: string
          birthday?: string | null
          created_at?: string | null
          description?: string | null
          end_value?: number | null
          goal_type?: string | null
          id?: string
          notion_id?: string | null
          progress?: string | null
          sort_order?: number | null
          start_value?: number | null
          target_date?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          age_group?: string
          birthday?: string | null
          created_at?: string | null
          description?: string | null
          end_value?: number | null
          goal_type?: string | null
          id?: string
          notion_id?: string | null
          progress?: string | null
          sort_order?: number | null
          start_value?: number | null
          target_date?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      login_logs: {
        Row: {
          failure_msg: string | null
          id: string
          ip_address: string | null
          login_at: string | null
          role: string | null
          success: boolean | null
          user_id: string | null
        }
        Insert: {
          failure_msg?: string | null
          id?: string
          ip_address?: string | null
          login_at?: string | null
          role?: string | null
          success?: boolean | null
          user_id?: string | null
        }
        Update: {
          failure_msg?: string | null
          id?: string
          ip_address?: string | null
          login_at?: string | null
          role?: string | null
          success?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_content: {
        Row: {
          agent: string
          body: string
          card_count: number | null
          category: string | null
          char_count: number | null
          content_type: string
          created_at: string | null
          id: string
          image_urls: string[] | null
          is_published: boolean | null
          item: string
          published_at: string | null
          region: string
          run_id: string | null
          scene_key: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          agent?: string
          body: string
          card_count?: number | null
          category?: string | null
          char_count?: number | null
          content_type: string
          created_at?: string | null
          id?: string
          image_urls?: string[] | null
          is_published?: boolean | null
          item: string
          published_at?: string | null
          region: string
          run_id?: string | null
          scene_key?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          agent?: string
          body?: string
          card_count?: number | null
          category?: string | null
          char_count?: number | null
          content_type?: string
          created_at?: string | null
          id?: string
          image_urls?: string[] | null
          is_published?: boolean | null
          item?: string
          published_at?: string | null
          region?: string
          run_id?: string | null
          scene_key?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_content_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "marketing_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_keywords: {
        Row: {
          content_id: string | null
          created_at: string | null
          id: string
          is_used: boolean | null
          item: string
          region: string
          used_date: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string | null
          id?: string
          is_used?: boolean | null
          item: string
          region: string
          used_date?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string | null
          id?: string
          is_used?: boolean | null
          item?: string
          region?: string
          used_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_keywords_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "marketing_content"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_kpi: {
        Row: {
          avg_rating: number | null
          channel: string
          comment_count: number | null
          content_id: string | null
          created_at: string | null
          id: string
          like_count: number | null
          metric_date: string
          note: string | null
          phone_clicks: number | null
          place_views: number | null
          reach: number | null
          review_count: number | null
          saves: number | null
          shares: number | null
          view_count: number | null
          view_tab: boolean | null
        }
        Insert: {
          avg_rating?: number | null
          channel: string
          comment_count?: number | null
          content_id?: string | null
          created_at?: string | null
          id?: string
          like_count?: number | null
          metric_date?: string
          note?: string | null
          phone_clicks?: number | null
          place_views?: number | null
          reach?: number | null
          review_count?: number | null
          saves?: number | null
          shares?: number | null
          view_count?: number | null
          view_tab?: boolean | null
        }
        Update: {
          avg_rating?: number | null
          channel?: string
          comment_count?: number | null
          content_id?: string | null
          created_at?: string | null
          id?: string
          like_count?: number | null
          metric_date?: string
          note?: string | null
          phone_clicks?: number | null
          place_views?: number | null
          reach?: number | null
          review_count?: number | null
          saves?: number | null
          shares?: number | null
          view_count?: number | null
          view_tab?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_kpi_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "marketing_content"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_place_reviews: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          is_replied: boolean | null
          rating: number | null
          replied_at: string | null
          review_date: string | null
          reviewer: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_replied?: boolean | null
          rating?: number | null
          replied_at?: string | null
          review_date?: string | null
          reviewer?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_replied?: boolean | null
          rating?: number | null
          replied_at?: string | null
          review_date?: string | null
          reviewer?: string | null
        }
        Relationships: []
      }
      marketing_runs: {
        Row: {
          agent: string | null
          created_at: string | null
          duration_sec: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          item: string | null
          region: string | null
          run_date: string
          started_at: string | null
          status: string
          trigger_type: string
        }
        Insert: {
          agent?: string | null
          created_at?: string | null
          duration_sec?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          item?: string | null
          region?: string | null
          run_date: string
          started_at?: string | null
          status?: string
          trigger_type?: string
        }
        Update: {
          agent?: string | null
          created_at?: string | null
          duration_sec?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          item?: string | null
          region?: string | null
          run_date?: string
          started_at?: string | null
          status?: string
          trigger_type?: string
        }
        Relationships: []
      }
      marketing_stats: {
        Row: {
          blog_count: number | null
          blog_target: number | null
          id: string
          image_prompt_count: number | null
          insta_count: number | null
          insta_target: number | null
          month: string
          updated_at: string | null
        }
        Insert: {
          blog_count?: number | null
          blog_target?: number | null
          id?: string
          image_prompt_count?: number | null
          insta_count?: number | null
          insta_target?: number | null
          month: string
          updated_at?: string | null
        }
        Update: {
          blog_count?: number | null
          blog_target?: number | null
          id?: string
          image_prompt_count?: number | null
          insta_count?: number | null
          insta_target?: number | null
          month?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      metrics_config: {
        Row: {
          alive: boolean
          calculation: string
          cycle: string
          direction: string
          function_code: string
          key: string
          label: string
          show_on_dashboard: boolean
          sort_order: number
          target_value: number | null
          unit: string
          updated_at: string
        }
        Insert: {
          alive?: boolean
          calculation?: string
          cycle: string
          direction: string
          function_code: string
          key: string
          label: string
          show_on_dashboard?: boolean
          sort_order?: number
          target_value?: number | null
          unit: string
          updated_at?: string
        }
        Update: {
          alive?: boolean
          calculation?: string
          cycle?: string
          direction?: string
          function_code?: string
          key?: string
          label?: string
          show_on_dashboard?: boolean
          sort_order?: number
          target_value?: number | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "metrics_config_function_code_fkey"
            columns: ["function_code"]
            isOneToOne: false
            referencedRelation: "functions"
            referencedColumns: ["code"]
          },
        ]
      }
      monthly_meetings: {
        Row: {
          attendee_count: number
          churn_count: number
          claims_count: number
          created_at: string
          decision_1: string | null
          decision_2: string | null
          decision_3: string | null
          fix_due: string | null
          fix_item: string | null
          fix_owner_id: string | null
          fix_result: string | null
          held_at: string | null
          id: string
          jobs_count: number
          month: string
          net_profit: number | null
          photo_url: string | null
          praise_reason: string | null
          praised_user_id: string | null
          renewal_rate: number | null
          revenue: number | null
          rework_count: number
          total_count: number
          updated_at: string
        }
        Insert: {
          attendee_count?: number
          churn_count?: number
          claims_count?: number
          created_at?: string
          decision_1?: string | null
          decision_2?: string | null
          decision_3?: string | null
          fix_due?: string | null
          fix_item?: string | null
          fix_owner_id?: string | null
          fix_result?: string | null
          held_at?: string | null
          id?: string
          jobs_count?: number
          month: string
          net_profit?: number | null
          photo_url?: string | null
          praise_reason?: string | null
          praised_user_id?: string | null
          renewal_rate?: number | null
          revenue?: number | null
          rework_count?: number
          total_count?: number
          updated_at?: string
        }
        Update: {
          attendee_count?: number
          churn_count?: number
          claims_count?: number
          created_at?: string
          decision_1?: string | null
          decision_2?: string | null
          decision_3?: string | null
          fix_due?: string | null
          fix_item?: string | null
          fix_owner_id?: string | null
          fix_result?: string | null
          held_at?: string | null
          id?: string
          jobs_count?: number
          month?: string
          net_profit?: number | null
          photo_url?: string | null
          praise_reason?: string | null
          praised_user_id?: string | null
          renewal_rate?: number | null
          revenue?: number | null
          rework_count?: number
          total_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_meetings_fix_owner_id_fkey"
            columns: ["fix_owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_meetings_praised_user_id_fkey"
            columns: ["praised_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_reports: {
        Row: {
          admin_memo: string | null
          created_at: string | null
          customer_id: string
          id: string
          manager_comment: string | null
          month: number
          published_at: string | null
          status: string
          updated_at: string | null
          year: number
        }
        Insert: {
          admin_memo?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          manager_comment?: string | null
          month: number
          published_at?: string | null
          status?: string
          updated_at?: string | null
          year: number
        }
        Update: {
          admin_memo?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          manager_comment?: string | null
          month?: number
          published_at?: string | null
          status?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_reports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_dismissed: {
        Row: {
          dismissed_at: string
          nav_key: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          nav_key: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          nav_key?: string
          user_id?: string
        }
        Relationships: []
      }
      notices: {
        Row: {
          author_id: string | null
          author_name: string | null
          content: string
          created_at: string | null
          event_date: string | null
          id: string
          image_url: string | null
          images: string[]
          pinned: boolean
          popup: boolean
          priority: string
          target_audience: string
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          content: string
          created_at?: string | null
          event_date?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          pinned?: boolean
          popup?: boolean
          priority?: string
          target_audience?: string
          title: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          content?: string
          created_at?: string | null
          event_date?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          pinned?: boolean
          popup?: boolean
          priority?: string
          target_audience?: string
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_history: {
        Row: {
          body: string
          category: string
          created_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          method: string | null
          recipient_id: string | null
          recipient_name: string | null
          recipient_phone: string | null
          recipient_type: string | null
          status: string | null
          title: string | null
          type: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          method?: string | null
          recipient_id?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_type?: string | null
          status?: string | null
          title?: string | null
          type: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          method?: string | null
          recipient_id?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_type?: string | null
          status?: string | null
          title?: string | null
          type?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          application_id: string | null
          id: string
          send_type: string
          sent_at: string
          template_name: string
        }
        Insert: {
          application_id?: string | null
          id?: string
          send_type?: string
          sent_at?: string
          template_name: string
        }
        Update: {
          application_id?: string | null
          id?: string
          send_type?: string
          sent_at?: string
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "service_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          alimtalk_template_id: string | null
          channel_alimtalk: boolean | null
          channel_in_app: boolean | null
          channel_push: boolean | null
          channel_sms: boolean | null
          description: string | null
          id: string
          is_active: boolean | null
          label: string
          notify_admin: boolean | null
          notify_customer: boolean | null
          notify_franchise_hq: boolean
          notify_worker: boolean | null
          sort_order: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          alimtalk_template_id?: string | null
          channel_alimtalk?: boolean | null
          channel_in_app?: boolean | null
          channel_push?: boolean | null
          channel_sms?: boolean | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          notify_admin?: boolean | null
          notify_customer?: boolean | null
          notify_franchise_hq?: boolean
          notify_worker?: boolean | null
          sort_order?: number | null
          type: string
          updated_at?: string | null
        }
        Update: {
          alimtalk_template_id?: string | null
          channel_alimtalk?: boolean | null
          channel_in_app?: boolean | null
          channel_push?: boolean | null
          channel_sms?: boolean | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          notify_admin?: boolean | null
          notify_customer?: boolean | null
          notify_franchise_hq?: boolean
          notify_worker?: boolean | null
          sort_order?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          applicable_locations: string[]
          applicable_types: string[]
          auto_used: boolean
          body: string
          category: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          linked_payment_status: string | null
          linked_progress_status: string | null
          scope: string
          send_mode: string
          subject: string | null
          title: string
          trigger_desc: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          applicable_locations?: string[]
          applicable_types?: string[]
          auto_used?: boolean
          body: string
          category?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          linked_payment_status?: string | null
          linked_progress_status?: string | null
          scope: string
          send_mode?: string
          subject?: string | null
          title: string
          trigger_desc?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          applicable_locations?: string[]
          applicable_types?: string[]
          auto_used?: boolean
          body?: string
          category?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          linked_payment_status?: string | null
          linked_progress_status?: string | null
          scope?: string
          send_mode?: string
          subject?: string | null
          title?: string
          trigger_desc?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_cache: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          phone: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          phone: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number
          created_at: string | null
          expires_at: string
          hashed_otp: string
          locked_until: string | null
          phone: string
          rate_limited_until: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string | null
          expires_at: string
          hashed_otp: string
          locked_until?: string | null
          phone: string
          rate_limited_until?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string | null
          expires_at?: string
          hashed_otp?: string
          locked_until?: string | null
          phone?: string
          rate_limited_until?: string | null
        }
        Relationships: []
      }
      payroll_payslips: {
        Row: {
          calc_method_strings: Json | null
          created_at: string
          deduct_items: Json | null
          deduction_amount: number
          employment_type: string | null
          file_name: string | null
          file_url: string | null
          gross_amount: number
          id: string
          is_sent: boolean
          issued_at: string
          net_amount: number
          pay_date: string | null
          pay_items: Json | null
          person_id: string
          person_name: string
          person_type: string
          sent_at: string | null
          sent_channel: string | null
          snapshot_input: Json | null
          snapshot_rates: Json | null
          status: string
          tax_type: string | null
          year_month: string
        }
        Insert: {
          calc_method_strings?: Json | null
          created_at?: string
          deduct_items?: Json | null
          deduction_amount?: number
          employment_type?: string | null
          file_name?: string | null
          file_url?: string | null
          gross_amount?: number
          id?: string
          is_sent?: boolean
          issued_at?: string
          net_amount?: number
          pay_date?: string | null
          pay_items?: Json | null
          person_id: string
          person_name: string
          person_type: string
          sent_at?: string | null
          sent_channel?: string | null
          snapshot_input?: Json | null
          snapshot_rates?: Json | null
          status?: string
          tax_type?: string | null
          year_month: string
        }
        Update: {
          calc_method_strings?: Json | null
          created_at?: string
          deduct_items?: Json | null
          deduction_amount?: number
          employment_type?: string | null
          file_name?: string | null
          file_url?: string | null
          gross_amount?: number
          id?: string
          is_sent?: boolean
          issued_at?: string
          net_amount?: number
          pay_date?: string | null
          pay_items?: Json | null
          person_id?: string
          person_name?: string
          person_type?: string
          sent_at?: string | null
          sent_channel?: string | null
          snapshot_input?: Json | null
          snapshot_rates?: Json | null
          status?: string
          tax_type?: string | null
          year_month?: string
        }
        Relationships: []
      }
      payroll_records: {
        Row: {
          auto_amount: number
          created_at: string | null
          extra_deductions: Json
          extra_items: Json
          final_amount: number | null
          id: string
          is_paid: boolean
          note: string | null
          paid_at: string | null
          person_id: string
          person_type: string
          updated_at: string | null
          year_month: string
        }
        Insert: {
          auto_amount?: number
          created_at?: string | null
          extra_deductions?: Json
          extra_items?: Json
          final_amount?: number | null
          id?: string
          is_paid?: boolean
          note?: string | null
          paid_at?: string | null
          person_id: string
          person_type: string
          updated_at?: string | null
          year_month: string
        }
        Update: {
          auto_amount?: number
          created_at?: string | null
          extra_deductions?: Json
          extra_items?: Json
          final_amount?: number | null
          id?: string
          is_paid?: boolean
          note?: string | null
          paid_at?: string | null
          person_id?: string
          person_type?: string
          updated_at?: string | null
          year_month?: string
        }
        Relationships: []
      }
      payroll_settings: {
        Row: {
          id: string
          insurance_rates: Json
          updated_at: string | null
        }
        Insert: {
          id?: string
          insurance_rates?: Json
          updated_at?: string | null
        }
        Update: {
          id?: string
          insurance_rates?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      payslip_issue_log: {
        Row: {
          error_message: string | null
          id: string
          method: string
          payslip_id: string
          recipient: string | null
          result: string
          sent_at: string | null
        }
        Insert: {
          error_message?: string | null
          id?: string
          method: string
          payslip_id: string
          recipient?: string | null
          result?: string
          sent_at?: string | null
        }
        Update: {
          error_message?: string | null
          id?: string
          method?: string
          payslip_id?: string
          recipient?: string | null
          result?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payslip_issue_log_payslip_id_fkey"
            columns: ["payslip_id"]
            isOneToOne: false
            referencedRelation: "payroll_payslips"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_template: {
        Row: {
          created_at: string | null
          default_values: Json | null
          employment_type: string
          id: string
          is_default: boolean | null
          name: string
          updated_at: string | null
          visible_deduct_items: Json | null
          visible_pay_items: Json | null
        }
        Insert: {
          created_at?: string | null
          default_values?: Json | null
          employment_type: string
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string | null
          visible_deduct_items?: Json | null
          visible_pay_items?: Json | null
        }
        Update: {
          created_at?: string | null
          default_values?: Json | null
          employment_type?: string
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
          visible_deduct_items?: Json | null
          visible_pay_items?: Json | null
        }
        Relationships: []
      }
      plan_item_connections: {
        Row: {
          created_at: string | null
          id: string
          source_id: string
          target_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          source_id: string
          target_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          source_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_item_connections_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_item_connections_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_item_tasks: {
        Row: {
          created_at: string | null
          id: string
          is_completed: boolean | null
          plan_item_id: string
          sort_order: number | null
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          plan_item_id: string
          sort_order?: number | null
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          plan_item_id?: string
          sort_order?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_item_tasks_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          categories: string[] | null
          created_at: string | null
          description: string | null
          id: string
          level: string
          parent_plan_item_id: string | null
          period_key: string
          priority: string | null
          routine_task_id: string | null
          scheduled_time: string | null
          section_id: string | null
          sort_order: number | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          categories?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          level: string
          parent_plan_item_id?: string | null
          period_key: string
          priority?: string | null
          routine_task_id?: string | null
          scheduled_time?: string | null
          section_id?: string | null
          sort_order?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          categories?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          level?: string
          parent_plan_item_id?: string | null
          period_key?: string
          priority?: string | null
          routine_task_id?: string | null
          scheduled_time?: string | null
          section_id?: string | null
          sort_order?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_parent_plan_item_id_fkey"
            columns: ["parent_plan_item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_routine_task_id_fkey"
            columns: ["routine_task_id"]
            isOneToOne: false
            referencedRelation: "routine_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "plan_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_mappings: {
        Row: {
          child_note: string | null
          child_period_key: string
          created_at: string | null
          id: string
          parent_item_id: string | null
        }
        Insert: {
          child_note?: string | null
          child_period_key: string
          created_at?: string | null
          id?: string
          parent_item_id?: string | null
        }
        Update: {
          child_note?: string | null
          child_period_key?: string
          created_at?: string | null
          id?: string
          parent_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_mappings_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_sections: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          sort_order: number | null
          title: string
          year: number
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          sort_order?: number | null
          title: string
          year: number
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          sort_order?: number | null
          title?: string
          year?: number
        }
        Relationships: []
      }
      portal_preview_tokens: {
        Row: {
          admin_user_id: string | null
          created_at: string | null
          expires_at: string
          id: string
          target_user_id: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          target_user_id?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          target_user_id?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_preview_tokens_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_preview_tokens_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birthday: string | null
          computer_skills: string[] | null
          created_at: string | null
          id: string
          memo: string | null
          name: string
          other_career: string[] | null
          other_certificates: string[] | null
          physical_abilities: string[] | null
          religion: string[] | null
          social_career: string[] | null
          updated_at: string | null
        }
        Insert: {
          birthday?: string | null
          computer_skills?: string[] | null
          created_at?: string | null
          id?: string
          memo?: string | null
          name: string
          other_career?: string[] | null
          other_certificates?: string[] | null
          physical_abilities?: string[] | null
          religion?: string[] | null
          social_career?: string[] | null
          updated_at?: string | null
        }
        Update: {
          birthday?: string | null
          computer_skills?: string[] | null
          created_at?: string | null
          id?: string
          memo?: string | null
          name?: string
          other_career?: string[] | null
          other_certificates?: string[] | null
          physical_abilities?: string[] | null
          religion?: string[] | null
          social_career?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_notification_logs: {
        Row: {
          body: string
          error_message: string | null
          id: string
          sent_at: string | null
          status: string | null
          subscription_id: string | null
          title: string
          url: string | null
          user_id: string | null
          user_type: string | null
        }
        Insert: {
          body: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
          subscription_id?: string | null
          title: string
          url?: string | null
          user_id?: string | null
          user_type?: string | null
        }
        Update: {
          body?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
          subscription_id?: string | null
          title?: string
          url?: string | null
          user_id?: string | null
          user_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          device_info: Json | null
          endpoint: string
          id: string
          is_active: boolean | null
          p256dh: string
          updated_at: string | null
          user_id: string
          user_type: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          device_info?: Json | null
          endpoint: string
          id?: string
          is_active?: boolean | null
          p256dh: string
          updated_at?: string | null
          user_id: string
          user_type: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          device_info?: Json | null
          endpoint?: string
          id?: string
          is_active?: boolean | null
          p256dh?: string
          updated_at?: string | null
          user_id?: string
          user_type?: string
        }
        Relationships: []
      }
      quarterly_interviews: {
        Row: {
          company_action: string | null
          created_at: string
          held_at: string
          id: string
          notified_at: string | null
          q1_hardest: string | null
          q2_wish: string | null
          q3_future: string | null
          quarter: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_action?: string | null
          created_at?: string
          held_at: string
          id?: string
          notified_at?: string | null
          q1_hardest?: string | null
          q2_wish?: string | null
          q3_future?: string | null
          quarter: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_action?: string | null
          created_at?: string
          held_at?: string
          id?: string
          notified_at?: string | null
          q1_hardest?: string | null
          q2_wish?: string | null
          q3_future?: string | null
          quarter?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quarterly_interviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_settings: {
        Row: {
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_name: string | null
          company_address: string
          company_biz_no: string
          company_ceo: string
          company_name: string
          company_phone: string
          id: string
          seal_image_url: string | null
          updated_at: string | null
          valid_days: number
        }
        Insert: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          company_address?: string
          company_biz_no?: string
          company_ceo?: string
          company_name?: string
          company_phone?: string
          id?: string
          seal_image_url?: string | null
          updated_at?: string | null
          valid_days?: number
        }
        Update: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          company_address?: string
          company_biz_no?: string
          company_ceo?: string
          company_name?: string
          company_phone?: string
          id?: string
          seal_image_url?: string | null
          updated_at?: string | null
          valid_days?: number
        }
        Relationships: []
      }
      requests: {
        Row: {
          admin_memo: string | null
          category: string
          checked_at: string | null
          checked_by: string | null
          content: string
          created_at: string
          extra_data: Json
          id: string
          requester_id: string
          requester_name: string
          requester_read: boolean
          requester_role: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_memo?: string | null
          category: string
          checked_at?: string | null
          checked_by?: string | null
          content: string
          created_at?: string
          extra_data?: Json
          id?: string
          requester_id: string
          requester_name?: string
          requester_read?: boolean
          requester_role: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_memo?: string | null
          category?: string
          checked_at?: string | null
          checked_by?: string | null
          content?: string
          created_at?: string
          extra_data?: Json
          id?: string
          requester_id?: string
          requester_name?: string
          requester_read?: boolean
          requester_role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      routine_tasks: {
        Row: {
          category: string
          color: string
          created_at: string | null
          end_date: string | null
          id: string
          is_active: boolean
          monthly_dates: number[] | null
          schedule_type: string
          sort_order: number
          title: string
          updated_at: string | null
          weekly_days: number[] | null
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          monthly_dates?: number[] | null
          schedule_type: string
          sort_order?: number
          title: string
          updated_at?: string | null
          weekly_days?: number[] | null
        }
        Update: {
          category?: string
          color?: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          monthly_dates?: number[] | null
          schedule_type?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
          weekly_days?: number[] | null
        }
        Relationships: []
      }
      service_applications: {
        Row: {
          access_method: string | null
          account_number: string | null
          address: string
          admin_notes: string | null
          admin_reacted_at: string | null
          admin_reacted_by: string | null
          admin_request_notes: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          balance: number | null
          balance_auto_sent_at: string | null
          balance_paid_at: string | null
          balance_payment_url: string | null
          balance_portone_id: string | null
          billing_key: string | null
          building_access: string | null
          business_hours_end: string | null
          business_hours_start: string | null
          business_name: string
          business_number: string | null
          care_scope: string | null
          completed_at: string | null
          condition_score: number | null
          construction_date: string | null
          construction_time: string | null
          created_at: string | null
          customer_id: string | null
          customer_memo: string | null
          deleted_at: string | null
          deposit: number | null
          deposit_auto_sent_at: string | null
          deposit_paid_at: string | null
          deposit_payment_url: string | null
          deposit_portone_id: string | null
          disposition: string | null
          drive_folder_url: string | null
          elevator: string | null
          email: string | null
          gcal_event_id: string | null
          id: string
          internal_memo: string | null
          invoice_issued_at: string | null
          last_quote_no: string | null
          last_quote_pdf_url: string | null
          manager_pay: number | null
          meeting_time: string | null
          notification_log: Json | null
          notification_send_at: string | null
          notification_sent_at: string | null
          notion_page_id: string | null
          owner_name: string
          parking: string | null
          payment_confirmed_at: string | null
          payment_method: string | null
          payment_status: string | null
          payment_status_detail: string | null
          phone: string
          phone_2: string | null
          phone_notify_1: boolean
          phone_notify_2: boolean
          platform_nickname: string | null
          pre_meeting_at: string | null
          pre_meeting_done: boolean
          privacy_consent: string | null
          progress_status: string | null
          quote_items: Json | null
          quote_log: Json | null
          quote_notes: string | null
          quote_pdf_url: string | null
          quote_sent_at: string | null
          quote_url: string | null
          quote_valid_until: string | null
          recommended_services: Json | null
          remind_1day_sent_at: string | null
          remind_day_sent_at: string | null
          request_notes: string | null
          saved_quotes: Json
          service_consent: string | null
          service_type: string | null
          source: string | null
          space_size: string | null
          status: string
          submitted_at: string | null
          supply_amount: number | null
          tax_invoice_issued: boolean
          tax_invoice_issued_at: string | null
          unit_price_per_visit: number | null
          vat: number | null
          virtual_account_bank: string | null
          virtual_account_expired_at: string | null
          virtual_account_number: string | null
          work_completed_at: string | null
          work_started_at: string | null
          work_status: string
          worker_plan_note: string | null
          worker_planned_departure: string | null
        }
        Insert: {
          access_method?: string | null
          account_number?: string | null
          address: string
          admin_notes?: string | null
          admin_reacted_at?: string | null
          admin_reacted_by?: string | null
          admin_request_notes?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_to?: string | null
          balance?: number | null
          balance_auto_sent_at?: string | null
          balance_paid_at?: string | null
          balance_payment_url?: string | null
          balance_portone_id?: string | null
          billing_key?: string | null
          building_access?: string | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          business_name: string
          business_number?: string | null
          care_scope?: string | null
          completed_at?: string | null
          condition_score?: number | null
          construction_date?: string | null
          construction_time?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_memo?: string | null
          deleted_at?: string | null
          deposit?: number | null
          deposit_auto_sent_at?: string | null
          deposit_paid_at?: string | null
          deposit_payment_url?: string | null
          deposit_portone_id?: string | null
          disposition?: string | null
          drive_folder_url?: string | null
          elevator?: string | null
          email?: string | null
          gcal_event_id?: string | null
          id?: string
          internal_memo?: string | null
          invoice_issued_at?: string | null
          last_quote_no?: string | null
          last_quote_pdf_url?: string | null
          manager_pay?: number | null
          meeting_time?: string | null
          notification_log?: Json | null
          notification_send_at?: string | null
          notification_sent_at?: string | null
          notion_page_id?: string | null
          owner_name: string
          parking?: string | null
          payment_confirmed_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payment_status_detail?: string | null
          phone: string
          phone_2?: string | null
          phone_notify_1?: boolean
          phone_notify_2?: boolean
          platform_nickname?: string | null
          pre_meeting_at?: string | null
          pre_meeting_done?: boolean
          privacy_consent?: string | null
          progress_status?: string | null
          quote_items?: Json | null
          quote_log?: Json | null
          quote_notes?: string | null
          quote_pdf_url?: string | null
          quote_sent_at?: string | null
          quote_url?: string | null
          quote_valid_until?: string | null
          recommended_services?: Json | null
          remind_1day_sent_at?: string | null
          remind_day_sent_at?: string | null
          request_notes?: string | null
          saved_quotes?: Json
          service_consent?: string | null
          service_type?: string | null
          source?: string | null
          space_size?: string | null
          status?: string
          submitted_at?: string | null
          supply_amount?: number | null
          tax_invoice_issued?: boolean
          tax_invoice_issued_at?: string | null
          unit_price_per_visit?: number | null
          vat?: number | null
          virtual_account_bank?: string | null
          virtual_account_expired_at?: string | null
          virtual_account_number?: string | null
          work_completed_at?: string | null
          work_started_at?: string | null
          work_status?: string
          worker_plan_note?: string | null
          worker_planned_departure?: string | null
        }
        Update: {
          access_method?: string | null
          account_number?: string | null
          address?: string
          admin_notes?: string | null
          admin_reacted_at?: string | null
          admin_reacted_by?: string | null
          admin_request_notes?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_to?: string | null
          balance?: number | null
          balance_auto_sent_at?: string | null
          balance_paid_at?: string | null
          balance_payment_url?: string | null
          balance_portone_id?: string | null
          billing_key?: string | null
          building_access?: string | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          business_name?: string
          business_number?: string | null
          care_scope?: string | null
          completed_at?: string | null
          condition_score?: number | null
          construction_date?: string | null
          construction_time?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_memo?: string | null
          deleted_at?: string | null
          deposit?: number | null
          deposit_auto_sent_at?: string | null
          deposit_paid_at?: string | null
          deposit_payment_url?: string | null
          deposit_portone_id?: string | null
          disposition?: string | null
          drive_folder_url?: string | null
          elevator?: string | null
          email?: string | null
          gcal_event_id?: string | null
          id?: string
          internal_memo?: string | null
          invoice_issued_at?: string | null
          last_quote_no?: string | null
          last_quote_pdf_url?: string | null
          manager_pay?: number | null
          meeting_time?: string | null
          notification_log?: Json | null
          notification_send_at?: string | null
          notification_sent_at?: string | null
          notion_page_id?: string | null
          owner_name?: string
          parking?: string | null
          payment_confirmed_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payment_status_detail?: string | null
          phone?: string
          phone_2?: string | null
          phone_notify_1?: boolean
          phone_notify_2?: boolean
          platform_nickname?: string | null
          pre_meeting_at?: string | null
          pre_meeting_done?: boolean
          privacy_consent?: string | null
          progress_status?: string | null
          quote_items?: Json | null
          quote_log?: Json | null
          quote_notes?: string | null
          quote_pdf_url?: string | null
          quote_sent_at?: string | null
          quote_url?: string | null
          quote_valid_until?: string | null
          recommended_services?: Json | null
          remind_1day_sent_at?: string | null
          remind_day_sent_at?: string | null
          request_notes?: string | null
          saved_quotes?: Json
          service_consent?: string | null
          service_type?: string | null
          source?: string | null
          space_size?: string | null
          status?: string
          submitted_at?: string | null
          supply_amount?: number | null
          tax_invoice_issued?: boolean
          tax_invoice_issued_at?: string | null
          unit_price_per_visit?: number | null
          vat?: number | null
          virtual_account_bank?: string | null
          virtual_account_expired_at?: string | null
          virtual_account_number?: string | null
          work_completed_at?: string | null
          work_started_at?: string | null
          work_status?: string
          worker_plan_note?: string | null
          worker_planned_departure?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_applications_admin_reacted_by_fkey"
            columns: ["admin_reacted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_billings: {
        Row: {
          amount: number
          billing_period: string
          billing_type: string
          created_at: string | null
          customer_id: string
          due_date: string
          id: string
          last_notified_at: string | null
          notes: string | null
          paid_date: string | null
          schedule_id: string | null
          service_type: string | null
          status: string | null
          tax_invoice_issued: boolean
          tax_invoice_issued_date: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          billing_period: string
          billing_type: string
          created_at?: string | null
          customer_id: string
          due_date: string
          id?: string
          last_notified_at?: string | null
          notes?: string | null
          paid_date?: string | null
          schedule_id?: string | null
          service_type?: string | null
          status?: string | null
          tax_invoice_issued?: boolean
          tax_invoice_issued_date?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          billing_period?: string
          billing_type?: string
          created_at?: string | null
          customer_id?: string
          due_date?: string
          id?: string
          last_notified_at?: string | null
          notes?: string | null
          paid_date?: string | null
          schedule_id?: string | null
          service_type?: string | null
          status?: string | null
          tax_invoice_issued?: boolean
          tax_invoice_issued_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_billings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_billings_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      service_schedules: {
        Row: {
          actual_arrival: string | null
          actual_completion: string | null
          application_id: string | null
          arrival_lat: number | null
          arrival_lng: number | null
          assigned_user_id: string | null
          contract_id: string | null
          created_at: string | null
          customer_id: string | null
          deleted_at: string | null
          gcal_event_id: string | null
          id: string
          items_this_visit: Json
          memo_visible: boolean
          payment_amount: number | null
          payment_date: string | null
          payment_status: string | null
          scheduled_date: string
          scheduled_time_end: string | null
          scheduled_time_start: string | null
          status: string | null
          updated_at: string | null
          work_step: number | null
          worker_id: string | null
          worker_memo: string | null
          worker_pay: number | null
        }
        Insert: {
          actual_arrival?: string | null
          actual_completion?: string | null
          application_id?: string | null
          arrival_lat?: number | null
          arrival_lng?: number | null
          assigned_user_id?: string | null
          contract_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          gcal_event_id?: string | null
          id?: string
          items_this_visit?: Json
          memo_visible?: boolean
          payment_amount?: number | null
          payment_date?: string | null
          payment_status?: string | null
          scheduled_date: string
          scheduled_time_end?: string | null
          scheduled_time_start?: string | null
          status?: string | null
          updated_at?: string | null
          work_step?: number | null
          worker_id?: string | null
          worker_memo?: string | null
          worker_pay?: number | null
        }
        Update: {
          actual_arrival?: string | null
          actual_completion?: string | null
          application_id?: string | null
          arrival_lat?: number | null
          arrival_lng?: number | null
          assigned_user_id?: string | null
          contract_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          gcal_event_id?: string | null
          id?: string
          items_this_visit?: Json
          memo_visible?: boolean
          payment_amount?: number | null
          payment_date?: string | null
          payment_status?: string | null
          scheduled_date?: string
          scheduled_time_end?: string | null
          scheduled_time_start?: string | null
          status?: string | null
          updated_at?: string | null
          work_step?: number | null
          worker_id?: string | null
          worker_memo?: string | null
          worker_pay?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_schedules_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "service_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_items: {
        Row: {
          category: string | null
          created_at: string | null
          expected_price: number | null
          id: string
          memo: string | null
          priority: string | null
          purchased_at: string | null
          qty: number | null
          service_date: string | null
          sort_order: number | null
          status: string | null
          title: string
          updated_at: string | null
          url: string | null
          where_to_buy: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          expected_price?: number | null
          id?: string
          memo?: string | null
          priority?: string | null
          purchased_at?: string | null
          qty?: number | null
          service_date?: string | null
          sort_order?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
          url?: string | null
          where_to_buy?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          expected_price?: number | null
          id?: string
          memo?: string | null
          priority?: string | null
          purchased_at?: string | null
          qty?: number | null
          service_date?: string | null
          sort_order?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
          url?: string | null
          where_to_buy?: string | null
        }
        Relationships: []
      }
      shopping_sites: {
        Row: {
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
          url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          url?: string
        }
        Relationships: []
      }
      standards: {
        Row: {
          created_at: string
          cycle: string
          doc_name: string
          file_url: string | null
          function_code: string
          id: string
          last_updated_at: string | null
          max_pages: string | null
          stale_after_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle: string
          doc_name: string
          file_url?: string | null
          function_code: string
          id?: string
          last_updated_at?: string | null
          max_pages?: string | null
          stale_after_days: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle?: string
          doc_name?: string
          file_url?: string | null
          function_code?: string
          id?: string
          last_updated_at?: string | null
          max_pages?: string | null
          stale_after_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "standards_function_code_fkey"
            columns: ["function_code"]
            isOneToOne: false
            referencedRelation: "functions"
            referencedColumns: ["code"]
          },
        ]
      }
      tax_invoice_drafts: {
        Row: {
          bill_receipt_type: string | null
          created_at: string
          id: string
          invoice_kind: string | null
          items: Json
          notes: string | null
          receiver_address: string | null
          receiver_business_item: string | null
          receiver_business_name: string | null
          receiver_business_number: string | null
          receiver_business_type: string | null
          receiver_email: string | null
          receiver_email_2: string | null
          receiver_owner_name: string | null
          source: string
          source_id: string
          supplier_id: string | null
          updated_at: string
          written_date: string | null
        }
        Insert: {
          bill_receipt_type?: string | null
          created_at?: string
          id?: string
          invoice_kind?: string | null
          items?: Json
          notes?: string | null
          receiver_address?: string | null
          receiver_business_item?: string | null
          receiver_business_name?: string | null
          receiver_business_number?: string | null
          receiver_business_type?: string | null
          receiver_email?: string | null
          receiver_email_2?: string | null
          receiver_owner_name?: string | null
          source: string
          source_id: string
          supplier_id?: string | null
          updated_at?: string
          written_date?: string | null
        }
        Update: {
          bill_receipt_type?: string | null
          created_at?: string
          id?: string
          invoice_kind?: string | null
          items?: Json
          notes?: string | null
          receiver_address?: string | null
          receiver_business_item?: string | null
          receiver_business_name?: string | null
          receiver_business_number?: string | null
          receiver_business_type?: string | null
          receiver_email?: string | null
          receiver_email_2?: string | null
          receiver_owner_name?: string | null
          source?: string
          source_id?: string
          supplier_id?: string | null
          updated_at?: string
          written_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoice_drafts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "tax_invoice_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_invoice_suppliers: {
        Row: {
          address: string
          business_item: string
          business_type: string
          company_name: string
          created_at: string
          email: string
          id: string
          is_default: boolean
          label: string
          registration_number: string
          representative: string
          updated_at: string
        }
        Insert: {
          address?: string
          business_item?: string
          business_type?: string
          company_name: string
          created_at?: string
          email?: string
          id?: string
          is_default?: boolean
          label: string
          registration_number: string
          representative: string
          updated_at?: string
        }
        Update: {
          address?: string
          business_item?: string
          business_type?: string
          company_name?: string
          created_at?: string
          email?: string
          id?: string
          is_default?: boolean
          label?: string
          registration_number?: string
          representative?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_rate_config: {
        Row: {
          created_at: string | null
          effective_from: string
          effective_to: string | null
          id: string
          key: string
          memo: string | null
          value: number
        }
        Insert: {
          created_at?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          key: string
          memo?: string | null
          value: number
        }
        Update: {
          created_at?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          key?: string
          memo?: string | null
          value?: number
        }
        Relationships: []
      }
      thought_edges: {
        Row: {
          created_at: string
          id: string
          label: string | null
          relation_type: string
          source_handle: string | null
          source_id: string
          target_handle: string | null
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          relation_type?: string
          source_handle?: string | null
          source_id: string
          target_handle?: string | null
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          relation_type?: string
          source_handle?: string | null
          source_id?: string
          target_handle?: string | null
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thought_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "thought_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thought_edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "thought_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      thought_nodes: {
        Row: {
          color: string
          content: string | null
          created_at: string
          grid_position: number
          id: string
          node_kind: string
          parent_id: string | null
          pos_x: number
          pos_y: number
          sort_order: number
          tags: string[]
          title: string
          type: Database["public"]["Enums"]["thought_node_type"]
          updated_at: string
        }
        Insert: {
          color?: string
          content?: string | null
          created_at?: string
          grid_position?: number
          id?: string
          node_kind?: string
          parent_id?: string | null
          pos_x?: number
          pos_y?: number
          sort_order?: number
          tags?: string[]
          title?: string
          type?: Database["public"]["Enums"]["thought_node_type"]
          updated_at?: string
        }
        Update: {
          color?: string
          content?: string | null
          created_at?: string
          grid_position?: number
          id?: string
          node_kind?: string
          parent_id?: string | null
          pos_x?: number
          pos_y?: number
          sort_order?: number
          tags?: string[]
          title?: string
          type?: Database["public"]["Enums"]["thought_node_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "thought_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "thought_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_queue: {
        Row: {
          bg_photo_index: number
          content_id: string | null
          created_at: string | null
          folder_id: string
          folder_name: string
          id: number
          main_photo_index: number
          used_at: string | null
        }
        Insert: {
          bg_photo_index?: number
          content_id?: string | null
          created_at?: string | null
          folder_id: string
          folder_name: string
          id?: number
          main_photo_index?: number
          used_at?: string | null
        }
        Update: {
          bg_photo_index?: number
          content_id?: string | null
          created_at?: string | null
          folder_id?: string
          folder_name?: string
          id?: number
          main_photo_index?: number
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_queue_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "marketing_content"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_price_monthly: {
        Row: {
          application_id: string
          created_at: string | null
          id: string
          unit_price: number
          updated_at: string | null
          year_month: string
        }
        Insert: {
          application_id: string
          created_at?: string | null
          id?: string
          unit_price?: number
          updated_at?: string | null
          year_month: string
        }
        Update: {
          application_id?: string
          created_at?: string | null
          id?: string
          unit_price?: number
          updated_at?: string | null
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_price_monthly_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "service_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_number: string | null
          account_sent_at: string | null
          auth_id: string | null
          avatar_url: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          password_hint: string | null
          phone: string | null
          resident_number: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          account_sent_at?: string | null
          auth_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          password_hint?: string | null
          phone?: string | null
          resident_number?: string | null
          role: string
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          account_sent_at?: string | null
          auth_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          password_hint?: string | null
          phone?: string | null
          resident_number?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      weekly_notices: {
        Row: {
          ai_draft_used: boolean
          author_id: string
          created_at: string
          id: string
          line1: string
          line2: string
          line3: string
          original_draft: Json | null
          published_at: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          ai_draft_used?: boolean
          author_id: string
          created_at?: string
          id?: string
          line1: string
          line2: string
          line3: string
          original_draft?: Json | null
          published_at?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          ai_draft_used?: boolean
          author_id?: string
          created_at?: string
          id?: string
          line1?: string
          line2?: string
          line3?: string
          original_draft?: Json | null
          published_at?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_notices_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      work_assignments: {
        Row: {
          application_id: string | null
          business_name: string | null
          construction_date: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          salary: number | null
          service_type: string | null
          worker_id: string | null
        }
        Insert: {
          application_id?: string | null
          business_name?: string | null
          construction_date?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          salary?: number | null
          service_type?: string | null
          worker_id?: string | null
        }
        Update: {
          application_id?: string | null
          business_name?: string | null
          construction_date?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          salary?: number | null
          service_type?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_assignments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      work_checklists: {
        Row: {
          checklist_items: Json
          completed_at: string | null
          created_at: string | null
          id: string
          is_completed: boolean | null
          item_name: string
          schedule_id: string | null
        }
        Insert: {
          checklist_items?: Json
          completed_at?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          item_name: string
          schedule_id?: string | null
        }
        Update: {
          checklist_items?: Json
          completed_at?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          item_name?: string
          schedule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_checklists_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      work_photos: {
        Row: {
          checklist_id: string | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          photo_type: string
          photo_url: string
          schedule_id: string | null
          storage_path: string
          taken_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          checklist_id?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          photo_type: string
          photo_url: string
          schedule_id?: string | null
          storage_path: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          checklist_id?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          photo_type?: string
          photo_url?: string
          schedule_id?: string | null
          storage_path?: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_photos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "work_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_photos_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          account_number: string | null
          anniversary: string | null
          avg_salary: number | null
          bank_copy_submitted: string | null
          birth_date: string | null
          blood_type: string | null
          certifications: string | null
          contract_signed: string | null
          contracted_monthly_hours: number | null
          contracted_weekly_hours: number | null
          created_at: string | null
          day_wage: number | null
          department: string | null
          dependents: number | null
          email: string | null
          emergency_contact: string | null
          employment_type: string | null
          enrolled_employment_insurance: boolean | null
          enrolled_health_insurance: boolean | null
          enrolled_national_pension: boolean | null
          gender: string | null
          health_cert_date: string | null
          health_cert_status: string | null
          hobby: string | null
          home_address: string | null
          id: string
          job_title: string | null
          join_date: string | null
          name: string
          nationality: string | null
          night_wage: number | null
          personal_id: string | null
          phone: string | null
          photo_url: string | null
          position: string | null
          resident_number: string | null
          safety_edu_date: string | null
          safety_edu_status: string | null
          salary_basis: string | null
          skill_level: string | null
          specialties: string | null
          tax_type: string | null
          template_id: string | null
          user_id: string | null
          work_history: string | null
        }
        Insert: {
          account_number?: string | null
          anniversary?: string | null
          avg_salary?: number | null
          bank_copy_submitted?: string | null
          birth_date?: string | null
          blood_type?: string | null
          certifications?: string | null
          contract_signed?: string | null
          contracted_monthly_hours?: number | null
          contracted_weekly_hours?: number | null
          created_at?: string | null
          day_wage?: number | null
          department?: string | null
          dependents?: number | null
          email?: string | null
          emergency_contact?: string | null
          employment_type?: string | null
          enrolled_employment_insurance?: boolean | null
          enrolled_health_insurance?: boolean | null
          enrolled_national_pension?: boolean | null
          gender?: string | null
          health_cert_date?: string | null
          health_cert_status?: string | null
          hobby?: string | null
          home_address?: string | null
          id?: string
          job_title?: string | null
          join_date?: string | null
          name: string
          nationality?: string | null
          night_wage?: number | null
          personal_id?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          resident_number?: string | null
          safety_edu_date?: string | null
          safety_edu_status?: string | null
          salary_basis?: string | null
          skill_level?: string | null
          specialties?: string | null
          tax_type?: string | null
          template_id?: string | null
          user_id?: string | null
          work_history?: string | null
        }
        Update: {
          account_number?: string | null
          anniversary?: string | null
          avg_salary?: number | null
          bank_copy_submitted?: string | null
          birth_date?: string | null
          blood_type?: string | null
          certifications?: string | null
          contract_signed?: string | null
          contracted_monthly_hours?: number | null
          contracted_weekly_hours?: number | null
          created_at?: string | null
          day_wage?: number | null
          department?: string | null
          dependents?: number | null
          email?: string | null
          emergency_contact?: string | null
          employment_type?: string | null
          enrolled_employment_insurance?: boolean | null
          enrolled_health_insurance?: boolean | null
          enrolled_national_pension?: boolean | null
          gender?: string | null
          health_cert_date?: string | null
          health_cert_status?: string | null
          hobby?: string | null
          home_address?: string | null
          id?: string
          job_title?: string | null
          join_date?: string | null
          name?: string
          nationality?: string | null
          night_wage?: number | null
          personal_id?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          resident_number?: string | null
          safety_edu_date?: string | null
          safety_edu_status?: string | null
          salary_basis?: string | null
          skill_level?: string | null
          specialties?: string | null
          tax_type?: string | null
          template_id?: string | null
          user_id?: string | null
          work_history?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "payslip_template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      auction_summary: {
        Row: {
          address: string | null
          appraisal_amount: number | null
          bid_date: string | null
          case_number: string | null
          claim_amount: number | null
          court: string | null
          crawled_at: string | null
          division: string | null
          estimated_total_cost: number | null
          fail_count: number | null
          id: string | null
          inherited_rights: Json | null
          investment_memo: string | null
          item_note: string | null
          item_type: string | null
          lessee_risk: Json | null
          lien_risk: Json | null
          min_bid_amount: number | null
          min_bid_rate: number | null
          parties: Json | null
          risk_level: string | null
          risk_summary: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_user_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      detect_attendance_anomalies: {
        Args: {
          late_arrival_grace_min?: number
          late_departure_grace_min?: number
          overrun_ratio?: number
        }
        Returns: {
          alert_type: string
          application_id: string
          assigned_admin_id: string
          business_name: string
          construction_date: string
          elapsed_min: number
          scheduled_time: string
          work_started_at: string
          worker_user_ids: string[]
        }[]
      }
      get_auth_user_id_by_phone: { Args: { p_phone: string }; Returns: string }
      get_low_stock_items: {
        Args: never
        Returns: {
          category: string
          current_qty: number
          id: string
          image_url: string
          item_name: string
          last_updated: string
          min_qty: number
          unit: string
        }[]
      }
      get_profile_id_by_phone: { Args: { p_phone: string }; Returns: string }
      recalc_customer_next_visit: {
        Args: { target_customer_id: string }
        Returns: undefined
      }
    }
    Enums: {
      thought_node_type:
        | "idea"
        | "logic"
        | "concern"
        | "action"
        | "business"
        | "memo"
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
      thought_node_type: [
        "idea",
        "logic",
        "concern",
        "action",
        "business",
        "memo",
      ],
    },
  },
} as const

// ─── 커스텀 도메인 타입 (자동 생성 영역 외부) ─────────────────────────────

export type UserRole = 'admin' | 'worker' | 'customer' | 'franchise_hq'

export type PipelineStatus =
  | 'inquiry' | 'quote_sent' | 'consulting' | 'contracted'
  | 'schedule_assigned' | 'service_scheduled' | 'service_done'
  | 'payment_done' | 'subscription_active' | 'renewal_pending' | 'churned'

export type ScheduleStatus =
  | 'scheduled' | 'confirmed' | 'in_progress' | 'completed'
  | 'cancelled' | 'rescheduled'

export type PaymentStatus = 'pending' | 'invoiced' | 'paid' | 'overdue'

export type PhotoType = 'before' | 'after' | 'during' | 'damage' | 'closing'

export type ContractType = 'onetime' | 'subscription'

export type ServiceGrade = 'Z_WHITE' | 'G_BLUE' | 'D_BLACK'

export type InventoryCategory = 'chemical' | 'equipment' | 'consumable' | 'other'

export interface User {
  id: string
  auth_id: string | null
  role: UserRole
  name: string
  phone: string
  email: string | null
  avatar_url: string | null
  is_active: boolean
  account_sent_at: string | null
  password_hint: string | null
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  user_id: string | null
  business_name: string
  business_number: string | null
  address: string
  address_detail: string | null
  latitude: number | null
  longitude: number | null
  contact_name: string
  contact_phone: string
  door_password: string | null
  gas_location: string | null
  power_location: string | null
  parking_info: string | null
  special_notes: string | null
  drive_folder_url: string | null
  pipeline_status: PipelineStatus
  created_at: string
  updated_at: string
}

export interface ServiceItem {
  id: string
  name: string
  category: string
}

export interface Contract {
  id: string
  customer_id: string
  contract_type: ContractType
  subscription_plan: 'cycle_3' | 'cycle_6' | 'cycle_12' | null
  visit_frequency: 'standard' | 'double' | 'triple' | null
  service_grade: ServiceGrade
  selected_items: ServiceItem[]
  monthly_price: number | null
  annual_price: number | null
  start_date: string | null
  end_date: string | null
  contract_year: number
  discount_rate: number
  status: 'draft' | 'active' | 'expired' | 'terminated' | 'renewed'
  created_at: string
  updated_at: string
}

export interface ServiceSchedule {
  id: string
  customer_id: string
  contract_id: string | null
  worker_id: string | null
  scheduled_date: string
  scheduled_time_start: string
  scheduled_time_end: string
  items_this_visit: ServiceItem[]
  status: ScheduleStatus
  work_step: number
  actual_arrival: string | null
  actual_completion: string | null
  arrival_lat: number | null
  arrival_lng: number | null
  worker_memo: string | null
  memo_visible: boolean
  payment_status: PaymentStatus
  payment_amount: number | null
  payment_date: string | null
  created_at: string
  updated_at: string
  customer?: Customer
  worker?: User
}

export interface ChecklistItem {
  step: string
  done: boolean
  done_at?: string
}

export interface WorkChecklist {
  id: string
  schedule_id: string
  item_name: string
  checklist_items: ChecklistItem[]
  is_completed: boolean
  completed_at: string | null
  created_at: string
}

export interface WorkPhoto {
  id: string
  schedule_id: string
  checklist_id: string | null
  photo_type: PhotoType
  storage_path: string
  photo_url: string
  taken_at: string
  gps_lat: number | null
  gps_lng: number | null
  uploaded_by: string | null
}

export type ConditionScore = 1 | 2 | 3
export type RecommendationPriority = 'high' | 'medium' | 'low'

export interface RecommendedService {
  name: string
  reason: string
  priority: RecommendationPriority
}

export interface ClosingChecklist {
  id: string
  schedule_id: string
  garbage_disposal: boolean
  gas_valve_check: boolean
  electric_check: boolean
  security_check: boolean
  door_lock_check: boolean
  customer_rating: number | null
  customer_comment: string | null
  condition_score: ConditionScore | null
  recommended_services: RecommendedService[]
  completed_at: string | null
  created_at: string
}

export interface Attendance {
  id: string
  worker_id: string
  work_date: string
  clock_in: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_out: string | null
  clock_out_lat: number | null
  clock_out_lng: number | null
}

export interface InventoryItem {
  id: string
  category: InventoryCategory
  item_name: string
  current_qty: number
  unit: string
  min_qty: number
  last_updated: string
}

export interface CustomerRequest {
  id: string
  customer_id: string
  user_id: string
  content: string
  is_read: boolean
  created_at: string
}

export interface InventoryLog {
  id: string
  inventory_id: string
  worker_id: string | null
  schedule_id: string | null
  change_type: 'use' | 'receive' | 'return' | 'adjust'
  quantity: number
  note: string | null
  created_at: string
}
