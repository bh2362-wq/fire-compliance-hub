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
      customers: {
        Row: {
          address: string | null
          city: string | null
          client_signature: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          postcode: string | null
          status: string | null
          updated_at: string
          xero_contact_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_signature?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          postcode?: string | null
          status?: string | null
          updated_at?: string
          xero_contact_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          client_signature?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          postcode?: string | null
          status?: string | null
          updated_at?: string
          xero_contact_id?: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          next_service_due: string | null
          notes: string | null
          panel_location: string | null
          panel_manufacturer: string | null
          panel_model: string | null
          parts_used: string | null
          recommendations: string | null
          report_date: string
          report_number: string | null
          site_id: string
          status: string
          system_condition: string | null
          system_type: string | null
          updated_at: string
          visit_id: string
          work_carried_out: string | null
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
          next_service_due?: string | null
          notes?: string | null
          panel_location?: string | null
          panel_manufacturer?: string | null
          panel_model?: string | null
          parts_used?: string | null
          recommendations?: string | null
          report_date?: string
          report_number?: string | null
          site_id: string
          status?: string
          system_condition?: string | null
          system_type?: string | null
          updated_at?: string
          visit_id: string
          work_carried_out?: string | null
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
          next_service_due?: string | null
          notes?: string | null
          panel_location?: string | null
          panel_manufacturer?: string | null
          panel_model?: string | null
          parts_used?: string | null
          recommendations?: string | null
          report_date?: string
          report_number?: string | null
          site_id?: string
          status?: string
          system_condition?: string | null
          system_type?: string | null
          updated_at?: string
          visit_id?: string
          work_carried_out?: string | null
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
      visits: {
        Row: {
          coverage_percentage: number | null
          created_at: string
          devices_tested: number | null
          engineer_id: string | null
          id: string
          issues_count: number | null
          notes: string | null
          site_id: string
          status: string | null
          total_devices: number | null
          updated_at: string
          visit_date: string
          visit_type: string
        }
        Insert: {
          coverage_percentage?: number | null
          created_at?: string
          devices_tested?: number | null
          engineer_id?: string | null
          id?: string
          issues_count?: number | null
          notes?: string | null
          site_id: string
          status?: string | null
          total_devices?: number | null
          updated_at?: string
          visit_date?: string
          visit_type: string
        }
        Update: {
          coverage_percentage?: number | null
          created_at?: string
          devices_tested?: number | null
          engineer_id?: string | null
          id?: string
          issues_count?: number | null
          notes?: string | null
          site_id?: string
          status?: string | null
          total_devices?: number | null
          updated_at?: string
          visit_date?: string
          visit_type?: string
        }
        Relationships: [
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
      [_ in never]: never
    }
    Functions: {
      get_next_qms_number: { Args: { prefix: string }; Returns: string }
      get_next_report_number: {
        Args: { report_type?: string }
        Returns: string
      }
      has_elevated_role: { Args: { _user_id: string }; Returns: boolean }
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
