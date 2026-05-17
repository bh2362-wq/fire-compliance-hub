import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface RamsHazard {
  id: string;
  hazard: string;
  who_affected: string;
  existing_controls: string;
  likelihood: number;
  severity: number;
  risk_level: string;
  additional_controls: string;
  residual_likelihood: number;
  residual_severity: number;
  residual_risk: string;
  [key: string]: string | number; // Index signature for JSON compatibility
}

export interface MethodStatement {
  step_number: number;
  description: string;
  responsible_person: string;
  equipment_required: string;
  [key: string]: string | number; // Index signature for JSON compatibility
}

export interface RamsTemplate {
  id: string;
  name: string;
  description: string | null;
  service_type: string | null;
  hazards: RamsHazard[];
  method_statements: MethodStatement[];
  ppe_requirements: string[];
  emergency_procedures: string | null;
  site_specific_hazards: string | null;
  site_access_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RamsDocument {
  id: string;
  rams_number: string;
  title: string;
  template_id: string | null;
  site_id: string | null;
  visit_id: string | null;
  contract_id: string | null;
  hazards: RamsHazard[];
  method_statements: MethodStatement[];
  ppe_requirements: string[];
  emergency_procedures: string | null;
  site_specific_hazards: string | null;
  site_access_notes: string | null;
  status: string;
  version: number;
  parent_version_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  review_date: string | null;
  preparer_signature: string | null;
  preparer_signed_at: string | null;
  preparer_name: string | null;
  reviewer_signature: string | null;
  reviewer_signed_at: string | null;
  reviewer_name: string | null;
  client_signature: string | null;
  client_signed_at: string | null;
  client_name: string | null;
  sent_at: string | null;
  sent_to: string[] | null;
  sent_by: string | null;
  accepted_at: string | null;
  accepted_by_name: string | null;
  acceptance_signature: string | null;
  acceptance_token: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  site?: { id: string; name: string; address: string | null; customer_id: string | null; customers?: { name: string } | null };
  visit?: { id: string; visit_date: string; visit_type: string };
  contract?: { id: string; service_type: string };
  template?: { id: string; name: string };
}

export interface RamsVersion {
  id: string;
  rams_document_id: string;
  version_number: number;
  changes_summary: string | null;
  document_snapshot: unknown;
  created_by: string;
  created_at: string;
}

// Calculate risk level from likelihood and severity (1-5 scale)
export function calculateRiskLevel(likelihood: number, severity: number): string {
  const score = likelihood * severity;
  if (score <= 4) return "Low";
  if (score <= 9) return "Medium";
  if (score <= 15) return "High";
  return "Very High";
}

// Helper to parse JSONB fields
function parseTemplate(data: any): RamsTemplate {
  return {
    ...data,
    hazards: (Array.isArray(data.hazards) ? data.hazards : []) as RamsHazard[],
    method_statements: (Array.isArray(data.method_statements) ? data.method_statements : []) as MethodStatement[],
    ppe_requirements: Array.isArray(data.ppe_requirements) ? data.ppe_requirements : [],
  };
}

function parseDocument(data: any): RamsDocument {
  return {
    ...data,
    hazards: (Array.isArray(data.hazards) ? data.hazards : []) as RamsHazard[],
    method_statements: (Array.isArray(data.method_statements) ? data.method_statements : []) as MethodStatement[],
    ppe_requirements: Array.isArray(data.ppe_requirements) ? data.ppe_requirements : [],
  };
}

// Templates
export async function getRamsTemplates(): Promise<RamsTemplate[]> {
  const { data, error } = await supabase
    .from("rams_templates")
    .select("*")
    .order("name");

  if (error) throw error;
  return (data || []).map(parseTemplate);
}

export async function getRamsTemplate(id: string): Promise<RamsTemplate | null> {
  const { data, error } = await supabase
    .from("rams_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return parseTemplate(data);
}

export async function createRamsTemplate(
  template: Omit<RamsTemplate, "id" | "created_at" | "updated_at">
): Promise<RamsTemplate> {
  const { data, error } = await supabase
    .from("rams_templates")
    .insert({
      name: template.name,
      description: template.description,
      service_type: template.service_type,
      hazards: template.hazards as unknown as Json,
      method_statements: template.method_statements as unknown as Json,
      ppe_requirements: template.ppe_requirements,
      emergency_procedures: template.emergency_procedures,
      site_specific_hazards: template.site_specific_hazards,
      site_access_notes: template.site_access_notes,
      created_by: template.created_by,
    })
    .select()
    .single();

  if (error) throw error;
  return parseTemplate(data);
}

export async function updateRamsTemplate(
  id: string,
  updates: Partial<RamsTemplate>
): Promise<RamsTemplate> {
  const updateData: Record<string, any> = { ...updates };
  if (updates.hazards) {
    updateData.hazards = updates.hazards as unknown as Json;
  }
  if (updates.method_statements) {
    updateData.method_statements = updates.method_statements as unknown as Json;
  }
  // Remove joined fields
  delete updateData.id;
  delete updateData.created_at;
  delete updateData.updated_at;

  const { data, error } = await supabase
    .from("rams_templates")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return parseTemplate(data);
}

export async function deleteRamsTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("rams_templates").delete().eq("id", id);
  if (error) throw error;
}

// Documents
export async function getRamsDocuments(): Promise<RamsDocument[]> {
  const { data, error } = await supabase
    .from("rams_documents")
    .select(`
      *,
      site:sites(id, name, address, customer_id, customers(name)),
      visit:visits(id, visit_date, visit_type),
      contract:site_service_contracts(id, service_type),
      template:rams_templates(id, name)
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(parseDocument);
}

export async function getRamsDocument(id: string): Promise<RamsDocument | null> {
  const { data, error } = await supabase
    .from("rams_documents")
    .select(`
      *,
      site:sites(id, name, address, customer_id, customers(name)),
      visit:visits(id, visit_date, visit_type),
      contract:site_service_contracts(id, service_type),
      template:rams_templates(id, name)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return parseDocument(data);
}

export async function getRamsDocumentsBySite(siteId: string): Promise<RamsDocument[]> {
  const { data, error } = await supabase
    .from("rams_documents")
    .select(`
      *,
      site:sites(id, name, address, customer_id, customers(name)),
      visit:visits(id, visit_date, visit_type),
      contract:site_service_contracts(id, service_type),
      template:rams_templates(id, name)
    `)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(parseDocument);
}

export async function createRamsDocument(
  doc: Omit<RamsDocument, "id" | "rams_number" | "created_at" | "updated_at" | "site" | "visit" | "contract" | "template">
): Promise<RamsDocument> {
  // Get next RAMS number
  const { data: ramsNumber, error: numError } = await supabase.rpc("get_next_qms_number", {
    prefix: "RAMS",
  });
  if (numError) throw numError;

  const { data, error } = await supabase
    .from("rams_documents")
    .insert({
      rams_number: ramsNumber,
      title: doc.title,
      template_id: doc.template_id,
      site_id: doc.site_id,
      visit_id: doc.visit_id,
      contract_id: doc.contract_id,
      hazards: doc.hazards as unknown as Json,
      method_statements: doc.method_statements as unknown as Json,
      ppe_requirements: doc.ppe_requirements,
      emergency_procedures: doc.emergency_procedures,
      site_specific_hazards: doc.site_specific_hazards,
      site_access_notes: doc.site_access_notes,
      status: doc.status,
      version: doc.version,
      parent_version_id: doc.parent_version_id,
      approved_by: doc.approved_by,
      approved_at: doc.approved_at,
      review_date: doc.review_date,
      preparer_signature: doc.preparer_signature,
      preparer_signed_at: doc.preparer_signed_at,
      preparer_name: doc.preparer_name,
      reviewer_signature: doc.reviewer_signature,
      reviewer_signed_at: doc.reviewer_signed_at,
      reviewer_name: doc.reviewer_name,
      client_signature: doc.client_signature,
      client_signed_at: doc.client_signed_at,
      client_name: doc.client_name,
      created_by: doc.created_by,
    })
    .select(`
      *,
      site:sites(id, name, address, customer_id, customers(name)),
      visit:visits(id, visit_date, visit_type),
      contract:site_service_contracts(id, service_type),
      template:rams_templates(id, name)
    `)
    .single();

  if (error) throw error;
  return parseDocument(data);
}

export async function updateRamsDocument(
  id: string,
  updates: Partial<RamsDocument>
): Promise<RamsDocument> {
  const updateData: Record<string, any> = { ...updates };
  if (updates.hazards) {
    updateData.hazards = updates.hazards as unknown as Json;
  }
  if (updates.method_statements) {
    updateData.method_statements = updates.method_statements as unknown as Json;
  }
  // Remove joined fields
  delete updateData.id;
  delete updateData.rams_number;
  delete updateData.created_at;
  delete updateData.updated_at;
  delete updateData.site;
  delete updateData.visit;
  delete updateData.contract;
  delete updateData.template;

  const { data, error } = await supabase
    .from("rams_documents")
    .update(updateData)
    .eq("id", id)
    .select(`
      *,
      site:sites(id, name, address, customer_id, customers(name)),
      visit:visits(id, visit_date, visit_type),
      contract:site_service_contracts(id, service_type),
      template:rams_templates(id, name)
    `)
    .single();

  if (error) throw error;
  return parseDocument(data);
}

export async function deleteRamsDocument(id: string): Promise<void> {
  const { error } = await supabase.from("rams_documents").delete().eq("id", id);
  if (error) throw error;
}

// Version history
export async function getRamsVersions(documentId: string): Promise<RamsVersion[]> {
  const { data, error } = await supabase
    .from("rams_versions")
    .select("*")
    .eq("rams_document_id", documentId)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createRamsVersion(
  documentId: string,
  versionNumber: number,
  changesSummary: string,
  snapshot: Record<string, unknown>,
  userId: string
): Promise<RamsVersion> {
  const { data, error } = await supabase
    .from("rams_versions")
    .insert({
      rams_document_id: documentId,
      version_number: versionNumber,
      changes_summary: changesSummary,
      document_snapshot: snapshot as unknown as Json,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Create new version of document (for versioning)
export async function createNewDocumentVersion(
  originalDoc: RamsDocument,
  updates: Partial<RamsDocument>,
  changesSummary: string,
  userId: string
): Promise<RamsDocument> {
  // First save current version to history
  await createRamsVersion(
    originalDoc.id,
    originalDoc.version,
    `Version ${originalDoc.version} archived`,
    originalDoc as unknown as Record<string, unknown>,
    userId
  );

  // Update document with new version
  const newVersion = originalDoc.version + 1;
  const updatedDoc = await updateRamsDocument(originalDoc.id, {
    ...updates,
    version: newVersion,
    status: "draft", // Reset to draft for new version
  });

  // Create new version record
  await createRamsVersion(
    originalDoc.id,
    newVersion,
    changesSummary,
    updatedDoc as unknown as Record<string, unknown>,
    userId
  );

  return updatedDoc;
}

// Default PPE options
export const DEFAULT_PPE_OPTIONS = [
  "Safety Boots",
  "Hard Hat",
  "Hi-Vis Vest",
  "Safety Glasses",
  "Ear Protection",
  "Dust Mask",
  "Gloves",
  "Face Shield",
  "Fall Protection Harness",
  "Knee Pads",
];

// Default hazard categories for fire alarm work
export const DEFAULT_HAZARD_CATEGORIES = [
  "Working at Height",
  "Electrical Hazards",
  "Manual Handling",
  "Lone Working",
  "Slips, Trips and Falls",
  "Hot Works",
  "Confined Spaces",
  "Asbestos",
  "Fire",
  "Moving Vehicles",
  "Noise",
  "Dust",
];
