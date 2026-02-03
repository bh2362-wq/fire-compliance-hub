import { supabase } from "@/integrations/supabase/client";
import { SERVICE_TYPES } from "@/services/serviceContractService";

export interface ContractAsset {
  id: string;
  contract_id: string;
  item_name: string;
  item_type: string | null;
  manufacturer: string | null;
  model: string | null;
  loops_count: number | null;
  zones_count: number | null;
  location: string | null;
  serial_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractAssetInsert {
  contract_id: string;
  item_name: string;
  item_type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  loops_count?: number | null;
  zones_count?: number | null;
  location?: string | null;
  serial_number?: string | null;
  notes?: string | null;
}

export async function getContractAssets(contractId: string): Promise<ContractAsset[]> {
  const { data, error } = await supabase
    .from("contract_assets")
    .select("*")
    .eq("contract_id", contractId)
    .order("item_name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createContractAsset(asset: ContractAssetInsert): Promise<ContractAsset> {
  const { data, error } = await supabase
    .from("contract_assets")
    .insert(asset)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateContractAsset(id: string, asset: Partial<ContractAssetInsert>): Promise<ContractAsset> {
  const { data, error } = await supabase
    .from("contract_assets")
    .update(asset)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteContractAsset(id: string): Promise<void> {
  const { error } = await supabase
    .from("contract_assets")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// Common asset item types by service type (matches SERVICE_TYPES from serviceContractService)
export const ASSET_ITEMS: Record<string, { value: string; label: string }[]> = {
  fire: [
    { value: "control_panel", label: "Control Panel" },
    { value: "repeater_panel", label: "Repeater Panel" },
    { value: "detector", label: "Detector" },
    { value: "call_point", label: "Call Point" },
    { value: "sounder", label: "Sounder" },
    { value: "beacon", label: "Beacon" },
    { value: "interface_unit", label: "Interface Unit" },
  ],
  aspirator: [
    { value: "aspirating_unit", label: "Aspirating Unit" },
    { value: "display_panel", label: "Display Panel" },
    { value: "sampling_point", label: "Sampling Point" },
  ],
  gas_suppression: [
    { value: "control_panel", label: "Control Panel" },
    { value: "cylinder", label: "Cylinder" },
    { value: "detector", label: "Detector" },
    { value: "release_panel", label: "Release Panel" },
    { value: "nozzle", label: "Discharge Nozzle" },
    { value: "abort_switch", label: "Abort Switch" },
  ],
  room_integrity: [
    { value: "door_holder", label: "Door Holder" },
    { value: "damper", label: "Damper" },
    { value: "seal", label: "Seal" },
    { value: "vent", label: "Vent" },
  ],
  fire_curtain: [
    { value: "fire_curtain", label: "Fire Curtain" },
    { value: "control_panel", label: "Control Panel" },
    { value: "motor", label: "Motor" },
    { value: "limit_switch", label: "Limit Switch" },
  ],
  disabled_refuge: [
    { value: "call_point", label: "Call Point" },
    { value: "master_station", label: "Master Station" },
    { value: "outstation", label: "Outstation" },
    { value: "handset", label: "Handset" },
  ],
  emergency_lighting: [
    { value: "luminaire", label: "Luminaire" },
    { value: "exit_sign", label: "Exit Sign" },
    { value: "central_battery", label: "Central Battery System" },
    { value: "test_switch", label: "Test Switch" },
  ],
  intruder_alarm: [
    { value: "control_panel", label: "Control Panel" },
    { value: "keypad", label: "Keypad" },
    { value: "pir_detector", label: "PIR Detector" },
    { value: "door_contact", label: "Door Contact" },
    { value: "sounder", label: "Sounder" },
    { value: "strobe", label: "Strobe" },
  ],
  nurse_call: [
    { value: "master_station", label: "Master Station" },
    { value: "call_point", label: "Call Point" },
    { value: "corridor_light", label: "Corridor Light" },
    { value: "pear_push", label: "Pear Push" },
    { value: "pull_cord", label: "Pull Cord" },
  ],
};

export function getAssetItemsForDiscipline(serviceType: string): { value: string; label: string }[] {
  return ASSET_ITEMS[serviceType] || ASSET_ITEMS.fire;
}

// Re-export SERVICE_TYPES for convenience
export { SERVICE_TYPES };
