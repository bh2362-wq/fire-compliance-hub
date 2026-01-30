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
      app_role: "owner" | "admin" | "engineer" | "client" | "auditor"
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
      app_role: ["owner", "admin", "engineer", "client", "auditor"],
    },
  },
} as const
