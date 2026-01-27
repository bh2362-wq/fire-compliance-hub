import { supabase } from "@/integrations/supabase/client";

export interface Site {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  total_devices: number | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteFormData {
  name: string;
  address?: string;
  city?: string;
  postcode?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
}

export interface DeviceImport {
  loop: string;
  address: string;
  device_type: string;
  location?: string;
  zone?: string;
}

export async function getSites(): Promise<{ sites: Site[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("sites")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;
    return { sites: data || [], error: null };
  } catch (error) {
    console.error("Error fetching sites:", error);
    return { sites: [], error: error as Error };
  }
}

export async function getSiteById(id: string): Promise<{ site: Site | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("sites")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return { site: data, error: null };
  } catch (error) {
    console.error("Error fetching site:", error);
    return { site: null, error: error as Error };
  }
}

export async function createSite(data: SiteFormData): Promise<{ site: Site | null; error: Error | null }> {
  try {
    const { data: site, error } = await supabase
      .from("sites")
      .insert({
        name: data.name,
        address: data.address || null,
        city: data.city || null,
        postcode: data.postcode || null,
        contact_name: data.contact_name || null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        status: "active",
      })
      .select()
      .single();

    if (error) throw error;
    return { site, error: null };
  } catch (error) {
    console.error("Error creating site:", error);
    return { site: null, error: error as Error };
  }
}

export async function updateSite(id: string, data: SiteFormData): Promise<{ site: Site | null; error: Error | null }> {
  try {
    const { data: site, error } = await supabase
      .from("sites")
      .update({
        name: data.name,
        address: data.address || null,
        city: data.city || null,
        postcode: data.postcode || null,
        contact_name: data.contact_name || null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { site, error: null };
  } catch (error) {
    console.error("Error updating site:", error);
    return { site: null, error: error as Error };
  }
}

export async function deleteSite(id: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("sites")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error("Error deleting site:", error);
    return { error: error as Error };
  }
}

export async function getSiteDevices(siteId: string) {
  try {
    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("site_id", siteId)
      .order("loop", { ascending: true })
      .order("address", { ascending: true });

    if (error) throw error;
    return { devices: data || [], error: null };
  } catch (error) {
    console.error("Error fetching site devices:", error);
    return { devices: [], error: error as Error };
  }
}

export async function importDevices(
  siteId: string,
  devices: DeviceImport[]
): Promise<{ imported: number; errors: string[]; error: Error | null }> {
  const errors: string[] = [];
  let imported = 0;

  try {
    // Insert devices in batches
    const batchSize = 50;
    for (let i = 0; i < devices.length; i += batchSize) {
      const batch = devices.slice(i, i + batchSize).map((d) => ({
        site_id: siteId,
        loop: d.loop,
        address: d.address,
        device_type: d.device_type,
        location: d.location || null,
        zone: d.zone || null,
        status: "active",
      }));

      const { data, error } = await supabase
        .from("devices")
        .upsert(batch, { 
          onConflict: "site_id,loop,address",
          ignoreDuplicates: false 
        })
        .select();

      if (error) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        imported += data?.length || 0;
      }
    }

    // Update site total_devices count
    const { count } = await supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId);

    await supabase
      .from("sites")
      .update({ total_devices: count || 0 })
      .eq("id", siteId);

    return { imported, errors, error: null };
  } catch (error) {
    console.error("Error importing devices:", error);
    return { imported, errors, error: error as Error };
  }
}

export function parseDeviceCSV(content: string): { devices: DeviceImport[]; errors: string[] } {
  const errors: string[] = [];
  const devices: DeviceImport[] = [];

  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());

  if (lines.length < 2) {
    errors.push("CSV must contain headers and at least one data row");
    return { devices, errors };
  }

  // Parse headers
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  
  // Find column indices
  const loopIdx = headers.findIndex((h) => ["loop", "loop_no", "circuit"].includes(h));
  const addrIdx = headers.findIndex((h) => ["address", "addr", "point"].includes(h));
  const typeIdx = headers.findIndex((h) => ["type", "device_type", "device", "equipment"].includes(h));
  const locIdx = headers.findIndex((h) => ["location", "loc", "description", "desc"].includes(h));
  const zoneIdx = headers.findIndex((h) => ["zone", "area"].includes(h));

  if (loopIdx === -1 || addrIdx === -1 || typeIdx === -1) {
    errors.push("CSV must contain loop, address, and type columns");
    return { devices, errors };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    
    const loop = values[loopIdx];
    const address = values[addrIdx];
    const device_type = values[typeIdx];

    if (!loop || !address || !device_type) {
      errors.push(`Row ${i + 1}: Missing required field (loop, address, or type)`);
      continue;
    }

    devices.push({
      loop,
      address,
      device_type,
      location: locIdx >= 0 ? values[locIdx] : undefined,
      zone: zoneIdx >= 0 ? values[zoneIdx] : undefined,
    });
  }

  return { devices, errors };
}

