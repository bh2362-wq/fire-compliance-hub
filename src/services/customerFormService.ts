import { supabase } from "@/integrations/supabase/client";

export interface FormFieldDefinition {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "checkbox" | "signature" | "textarea" | "select" | "table";
  page: number;
  required?: boolean;
  section?: string;
  options?: string[];
  tableColumns?: string[];
  tableRows?: number;
}

export interface FormTemplate {
  id: string;
  name: string;
  form_code: string;
  description: string | null;
  customer_id: string | null;
  template_pdf_path: string | null;
  field_schema: FormFieldDefinition[];
  page_count: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FormSubmission {
  id: string;
  template_id: string;
  site_id: string | null;
  visit_id: string | null;
  customer_id: string | null;
  form_data: Record<string, unknown>;
  signatures: Record<string, string>;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  template?: FormTemplate;
}

// Pre-defined field schemas for Churches Fire forms
export const CHURCHES_FIRE_TEMPLATES: Omit<FormTemplate, "id" | "created_by" | "created_at" | "updated_at">[] = [
  {
    name: "Battery Calculation",
    form_code: "A058-G",
    description: "Customer Fire Alarm Battery Calculation",
    customer_id: null,
    template_pdf_path: "/form-templates/Alarm_Install_Battery_Calculation.pdf",
    page_count: 1,
    is_active: true,
    field_schema: [
      { id: "address", label: "Address", type: "text", page: 1, section: "Site Details", required: true },
      { id: "postcode", label: "Postcode", type: "text", page: 1, section: "Site Details", required: true },
      { id: "job_number", label: "Job Number", type: "text", page: 1, section: "Site Details" },
      { id: "standby_current", label: "Standby Current", type: "number", page: 1, section: "Battery Calculation" },
      { id: "standby_time_hrs", label: "Standby Time (hrs)", type: "number", page: 1, section: "Battery Calculation" },
      { id: "alarm_current", label: "Alarm Current", type: "number", page: 1, section: "Battery Calculation" },
      { id: "min_battery_capacity", label: "Minimum Battery Capacity", type: "number", page: 1, section: "Battery Calculation" },
      { id: "design_battery_size", label: "Design Battery Size (Ah)", type: "text", page: 1, section: "Battery Calculation" },
      { id: "installed_battery_size", label: "Installed Battery Size (Ah)", type: "text", page: 1, section: "Battery Calculation" },
      { id: "panel_location", label: "Panel Located", type: "text", page: 1, section: "Loop Calculations" },
      { id: "no_of_loops", label: "No of Loops", type: "number", page: 1, section: "Loop Calculations" },
      { id: "test_name", label: "Test Carried Out By - Name", type: "text", page: 1, section: "Sign Off", required: true },
      { id: "test_meter_used", label: "Test Meter Used", type: "text", page: 1, section: "Sign Off" },
      { id: "serial_number", label: "Serial Number", type: "text", page: 1, section: "Sign Off" },
      { id: "test_date", label: "Date", type: "date", page: 1, section: "Sign Off", required: true },
      { id: "test_signature", label: "Signature", type: "signature", page: 1, section: "Sign Off", required: true },
    ],
  },
  {
    name: "Installation Certificate",
    form_code: "A056-G",
    description: "Fire Alarm Installation Certificate",
    customer_id: null,
    template_pdf_path: "/form-templates/Alarm_Installation_Certificate.pdf",
    page_count: 1,
    is_active: true,
    field_schema: [
      { id: "address", label: "Address", type: "text", page: 1, section: "Site Details", required: true },
      { id: "postcode", label: "Postcode", type: "text", page: 1, section: "Site Details", required: true },
      { id: "signatory_name", label: "Name", type: "text", page: 1, section: "Signatory", required: true },
      { id: "signatory_position", label: "Position", type: "text", page: 1, section: "Signatory" },
      { id: "signatory_date", label: "Date", type: "date", page: 1, section: "Signatory", required: true },
      { id: "signatory_signature", label: "Signature", type: "signature", page: 1, section: "Signatory", required: true },
      { id: "system_category", label: "Category of System", type: "text", page: 1, section: "System Details" },
      { id: "certificate_no", label: "Certificate No", type: "text", page: 1, section: "System Details" },
      { id: "agreed_variations", label: "Agreed Variations from Specification", type: "textarea", page: 1, section: "Variations" },
      { id: "variations_continuation", label: "Agreed Variations Continuation", type: "textarea", page: 1, section: "Variations" },
    ],
  },
  {
    name: "Cable Reading Certificates",
    form_code: "A058-G-CR",
    description: "Customer Fire Alarm Cable Readings",
    customer_id: null,
    template_pdf_path: "/form-templates/Alarm_Cable_Reading_Certificates.pdf",
    page_count: 1,
    is_active: true,
    field_schema: [
      { id: "panel_type", label: "Panel Type", type: "text", page: 1, section: "Panel Details" },
      { id: "panel_model", label: "Model Number", type: "text", page: 1, section: "Panel Details" },
      { id: "panel_location", label: "Panel Location", type: "text", page: 1, section: "Panel Details" },
      { id: "test_equipment", label: "Test Equipment", type: "text", page: 1, section: "Panel Details" },
      { id: "panel_description", label: "Description", type: "text", page: 1, section: "Panel Details" },
      { id: "equipment_serial", label: "Serial Number", type: "text", page: 1, section: "Panel Details" },
      { id: "cable_readings", label: "Cable Readings", type: "table", page: 1, section: "Readings",
        tableColumns: ["Loop/Zone/Sounder", "No of Points", "Size Live mm2", "R1+R2", "L-L Ω", "N-N Ω", "E-E Ω", "L-N MΩ", "L-E MΩ", "N-E MΩ", "Polarity", "Notes"],
        tableRows: 10 },
      { id: "engineer_name", label: "Engineer Name", type: "text", page: 1, section: "Sign Off", required: true },
      { id: "engineer_signature", label: "Engineer Signature", type: "signature", page: 1, section: "Sign Off", required: true },
    ],
  },
  {
    name: "Acceptance Certificate",
    form_code: "A038-H",
    description: "Fire Alarm Acceptance Certificate (BS5839-1:2025)",
    customer_id: null,
    template_pdf_path: "/form-templates/Alarm_Install_Acceptance_Certificate.pdf",
    page_count: 1,
    is_active: true,
    field_schema: [
      { id: "address", label: "Address", type: "text", page: 1, section: "Site Details", required: true },
      { id: "postcode", label: "Postcode", type: "text", page: 1, section: "Site Details", required: true },
      { id: "customer_name", label: "Customer Name", type: "text", page: 1, section: "Acceptance", required: true },
      { id: "customer_position", label: "Position", type: "text", page: 1, section: "Acceptance" },
      { id: "customer_date", label: "Date", type: "date", page: 1, section: "Acceptance", required: true },
      { id: "customer_signature", label: "Customer Signature", type: "signature", page: 1, section: "Acceptance", required: true },
      { id: "on_behalf_of", label: "For and on behalf of", type: "text", page: 1, section: "Acceptance" },
      { id: "extent_of_system", label: "Extent of System Covered", type: "textarea", page: 1, section: "System Details" },
      { id: "work_required", label: "Work Required Before Acceptance", type: "textarea", page: 1, section: "System Details" },
      { id: "variations", label: "Variations from BS5839-1:2025", type: "textarea", page: 1, section: "Variations" },
      { id: "trained_person_1", label: "Trained Person 1", type: "text", page: 1, section: "Training" },
      { id: "trained_person_2", label: "Trained Person 2", type: "text", page: 1, section: "Training" },
      { id: "trained_person_3", label: "Trained Person 3", type: "text", page: 1, section: "Training" },
      { id: "trained_person_4", label: "Trained Person 4", type: "text", page: 1, section: "Training" },
      { id: "installation_satisfactory", label: "All installation work appears to be satisfactory", type: "checkbox", page: 1, section: "Compliance Checks" },
      { id: "fire_alarm_signal", label: "System capable of giving fire alarm signal", type: "checkbox", page: 1, section: "Compliance Checks" },
      { id: "remote_transmission", label: "Remote transmission of alarms operates correctly", type: "checkbox", page: 1, section: "Compliance Checks" },
      { id: "as_fitted_drawings", label: "As fitted drawings provided", type: "checkbox", page: 1, section: "Documents Provided" },
      { id: "operating_instructions", label: "Operating and maintenance instructions provided", type: "checkbox", page: 1, section: "Documents Provided" },
      { id: "certificates_provided", label: "Certificates of design, installation & commissioning provided", type: "checkbox", page: 1, section: "Documents Provided" },
      { id: "log_book", label: "Log book provided", type: "checkbox", page: 1, section: "Documents Provided" },
      { id: "user_instructed", label: "User representatives properly instructed", type: "checkbox", page: 1, section: "Documents Provided" },
      { id: "tests_witnessed", label: "All relevant tests witnessed", type: "checkbox", page: 1, section: "Documents Provided" },
    ],
  },
  {
    name: "Commissioning Certificate",
    form_code: "A051-G",
    description: "Fire Alarm Commissioning Certificate (3 pages)",
    customer_id: null,
    template_pdf_path: "/form-templates/Alarm_Install_Commissioning_Certificate.pdf",
    page_count: 3,
    is_active: true,
    field_schema: [
      // Page 1 - Client & System Details
      { id: "client_name", label: "Client Name", type: "text", page: 1, section: "Client Details", required: true },
      { id: "client_address", label: "Client Address", type: "text", page: 1, section: "Client Details", required: true },
      { id: "client_postcode", label: "Client Postcode", type: "text", page: 1, section: "Client Details" },
      { id: "system_address", label: "System Address", type: "text", page: 1, section: "System Details" },
      { id: "system_is_new", label: "System is New", type: "checkbox", page: 1, section: "System Details" },
      { id: "extent_of_system", label: "Extent of System", type: "textarea", page: 1, section: "System Details" },
      { id: "system_category", label: "System Category", type: "text", page: 1, section: "System Details" },
      { id: "all_equipment_operates", label: "All equipment operates correctly", type: "checkbox", page: 1, section: "Examinations" },
      { id: "installation_acceptable", label: "Installation work is acceptable standard", type: "checkbox", page: 1, section: "Examinations" },
      { id: "system_inspected_tested", label: "System inspected and tested per BS5839", type: "checkbox", page: 1, section: "Examinations" },
      { id: "system_performs_spec", label: "System performs as required by specification", type: "text", page: 1, section: "Examinations" },
      { id: "no_false_alarm_potential", label: "No unacceptable rate of false alarms identified", type: "checkbox", page: 1, section: "Examinations" },
      { id: "documentation_provided", label: "Documentation provided to user", type: "checkbox", page: 1, section: "Examinations" },
      { id: "soak_test_weeks", label: "Soak Test Period (weeks)", type: "text", page: 1, section: "Examinations" },
      { id: "commissioning_variations", label: "Variations from BS5839-1", type: "textarea", page: 1, section: "Certificate" },
      { id: "engineer_name", label: "Commissioning Engineer Name", type: "text", page: 1, section: "Certificate", required: true },
      { id: "engineer_position", label: "Position", type: "text", page: 1, section: "Certificate" },
      { id: "engineer_date", label: "Date", type: "date", page: 1, section: "Certificate", required: true },
      { id: "engineer_signature", label: "Signature", type: "signature", page: 1, section: "Certificate", required: true },
      { id: "design_cert_no", label: "Design Certificate No", type: "text", page: 1, section: "Organisation Details" },
      { id: "installation_cert_no", label: "Installation Certificate No", type: "text", page: 1, section: "Organisation Details" },
      { id: "design_drawings_no", label: "Design Drawings No", type: "text", page: 1, section: "Organisation Details" },
      { id: "as_fitted_drawings_no", label: "As Fitted Drawings No", type: "text", page: 1, section: "Organisation Details" },
      // Page 2 - 32-item checklist (Y/N/N/A)
      ...Array.from({ length: 32 }, (_, i) => ({
        id: `checklist_item_${i + 1}`,
        label: `Item ${i + 1}`,
        type: "select" as const,
        page: 2,
        section: "Commissioning Checklist",
        options: ["Y", "N", "N/A"],
      })),
      // Page 3 - Incomplete work & final signature
      { id: "incomplete_work", label: "Work Not Completed", type: "textarea", page: 3, section: "Incomplete Work" },
      { id: "incomplete_reasons", label: "Reasons", type: "textarea", page: 3, section: "Incomplete Work" },
      { id: "final_signature", label: "Final Signature", type: "signature", page: 3, section: "Final Sign Off", required: true },
      { id: "final_print_name", label: "Print Name", type: "text", page: 3, section: "Final Sign Off", required: true },
    ],
  },
];

export async function getFormTemplates() {
  const { data, error } = await supabase
    .from("customer_form_templates")
    .select("*")
    .order("name");

  if (error) throw error;
  return (data || []) as unknown as FormTemplate[];
}

export async function getFormTemplate(id: string) {
  const { data, error } = await supabase
    .from("customer_form_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as unknown as FormTemplate;
}

export async function createFormTemplate(template: Omit<FormTemplate, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase
    .from("customer_form_templates")
    .insert(template as Record<string, unknown>)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as FormTemplate;
}

export async function seedChurchesFireTemplates(userId: string) {
  const existing = await getFormTemplates();
  const existingCodes = existing.map((t) => t.form_code);

  const toCreate = CHURCHES_FIRE_TEMPLATES.filter(
    (t) => !existingCodes.includes(t.form_code)
  );

  if (toCreate.length === 0) return existing;

  const { data, error } = await supabase
    .from("customer_form_templates")
    .insert(toCreate.map((t) => ({ ...t, created_by: userId }) as Record<string, unknown>))
    .select();

  if (error) throw error;
  return [...existing, ...(data as unknown as FormTemplate[])];
}

export async function getFormSubmissions(templateId?: string) {
  let query = supabase
    .from("customer_form_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (templateId) {
    query = query.eq("template_id", templateId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as FormSubmission[];
}

export async function getFormSubmission(id: string) {
  const { data, error } = await supabase
    .from("customer_form_submissions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as unknown as FormSubmission;
}

export async function createFormSubmission(submission: {
  template_id: string;
  site_id?: string;
  visit_id?: string;
  customer_id?: string;
  form_data: Record<string, unknown>;
  signatures: Record<string, string>;
  status: string;
  created_by: string;
}) {
  const { data, error } = await supabase
    .from("customer_form_submissions")
    .insert(submission as Record<string, unknown>)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as FormSubmission;
}

export async function updateFormSubmission(
  id: string,
  updates: {
    form_data?: Record<string, unknown>;
    signatures?: Record<string, string>;
    status?: string;
    completed_at?: string;
    completed_by?: string;
  }
) {
  const { data, error } = await supabase
    .from("customer_form_submissions")
    .update(updates as Record<string, unknown>)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as FormSubmission;
}

export async function deleteFormSubmission(id: string) {
  const { error } = await supabase
    .from("customer_form_submissions")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
