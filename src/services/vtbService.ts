import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────

export type VTBRiskLevel = "High" | "Medium" | "Low";
export type VTBStatus = "draft" | "issued" | "superseded" | "archived";

export interface VTBTaskStep {
  step_number: number;
  title: string;
  description: string;           // concise, plain English
  tools_equipment: string[];     // list of tools/materials for this step
  safety_note: string;           // key safety point for this step
  photo_prompt: string;          // description of the photo that should be taken here
}

export interface VTBWorkLocation {
  description: string;           // overall description of work area
  access_notes: string;          // how operatives access the work area
  egress_notes: string;          // emergency egress / exit routes
  vehicle_routes: string;        // vehicle / delivery access
  exclusion_zones: string;       // areas operatives must not enter
  services: string;              // known services (electric, gas, comms, fire systems)
  hazard_areas: string;          // specific hazardous areas noted
}

export interface VTBTeamRole {
  role: string;                  // e.g. "Site Supervisor", "Fire Alarm Engineer"
  responsible_person: string;    // name or "TBC"
  competency_required: string;   // e.g. "FIA qualified, ECS card holder"
  qualifications: string;        // specific certs / training required
}

export interface VTBPPEItem {
  item: string;                  // e.g. "Safety Helmet"
  mandatory: boolean;
  specification: string;         // e.g. "EN 397 — hard hat"
  icon_key: string;              // for PDF icon lookup
}

export interface VisualTaskBriefing {
  id: string;
  vtb_reference: string;
  title: string;
  activity: string;
  risk_level: VTBRiskLevel;
  status: VTBStatus;
  rams_document_id: string | null;
  site_id: string | null;
  customer_id: string | null;
  principal_contractor: string | null;
  client_name: string | null;
  project_reference: string | null;
  prepared_by: string | null;
  prepared_date: string | null;
  reviewed_by: string | null;
  version: number;
  task_steps: VTBTaskStep[];
  work_location: VTBWorkLocation;
  team_roles: VTBTeamRole[];
  ppe_required: VTBPPEItem[];
  dos: string[];
  donts: string[];
  ai_generated: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  site?: { name: string; address: string | null } | null;
  rams_document?: { title: string; rams_number: string } | null;
}

// ── Standard PPE set for fire alarm work ─────────────────────────────────────

export const STANDARD_FA_PPE: VTBPPEItem[] = [
  { item: "Safety Helmet", mandatory: true,  specification: "EN 397 — Hard Hat", icon_key: "helmet" },
  { item: "Hi-Vis Vest / Jacket", mandatory: true,  specification: "EN ISO 20471 Class 2", icon_key: "hiviz" },
  { item: "Safety Footwear", mandatory: true,  specification: "EN ISO 20345 S1P — steel toe cap", icon_key: "boots" },
  { item: "Gloves", mandatory: true,  specification: "EN 388 — cut/abrasion resistant", icon_key: "gloves" },
  { item: "Eye Protection", mandatory: false, specification: "EN 166 — safety glasses / goggles", icon_key: "eye" },
  { item: "Ear Protection", mandatory: false, specification: "EN 352 — disposable ear plugs (SNR 28)", icon_key: "ear" },
  { item: "Dust Mask / RPE", mandatory: false, specification: "EN 149 FFP2 — if drilling/cutting", icon_key: "mask" },
  { item: "Knee Pads", mandatory: false, specification: "For floor-level device work", icon_key: "knee" },
];

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function getVTBs(options: {
  ramsDocumentId?: string;
  siteId?: string;
  status?: VTBStatus;
} = {}): Promise<VisualTaskBriefing[]> {
  let q = supabase
    .from("visual_task_briefings")
    .select("*, site:sites!visual_task_briefings_site_id_fkey(name, address), rams_document:rams_documents!visual_task_briefings_rams_document_id_fkey(title, rams_number)")
    .order("created_at", { ascending: false });

  if (options.ramsDocumentId) q = q.eq("rams_document_id", options.ramsDocumentId);
  if (options.siteId)         q = q.eq("site_id", options.siteId);
  if (options.status)         q = q.eq("status", options.status);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(normalise) as VisualTaskBriefing[];
}

export async function getVTB(id: string): Promise<VisualTaskBriefing> {
  const { data, error } = await supabase
    .from("visual_task_briefings")
    .select("*, site:sites!visual_task_briefings_site_id_fkey(name, address), rams_document:rams_documents!visual_task_briefings_rams_document_id_fkey(title, rams_number)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return normalise(data) as VisualTaskBriefing;
}

function normalise(d: Record<string, unknown>): Partial<VisualTaskBriefing> {
  return {
    ...d,
    task_steps:   Array.isArray(d.task_steps)   ? d.task_steps   as VTBTaskStep[]  : [],
    work_location:(d.work_location && typeof d.work_location === "object" ? d.work_location : {}) as VTBWorkLocation,
    team_roles:   Array.isArray(d.team_roles)   ? d.team_roles   as VTBTeamRole[]  : [],
    ppe_required: Array.isArray(d.ppe_required) ? d.ppe_required as VTBPPEItem[]   : [],
    dos:          Array.isArray(d.dos)           ? d.dos          as string[]       : [],
    donts:        Array.isArray(d.donts)         ? d.donts        as string[]       : [],
  };
}

export async function createVTB(
  data: Omit<VisualTaskBriefing, "id" | "vtb_reference" | "created_at" | "updated_at" | "site" | "rams_document">
): Promise<VisualTaskBriefing> {
  const { data: row, error } = await supabase
    .from("visual_task_briefings")
    .insert({ ...data, vtb_reference: "" } as any)
    .select()
    .single();
  if (error) throw error;
  return normalise(row) as VisualTaskBriefing;
}

export async function updateVTB(
  id: string,
  updates: Partial<VisualTaskBriefing>
): Promise<VisualTaskBriefing> {
  const { data, error } = await supabase
    .from("visual_task_briefings")
    .update(updates as any)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return normalise(data) as VisualTaskBriefing;
}

export async function deleteVTB(id: string): Promise<void> {
  const { error } = await supabase.from("visual_task_briefings").delete().eq("id", id);
  if (error) throw error;
}

// ── Risk level colours ─────────────────────────────────────────────────────────

export const RISK_CONFIG: Record<VTBRiskLevel, { bg: string; text: string; border: string }> = {
  High:   { bg: "bg-red-100",    text: "text-red-800",    border: "border-red-300"   },
  Medium: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300"},
  Low:    { bg: "bg-green-100",  text: "text-green-800",  border: "border-green-300" },
};
