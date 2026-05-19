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
  sharepoint_folder: string | null;
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
): Promise<{ imported: number; skipped: number; errors: string[]; error: Error | null }> {
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  try {
    // First, fetch existing devices for this site to check for duplicates
    const { data: existingDevices, error: fetchError } = await supabase
      .from("devices")
      .select("loop, address")
      .eq("site_id", siteId);

    if (fetchError) {
      throw fetchError;
    }

    // Create a Set of existing device keys for fast lookup
    const existingKeys = new Set(
      (existingDevices || []).map((d) => `${d.loop}-${d.address}`)
    );

    // Filter out duplicates
    const newDevices = devices.filter((d) => {
      const key = `${d.loop}-${d.address}`;
      if (existingKeys.has(key)) {
        skipped++;
        return false;
      }
      return true;
    });

    if (newDevices.length === 0) {
      return { imported: 0, skipped, errors, error: null };
    }

    // Insert only new devices in batches
    const batchSize = 50;
    for (let i = 0; i < newDevices.length; i += batchSize) {
      const batch = newDevices.slice(i, i + batchSize).map((d) => ({
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
        .insert(batch)
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

    return { imported, skipped, errors, error: null };
  } catch (error) {
    console.error("Error importing devices:", error);
    return { imported, skipped, errors, error: error as Error };
  }
}

// Header alias dictionaries used by both CSV and spreadsheet parsers.
const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  loop: ["loop", "loop no", "loopno", "loop number", "loop#", "lp", "lp no", "circuit", "circuit no"],
  address: ["address", "addr", "device address", "device addr", "point address", "point", "addr no", "address no", "device id", "device no"],
  type: ["device type", "type", "type description", "device description", "device", "equipment", "equipment type", "model", "device model", "part", "part no", "part number"],
  location: ["location", "loc", "device location", "description", "desc", "area description", "room", "place", "fitted location"],
  zone: ["zone", "zone no", "zone number", "zone description", "area", "zone area"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[\s._\-/\\#]+/g, " ").replace(/\s+/g, " ").trim();
}

function findColumnFuzzy(columns: string[], aliases: string[]): string | null {
  const lookup = new Map<string, string>();
  columns.forEach((c) => {
    const n = normalizeHeader(c);
    if (n && !lookup.has(n)) lookup.set(n, c);
  });
  const normAliases = aliases.map(normalizeHeader).filter(Boolean);

  // 1. Exact normalized match
  for (const a of normAliases) {
    const hit = lookup.get(a);
    if (hit) return hit;
  }
  // 2. Contains match (header contains alias or alias contains header)
  for (const a of normAliases) {
    for (const [norm, orig] of lookup.entries()) {
      if (norm.includes(a) || a.includes(norm)) return orig;
    }
  }
  return null;
}

// Proper CSV line parser - handles quoted fields containing commas/quotes
function parseCSVLine(line: string, delimiter = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim().replace(/^["']|["']$/g, ""));
}

function detectDelimiter(content: string): string {
  const head = content.split("\n").slice(0, 5).join("\n");
  const c = (head.match(/,/g) || []).length;
  const s = (head.match(/;/g) || []).length;
  const t = (head.match(/\t/g) || []).length;
  if (t > c && t > s) return "\t";
  if (s > c) return ";";
  return ",";
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

  const delimiter = detectDelimiter(content);
  const headers = parseCSVLine(lines[0], delimiter);

  const loopCol = findColumnFuzzy(headers, COLUMN_ALIASES.loop);
  const addrCol = findColumnFuzzy(headers, COLUMN_ALIASES.address);
  const typeCol = findColumnFuzzy(headers, COLUMN_ALIASES.type);
  const locCol = findColumnFuzzy(headers, COLUMN_ALIASES.location);
  const zoneCol = findColumnFuzzy(headers, COLUMN_ALIASES.zone);

  if (!loopCol || !addrCol || !typeCol) {
    errors.push("CSV must contain loop, address, and type columns");
    return { devices, errors };
  }

  const loopIdx = headers.indexOf(loopCol);
  const addrIdx = headers.indexOf(addrCol);
  const typeIdx = headers.indexOf(typeCol);
  const locIdx = locCol ? headers.indexOf(locCol) : -1;
  const zoneIdx = zoneCol ? headers.indexOf(zoneCol) : -1;

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
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
      location: locIdx >= 0 ? values[locIdx] || undefined : undefined,
      zone: zoneIdx >= 0 ? values[zoneIdx] || undefined : undefined,
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

  const columns = Object.keys(rows[0]);
  const loopCol = findColumnFuzzy(columns, COLUMN_ALIASES.loop);
  const addrCol = findColumnFuzzy(columns, COLUMN_ALIASES.address);
  const typeCol = findColumnFuzzy(columns, COLUMN_ALIASES.type);
  const locCol = findColumnFuzzy(columns, COLUMN_ALIASES.location);
  const zoneCol = findColumnFuzzy(columns, COLUMN_ALIASES.zone);

  if (!loopCol || !addrCol || !typeCol) {
    errors.push("Sheet must contain loop, address, and type columns");
    return { devices, errors };
  }

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
  const mapping: Partial<ColumnMapping> = {
    loop: findColumnFuzzy(columns, COLUMN_ALIASES.loop),
    address: findColumnFuzzy(columns, COLUMN_ALIASES.address),
    type: findColumnFuzzy(columns, COLUMN_ALIASES.type),
    location: findColumnFuzzy(columns, COLUMN_ALIASES.location),
    zone: findColumnFuzzy(columns, COLUMN_ALIASES.zone),
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
