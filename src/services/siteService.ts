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
