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
      ai_assists: {
        Row: {
          assist_type: string
          created_at: string
          custom_instructions: string | null
          error_message: string | null
          grounding: Json | null
          hallucinated_clauses: Json | null
          id: string
          input_text: string | null
          latency_ms: number | null
          model: string | null
          output_text: string | null
          status: string
          use_reference_library: boolean
          user_id: string | null
        }
        Insert: {
          assist_type: string
          created_at?: string
          custom_instructions?: string | null
          error_message?: string | null
          grounding?: Json | null
          hallucinated_clauses?: Json | null
          id?: string
          input_text?: string | null
          latency_ms?: number | null
          model?: string | null
          output_text?: string | null
          status?: string
          use_reference_library?: boolean
          user_id?: string | null
        }
        Update: {
          assist_type?: string
          created_at?: string
          custom_instructions?: string | null
          error_message?: string | null
          grounding?: Json | null
          hallucinated_clauses?: Json | null
          id?: string
          input_text?: string | null
          latency_ms?: number | null
          model?: string | null
          output_text?: string | null
          status?: string
          use_reference_library?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_date: string
          created_at: string
          created_by: string
          customer_id: string | null
          description: string | null
          end_date: string | null
          end_time: string | null
          engineer_id: string | null
          id: string
          site_id: string
          start_time: string
          status: string
          title: string
          updated_at: string
          visit_id: string | null
          visit_type: string | null
        }
        Insert: {
          appointment_date: string
          created_at?: string
          created_by: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          engineer_id?: string | null
          id?: string
          site_id: string
          start_time: string
          status?: string
          title: string
          updated_at?: string
          visit_id?: string | null
          visit_type?: string | null
        }
        Update: {
          appointment_date?: string
          created_at?: string
          created_by?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          engineer_id?: string | null
          id?: string
          site_id?: string
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
          visit_id?: string | null
          visit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "appointments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      auto_quote_disambiguations: {
        Row: {
          candidates: Json | null
          created_at: string | null
          id: string
          job_id: string | null
          notes: string | null
          original_description: string
          quantity: number
          selected_candidate: Json | null
          status: string
        }
        Insert: {
          candidates?: Json | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          original_description: string
          quantity?: number
          selected_candidate?: Json | null
          status?: string
        }
        Update: {
          candidates?: Json | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          original_description?: string
          quantity?: number
          selected_candidate?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_quote_disambiguations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "auto_quote_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_quote_jobs: {
        Row: {
          created_at: string | null
          email_id: string
          email_type: string | null
          id: string
          items_matched: number | null
          items_pending: number | null
          quotation_id: string | null
          received_at: string | null
          sender: string | null
          site_address: string | null
          site_name: string | null
          status: string
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          email_id: string
          email_type?: string | null
          id?: string
          items_matched?: number | null
          items_pending?: number | null
          quotation_id?: string | null
          received_at?: string | null
          sender?: string | null
          site_address?: string | null
          site_name?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          email_id?: string
          email_type?: string | null
          id?: string
          items_matched?: number | null
          items_pending?: number | null
          quotation_id?: string | null
          received_at?: string | null
          sender?: string | null
          site_address?: string | null
          site_name?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_quote_jobs_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      cause_effect_matrices: {
        Row: {
          id: string
          is_archived: boolean
          legend: string | null
          notes: string | null
          site_id: string
          source_file_name: string | null
          source_file_path: string | null
          title: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          id?: string
          is_archived?: boolean
          legend?: string | null
          notes?: string | null
          site_id: string
          source_file_name?: string | null
          source_file_path?: string | null
          title: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          id?: string
          is_archived?: boolean
          legend?: string | null
          notes?: string | null
          site_id?: string
          source_file_name?: string | null
          source_file_path?: string | null
          title?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cause_effect_matrices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      cause_effect_outputs: {
        Row: {
          code: string
          id: string
          identification: string | null
          matrix_id: string
          ordinal: number
          panel_location: string | null
        }
        Insert: {
          code: string
          id?: string
          identification?: string | null
          matrix_id: string
          ordinal: number
          panel_location?: string | null
        }
        Update: {
          code?: string
          id?: string
          identification?: string | null
          matrix_id?: string
          ordinal?: number
          panel_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cause_effect_outputs_matrix_id_fkey"
            columns: ["matrix_id"]
            isOneToOne: false
            referencedRelation: "cause_effect_matrices"
            referencedColumns: ["id"]
          },
        ]
      }
      cause_effect_rules: {
        Row: {
          actions: Json
          id: string
          matrix_id: string
          notes: string | null
          ordinal: number
          ref: string | null
          trigger_device: string | null
          trigger_location: string | null
          trigger_type: string | null
        }
        Insert: {
          actions?: Json
          id?: string
          matrix_id: string
          notes?: string | null
          ordinal: number
          ref?: string | null
          trigger_device?: string | null
          trigger_location?: string | null
          trigger_type?: string | null
        }
        Update: {
          actions?: Json
          id?: string
          matrix_id?: string
          notes?: string | null
          ordinal?: number
          ref?: string | null
          trigger_device?: string | null
          trigger_location?: string | null
          trigger_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cause_effect_rules_matrix_id_fkey"
            columns: ["matrix_id"]
            isOneToOne: false
            referencedRelation: "cause_effect_matrices"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_audibility_readings: {
        Row: {
          alarm_db: number | null
          ambient_db: number | null
          created_at: string
          floor: string | null
          id: string
          location: string
          notes: string | null
          ordinal: number
          report_id: string
          required_db: number | null
          result: string | null
        }
        Insert: {
          alarm_db?: number | null
          ambient_db?: number | null
          created_at?: string
          floor?: string | null
          id?: string
          location: string
          notes?: string | null
          ordinal: number
          report_id: string
          required_db?: number | null
          result?: string | null
        }
        Update: {
          alarm_db?: number | null
          ambient_db?: number | null
          created_at?: string
          floor?: string | null
          id?: string
          location?: string
          notes?: string | null
          ordinal?: number
          report_id?: string
          required_db?: number | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ce_audibility_readings_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "ce_audibility_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_audibility_reports: {
        Row: {
          bs5839_compliant: boolean | null
          client_name: string | null
          client_sign_name: string | null
          client_sign_position: string | null
          client_signature: string | null
          created_at: string
          created_by: string | null
          engineer_name: string | null
          engineer_signature: string | null
          general_observations: string | null
          id: string
          invoiced: boolean
          next_service_due: string | null
          notes: string | null
          remedial_timeframe: string | null
          report_date: string | null
          report_number: string | null
          sharepoint_folder: string | null
          sharepoint_url: string | null
          site_id: string
          sound_meter_cal_due: string | null
          sound_meter_cal_on_file: boolean | null
          sound_meter_make_model: string | null
          sound_meter_serial: string | null
          status: string
          updated_at: string
          visit_id: string
        }
        Insert: {
          bs5839_compliant?: boolean | null
          client_name?: string | null
          client_sign_name?: string | null
          client_sign_position?: string | null
          client_signature?: string | null
          created_at?: string
          created_by?: string | null
          engineer_name?: string | null
          engineer_signature?: string | null
          general_observations?: string | null
          id?: string
          invoiced?: boolean
          next_service_due?: string | null
          notes?: string | null
          remedial_timeframe?: string | null
          report_date?: string | null
          report_number?: string | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          site_id: string
          sound_meter_cal_due?: string | null
          sound_meter_cal_on_file?: boolean | null
          sound_meter_make_model?: string | null
          sound_meter_serial?: string | null
          status?: string
          updated_at?: string
          visit_id: string
        }
        Update: {
          bs5839_compliant?: boolean | null
          client_name?: string | null
          client_sign_name?: string | null
          client_sign_position?: string | null
          client_signature?: string | null
          created_at?: string
          created_by?: string | null
          engineer_name?: string | null
          engineer_signature?: string | null
          general_observations?: string | null
          id?: string
          invoiced?: boolean
          next_service_due?: string | null
          notes?: string | null
          remedial_timeframe?: string | null
          report_date?: string | null
          report_number?: string | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          site_id?: string
          sound_meter_cal_due?: string | null
          sound_meter_cal_on_file?: boolean | null
          sound_meter_make_model?: string | null
          sound_meter_serial?: string | null
          status?: string
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_audibility_reports_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_audibility_reports_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_issues: {
        Row: {
          action_required: string | null
          created_at: string
          description: string | null
          id: string
          kind: string
          location: string | null
          measured_db: number | null
          report_id: string
          required_db: number | null
          severity: string | null
        }
        Insert: {
          action_required?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          location?: string | null
          measured_db?: number | null
          report_id: string
          required_db?: number | null
          severity?: string | null
        }
        Update: {
          action_required?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          location?: string | null
          measured_db?: number | null
          report_id?: string
          required_db?: number | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ce_issues_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "ce_audibility_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_output_checks: {
        Row: {
          actual: string | null
          created_at: string
          expected: string | null
          function_name: string
          id: string
          ordinal: number
          report_id: string
          result: string | null
        }
        Insert: {
          actual?: string | null
          created_at?: string
          expected?: string | null
          function_name: string
          id?: string
          ordinal: number
          report_id: string
          result?: string | null
        }
        Update: {
          actual?: string | null
          created_at?: string
          expected?: string | null
          function_name?: string
          id?: string
          ordinal?: number
          report_id?: string
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ce_output_checks_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "ce_audibility_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_remedials: {
        Row: {
          created_at: string
          description: string | null
          estimated_cost: number | null
          id: string
          location: string | null
          priority: string | null
          report_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          location?: string | null
          priority?: string | null
          report_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          location?: string | null
          priority?: string | null
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_remedials_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "ce_audibility_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_stage_tests: {
        Row: {
          areas_activated: string | null
          created_at: string
          delay_time: string | null
          id: string
          ordinal: number
          report_id: string
          result: string | null
          stage_name: string
        }
        Insert: {
          areas_activated?: string | null
          created_at?: string
          delay_time?: string | null
          id?: string
          ordinal: number
          report_id: string
          result?: string | null
          stage_name: string
        }
        Update: {
          areas_activated?: string | null
          created_at?: string
          delay_time?: string | null
          id?: string
          ordinal?: number
          report_id?: string
          result?: string | null
          stage_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_stage_tests_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "ce_audibility_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      company_documents: {
        Row: {
          category: string
          created_at: string
          description: string | null
          expires_at: string | null
          file_storage_path: string | null
          file_url: string | null
          id: string
          is_archived: boolean | null
          title: string
          updated_at: string
          version: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          file_storage_path?: string | null
          file_url?: string | null
          id?: string
          is_archived?: boolean | null
          title: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          file_storage_path?: string | null
          file_url?: string | null
          id?: string
          is_archived?: boolean | null
          title?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          bank_sort_code: string | null
          city: string | null
          company_logo_url: string | null
          company_name: string
          created_at: string
          created_by: string | null
          default_engineer_signature: string | null
          default_payment_terms: number | null
          email: string | null
          id: string
          phone: string | null
          postcode: string | null
          registration_number: string | null
          report_footer_text: string | null
          report_logo_url: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_sort_code?: string | null
          city?: string | null
          company_logo_url?: string | null
          company_name: string
          created_at?: string
          created_by?: string | null
          default_engineer_signature?: string | null
          default_payment_terms?: number | null
          email?: string | null
          id?: string
          phone?: string | null
          postcode?: string | null
          registration_number?: string | null
          report_footer_text?: string | null
          report_logo_url?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_sort_code?: string | null
          city?: string | null
          company_logo_url?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          default_engineer_signature?: string | null
          default_payment_terms?: number | null
          email?: string | null
          id?: string
          phone?: string | null
          postcode?: string | null
          registration_number?: string | null
          report_footer_text?: string | null
          report_logo_url?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: []
      }
      compliance_audit_trail: {
        Row: {
          actor: string | null
          actor_ip: string | null
          customer_id: string | null
          description: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          metadata: Json | null
          occurred_at: string
          site_id: string | null
        }
        Insert: {
          actor?: string | null
          actor_ip?: string | null
          customer_id?: string | null
          description: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          site_id?: string | null
        }
        Update: {
          actor?: string | null
          actor_ip?: string | null
          customer_id?: string | null
          description?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          site_id?: string | null
        }
        Relationships: []
      }
      contract_assets: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          item_name: string
          item_type: string | null
          location: string | null
          loops_count: number | null
          manufacturer: string | null
          model: string | null
          notes: string | null
          serial_number: string | null
          updated_at: string
          zones_count: number | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          item_name: string
          item_type?: string | null
          location?: string | null
          loops_count?: number | null
          manufacturer?: string | null
          model?: string | null
          notes?: string | null
          serial_number?: string | null
          updated_at?: string
          zones_count?: number | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          item_name?: string
          item_type?: string | null
          location?: string | null
          loops_count?: number | null
          manufacturer?: string | null
          model?: string | null
          notes?: string | null
          serial_number?: string | null
          updated_at?: string
          zones_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_assets_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "site_service_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_checks: {
        Row: {
          accounts_last_made_up: string | null
          accounts_next_due: string | null
          accounts_overdue: boolean | null
          checked_at: string
          checked_by: string
          company_name: string | null
          company_number: string
          company_status: string | null
          company_type: string | null
          confirmation_statement_next_due: string | null
          confirmation_statement_overdue: boolean | null
          created_at: string
          customer_id: string
          date_of_creation: string | null
          filing_history: Json | null
          has_charges: boolean | null
          has_insolvency_history: boolean | null
          id: string
          officers: Json | null
          raw_data: Json | null
          registered_address: Json | null
          risk_factors: Json | null
          risk_level: string | null
          sic_codes: string[] | null
          updated_at: string
        }
        Insert: {
          accounts_last_made_up?: string | null
          accounts_next_due?: string | null
          accounts_overdue?: boolean | null
          checked_at?: string
          checked_by: string
          company_name?: string | null
          company_number: string
          company_status?: string | null
          company_type?: string | null
          confirmation_statement_next_due?: string | null
          confirmation_statement_overdue?: boolean | null
          created_at?: string
          customer_id: string
          date_of_creation?: string | null
          filing_history?: Json | null
          has_charges?: boolean | null
          has_insolvency_history?: boolean | null
          id?: string
          officers?: Json | null
          raw_data?: Json | null
          registered_address?: Json | null
          risk_factors?: Json | null
          risk_level?: string | null
          sic_codes?: string[] | null
          updated_at?: string
        }
        Update: {
          accounts_last_made_up?: string | null
          accounts_next_due?: string | null
          accounts_overdue?: boolean | null
          checked_at?: string
          checked_by?: string
          company_name?: string | null
          company_number?: string
          company_status?: string | null
          company_type?: string | null
          confirmation_statement_next_due?: string | null
          confirmation_statement_overdue?: boolean | null
          created_at?: string
          customer_id?: string
          date_of_creation?: string | null
          filing_history?: Json | null
          has_charges?: boolean | null
          has_insolvency_history?: boolean | null
          id?: string
          officers?: Json | null
          raw_data?: Json | null
          registered_address?: Json | null
          risk_factors?: Json | null
          risk_level?: string | null
          sic_codes?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_checks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_control_exclusions: {
        Row: {
          created_at: string
          customer_id: string | null
          excluded_by: string
          excluded_until: string | null
          id: string
          is_permanent: boolean | null
          reason: string | null
          updated_at: string
          xero_invoice_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          excluded_by: string
          excluded_until?: string | null
          id?: string
          is_permanent?: boolean | null
          reason?: string | null
          updated_at?: string
          xero_invoice_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          excluded_by?: string
          excluded_until?: string | null
          id?: string
          is_permanent?: boolean | null
          reason?: string | null
          updated_at?: string
          xero_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_control_exclusions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_control_reminders: {
        Row: {
          amount_due: number | null
          channel: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          customer_id: string | null
          days_overdue: number | null
          error_message: string | null
          external_id: string | null
          id: string
          response_notes: string | null
          response_received_at: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          step_id: string | null
          updated_at: string
          xero_invoice_id: string
          xero_invoice_number: string | null
        }
        Insert: {
          amount_due?: number | null
          channel: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_id?: string | null
          days_overdue?: number | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          response_notes?: string | null
          response_received_at?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          step_id?: string | null
          updated_at?: string
          xero_invoice_id: string
          xero_invoice_number?: string | null
        }
        Update: {
          amount_due?: number | null
          channel?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_id?: string | null
          days_overdue?: number | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          response_notes?: string | null
          response_received_at?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          step_id?: string | null
          updated_at?: string
          xero_invoice_id?: string
          xero_invoice_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_control_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_control_reminders_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "credit_control_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_control_schedules: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_control_steps: {
        Row: {
          channel: string
          created_at: string
          days_overdue: number
          id: string
          is_active: boolean | null
          message_template: string
          schedule_id: string
          sort_order: number
          subject_template: string | null
          template_type: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          days_overdue: number
          id?: string
          is_active?: boolean | null
          message_template: string
          schedule_id: string
          sort_order?: number
          subject_template?: string | null
          template_type: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          days_overdue?: number
          id?: string
          is_active?: boolean | null
          message_template?: string
          schedule_id?: string
          sort_order?: number
          subject_template?: string | null
          template_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_control_steps_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "credit_control_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_email_drafts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          form_label: string | null
          id: string
          recipient_email: string | null
          sent_at: string | null
          site_id: string | null
          status: string
          subject: string | null
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          form_label?: string | null
          id?: string
          recipient_email?: string | null
          sent_at?: string | null
          site_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          form_label?: string | null
          id?: string
          recipient_email?: string | null
          sent_at?: string | null
          site_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_email_drafts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_email_drafts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_email_drafts_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_form_submissions: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          form_data: Json
          id: string
          signatures: Json
          site_id: string | null
          status: string
          template_id: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          form_data?: Json
          id?: string
          signatures?: Json
          site_id?: string | null
          status?: string
          template_id: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          form_data?: Json
          id?: string
          signatures?: Json
          site_id?: string | null
          status?: string
          template_id?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_form_submissions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_form_submissions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_form_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "customer_form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_form_submissions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_form_templates: {
        Row: {
          created_at: string
          created_by: string
          customer_id: string | null
          description: string | null
          field_schema: Json
          form_code: string
          id: string
          is_active: boolean | null
          name: string
          page_count: number | null
          template_pdf_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_id?: string | null
          description?: string | null
          field_schema?: Json
          form_code: string
          id?: string
          is_active?: boolean | null
          name: string
          page_count?: number | null
          template_pdf_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_id?: string | null
          description?: string | null
          field_schema?: Json
          form_code?: string
          id?: string
          is_active?: boolean | null
          name?: string
          page_count?: number | null
          template_pdf_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_form_templates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_intelligence_reports: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string | null
          generated_at: string
          generated_by: string
          id: string
          is_active: boolean
          report_data: Json
          share_token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at?: string | null
          generated_at?: string
          generated_by: string
          id?: string
          is_active?: boolean
          report_data?: Json
          share_token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          generated_at?: string
          generated_by?: string
          id?: string
          is_active?: boolean
          report_data?: Json
          share_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_intelligence_reports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_rams_requirements: {
        Row: {
          created_at: string
          created_by: string
          customer_id: string
          description: string | null
          id: string
          is_mandatory: boolean | null
          requirement_type: string
          site_id: string | null
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_id: string
          description?: string | null
          id?: string
          is_mandatory?: boolean | null
          requirement_type: string
          site_id?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_id?: string
          description?: string | null
          id?: string
          is_mandatory?: boolean | null
          requirement_type?: string
          site_id?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_rams_requirements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_rams_requirements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          client_signature: string | null
          company_number: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          email_recipients: string | null
          id: string
          invoice_email_recipients: string | null
          name: string
          notes: string | null
          postcode: string | null
          quote_email_recipients: string | null
          report_email_recipients: string | null
          sharepoint_folder: string | null
          sharepoint_url: string | null
          status: string | null
          updated_at: string
          xero_contact_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_signature?: string | null
          company_number?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          email_recipients?: string | null
          id?: string
          invoice_email_recipients?: string | null
          name: string
          notes?: string | null
          postcode?: string | null
          quote_email_recipients?: string | null
          report_email_recipients?: string | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          status?: string | null
          updated_at?: string
          xero_contact_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          client_signature?: string | null
          company_number?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          email_recipients?: string | null
          id?: string
          invoice_email_recipients?: string | null
          name?: string
          notes?: string | null
          postcode?: string | null
          quote_email_recipients?: string | null
          report_email_recipients?: string | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          status?: string | null
          updated_at?: string
          xero_contact_id?: string | null
        }
        Relationships: []
      }
      data_access_requests: {
        Row: {
          created_at: string
          export_url: string | null
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          request_type: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          export_url?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          request_type?: string
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          export_url?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          request_type?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_retention_policies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_purge_at: string | null
          retention_days: number
          table_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_purge_at?: string | null
          retention_days?: number
          table_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_purge_at?: string | null
          retention_days?: number
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      declination_of_works: {
        Row: {
          bho_representative: string | null
          bho_signature: string | null
          created_at: string
          customer_id: string | null
          defect_id: string | null
          defect_notice_id: string | null
          id: string
          premises_address: string | null
          premises_name: string
          recommended_works: string
          responsible_person_name: string
          responsible_person_role: string | null
          risk_accepted_statement: string | null
          risk_statement: string
          signature: string | null
          signed_by: string
          signed_date: string
          signed_ip: string | null
          site_id: string | null
          standard_reference: string | null
          witnessed_by: string | null
        }
        Insert: {
          bho_representative?: string | null
          bho_signature?: string | null
          created_at?: string
          customer_id?: string | null
          defect_id?: string | null
          defect_notice_id?: string | null
          id?: string
          premises_address?: string | null
          premises_name: string
          recommended_works: string
          responsible_person_name: string
          responsible_person_role?: string | null
          risk_accepted_statement?: string | null
          risk_statement: string
          signature?: string | null
          signed_by: string
          signed_date: string
          signed_ip?: string | null
          site_id?: string | null
          standard_reference?: string | null
          witnessed_by?: string | null
        }
        Update: {
          bho_representative?: string | null
          bho_signature?: string | null
          created_at?: string
          customer_id?: string | null
          defect_id?: string | null
          defect_notice_id?: string | null
          id?: string
          premises_address?: string | null
          premises_name?: string
          recommended_works?: string
          responsible_person_name?: string
          responsible_person_role?: string | null
          risk_accepted_statement?: string | null
          risk_statement?: string
          signature?: string | null
          signed_by?: string
          signed_date?: string
          signed_ip?: string | null
          site_id?: string | null
          standard_reference?: string | null
          witnessed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "declination_of_works_defect_notice_id_fkey"
            columns: ["defect_notice_id"]
            isOneToOne: false
            referencedRelation: "defect_notices"
            referencedColumns: ["id"]
          },
        ]
      }
      default_service_types: {
        Row: {
          created_at: string
          default_price: number | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_price?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_price?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      defect_notices: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledgement_method: string | null
          acknowledgement_status: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          defect_category: string
          defect_description: string
          defect_id: string | null
          escalation_level: string
          id: string
          next_escalation_at: string | null
          recommended_action: string | null
          responsible_person_email: string | null
          responsible_person_name: string
          responsible_person_phone: string | null
          risk_description: string | null
          sent_at: string
          site_id: string | null
          standard_reference: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgement_method?: string | null
          acknowledgement_status?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          defect_category: string
          defect_description: string
          defect_id?: string | null
          escalation_level?: string
          id?: string
          next_escalation_at?: string | null
          recommended_action?: string | null
          responsible_person_email?: string | null
          responsible_person_name: string
          responsible_person_phone?: string | null
          risk_description?: string | null
          sent_at?: string
          site_id?: string | null
          standard_reference?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgement_method?: string | null
          acknowledgement_status?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          defect_category?: string
          defect_description?: string
          defect_id?: string | null
          escalation_level?: string
          id?: string
          next_escalation_at?: string | null
          recommended_action?: string | null
          responsible_person_email?: string | null
          responsible_person_name?: string
          responsible_person_phone?: string | null
          risk_description?: string | null
          sent_at?: string
          site_id?: string | null
          standard_reference?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      device_price_items: {
        Row: {
          ai_price_results: Json | null
          ai_search_status: string | null
          cost_price: number | null
          created_at: string
          description: string
          device_type: string | null
          id: string
          labour_cost: number | null
          location: string | null
          markup_percent: number | null
          merged_from: string[] | null
          model_number: string | null
          price_list_id: string
          quantity: number
          sell_price: number | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          ai_price_results?: Json | null
          ai_search_status?: string | null
          cost_price?: number | null
          created_at?: string
          description: string
          device_type?: string | null
          id?: string
          labour_cost?: number | null
          location?: string | null
          markup_percent?: number | null
          merged_from?: string[] | null
          model_number?: string | null
          price_list_id: string
          quantity?: number
          sell_price?: number | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          ai_price_results?: Json | null
          ai_search_status?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string
          device_type?: string | null
          id?: string
          labour_cost?: number | null
          location?: string | null
          markup_percent?: number | null
          merged_from?: string[] | null
          model_number?: string | null
          price_list_id?: string
          quantity?: number
          sell_price?: number | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_price_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "device_price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      device_price_lists: {
        Row: {
          created_at: string
          created_by: string
          customer_id: string | null
          id: string
          name: string
          site_id: string | null
          source_file_name: string | null
          source_file_type: string | null
          status: string
          total_cost: number | null
          total_items: number | null
          total_sell: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_id?: string | null
          id?: string
          name: string
          site_id?: string | null
          source_file_name?: string | null
          source_file_type?: string | null
          status?: string
          total_cost?: number | null
          total_items?: number | null
          total_sell?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_id?: string | null
          id?: string
          name?: string
          site_id?: string | null
          source_file_name?: string | null
          source_file_type?: string | null
          status?: string
          total_cost?: number | null
          total_items?: number | null
          total_sell?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_price_lists_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_price_lists_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          address: string
          created_at: string
          device_type: string
          id: string
          imported_source_columns: string[] | null
          installed_at: string | null
          last_tested_at: string | null
          location: string | null
          loop: string
          raw_import_data: Json | null
          site_id: string
          status: string | null
          updated_at: string
          zone: string | null
        }
        Insert: {
          address: string
          created_at?: string
          device_type: string
          id?: string
          imported_source_columns?: string[] | null
          installed_at?: string | null
          last_tested_at?: string | null
          location?: string | null
          loop: string
          raw_import_data?: Json | null
          site_id: string
          status?: string | null
          updated_at?: string
          zone?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          device_type?: string
          id?: string
          imported_source_columns?: string[] | null
          installed_at?: string | null
          last_tested_at?: string | null
          location?: string | null
          loop?: string
          raw_import_data?: Json | null
          site_id?: string
          status?: string | null
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      email_action_items: {
        Row: {
          actioned_entity_id: string | null
          actioned_entity_type: string | null
          created_at: string
          created_by: string | null
          id: string
          intent_type: string
          notes: string | null
          priority: string
          snooze_until: string | null
          source_email_id: string | null
          source_from: string | null
          source_preview: string | null
          source_received_at: string | null
          source_subject: string | null
          status: string
          suggested_date: string | null
          suggested_payload: Json
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          actioned_entity_id?: string | null
          actioned_entity_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intent_type: string
          notes?: string | null
          priority?: string
          snooze_until?: string | null
          source_email_id?: string | null
          source_from?: string | null
          source_preview?: string | null
          source_received_at?: string | null
          source_subject?: string | null
          status?: string
          suggested_date?: string | null
          suggested_payload?: Json
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          actioned_entity_id?: string | null
          actioned_entity_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intent_type?: string
          notes?: string | null
          priority?: string
          snooze_until?: string | null
          source_email_id?: string | null
          source_from?: string | null
          source_preview?: string | null
          source_received_at?: string | null
          source_subject?: string | null
          status?: string
          suggested_date?: string | null
          suggested_payload?: Json
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivered_at: string | null
          email_type: string
          error_message: string | null
          id: string
          opened_at: string | null
          recipients: string[]
          report_id: string | null
          resend_id: string | null
          sent_at: string
          site_id: string | null
          status: string
          subject: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipients: string[]
          report_id?: string | null
          resend_id?: string | null
          sent_at?: string
          site_id?: string | null
          status?: string
          subject: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipients?: string[]
          report_id?: string | null
          resend_id?: string | null
          sent_at?: string
          site_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "service_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_template: string
          created_at: string
          created_by: string
          greeting_template: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          signoff_template: string
          subject_template: string
          template_type: string
          updated_at: string
        }
        Insert: {
          body_template: string
          created_at?: string
          created_by: string
          greeting_template?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          signoff_template?: string
          subject_template: string
          template_type?: string
          updated_at?: string
        }
        Update: {
          body_template?: string
          created_at?: string
          created_by?: string
          greeting_template?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          signoff_template?: string
          subject_template?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      file_uploads: {
        Row: {
          created_at: string
          defect_id: string | null
          devices_failed: number | null
          devices_found: number | null
          devices_passed: number | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          parsed_at: string | null
          parsing_errors: Json | null
          site_id: string | null
          storage_path: string | null
          uploaded_by: string | null
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          defect_id?: string | null
          devices_failed?: number | null
          devices_found?: number | null
          devices_passed?: number | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          parsed_at?: string | null
          parsing_errors?: Json | null
          site_id?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          defect_id?: string | null
          devices_failed?: number | null
          devices_found?: number | null
          devices_passed?: number | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          parsed_at?: string | null
          parsing_errors?: Json | null
          site_id?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_uploads_defect_id_fkey"
            columns: ["defect_id"]
            isOneToOne: false
            referencedRelation: "site_defects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_uploads_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_uploads_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_consent_records: {
        Row: {
          consent_type: string
          consented: boolean
          consented_at: string | null
          created_at: string
          id: string
          ip_address: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          consent_type: string
          consented?: boolean
          consented_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          consent_type?: string
          consented?: boolean
          consented_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      issues: {
        Row: {
          created_at: string
          description: string | null
          device_id: string | null
          id: string
          issue_type: string
          resolution: string | null
          resolved_at: string | null
          severity: string | null
          site_id: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          device_id?: string | null
          id?: string
          issue_type: string
          resolution?: string | null
          resolved_at?: string | null
          severity?: string | null
          site_id: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          device_id?: string | null
          id?: string
          issue_type?: string
          resolution?: string | null
          resolved_at?: string | null
          severity?: string | null
          site_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issues_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      materials_catalog: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          part_number: string
          retail_price: number | null
          source: string | null
          supplier_name: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          part_number: string
          retail_price?: number | null
          source?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          part_number?: string
          retail_price?: number | null
          source?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      microsoft_tokens: {
        Row: {
          access_token: string
          connected_at: string
          connected_by: string
          expires_at: string
          id: string
          refresh_token: string
          scope: string | null
          token_type: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          connected_by: string
          expires_at: string
          id?: string
          refresh_token: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          connected_by?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          channel: string
          error_message: string | null
          external_id: string | null
          id: string
          message_body: string | null
          notice_id: string | null
          recipient: string
          sent_at: string
          status: string | null
        }
        Insert: {
          channel: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          message_body?: string | null
          notice_id?: string | null
          recipient: string
          sent_at?: string
          status?: string | null
        }
        Update: {
          channel?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          message_body?: string | null
          notice_id?: string | null
          recipient?: string
          sent_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "defect_notices"
            referencedColumns: ["id"]
          },
        ]
      }
      outlook_calendar_sync: {
        Row: {
          appointment_id: string
          created_at: string
          engineer_id: string
          id: string
          last_synced_at: string
          outlook_event_id: string
          sync_direction: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          engineer_id: string
          id?: string
          last_synced_at?: string
          outlook_event_id: string
          sync_direction?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          engineer_id?: string
          id?: string
          last_synced_at?: string
          outlook_event_id?: string
          sync_direction?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlook_calendar_sync_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      parsed_device_tests: {
        Row: {
          address: string
          created_at: string
          device_id: string | null
          device_type: string | null
          engineer_id: string | null
          fail_reason: string | null
          id: string
          location: string | null
          loop: string
          matched: boolean | null
          notes: string | null
          photo_url: string | null
          raw_data: Json | null
          source: string | null
          status: string
          tested_at: string | null
          upload_id: string
          visit_id: string | null
        }
        Insert: {
          address: string
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          engineer_id?: string | null
          fail_reason?: string | null
          id?: string
          location?: string | null
          loop: string
          matched?: boolean | null
          notes?: string | null
          photo_url?: string | null
          raw_data?: Json | null
          source?: string | null
          status: string
          tested_at?: string | null
          upload_id: string
          visit_id?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          engineer_id?: string | null
          fail_reason?: string | null
          id?: string
          location?: string | null
          loop?: string
          matched?: boolean | null
          notes?: string | null
          photo_url?: string | null
          raw_data?: Json | null
          source?: string | null
          status?: string
          tested_at?: string | null
          upload_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parsed_device_tests_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parsed_device_tests_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parsed_device_tests_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "file_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parsed_device_tests_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_history: {
        Row: {
          created_at: string
          customer_id: string | null
          days_overdue: number | null
          days_to_pay: number | null
          due_date: string | null
          id: string
          invoice_amount: number
          invoice_date: string | null
          payment_amount: number
          payment_date: string | null
          was_overdue: boolean | null
          xero_contact_id: string | null
          xero_invoice_id: string
          xero_invoice_number: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          days_overdue?: number | null
          days_to_pay?: number | null
          due_date?: string | null
          id?: string
          invoice_amount: number
          invoice_date?: string | null
          payment_amount: number
          payment_date?: string | null
          was_overdue?: boolean | null
          xero_contact_id?: string | null
          xero_invoice_id: string
          xero_invoice_number?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          days_overdue?: number | null
          days_to_pay?: number | null
          due_date?: string | null
          id?: string
          invoice_amount?: number
          invoice_date?: string | null
          payment_amount?: number
          payment_date?: string | null
          was_overdue?: boolean | null
          xero_contact_id?: string | null
          xero_invoice_id?: string
          xero_invoice_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_access: {
        Row: {
          access_token: string | null
          created_at: string
          customer_id: string
          email: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          login_count: number | null
          name: string
          role: string | null
          site_id: string | null
          token_expires_at: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          customer_id: string
          email: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          login_count?: number | null
          name: string
          role?: string | null
          site_id?: string | null
          token_expires_at?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string
          customer_id?: string
          email?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          login_count?: number | null
          name?: string
          role?: string | null
          site_id?: string | null
          token_expires_at?: string | null
        }
        Relationships: []
      }
      price_list_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_active: boolean | null
          keywords: string[] | null
          labour_cost: number | null
          manufacturer: string | null
          markup_pct: number | null
          model: string | null
          notes: string | null
          part_number: string | null
          short_name: string | null
          unit_cost: number | null
          updated_at: string
          upload_batch: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          labour_cost?: number | null
          manufacturer?: string | null
          markup_pct?: number | null
          model?: string | null
          notes?: string | null
          part_number?: string | null
          short_name?: string | null
          unit_cost?: number | null
          updated_at?: string
          upload_batch?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          labour_cost?: number | null
          manufacturer?: string | null
          markup_pct?: number | null
          model?: string | null
          notes?: string | null
          part_number?: string | null
          short_name?: string | null
          unit_cost?: number | null
          updated_at?: string
          upload_batch?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          engineer_signature: string | null
          full_name: string | null
          id: string
          microsoft_email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          engineer_signature?: string | null
          full_name?: string | null
          id?: string
          microsoft_email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          engineer_signature?: string | null
          full_name?: string | null
          id?: string
          microsoft_email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_order_line_items: {
        Row: {
          account_code: string | null
          created_at: string
          description: string
          id: string
          purchase_order_id: string
          quantity: number
          sort_order: number | null
          total_price: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          account_code?: string | null
          created_at?: string
          description: string
          id?: string
          purchase_order_id: string
          quantity?: number
          sort_order?: number | null
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          account_code?: string | null
          created_at?: string
          description?: string
          id?: string
          purchase_order_id?: string
          quantity?: number
          sort_order?: number | null
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_line_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string
          delivery_address: string | null
          expected_delivery_date: string | null
          id: string
          notes: string | null
          order_date: string
          po_number: string
          reference: string | null
          status: string
          subtotal: number | null
          supplier_id: string
          synced_at: string | null
          total_amount: number | null
          updated_at: string
          vat_amount: number | null
          vat_rate: number | null
          xero_purchase_order_id: string | null
          xero_status: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          delivery_address?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number: string
          reference?: string | null
          status?: string
          subtotal?: number | null
          supplier_id: string
          synced_at?: string | null
          total_amount?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
          xero_purchase_order_id?: string | null
          xero_status?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          delivery_address?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number?: string
          reference?: string | null
          status?: string
          subtotal?: number | null
          supplier_id?: string
          synced_at?: string | null
          total_amount?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
          xero_purchase_order_id?: string | null
          xero_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_attachments: {
        Row: {
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      qms_audit_templates: {
        Row: {
          checklist: Json
          created_at: string
          created_by: string
          description: string | null
          id: string
          iso_clauses: string[] | null
          name: string
          updated_at: string
        }
        Insert: {
          checklist?: Json
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          iso_clauses?: string[] | null
          name: string
          updated_at?: string
        }
        Update: {
          checklist?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          iso_clauses?: string[] | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      qms_audits: {
        Row: {
          audit_number: string
          audit_type: string
          auditee_department: string | null
          completed_date: string | null
          created_at: string
          created_by: string
          findings: Json | null
          id: string
          lead_auditor_id: string | null
          scheduled_date: string
          scope: string | null
          status: string
          summary: string | null
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audit_number: string
          audit_type: string
          auditee_department?: string | null
          completed_date?: string | null
          created_at?: string
          created_by: string
          findings?: Json | null
          id?: string
          lead_auditor_id?: string | null
          scheduled_date: string
          scope?: string | null
          status?: string
          summary?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audit_number?: string
          audit_type?: string
          auditee_department?: string | null
          completed_date?: string | null
          created_at?: string
          created_by?: string
          findings?: Json | null
          id?: string
          lead_auditor_id?: string | null
          scheduled_date?: string
          scope?: string | null
          status?: string
          summary?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qms_audits_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "qms_audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_capas: {
        Row: {
          action_plan: string | null
          assigned_to: string | null
          capa_number: string
          completed_at: string | null
          created_at: string
          created_by: string
          description: string
          due_date: string | null
          effectiveness_review: string | null
          id: string
          ncr_id: string | null
          priority: string
          status: string
          title: string
          type: string
          updated_at: string
          verification_required: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          action_plan?: string | null
          assigned_to?: string | null
          capa_number: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          description: string
          due_date?: string | null
          effectiveness_review?: string | null
          id?: string
          ncr_id?: string | null
          priority?: string
          status?: string
          title: string
          type: string
          updated_at?: string
          verification_required?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          action_plan?: string | null
          assigned_to?: string | null
          capa_number?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string
          due_date?: string | null
          effectiveness_review?: string | null
          id?: string
          ncr_id?: string | null
          priority?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          verification_required?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qms_capas_ncr_id_fkey"
            columns: ["ncr_id"]
            isOneToOne: false
            referencedRelation: "qms_ncrs"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_document_acknowledgements: {
        Row: {
          acknowledged_at: string
          document_version_id: string
          id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          document_version_id: string
          id?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          document_version_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qms_document_acknowledgements_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "qms_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_document_approvals: {
        Row: {
          approved_at: string | null
          approver_id: string
          comments: string | null
          created_at: string
          document_version_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approver_id: string
          comments?: string | null
          created_at?: string
          document_version_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approver_id?: string
          comments?: string | null
          created_at?: string
          document_version_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qms_document_approvals_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "qms_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_document_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      qms_document_versions: {
        Row: {
          changes_summary: string | null
          created_at: string
          created_by: string
          document_id: string
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          version_number: number
        }
        Insert: {
          changes_summary?: string | null
          created_at?: string
          created_by: string
          document_id: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          version_number: number
        }
        Update: {
          changes_summary?: string | null
          created_at?: string
          created_by?: string
          document_id?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "qms_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "qms_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_documents: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string
          current_version: number | null
          description: string | null
          document_number: string
          id: string
          next_review_date: string | null
          review_frequency_months: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by: string
          current_version?: number | null
          description?: string | null
          document_number: string
          id?: string
          next_review_date?: string | null
          review_frequency_months?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string
          current_version?: number | null
          description?: string | null
          document_number?: string
          id?: string
          next_review_date?: string | null
          review_frequency_months?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qms_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "qms_document_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_feedback: {
        Row: {
          assigned_to: string | null
          channel: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          description: string
          feedback_number: string
          id: string
          ncr_id: string | null
          priority: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          satisfaction_rating: number | null
          site_id: string | null
          status: string
          subject: string
          type: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          channel?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          description: string
          feedback_number: string
          id?: string
          ncr_id?: string | null
          priority?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          satisfaction_rating?: number | null
          site_id?: string | null
          status?: string
          subject: string
          type: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          description?: string
          feedback_number?: string
          id?: string
          ncr_id?: string | null
          priority?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          satisfaction_rating?: number | null
          site_id?: string | null
          status?: string
          subject?: string
          type?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qms_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qms_feedback_ncr_id_fkey"
            columns: ["ncr_id"]
            isOneToOne: false
            referencedRelation: "qms_ncrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qms_feedback_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qms_feedback_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_management_reviews: {
        Row: {
          action_items: Json | null
          agenda: Json | null
          attendees: string[] | null
          created_at: string
          created_by: string
          decisions: Json | null
          id: string
          kpi_data: Json | null
          minutes: string | null
          next_review_date: string | null
          review_date: string
          review_number: string
          status: string
          updated_at: string
        }
        Insert: {
          action_items?: Json | null
          agenda?: Json | null
          attendees?: string[] | null
          created_at?: string
          created_by: string
          decisions?: Json | null
          id?: string
          kpi_data?: Json | null
          minutes?: string | null
          next_review_date?: string | null
          review_date: string
          review_number: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_items?: Json | null
          agenda?: Json | null
          attendees?: string[] | null
          created_at?: string
          created_by?: string
          decisions?: Json | null
          id?: string
          kpi_data?: Json | null
          minutes?: string | null
          next_review_date?: string | null
          review_date?: string
          review_number?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      qms_ncrs: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          customer_id: string | null
          description: string
          due_date: string | null
          id: string
          immediate_action: string | null
          ncr_number: string
          raised_by: string
          root_cause: string | null
          severity: string
          site_id: string | null
          source: string
          status: string
          title: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          customer_id?: string | null
          description: string
          due_date?: string | null
          id?: string
          immediate_action?: string | null
          ncr_number: string
          raised_by: string
          root_cause?: string | null
          severity?: string
          site_id?: string | null
          source: string
          status?: string
          title: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string
          due_date?: string | null
          id?: string
          immediate_action?: string | null
          ncr_number?: string
          raised_by?: string
          root_cause?: string | null
          severity?: string
          site_id?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qms_ncrs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qms_ncrs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qms_ncrs_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_risks: {
        Row: {
          additional_controls: string | null
          category: string
          created_at: string
          created_by: string
          current_controls: string | null
          description: string
          id: string
          impact: number
          likelihood: number
          owner_id: string | null
          residual_impact: number | null
          residual_likelihood: number | null
          residual_score: number | null
          review_date: string | null
          risk_number: string
          risk_score: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          additional_controls?: string | null
          category: string
          created_at?: string
          created_by: string
          current_controls?: string | null
          description: string
          id?: string
          impact: number
          likelihood: number
          owner_id?: string | null
          residual_impact?: number | null
          residual_likelihood?: number | null
          residual_score?: number | null
          review_date?: string | null
          risk_number: string
          risk_score?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          additional_controls?: string | null
          category?: string
          created_at?: string
          created_by?: string
          current_controls?: string | null
          description?: string
          id?: string
          impact?: number
          likelihood?: number
          owner_id?: string | null
          residual_impact?: number | null
          residual_likelihood?: number | null
          residual_score?: number | null
          review_date?: string | null
          risk_number?: string
          risk_score?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      qms_supplier_evaluations: {
        Row: {
          created_at: string
          created_by: string
          delivery_score: number | null
          evaluation_date: string
          evaluation_period_end: string
          evaluation_period_start: string
          id: string
          late_deliveries: number | null
          ncrs_raised: number | null
          notes: string | null
          on_time_deliveries: number | null
          overall_score: number | null
          quality_score: number | null
          rating: string
          responsiveness_score: number | null
          source: string
          supplier_id: string
          total_orders: number | null
          total_spend: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          delivery_score?: number | null
          evaluation_date?: string
          evaluation_period_end: string
          evaluation_period_start: string
          id?: string
          late_deliveries?: number | null
          ncrs_raised?: number | null
          notes?: string | null
          on_time_deliveries?: number | null
          overall_score?: number | null
          quality_score?: number | null
          rating?: string
          responsiveness_score?: number | null
          source?: string
          supplier_id: string
          total_orders?: number | null
          total_spend?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          delivery_score?: number | null
          evaluation_date?: string
          evaluation_period_end?: string
          evaluation_period_start?: string
          id?: string
          late_deliveries?: number | null
          ncrs_raised?: number | null
          notes?: string | null
          on_time_deliveries?: number | null
          overall_score?: number | null
          quality_score?: number | null
          rating?: string
          responsiveness_score?: number | null
          source?: string
          supplier_id?: string
          total_orders?: number | null
          total_spend?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qms_supplier_evaluations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_training_records: {
        Row: {
          certificate_number: string | null
          certificate_url: string | null
          completion_date: string
          created_at: string
          created_by: string
          expiry_date: string | null
          id: string
          notes: string | null
          status: string
          trainer: string | null
          training_type_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          certificate_number?: string | null
          certificate_url?: string | null
          completion_date: string
          created_at?: string
          created_by: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          trainer?: string | null
          training_type_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          certificate_number?: string | null
          certificate_url?: string | null
          completion_date?: string
          created_at?: string
          created_by?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          trainer?: string | null
          training_type_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qms_training_records_training_type_id_fkey"
            columns: ["training_type_id"]
            isOneToOne: false
            referencedRelation: "qms_training_types"
            referencedColumns: ["id"]
          },
        ]
      }
      qms_training_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_mandatory: boolean | null
          name: string
          sort_order: number | null
          updated_at: string
          validity_months: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_mandatory?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string
          validity_months?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_mandatory?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string
          validity_months?: number | null
        }
        Relationships: []
      }
      quotation_line_items: {
        Row: {
          cost_price: number | null
          created_at: string
          description: string
          id: string
          is_section: boolean
          item_name: string | null
          labour_cost: number | null
          labour_included: boolean | null
          markup_percent: number | null
          merged_from: Json | null
          notes: string | null
          parent_id: string | null
          priority: string | null
          quantity: number | null
          quotation_id: string
          regulation_reference: string | null
          sort_order: number | null
          source_section: string | null
          source_type: string | null
          title: string | null
          total_price: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          cost_price?: number | null
          created_at?: string
          description: string
          id?: string
          is_section?: boolean
          item_name?: string | null
          labour_cost?: number | null
          labour_included?: boolean | null
          markup_percent?: number | null
          merged_from?: Json | null
          notes?: string | null
          parent_id?: string | null
          priority?: string | null
          quantity?: number | null
          quotation_id: string
          regulation_reference?: string | null
          sort_order?: number | null
          source_section?: string | null
          source_type?: string | null
          title?: string | null
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          cost_price?: number | null
          created_at?: string
          description?: string
          id?: string
          is_section?: boolean
          item_name?: string | null
          labour_cost?: number | null
          labour_included?: boolean | null
          markup_percent?: number | null
          merged_from?: Json | null
          notes?: string | null
          parent_id?: string | null
          priority?: string | null
          quantity?: number | null
          quotation_id?: string
          regulation_reference?: string | null
          sort_order?: number | null
          source_section?: string | null
          source_type?: string | null
          title?: string | null
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_line_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "quotation_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_line_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          acceptance_token: string | null
          accepted_by_name: string | null
          assumptions: Json | null
          bs5839_category: string | null
          building_type: string | null
          client_acceptance_signature: string | null
          client_accepted_at: string | null
          client_po_number: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          device_count: number | null
          device_counts_detail: Json | null
          exclusions: Json | null
          existing_system_description: string | null
          generated_files: Json | null
          gia_sqm: number | null
          id: string
          introduction: string | null
          job_category: string | null
          latest_docx_path: string | null
          latest_pdf_path: string | null
          locked_at: string | null
          locked_by: string | null
          loop_count: number | null
          notes: string | null
          occupancy_type: string | null
          po_number: string | null
          quotation_number: string
          region: string | null
          report_id: string | null
          scope: Json | null
          sharepoint_folder: string | null
          sharepoint_url: string | null
          show_section_subtotals: boolean
          site_id: string
          site_visit_date: string | null
          status: string
          storeys: number | null
          summary: string | null
          system_features: Json | null
          system_manufacturer: string | null
          system_panel: string | null
          system_type: string | null
          terms: string | null
          title: string | null
          total_amount: number | null
          updated_at: string
          valid_until: string | null
          vat_rate: number | null
          visit_id: string | null
          works_type: string | null
        }
        Insert: {
          acceptance_token?: string | null
          accepted_by_name?: string | null
          assumptions?: Json | null
          bs5839_category?: string | null
          building_type?: string | null
          client_acceptance_signature?: string | null
          client_accepted_at?: string | null
          client_po_number?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          device_count?: number | null
          device_counts_detail?: Json | null
          exclusions?: Json | null
          existing_system_description?: string | null
          generated_files?: Json | null
          gia_sqm?: number | null
          id?: string
          introduction?: string | null
          job_category?: string | null
          latest_docx_path?: string | null
          latest_pdf_path?: string | null
          locked_at?: string | null
          locked_by?: string | null
          loop_count?: number | null
          notes?: string | null
          occupancy_type?: string | null
          po_number?: string | null
          quotation_number: string
          region?: string | null
          report_id?: string | null
          scope?: Json | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          show_section_subtotals?: boolean
          site_id: string
          site_visit_date?: string | null
          status?: string
          storeys?: number | null
          summary?: string | null
          system_features?: Json | null
          system_manufacturer?: string | null
          system_panel?: string | null
          system_type?: string | null
          terms?: string | null
          title?: string | null
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          vat_rate?: number | null
          visit_id?: string | null
          works_type?: string | null
        }
        Update: {
          acceptance_token?: string | null
          accepted_by_name?: string | null
          assumptions?: Json | null
          bs5839_category?: string | null
          building_type?: string | null
          client_acceptance_signature?: string | null
          client_accepted_at?: string | null
          client_po_number?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          device_count?: number | null
          device_counts_detail?: Json | null
          exclusions?: Json | null
          existing_system_description?: string | null
          generated_files?: Json | null
          gia_sqm?: number | null
          id?: string
          introduction?: string | null
          job_category?: string | null
          latest_docx_path?: string | null
          latest_pdf_path?: string | null
          locked_at?: string | null
          locked_by?: string | null
          loop_count?: number | null
          notes?: string | null
          occupancy_type?: string | null
          po_number?: string | null
          quotation_number?: string
          region?: string | null
          report_id?: string | null
          scope?: Json | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          show_section_subtotals?: boolean
          site_id?: string
          site_visit_date?: string | null
          status?: string
          storeys?: number | null
          summary?: string | null
          system_features?: Json | null
          system_manufacturer?: string | null
          system_panel?: string | null
          system_type?: string | null
          terms?: string | null
          title?: string | null
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          vat_rate?: number | null
          visit_id?: string | null
          works_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "service_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          assumptions: Json | null
          building_type: string | null
          client_company: string | null
          client_contact: string | null
          created_at: string | null
          created_by: string | null
          device_counts: Json | null
          exclusions: Json | null
          existing_system_description: string | null
          generated_files: Json | null
          id: string
          introduction: string | null
          issued_date: string | null
          items: Json | null
          latest_docx_path: string | null
          latest_pdf_path: string | null
          occupancy_type: string | null
          project_title: string
          ref: string
          scope: Json | null
          site_address: string | null
          site_visit_date: string | null
          status: string
          storeys: number | null
          system_category: string | null
          system_features: Json | null
          system_loops: number | null
          system_manufacturer: string | null
          system_panel: string | null
          updated_at: string | null
          valid_until: string | null
          vat_rate: number | null
          works_type: string | null
        }
        Insert: {
          assumptions?: Json | null
          building_type?: string | null
          client_company?: string | null
          client_contact?: string | null
          created_at?: string | null
          created_by?: string | null
          device_counts?: Json | null
          exclusions?: Json | null
          existing_system_description?: string | null
          generated_files?: Json | null
          id?: string
          introduction?: string | null
          issued_date?: string | null
          items?: Json | null
          latest_docx_path?: string | null
          latest_pdf_path?: string | null
          occupancy_type?: string | null
          project_title: string
          ref: string
          scope?: Json | null
          site_address?: string | null
          site_visit_date?: string | null
          status?: string
          storeys?: number | null
          system_category?: string | null
          system_features?: Json | null
          system_loops?: number | null
          system_manufacturer?: string | null
          system_panel?: string | null
          updated_at?: string | null
          valid_until?: string | null
          vat_rate?: number | null
          works_type?: string | null
        }
        Update: {
          assumptions?: Json | null
          building_type?: string | null
          client_company?: string | null
          client_contact?: string | null
          created_at?: string | null
          created_by?: string | null
          device_counts?: Json | null
          exclusions?: Json | null
          existing_system_description?: string | null
          generated_files?: Json | null
          id?: string
          introduction?: string | null
          issued_date?: string | null
          items?: Json | null
          latest_docx_path?: string | null
          latest_pdf_path?: string | null
          occupancy_type?: string | null
          project_title?: string
          ref?: string
          scope?: Json | null
          site_address?: string | null
          site_visit_date?: string | null
          status?: string
          storeys?: number | null
          system_category?: string | null
          system_features?: Json | null
          system_loops?: number | null
          system_manufacturer?: string | null
          system_panel?: string | null
          updated_at?: string | null
          valid_until?: string | null
          vat_rate?: number | null
          works_type?: string | null
        }
        Relationships: []
      }
      rams_acknowledgements: {
        Row: {
          acknowledged_at: string
          engineer_id: string
          id: string
          ip_address: string | null
          notes: string | null
          rams_document_id: string
          signature: string | null
        }
        Insert: {
          acknowledged_at?: string
          engineer_id: string
          id?: string
          ip_address?: string | null
          notes?: string | null
          rams_document_id: string
          signature?: string | null
        }
        Update: {
          acknowledged_at?: string
          engineer_id?: string
          id?: string
          ip_address?: string | null
          notes?: string | null
          rams_document_id?: string
          signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rams_acknowledgements_rams_document_id_fkey"
            columns: ["rams_document_id"]
            isOneToOne: false
            referencedRelation: "rams_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      rams_activity_library: {
        Row: {
          activity_key: string
          activity_name: string
          british_standard: string | null
          category: string
          created_at: string
          default_site_hazards: string | null
          description: string | null
          emergency_procedures: string | null
          hazards: Json
          id: string
          is_active: boolean | null
          method_statements: Json
          ppe_requirements: string[]
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          activity_key: string
          activity_name: string
          british_standard?: string | null
          category: string
          created_at?: string
          default_site_hazards?: string | null
          description?: string | null
          emergency_procedures?: string | null
          hazards?: Json
          id?: string
          is_active?: boolean | null
          method_statements?: Json
          ppe_requirements?: string[]
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          activity_key?: string
          activity_name?: string
          british_standard?: string | null
          category?: string
          created_at?: string
          default_site_hazards?: string | null
          description?: string | null
          emergency_procedures?: string | null
          hazards?: Json
          id?: string
          is_active?: boolean | null
          method_statements?: Json
          ppe_requirements?: string[]
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      rams_documents: {
        Row: {
          acceptance_signature: string | null
          acceptance_token: string | null
          accepted_at: string | null
          accepted_by_name: string | null
          activity_key: string | null
          approved_at: string | null
          approved_by: string | null
          client_name: string | null
          client_signature: string | null
          client_signed_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string
          emergency_procedures: string | null
          hazards: Json
          id: string
          method_statements: Json
          parent_version_id: string | null
          ppe_requirements: string[] | null
          preparer_name: string | null
          preparer_signature: string | null
          preparer_signed_at: string | null
          rams_number: string
          review_date: string | null
          reviewer_name: string | null
          reviewer_signature: string | null
          reviewer_signed_at: string | null
          sent_at: string | null
          sent_by: string | null
          sent_to: string[] | null
          site_access_notes: string | null
          site_id: string | null
          site_specific_hazards: string | null
          status: string
          template_id: string | null
          title: string
          updated_at: string
          version: number
          visit_id: string | null
        }
        Insert: {
          acceptance_signature?: string | null
          acceptance_token?: string | null
          accepted_at?: string | null
          accepted_by_name?: string | null
          activity_key?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_name?: string | null
          client_signature?: string | null
          client_signed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by: string
          emergency_procedures?: string | null
          hazards?: Json
          id?: string
          method_statements?: Json
          parent_version_id?: string | null
          ppe_requirements?: string[] | null
          preparer_name?: string | null
          preparer_signature?: string | null
          preparer_signed_at?: string | null
          rams_number: string
          review_date?: string | null
          reviewer_name?: string | null
          reviewer_signature?: string | null
          reviewer_signed_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_to?: string[] | null
          site_access_notes?: string | null
          site_id?: string | null
          site_specific_hazards?: string | null
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
          version?: number
          visit_id?: string | null
        }
        Update: {
          acceptance_signature?: string | null
          acceptance_token?: string | null
          accepted_at?: string | null
          accepted_by_name?: string | null
          activity_key?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_name?: string | null
          client_signature?: string | null
          client_signed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string
          emergency_procedures?: string | null
          hazards?: Json
          id?: string
          method_statements?: Json
          parent_version_id?: string | null
          ppe_requirements?: string[] | null
          preparer_name?: string | null
          preparer_signature?: string | null
          preparer_signed_at?: string | null
          rams_number?: string
          review_date?: string | null
          reviewer_name?: string | null
          reviewer_signature?: string | null
          reviewer_signed_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_to?: string[] | null
          site_access_notes?: string | null
          site_id?: string | null
          site_specific_hazards?: string | null
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          version?: number
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rams_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "site_service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_documents_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "rams_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rams_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_documents_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      rams_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          emergency_procedures: string | null
          hazards: Json
          id: string
          method_statements: Json
          name: string
          ppe_requirements: string[] | null
          service_type: string | null
          site_access_notes: string | null
          site_specific_hazards: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          emergency_procedures?: string | null
          hazards?: Json
          id?: string
          method_statements?: Json
          name: string
          ppe_requirements?: string[] | null
          service_type?: string | null
          site_access_notes?: string | null
          site_specific_hazards?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          emergency_procedures?: string | null
          hazards?: Json
          id?: string
          method_statements?: Json
          name?: string
          ppe_requirements?: string[] | null
          service_type?: string | null
          site_access_notes?: string | null
          site_specific_hazards?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rams_versions: {
        Row: {
          changes_summary: string | null
          created_at: string
          created_by: string
          document_snapshot: Json
          id: string
          rams_document_id: string
          version_number: number
        }
        Insert: {
          changes_summary?: string | null
          created_at?: string
          created_by: string
          document_snapshot: Json
          id?: string
          rams_document_id: string
          version_number: number
        }
        Update: {
          changes_summary?: string | null
          created_at?: string
          created_by?: string
          document_snapshot?: Json
          id?: string
          rams_document_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "rams_versions_rams_document_id_fkey"
            columns: ["rams_document_id"]
            isOneToOne: false
            referencedRelation: "rams_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      recycled_quotation_numbers: {
        Row: {
          id: string
          quotation_number: string
          recycled_at: string
        }
        Insert: {
          id?: string
          quotation_number: string
          recycled_at?: string
        }
        Update: {
          id?: string
          quotation_number?: string
          recycled_at?: string
        }
        Relationships: []
      }
      recycled_report_numbers: {
        Row: {
          id: string
          recycled_at: string
          report_number: string
          report_type: string
        }
        Insert: {
          id?: string
          recycled_at?: string
          report_number: string
          report_type?: string
        }
        Update: {
          id?: string
          recycled_at?: string
          report_number?: string
          report_type?: string
        }
        Relationships: []
      }
      recycled_smart_form_cert_refs: {
        Row: {
          certificate_reference: string
          form_type: string
          recycled_at: string
        }
        Insert: {
          certificate_reference: string
          form_type: string
          recycled_at?: string
        }
        Update: {
          certificate_reference?: string
          form_type?: string
          recycled_at?: string
        }
        Relationships: []
      }
      ref_lib_chunks: {
        Row: {
          chunk_index: number
          content: string
          content_preview: string | null
          created_at: string | null
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
          page_number: number | null
          section_title: string | null
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          content_preview?: string | null
          created_at?: string | null
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          page_number?: number | null
          section_title?: string | null
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          content_preview?: string | null
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          page_number?: number | null
          section_title?: string | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "ref_lib_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ref_lib_documents: {
        Row: {
          chunk_count: number | null
          created_at: string | null
          doc_type: string
          edition: string | null
          effective_date: string | null
          id: string
          ingest_error: string | null
          ingest_status: string | null
          ingested_at: string | null
          metadata: Json | null
          page_count: number | null
          publisher: string | null
          source_filename: string | null
          source_storage_path: string | null
          standard_reference: string | null
          title: string
          total_tokens: number | null
          updated_at: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          chunk_count?: number | null
          created_at?: string | null
          doc_type: string
          edition?: string | null
          effective_date?: string | null
          id?: string
          ingest_error?: string | null
          ingest_status?: string | null
          ingested_at?: string | null
          metadata?: Json | null
          page_count?: number | null
          publisher?: string | null
          source_filename?: string | null
          source_storage_path?: string | null
          standard_reference?: string | null
          title: string
          total_tokens?: number | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          chunk_count?: number | null
          created_at?: string | null
          doc_type?: string
          edition?: string | null
          effective_date?: string | null
          id?: string
          ingest_error?: string | null
          ingest_status?: string | null
          ingested_at?: string | null
          metadata?: Json | null
          page_count?: number | null
          publisher?: string | null
          source_filename?: string | null
          source_storage_path?: string | null
          standard_reference?: string | null
          title?: string
          total_tokens?: number | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      remittance_advices: {
        Row: {
          ai_raw_extract: Json | null
          applied_at: string | null
          applied_by: string | null
          content_hash: string | null
          created_at: string
          currency: string
          error_message: string | null
          from_address: string | null
          from_name: string | null
          id: string
          mailbox: string
          message_id: string
          payer_name: string | null
          payment_date: string | null
          pdf_count: number
          received_at: string | null
          scanned_email_id: string | null
          status: string
          subject: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          ai_raw_extract?: Json | null
          applied_at?: string | null
          applied_by?: string | null
          content_hash?: string | null
          created_at?: string
          currency?: string
          error_message?: string | null
          from_address?: string | null
          from_name?: string | null
          id?: string
          mailbox: string
          message_id: string
          payer_name?: string | null
          payment_date?: string | null
          pdf_count?: number
          received_at?: string | null
          scanned_email_id?: string | null
          status?: string
          subject?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          ai_raw_extract?: Json | null
          applied_at?: string | null
          applied_by?: string | null
          content_hash?: string | null
          created_at?: string
          currency?: string
          error_message?: string | null
          from_address?: string | null
          from_name?: string | null
          id?: string
          mailbox?: string
          message_id?: string
          payer_name?: string | null
          payment_date?: string | null
          pdf_count?: number
          received_at?: string | null
          scanned_email_id?: string | null
          status?: string
          subject?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remittance_advices_scanned_email_id_fkey"
            columns: ["scanned_email_id"]
            isOneToOne: false
            referencedRelation: "scanned_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      remittance_line_items: {
        Row: {
          amount: number | null
          applied_at: string | null
          applied_by: string | null
          created_at: string
          error_message: string | null
          id: string
          invoice_number: string | null
          match_confidence: string | null
          matched_contact_name: string | null
          matched_xero_invoice_id: string | null
          raw_text: string | null
          remittance_id: string
          status: string
          updated_at: string
          xero_invoice_id: string | null
          xero_payment_id: string | null
        }
        Insert: {
          amount?: number | null
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_number?: string | null
          match_confidence?: string | null
          matched_contact_name?: string | null
          matched_xero_invoice_id?: string | null
          raw_text?: string | null
          remittance_id: string
          status?: string
          updated_at?: string
          xero_invoice_id?: string | null
          xero_payment_id?: string | null
        }
        Update: {
          amount?: number | null
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_number?: string | null
          match_confidence?: string | null
          matched_contact_name?: string | null
          matched_xero_invoice_id?: string | null
          raw_text?: string | null
          remittance_id?: string
          status?: string
          updated_at?: string
          xero_invoice_id?: string | null
          xero_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remittance_line_items_matched_xero_invoice_id_fkey"
            columns: ["matched_xero_invoice_id"]
            isOneToOne: false
            referencedRelation: "xero_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_line_items_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "remittance_advices"
            referencedColumns: ["id"]
          },
        ]
      }
      scanned_emails: {
        Row: {
          body_preview: string | null
          created_at: string
          from_address: string | null
          from_name: string | null
          has_attachments: boolean | null
          id: string
          importance: string | null
          is_read: boolean | null
          mailbox: string
          message_id: string
          raw: Json | null
          received_at: string | null
          scanned_at: string
          subject: string | null
          to_recipients: Json | null
        }
        Insert: {
          body_preview?: string | null
          created_at?: string
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean | null
          id?: string
          importance?: string | null
          is_read?: boolean | null
          mailbox: string
          message_id: string
          raw?: Json | null
          received_at?: string | null
          scanned_at?: string
          subject?: string | null
          to_recipients?: Json | null
        }
        Update: {
          body_preview?: string | null
          created_at?: string
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean | null
          id?: string
          importance?: string | null
          is_read?: boolean | null
          mailbox?: string
          message_id?: string
          raw?: Json | null
          received_at?: string | null
          scanned_at?: string
          subject?: string | null
          to_recipients?: Json | null
        }
        Relationships: []
      }
      scope_generations: {
        Row: {
          accepted: boolean | null
          generated_at: string | null
          generated_by: string | null
          id: string
          inputs: Json
          model: string | null
          output: Json
          quotation_id: string | null
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          accepted?: boolean | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          inputs: Json
          model?: string | null
          output: Json
          quotation_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          accepted?: boolean | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          inputs?: Json
          model?: string | null
          output?: Json
          quotation_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scope_generations_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_report_battery_tests: {
        Row: {
          charge_current_ma: number | null
          created_at: string
          id: string
          install_date: string | null
          load_test_result: string | null
          notes: string | null
          panel_or_psu_label: string
          recommendation: string | null
          service_report_id: string
          terminal_voltage_v: number | null
          updated_at: string
        }
        Insert: {
          charge_current_ma?: number | null
          created_at?: string
          id?: string
          install_date?: string | null
          load_test_result?: string | null
          notes?: string | null
          panel_or_psu_label: string
          recommendation?: string | null
          service_report_id: string
          terminal_voltage_v?: number | null
          updated_at?: string
        }
        Update: {
          charge_current_ma?: number | null
          created_at?: string
          id?: string
          install_date?: string | null
          load_test_result?: string | null
          notes?: string | null
          panel_or_psu_label?: string
          recommendation?: string | null
          service_report_id?: string
          terminal_voltage_v?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_report_battery_tests_service_report_id_fkey"
            columns: ["service_report_id"]
            isOneToOne: false
            referencedRelation: "service_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reports: {
        Row: {
          arc_connected: boolean | null
          arrival_time: string | null
          checklist: Json
          client_name: string | null
          client_sign_date: string | null
          client_sign_name: string | null
          client_sign_position: string | null
          client_signature: string | null
          created_at: string
          created_by: string
          defects_found: string | null
          departure_time: string | null
          devices_count: number | null
          engineer_name: string | null
          engineer_sign_date: string | null
          engineer_signature: string | null
          id: string
          invoiced: boolean | null
          isolation_details: string | null
          mileage_miles: number | null
          next_service_due: string | null
          notes: string | null
          outstanding_works: string | null
          panel_id: string | null
          panel_location: string | null
          panel_manufacturer: string | null
          panel_model: string | null
          parts_used: string | null
          recommendations: string | null
          report_date: string
          report_number: string | null
          sharepoint_folder: string | null
          sharepoint_url: string | null
          site_id: string
          status: string
          system_condition: string | null
          system_status: string | null
          system_type: string | null
          updated_at: string
          visit_id: string
          work_carried_out: string | null
          xero_invoice_number: string | null
          zones_count: number | null
        }
        Insert: {
          arc_connected?: boolean | null
          arrival_time?: string | null
          checklist?: Json
          client_name?: string | null
          client_sign_date?: string | null
          client_sign_name?: string | null
          client_sign_position?: string | null
          client_signature?: string | null
          created_at?: string
          created_by: string
          defects_found?: string | null
          departure_time?: string | null
          devices_count?: number | null
          engineer_name?: string | null
          engineer_sign_date?: string | null
          engineer_signature?: string | null
          id?: string
          invoiced?: boolean | null
          isolation_details?: string | null
          mileage_miles?: number | null
          next_service_due?: string | null
          notes?: string | null
          outstanding_works?: string | null
          panel_id?: string | null
          panel_location?: string | null
          panel_manufacturer?: string | null
          panel_model?: string | null
          parts_used?: string | null
          recommendations?: string | null
          report_date?: string
          report_number?: string | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          site_id: string
          status?: string
          system_condition?: string | null
          system_status?: string | null
          system_type?: string | null
          updated_at?: string
          visit_id: string
          work_carried_out?: string | null
          xero_invoice_number?: string | null
          zones_count?: number | null
        }
        Update: {
          arc_connected?: boolean | null
          arrival_time?: string | null
          checklist?: Json
          client_name?: string | null
          client_sign_date?: string | null
          client_sign_name?: string | null
          client_sign_position?: string | null
          client_signature?: string | null
          created_at?: string
          created_by?: string
          defects_found?: string | null
          departure_time?: string | null
          devices_count?: number | null
          engineer_name?: string | null
          engineer_sign_date?: string | null
          engineer_signature?: string | null
          id?: string
          invoiced?: boolean | null
          isolation_details?: string | null
          mileage_miles?: number | null
          next_service_due?: string | null
          notes?: string | null
          outstanding_works?: string | null
          panel_id?: string | null
          panel_location?: string | null
          panel_manufacturer?: string | null
          panel_model?: string | null
          parts_used?: string | null
          recommendations?: string | null
          report_date?: string
          report_number?: string | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          site_id?: string
          status?: string
          system_condition?: string | null
          system_status?: string | null
          system_type?: string | null
          updated_at?: string
          visit_id?: string
          work_carried_out?: string | null
          xero_invoice_number?: string | null
          zones_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_reports_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "site_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reports_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reports_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      service_visits: {
        Row: {
          acceptance_token: string | null
          accepted_by_name: string | null
          affected_loops: string[] | null
          affected_zones: string[] | null
          appointment_time: string | null
          arc_notified_at: string | null
          arrival_lat: number | null
          arrival_lng: number | null
          arrived_at: string | null
          call_received_at: string | null
          client_accepted_at: string | null
          client_po_file_url: string | null
          client_po_number: string | null
          client_signature_url: string | null
          client_signed_name: string | null
          commercial_classification: string | null
          confirmation_sent_at: string | null
          confirmation_sent_by: string | null
          confirmation_sent_to: string | null
          coverage_percentage: number | null
          created_at: string
          departed_at: string | null
          devices_tested: number | null
          engineer_assigned_at: string | null
          engineer_id: string | null
          engineer_notes: string | null
          estimated_hours: number | null
          fault_details: Json | null
          id: string
          issues_count: number | null
          job_number: string | null
          notes: string | null
          priority: string | null
          quotation_id: string | null
          quoted_price: number | null
          report_method: string | null
          reported_by: string | null
          site_id: string
          status: string | null
          total_devices: number | null
          updated_at: string
          visit_date: string
          visit_type: string
        }
        Insert: {
          acceptance_token?: string | null
          accepted_by_name?: string | null
          affected_loops?: string[] | null
          affected_zones?: string[] | null
          appointment_time?: string | null
          arc_notified_at?: string | null
          arrival_lat?: number | null
          arrival_lng?: number | null
          arrived_at?: string | null
          call_received_at?: string | null
          client_accepted_at?: string | null
          client_po_file_url?: string | null
          client_po_number?: string | null
          client_signature_url?: string | null
          client_signed_name?: string | null
          commercial_classification?: string | null
          confirmation_sent_at?: string | null
          confirmation_sent_by?: string | null
          confirmation_sent_to?: string | null
          coverage_percentage?: number | null
          created_at?: string
          departed_at?: string | null
          devices_tested?: number | null
          engineer_assigned_at?: string | null
          engineer_id?: string | null
          engineer_notes?: string | null
          estimated_hours?: number | null
          fault_details?: Json | null
          id?: string
          issues_count?: number | null
          job_number?: string | null
          notes?: string | null
          priority?: string | null
          quotation_id?: string | null
          quoted_price?: number | null
          report_method?: string | null
          reported_by?: string | null
          site_id: string
          status?: string | null
          total_devices?: number | null
          updated_at?: string
          visit_date?: string
          visit_type: string
        }
        Update: {
          acceptance_token?: string | null
          accepted_by_name?: string | null
          affected_loops?: string[] | null
          affected_zones?: string[] | null
          appointment_time?: string | null
          arc_notified_at?: string | null
          arrival_lat?: number | null
          arrival_lng?: number | null
          arrived_at?: string | null
          call_received_at?: string | null
          client_accepted_at?: string | null
          client_po_file_url?: string | null
          client_po_number?: string | null
          client_signature_url?: string | null
          client_signed_name?: string | null
          commercial_classification?: string | null
          confirmation_sent_at?: string | null
          confirmation_sent_by?: string | null
          confirmation_sent_to?: string | null
          coverage_percentage?: number | null
          created_at?: string
          departed_at?: string | null
          devices_tested?: number | null
          engineer_assigned_at?: string | null
          engineer_id?: string | null
          engineer_notes?: string | null
          estimated_hours?: number | null
          fault_details?: Json | null
          id?: string
          issues_count?: number | null
          job_number?: string | null
          notes?: string | null
          priority?: string | null
          quotation_id?: string | null
          quoted_price?: number | null
          report_method?: string | null
          reported_by?: string | null
          site_id?: string
          status?: string | null
          total_devices?: number | null
          updated_at?: string
          visit_date?: string
          visit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "visits_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      session_activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      site_assets: {
        Row: {
          asset_type: string
          created_at: string
          id: string
          item_name: string
          location: string | null
          loops_count: number | null
          manufacturer: string | null
          model: string | null
          notes: string | null
          serial_number: string | null
          site_id: string
          updated_at: string
          zones_count: number | null
        }
        Insert: {
          asset_type: string
          created_at?: string
          id?: string
          item_name: string
          location?: string | null
          loops_count?: number | null
          manufacturer?: string | null
          model?: string | null
          notes?: string | null
          serial_number?: string | null
          site_id: string
          updated_at?: string
          zones_count?: number | null
        }
        Update: {
          asset_type?: string
          created_at?: string
          id?: string
          item_name?: string
          location?: string | null
          loops_count?: number | null
          manufacturer?: string | null
          model?: string | null
          notes?: string | null
          serial_number?: string | null
          site_id?: string
          updated_at?: string
          zones_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "site_assets_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_bafe_certificates: {
        Row: {
          certificate_number: string
          certificate_type: string
          created_at: string
          expiry_date: string | null
          id: string
          issued_by: string
          issued_date: string
          linked_form_submission_id: string | null
          linked_report_id: string | null
          notes: string | null
          site_id: string
          status: string
          updated_at: string
        }
        Insert: {
          certificate_number: string
          certificate_type: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          issued_by: string
          issued_date: string
          linked_form_submission_id?: string | null
          linked_report_id?: string | null
          notes?: string | null
          site_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          certificate_number?: string
          certificate_type?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          issued_by?: string
          issued_date?: string
          linked_form_submission_id?: string | null
          linked_report_id?: string | null
          notes?: string | null
          site_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_bafe_certificates_linked_form_submission_id_fkey"
            columns: ["linked_form_submission_id"]
            isOneToOne: false
            referencedRelation: "customer_form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_bafe_certificates_linked_report_id_fkey"
            columns: ["linked_report_id"]
            isOneToOne: false
            referencedRelation: "service_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_bafe_certificates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_compliance_scores: {
        Row: {
          created_at: string
          dry_riser_score: number | null
          emergency_lighting_score: number | null
          fire_alarm_score: number | null
          fire_door_score: number | null
          id: string
          last_calculated_at: string
          open_cat1_count: number | null
          open_cat2_count: number | null
          open_cat3_count: number | null
          overall_score: number | null
          overdue_certs_count: number | null
          portable_equipment_score: number | null
          site_id: string
          trajectory: string | null
          unacknowledged_notices: number | null
        }
        Insert: {
          created_at?: string
          dry_riser_score?: number | null
          emergency_lighting_score?: number | null
          fire_alarm_score?: number | null
          fire_door_score?: number | null
          id?: string
          last_calculated_at?: string
          open_cat1_count?: number | null
          open_cat2_count?: number | null
          open_cat3_count?: number | null
          overall_score?: number | null
          overdue_certs_count?: number | null
          portable_equipment_score?: number | null
          site_id: string
          trajectory?: string | null
          unacknowledged_notices?: number | null
        }
        Update: {
          created_at?: string
          dry_riser_score?: number | null
          emergency_lighting_score?: number | null
          fire_alarm_score?: number | null
          fire_door_score?: number | null
          id?: string
          last_calculated_at?: string
          open_cat1_count?: number | null
          open_cat2_count?: number | null
          open_cat3_count?: number | null
          overall_score?: number | null
          overdue_certs_count?: number | null
          portable_equipment_score?: number | null
          site_id?: string
          trajectory?: string | null
          unacknowledged_notices?: number | null
        }
        Relationships: []
      }
      site_defects: {
        Row: {
          category: number
          created_at: string
          description: string
          id: string
          location: string | null
          notes: string | null
          quotation_id: string | null
          raised_at: string
          raised_by: string | null
          remediated_at: string | null
          report_id: string | null
          site_id: string
          status: string
          updated_at: string
          user_id: string | null
          visit_id: string | null
        }
        Insert: {
          category: number
          created_at?: string
          description: string
          id?: string
          location?: string | null
          notes?: string | null
          quotation_id?: string | null
          raised_at?: string
          raised_by?: string | null
          remediated_at?: string | null
          report_id?: string | null
          site_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
          visit_id?: string | null
        }
        Update: {
          category?: number
          created_at?: string
          description?: string
          id?: string
          location?: string | null
          notes?: string | null
          quotation_id?: string | null
          raised_at?: string
          raised_by?: string | null
          remediated_at?: string | null
          report_id?: string | null
          site_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_defects_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "service_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_defects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_defects_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      site_service_contracts: {
        Row: {
          contract_end: string | null
          contract_start: string | null
          created_at: string
          description: string | null
          frequency: string | null
          id: string
          included_visits: number | null
          notes: string | null
          po_number: string | null
          service_type: string
          site_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          description?: string | null
          frequency?: string | null
          id?: string
          included_visits?: number | null
          notes?: string | null
          po_number?: string | null
          service_type: string
          site_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          description?: string | null
          frequency?: string | null
          id?: string
          included_visits?: number | null
          notes?: string | null
          po_number?: string | null
          service_type?: string
          site_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_service_contracts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          access_hours: string | null
          access_notes: string | null
          address: string | null
          arc_account_ref: string | null
          arc_connected: boolean | null
          arc_provider: string | null
          areas_covered: string | null
          areas_not_covered: string | null
          bs5839_category: string | null
          building_type: string | null
          cable_type: string | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          customer_id: string | null
          duty_holder_email: string | null
          duty_holder_name: string | null
          duty_holder_phone: string | null
          duty_holder_role: string | null
          gate_code: string | null
          has_pava: boolean | null
          id: string
          name: string
          num_detectors: number | null
          num_devices: number | null
          num_loops: number | null
          num_manual_call_points: number | null
          num_sounders: number | null
          num_zones: number | null
          occupancy_type: string | null
          panel_make_model: string | null
          panel_software_version: string | null
          parking_notes: string | null
          pava_bs_en_54_16_compliant: boolean | null
          pava_bs_en_54_24_compliant: boolean | null
          pava_fa_interface_method: string | null
          pava_has_backup_amplifier: boolean | null
          pava_make: string | null
          pava_model: string | null
          pava_network_topology: string | null
          pava_num_circuits: number | null
          pava_num_loudspeakers: number | null
          pava_num_zones: number | null
          pava_software_version: string | null
          portal_token: string | null
          postcode: string | null
          psu_capacity_ah: number | null
          sharepoint_folder: string | null
          sharepoint_url: string | null
          status: string | null
          total_devices: number | null
          updated_at: string
          year_installed: number | null
        }
        Insert: {
          access_hours?: string | null
          access_notes?: string | null
          address?: string | null
          arc_account_ref?: string | null
          arc_connected?: boolean | null
          arc_provider?: string | null
          areas_covered?: string | null
          areas_not_covered?: string | null
          bs5839_category?: string | null
          building_type?: string | null
          cable_type?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_id?: string | null
          duty_holder_email?: string | null
          duty_holder_name?: string | null
          duty_holder_phone?: string | null
          duty_holder_role?: string | null
          gate_code?: string | null
          has_pava?: boolean | null
          id?: string
          name: string
          num_detectors?: number | null
          num_devices?: number | null
          num_loops?: number | null
          num_manual_call_points?: number | null
          num_sounders?: number | null
          num_zones?: number | null
          occupancy_type?: string | null
          panel_make_model?: string | null
          panel_software_version?: string | null
          parking_notes?: string | null
          pava_bs_en_54_16_compliant?: boolean | null
          pava_bs_en_54_24_compliant?: boolean | null
          pava_fa_interface_method?: string | null
          pava_has_backup_amplifier?: boolean | null
          pava_make?: string | null
          pava_model?: string | null
          pava_network_topology?: string | null
          pava_num_circuits?: number | null
          pava_num_loudspeakers?: number | null
          pava_num_zones?: number | null
          pava_software_version?: string | null
          portal_token?: string | null
          postcode?: string | null
          psu_capacity_ah?: number | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          status?: string | null
          total_devices?: number | null
          updated_at?: string
          year_installed?: number | null
        }
        Update: {
          access_hours?: string | null
          access_notes?: string | null
          address?: string | null
          arc_account_ref?: string | null
          arc_connected?: boolean | null
          arc_provider?: string | null
          areas_covered?: string | null
          areas_not_covered?: string | null
          bs5839_category?: string | null
          building_type?: string | null
          cable_type?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_id?: string | null
          duty_holder_email?: string | null
          duty_holder_name?: string | null
          duty_holder_phone?: string | null
          duty_holder_role?: string | null
          gate_code?: string | null
          has_pava?: boolean | null
          id?: string
          name?: string
          num_detectors?: number | null
          num_devices?: number | null
          num_loops?: number | null
          num_manual_call_points?: number | null
          num_sounders?: number | null
          num_zones?: number | null
          occupancy_type?: string | null
          panel_make_model?: string | null
          panel_software_version?: string | null
          parking_notes?: string | null
          pava_bs_en_54_16_compliant?: boolean | null
          pava_bs_en_54_24_compliant?: boolean | null
          pava_fa_interface_method?: string | null
          pava_has_backup_amplifier?: boolean | null
          pava_make?: string | null
          pava_model?: string | null
          pava_network_topology?: string | null
          pava_num_circuits?: number | null
          pava_num_loudspeakers?: number | null
          pava_num_zones?: number | null
          pava_software_version?: string | null
          portal_token?: string | null
          postcode?: string | null
          psu_capacity_ah?: number | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          status?: string | null
          total_devices?: number | null
          updated_at?: string
          year_installed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_form_submissions: {
        Row: {
          certificate_reference: string
          completed_at: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          engineer_id: string | null
          form_type: string
          id: string
          job_number: string | null
          payload: Json
          pdf_url: string | null
          site_id: string | null
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          certificate_reference: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          engineer_id?: string | null
          form_type?: string
          id?: string
          job_number?: string | null
          payload?: Json
          pdf_url?: string | null
          site_id?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          certificate_reference?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          engineer_id?: string | null
          form_type?: string
          id?: string
          job_number?: string | null
          payload?: Json
          pdf_url?: string | null
          site_id?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_form_submissions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_form_submissions_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "smart_form_submissions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_form_submissions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractors: {
        Row: {
          address: string | null
          city: string | null
          company_name: string
          contact_name: string | null
          created_at: string
          created_by: string
          day_rate: number | null
          email: string | null
          hourly_rate: number | null
          id: string
          insurance_document_url: string | null
          insurance_expiry: string | null
          notes: string | null
          phone: string | null
          postcode: string | null
          specializations: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_name: string
          contact_name?: string | null
          created_at?: string
          created_by: string
          day_rate?: number | null
          email?: string | null
          hourly_rate?: number | null
          id?: string
          insurance_document_url?: string | null
          insurance_expiry?: string | null
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          specializations?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company_name?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string
          day_rate?: number | null
          email?: string | null
          hourly_rate?: number | null
          id?: string
          insurance_document_url?: string | null
          insurance_expiry?: string | null
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          specializations?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      supplier_products: {
        Row: {
          category: string | null
          created_at: string
          description: string
          id: string
          product_code: string
          supplier_name: string
          trade_price: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description: string
          id?: string
          product_code: string
          supplier_name?: string
          trade_price?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          product_code?: string
          supplier_name?: string
          trade_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          created_by: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          postcode: string | null
          status: string
          updated_at: string
          xero_contact_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          status?: string
          updated_at?: string
          xero_contact_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          status?: string
          updated_at?: string
          xero_contact_id?: string | null
        }
        Relationships: []
      }
      tender_pack_items: {
        Row: {
          company_document_id: string | null
          created_at: string
          custom_title: string | null
          custom_url: string | null
          id: string
          notes: string | null
          sort_order: number
          tender_id: string
        }
        Insert: {
          company_document_id?: string | null
          created_at?: string
          custom_title?: string | null
          custom_url?: string | null
          id?: string
          notes?: string | null
          sort_order?: number
          tender_id: string
        }
        Update: {
          company_document_id?: string | null
          created_at?: string
          custom_title?: string | null
          custom_url?: string | null
          id?: string
          notes?: string | null
          sort_order?: number
          tender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_pack_items_company_document_id_fkey"
            columns: ["company_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_pack_items_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tenders: {
        Row: {
          buyer_name: string | null
          buyer_org: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deadline_at: string | null
          description: string | null
          discovered_at: string
          id: string
          notes: string | null
          published_at: string | null
          region: string | null
          source: string
          source_id: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string
          url: string | null
          value_max: number | null
          value_min: number | null
        }
        Insert: {
          buyer_name?: string | null
          buyer_org?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deadline_at?: string | null
          description?: string | null
          discovered_at?: string
          id?: string
          notes?: string | null
          published_at?: string | null
          region?: string | null
          source?: string
          source_id?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          url?: string | null
          value_max?: number | null
          value_min?: number | null
        }
        Update: {
          buyer_name?: string | null
          buyer_org?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deadline_at?: string | null
          description?: string | null
          discovered_at?: string
          id?: string
          notes?: string | null
          published_at?: string | null
          region?: string | null
          source?: string
          source_id?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string | null
          value_max?: number | null
          value_min?: number | null
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
      visit_documents: {
        Row: {
          category: string
          customer_id: string
          description: string | null
          document_date: string
          file_mime_type: string
          file_original_name: string
          file_path: string
          file_size_bytes: number
          id: string
          is_archived: boolean
          issued_by: string | null
          service_visit_id: string | null
          share_with_customer: boolean
          site_id: string
          title: string
          uploaded_at: string
          uploaded_by: string
          version_of_id: string | null
        }
        Insert: {
          category: string
          customer_id: string
          description?: string | null
          document_date: string
          file_mime_type: string
          file_original_name: string
          file_path: string
          file_size_bytes: number
          id?: string
          is_archived?: boolean
          issued_by?: string | null
          service_visit_id?: string | null
          share_with_customer?: boolean
          site_id: string
          title: string
          uploaded_at?: string
          uploaded_by: string
          version_of_id?: string | null
        }
        Update: {
          category?: string
          customer_id?: string
          description?: string | null
          document_date?: string
          file_mime_type?: string
          file_original_name?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          is_archived?: boolean
          issued_by?: string | null
          service_visit_id?: string | null
          share_with_customer?: boolean
          site_id?: string
          title?: string
          uploaded_at?: string
          uploaded_by?: string
          version_of_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_documents_service_visit_id_fkey"
            columns: ["service_visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_documents_version_of_id_fkey"
            columns: ["version_of_id"]
            isOneToOne: false
            referencedRelation: "visit_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_requirements: {
        Row: {
          category: string
          created_at: string
          created_by: string
          id: string
          is_confirmed: boolean | null
          item_name: string
          notes: string | null
          quantity: number | null
          updated_at: string
          visit_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          id?: string
          is_confirmed?: boolean | null
          item_name: string
          notes?: string | null
          quantity?: number | null
          updated_at?: string
          visit_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          is_confirmed?: boolean | null
          item_name?: string
          notes?: string | null
          quantity?: number | null
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_requirements_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_subcontractor_sheets: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          visit_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          visit_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_subcontractor_sheets_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_task_briefings: {
        Row: {
          activity: string
          ai_generated: boolean | null
          client_name: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          donts: Json
          dos: Json
          id: string
          ppe_required: Json
          prepared_by: string | null
          prepared_date: string | null
          principal_contractor: string | null
          project_reference: string | null
          rams_document_id: string | null
          reviewed_by: string | null
          risk_level: string
          site_id: string | null
          status: string
          task_steps: Json
          team_roles: Json
          title: string
          updated_at: string
          version: number
          vtb_reference: string
          work_location: Json
        }
        Insert: {
          activity: string
          ai_generated?: boolean | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          donts?: Json
          dos?: Json
          id?: string
          ppe_required?: Json
          prepared_by?: string | null
          prepared_date?: string | null
          principal_contractor?: string | null
          project_reference?: string | null
          rams_document_id?: string | null
          reviewed_by?: string | null
          risk_level?: string
          site_id?: string | null
          status?: string
          task_steps?: Json
          team_roles?: Json
          title: string
          updated_at?: string
          version?: number
          vtb_reference?: string
          work_location?: Json
        }
        Update: {
          activity?: string
          ai_generated?: boolean | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          donts?: Json
          dos?: Json
          id?: string
          ppe_required?: Json
          prepared_by?: string | null
          prepared_date?: string | null
          principal_contractor?: string | null
          project_reference?: string | null
          rams_document_id?: string | null
          reviewed_by?: string | null
          risk_level?: string
          site_id?: string | null
          status?: string
          task_steps?: Json
          team_roles?: Json
          title?: string
          updated_at?: string
          version?: number
          vtb_reference?: string
          work_location?: Json
        }
        Relationships: []
      }
      xero_connections: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          tenant_id: string
          tenant_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          tenant_id: string
          tenant_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          tenant_id?: string
          tenant_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      xero_invoices: {
        Row: {
          contact_id: string
          contact_name: string | null
          created_at: string
          created_by: string
          id: string
          status: string | null
          total_amount: number | null
          visit_id: string
          xero_invoice_id: string
          xero_invoice_number: string | null
        }
        Insert: {
          contact_id: string
          contact_name?: string | null
          created_at?: string
          created_by: string
          id?: string
          status?: string | null
          total_amount?: number | null
          visit_id: string
          xero_invoice_id: string
          xero_invoice_number?: string | null
        }
        Update: {
          contact_id?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string
          id?: string
          status?: string | null
          total_amount?: number | null
          visit_id?: string
          xero_invoice_id?: string
          xero_invoice_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xero_invoices_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      microsoft_tokens_safe: {
        Row: {
          connected_at: string | null
          connected_by: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          connected_at?: string | null
          connected_by?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          connected_at?: string | null
          connected_by?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      xero_connections_safe: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string | null
          tenant_id: string | null
          tenant_name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auto_capa_from_overdue_reviews: { Args: never; Returns: undefined }
      check_works_type_alignment: {
        Args: { p_typescript_values: string[] }
        Returns: {
          constraint_name: string
          missing_in_db: string[]
          missing_in_typescript: string[]
          status: string
        }[]
      }
      civ2_benchmark_summary: {
        Args: {
          p_building_type?: string
          p_job_category: string
          p_panel_make?: string
          p_region?: string
          p_system_type: string
        }
        Returns: {
          avg_margin_percent: number
          avg_quoted_price: number
          avg_total_cost: number
          median_quoted_price: number
          p25_quoted_price: number
          p75_quoted_price: number
          sample_size: number
          win_rate: number
        }[]
      }
      civ2_find_comparable_jobs: {
        Args: {
          p_building_type?: string
          p_device_count?: number
          p_job_category: string
          p_limit?: number
          p_panel_make?: string
          p_region?: string
          p_system_type: string
        }
        Returns: {
          building_type: string
          complexity: string
          decided_at: string
          device_count: number
          job_category: string
          margin_percent: number
          outcome: string
          panel_make: string
          quotation_id: string
          quotation_number: string
          quoted_price: number
          region: string
          similarity_score: number
          system_type: string
          total_cost: number
        }[]
      }
      get_next_po_number: { Args: never; Returns: string }
      get_next_qms_number: { Args: { prefix: string }; Returns: string }
      get_next_quotation_number: { Args: never; Returns: string }
      get_next_report_number: {
        Args: { report_type?: string }
        Returns: string
      }
      get_next_smart_form_cert_ref: {
        Args: { p_form_type?: string }
        Returns: string
      }
      get_shared_intelligence_report: {
        Args: { p_share_token: string }
        Returns: {
          created_at: string
          customer_id: string
          expires_at: string | null
          generated_at: string
          generated_by: string
          id: string
          is_active: boolean
          report_data: Json
          share_token: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "customer_intelligence_reports"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_elevated_role: { Args: { _user_id: string }; Returns: boolean }
      has_finance_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_visit_tested: { Args: { vid: string }; Returns: undefined }
      ref_lib_query_by_embedding: {
        Args: {
          filter_doc_type?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          chunk_id: string
          content: string
          doc_type: string
          document_id: string
          document_title: string
          page_number: number
          section_title: string
          similarity: number
          standard_reference: string
        }[]
      }
      reset_stuck_ref_lib_ingests: { Args: never; Returns: number }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "engineer"
        | "client"
        | "auditor"
        | "apprentice"
        | "office"
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
        "owner",
        "admin",
        "engineer",
        "client",
        "auditor",
        "apprentice",
        "office",
      ],
    },
  },
} as const