export function parseDeviceRows(rows: Record<string, unknown>[]): { devices: DeviceImport[]; errors: string[] } {
  const errors: string[] = [];
  const devices: DeviceImport[] = [];

  if (rows.length === 0) {
    errors.push("No data rows found in the sheet");
    return { devices, errors };
  }

  // Get headers from first row keys (normalized to lowercase)
  const sampleRow = rows[0];
  const headerMap = new Map<string, string>();
  
  Object.keys(sampleRow).forEach((key) => {
    headerMap.set(key.toLowerCase().trim(), key);
  });

  // Find column mappings
  const findColumn = (aliases: string[]): string | null => {
    for (const alias of aliases) {
      const key = headerMap.get(alias);
      if (key) return key;
    }
    return null;
  };

  const loopCol = findColumn(["loop", "loop_no", "circuit"]);
  const addrCol = findColumn(["address", "addr", "point"]);
  const typeCol = findColumn(["type", "device_type", "device", "equipment"]);
  const locCol = findColumn(["location", "loc", "description", "desc"]);
  const zoneCol = findColumn(["zone", "area"]);

  if (!loopCol || !addrCol || !typeCol) {
    errors.push("Sheet must contain loop, address, and type columns");
    return { devices, errors };
  }

  // Parse data rows
  rows.forEach((row, i) => {
    const loop = String(row[loopCol] ?? "").trim();
    const address = String(row[addrCol] ?? "").trim();
    const device_type = String(row[typeCol] ?? "").trim();

    if (!loop || !address || !device_type) {
      errors.push(`Row ${i + 2}: Missing required field (loop, address, or type)`);
      return;
    }

    devices.push({
      loop,
      address,
      device_type,
      location: locCol ? String(row[locCol] ?? "").trim() || undefined : undefined,
      zone: zoneCol ? String(row[zoneCol] ?? "").trim() || undefined : undefined,
    });
  });

  return { devices, errors };
}

export interface ColumnMapping {
  loop: string | null;
  address: string | null;
  type: string | null;
  location: string | null;
  zone: string | null;
}

export function detectColumnMapping(columns: string[]): { mapping: Partial<ColumnMapping>; complete: boolean } {
  const headerMap = new Map<string, string>();
  columns.forEach((col) => {
    headerMap.set(col.toLowerCase().trim(), col);
  });

  const findColumn = (aliases: string[]): string | null => {
    for (const alias of aliases) {
      const key = headerMap.get(alias);
      if (key) return key;
    }
    return null;
  };

  const mapping: Partial<ColumnMapping> = {
    loop: findColumn(["loop", "loop_no", "circuit"]),
    address: findColumn(["address", "addr", "point"]),
    type: findColumn(["type", "device_type", "device", "equipment"]),
    location: findColumn(["location", "loc", "description", "desc"]),
    zone: findColumn(["zone", "area"]),
  };

  const complete = !!(mapping.loop && mapping.address && mapping.type);

  return { mapping, complete };
}

export interface ManualValues {
  loop?: string;
  address?: string;
  type?: string;
  location?: string;
  zone?: string;
}

export interface BulkReplace {
  find: string;
  replace: string;
}

export interface BulkReplaceMap {
  loop?: BulkReplace;
  address?: BulkReplace;
  type?: BulkReplace;
  location?: BulkReplace;
  zone?: BulkReplace;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyBulkReplace(value: string, bulkReplace?: BulkReplace): string {
  if (!bulkReplace?.find) return value;
  return value.replace(new RegExp(escapeRegExp(bulkReplace.find), 'g'), bulkReplace.replace || '');
}

export function parseDeviceRowsWithMapping(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  manualValues: ManualValues = {},
  bulkReplaces: BulkReplaceMap = {}
): { devices: DeviceImport[]; errors: string[] } {
  const errors: string[] = [];
  const devices: DeviceImport[] = [];

  if (rows.length === 0) {
    errors.push("No data rows found in the sheet");
    return { devices, errors };
  }

  // Check if required fields have either a mapping or a manual value
  const hasLoop = mapping.loop || manualValues.loop?.trim();
  const hasAddress = mapping.address || manualValues.address?.trim();
  const hasType = mapping.type || manualValues.type?.trim();

  if (!hasLoop || !hasAddress || !hasType) {
    errors.push("Required columns (loop, address, type) must be mapped or manually provided");
    return { devices, errors };
  }

  rows.forEach((row, i) => {
    // Use manual value if column not mapped, otherwise use column value
    let loop = manualValues.loop?.trim() || (mapping.loop ? String(row[mapping.loop] ?? "").trim() : "");
    let address = manualValues.address?.trim() || (mapping.address ? String(row[mapping.address] ?? "").trim() : "");
    let device_type = manualValues.type?.trim() || (mapping.type ? String(row[mapping.type] ?? "").trim() : "");

    // Apply bulk replacements if not using manual values
    if (!manualValues.loop?.trim()) {
      loop = applyBulkReplace(loop, bulkReplaces.loop);
    }
    if (!manualValues.address?.trim()) {
      address = applyBulkReplace(address, bulkReplaces.address);
    }
    if (!manualValues.type?.trim()) {
      device_type = applyBulkReplace(device_type, bulkReplaces.type);
    }

    if (!loop || !address || !device_type) {
      errors.push(`Row ${i + 2}: Missing required field (loop, address, or type)`);
      return;
    }

    // For optional fields, prefer manual value, then column value with bulk replace
    let location: string | undefined;
    if (manualValues.location?.trim()) {
      location = manualValues.location.trim();
    } else if (mapping.location) {
      location = String(row[mapping.location] ?? "").trim() || undefined;
      if (location) {
        location = applyBulkReplace(location, bulkReplaces.location);
      }
    }

    let zone: string | undefined;
    if (manualValues.zone?.trim()) {
      zone = manualValues.zone.trim();
    } else if (mapping.zone) {
      zone = String(row[mapping.zone] ?? "").trim() || undefined;
      if (zone) {
        zone = applyBulkReplace(zone, bulkReplaces.zone);
      }
    }

    devices.push({
      loop,
      address,
      device_type,
      location,
      zone,
    });
  });

  return { devices, errors };
}
