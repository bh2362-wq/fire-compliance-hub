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
            referencedRelation: "visits"
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
            referencedRelation: "visits"
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
          installed_at: string | null
          last_tested_at: string | null
          location: string | null
          loop: string
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
          installed_at?: string | null
          last_tested_at?: string | null
          location?: string | null
          loop: string
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
          installed_at?: string | null
          last_tested_at?: string | null
          location?: string | null
          loop?: string
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
            referencedRelation: "visits"
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
            referencedRelation: "visits"
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
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
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
          id: string
          location: string | null
          loop: string
          matched: boolean | null
          raw_data: Json | null
          status: string
          upload_id: string
          visit_id: string | null
        }
        Insert: {
          address: string
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          id?: string
          location?: string | null
          loop: string
          matched?: boolean | null
          raw_data?: Json | null
          status: string
          upload_id: string
          visit_id?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          id?: string
          location?: string | null
          loop?: string
          matched?: boolean | null
          raw_data?: Json | null
          status?: string
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
            referencedRelation: "visits"
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
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
            referencedRelation: "visits"
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
            referencedRelation: "visits"
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
          item_name: string | null
          labour_cost: number | null
          labour_included: boolean | null
          markup_percent: number | null
          notes: string | null
          parent_id: string | null
          priority: string | null
          quantity: number | null
          quotation_id: string
          regulation_reference: string | null
          sort_order: number | null
          source_section: string | null
          source_type: string | null
          total_price: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          cost_price?: number | null
          created_at?: string
          description: string
          id?: string
          item_name?: string | null
          labour_cost?: number | null
          labour_included?: boolean | null
          markup_percent?: number | null
          notes?: string | null
          parent_id?: string | null
          priority?: string | null
          quantity?: number | null
          quotation_id: string
          regulation_reference?: string | null
          sort_order?: number | null
          source_section?: string | null
          source_type?: string | null
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          cost_price?: number | null
          created_at?: string
          description?: string
          id?: string
          item_name?: string | null
          labour_cost?: number | null
          labour_included?: boolean | null
          markup_percent?: number | null
          notes?: string | null
          parent_id?: string | null
          priority?: string | null
          quantity?: number | null
          quotation_id?: string
          regulation_reference?: string | null
          sort_order?: number | null
          source_section?: string | null
          source_type?: string | null
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
          client_acceptance_signature: string | null
          client_accepted_at: string | null
          client_po_number: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          po_number: string | null
          quotation_number: string
          report_id: string | null
          sharepoint_folder: string | null
          sharepoint_url: string | null
          site_id: string
          status: string
          summary: string | null
          terms: string | null
          title: string | null
          total_amount: number | null
          updated_at: string
          valid_until: string | null
          vat_rate: number | null
          visit_id: string | null
        }
        Insert: {
          acceptance_token?: string | null
          accepted_by_name?: string | null
          client_acceptance_signature?: string | null
          client_accepted_at?: string | null
          client_po_number?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          po_number?: string | null
          quotation_number: string
          report_id?: string | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          site_id: string
          status?: string
          summary?: string | null
          terms?: string | null
          title?: string | null
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          vat_rate?: number | null
          visit_id?: string | null
        }
        Update: {
          acceptance_token?: string | null
          accepted_by_name?: string | null
          client_acceptance_signature?: string | null
          client_accepted_at?: string | null
          client_po_number?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          po_number?: string | null
          quotation_number?: string
          report_id?: string | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          site_id?: string
          status?: string
          summary?: string | null
          terms?: string | null
          title?: string | null
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          vat_rate?: number | null
          visit_id?: string | null
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
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "visits"
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
      service_reports: {
        Row: {
          checklist: Json
          client_name: string | null
          client_signature: string | null
          created_at: string
          created_by: string
          defects_found: string | null
          devices_count: number | null
          engineer_name: string | null
          engineer_signature: string | null
          id: string
          invoiced: boolean | null
          next_service_due: string | null
          notes: string | null
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
          system_type: string | null
          updated_at: string
          visit_id: string
          work_carried_out: string | null
          xero_invoice_number: string | null
          zones_count: number | null
        }
        Insert: {
          checklist?: Json
          client_name?: string | null
          client_signature?: string | null
          created_at?: string
          created_by: string
          defects_found?: string | null
          devices_count?: number | null
          engineer_name?: string | null
          engineer_signature?: string | null
          id?: string
          invoiced?: boolean | null
          next_service_due?: string | null
          notes?: string | null
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
          system_type?: string | null
          updated_at?: string
          visit_id: string
          work_carried_out?: string | null
          xero_invoice_number?: string | null
          zones_count?: number | null
        }
        Update: {
          checklist?: Json
          client_name?: string | null
          client_signature?: string | null
          created_at?: string
          created_by?: string
          defects_found?: string | null
          devices_count?: number | null
          engineer_name?: string | null
          engineer_signature?: string | null
          id?: string
          invoiced?: boolean | null
          next_service_due?: string | null
          notes?: string | null
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
          system_type?: string | null
          updated_at?: string
          visit_id?: string
          work_carried_out?: string | null
          xero_invoice_number?: string | null
          zones_count?: number | null
        }
        Relationships: [
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
            referencedRelation: "visits"
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
          address: string | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          customer_id: string | null
          id: string
          name: string
          postcode: string | null
          sharepoint_folder: string | null
          sharepoint_url: string | null
          status: string | null
          total_devices: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          name: string
          postcode?: string | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          status?: string | null
          total_devices?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          name?: string
          postcode?: string | null
          sharepoint_folder?: string | null
          sharepoint_url?: string | null
          status?: string | null
          total_devices?: number | null
          updated_at?: string
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
            referencedRelation: "visits"
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
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          acceptance_token: string | null
          accepted_by_name: string | null
          client_accepted_at: string | null
          client_po_file_url: string | null
          client_po_number: string | null
          coverage_percentage: number | null
          created_at: string
          devices_tested: number | null
          engineer_id: string | null
          estimated_hours: number | null
          id: string
          issues_count: number | null
          notes: string | null
          quotation_id: string | null
          quoted_price: number | null
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
          client_accepted_at?: string | null
          client_po_file_url?: string | null
          client_po_number?: string | null
          coverage_percentage?: number | null
          created_at?: string
          devices_tested?: number | null
          engineer_id?: string | null
          estimated_hours?: number | null
          id?: string
          issues_count?: number | null
          notes?: string | null
          quotation_id?: string | null
          quoted_price?: number | null
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
          client_accepted_at?: string | null
          client_po_file_url?: string | null
          client_po_number?: string | null
          coverage_percentage?: number | null
          created_at?: string
          devices_tested?: number | null
          engineer_id?: string | null
          estimated_hours?: number | null
          id?: string
          issues_count?: number | null
          notes?: string | null
          quotation_id?: string | null
          quoted_price?: number | null
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
            referencedRelation: "visits"
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
      get_next_po_number: { Args: never; Returns: string }
      get_next_qms_number: { Args: { prefix: string }; Returns: string }
      get_next_quotation_number: { Args: never; Returns: string }
      get_next_report_number: {
        Args: { report_type?: string }
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
