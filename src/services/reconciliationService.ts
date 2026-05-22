import { supabase } from "@/integrations/supabase/client";

export interface Device {
  id: string;
  site_id: string;
  loop: string;
  address: string;
  device_type: string;
  location: string | null;
  zone: string | null;
  status: string | null;
  last_tested_at: string | null;
}

export interface ParsedDeviceTest {
  id: string;
  upload_id: string;
  loop: string;
  address: string;
  device_type: string | null;
  location: string | null;
  status: string;
  matched: boolean | null;
  device_id: string | null;
}

export interface ReconciliationResult {
  siteId: string;
  uploadId: string;
  totalInventory: number;
  totalTested: number;
  matched: ReconciliationMatch[];
  unmatched: ParsedDeviceTest[];
  missing: Device[];
  coverage: number;
  passRate: number;
  summary: {
    matched: number;
    unmatched: number;
    missing: number;
    passed: number;
    faults: number;
  };
}

export interface ReconciliationMatch {
  device: Device;
  test: ParsedDeviceTest;
  status: "passed" | "fault" | "untested" | "unknown";
}

export async function getSiteDevices(siteId: string): Promise<{ devices: Device[]; error: Error | null }> {
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

export async function getUploadTests(uploadId: string): Promise<{ tests: ParsedDeviceTest[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("parsed_device_tests")
      .select("*")
      .eq("upload_id", uploadId)
      .order("loop", { ascending: true })
      .order("address", { ascending: true });

    if (error) throw error;

    return { tests: data || [], error: null };
  } catch (error) {
    console.error("Error fetching upload tests:", error);
    return { tests: [], error: error as Error };
  }
}

export async function reconcileDevices(
  siteId: string,
  uploadId: string
): Promise<{ result: ReconciliationResult | null; error: Error | null }> {
  try {
    // Fetch both datasets in parallel
    const [devicesResult, testsResult] = await Promise.all([
      getSiteDevices(siteId),
      getUploadTests(uploadId),
    ]);

    if (devicesResult.error) throw devicesResult.error;
    if (testsResult.error) throw testsResult.error;

    const devices = devicesResult.devices;
    const tests = testsResult.tests;

    // Create a map for quick device lookup by loop-address
    const deviceMap = new Map<string, Device>();
    devices.forEach((device) => {
      const key = `${device.loop.trim()}-${device.address.trim()}`.toLowerCase();
      deviceMap.set(key, device);
    });

    // Track which devices have been matched
    const matchedDeviceIds = new Set<string>();
    const matched: ReconciliationMatch[] = [];
    const unmatched: ParsedDeviceTest[] = [];

    // Process each test result
    for (const test of tests) {
      const key = `${test.loop.trim()}-${test.address.trim()}`.toLowerCase();
      const device = deviceMap.get(key);

      if (device) {
        matchedDeviceIds.add(device.id);
        matched.push({
          device,
          test,
          status: test.status as "passed" | "fault" | "untested" | "unknown",
        });

        // Update the parsed_device_tests record with the matched device_id
        await supabase
          .from("parsed_device_tests")
          .update({ matched: true, device_id: device.id })
          .eq("id", test.id);
      } else {
        unmatched.push(test);
      }
    }

    // Find devices that weren't tested (missing from upload)
    const missing = devices.filter((device) => !matchedDeviceIds.has(device.id));

    // Calculate statistics
    const totalInventory = devices.length;
    const totalTested = matched.length;
    const coverage = totalInventory > 0 ? Math.round((totalTested / totalInventory) * 100) : 0;
    const passedCount = matched.filter((m) => m.status === "passed").length;
    const faultCount = matched.filter((m) => m.status === "fault").length;
    const passRate = totalTested > 0 ? Math.round((passedCount / totalTested) * 100) : 0;

    const result: ReconciliationResult = {
      siteId,
      uploadId,
      totalInventory,
      totalTested,
      matched,
      unmatched,
      missing,
      coverage,
      passRate,
      summary: {
        matched: matched.length,
        unmatched: unmatched.length,
        missing: missing.length,
        passed: passedCount,
        faults: faultCount,
      },
    };

    // Update visit coverage if this upload is linked to a visit
    const { data: uploadData } = await supabase
      .from("file_uploads")
      .select("visit_id")
      .eq("id", uploadId)
      .maybeSingle();

    if (uploadData?.visit_id) {
      await supabase
        .from("service_visits")
        .update({
          devices_tested: totalTested,
          total_devices: totalInventory,
          coverage_percentage: coverage,
          issues_count: faultCount + unmatched.length,
        })
        .eq("id", uploadData.visit_id);
    }

    return { result, error: null };
  } catch (error) {
    console.error("Error reconciling devices:", error);
    return { result: null, error: error as Error };
  }
}

export async function getSites(): Promise<{ sites: { id: string; name: string; total_devices: number | null }[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("sites")
      .select("id, name, total_devices")
      .order("name", { ascending: true });

    if (error) throw error;

    return { sites: data || [], error: null };
  } catch (error) {
    console.error("Error fetching sites:", error);
    return { sites: [], error: error as Error };
  }
}

export async function getSiteUploads(siteId?: string): Promise<{ uploads: { id: string; file_name: string; created_at: string; devices_found: number | null; site_id: string | null; site_name?: string }[]; error: Error | null }> {
  try {
    let query = supabase
      .from("file_uploads")
      .select("id, file_name, created_at, devices_found, site_id, site:sites(name)")
      .order("created_at", { ascending: false });

    if (siteId) {
      query = query.eq("site_id", siteId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Flatten site name into the upload object
    const uploads = (data || []).map((upload: any) => ({
      id: upload.id,
      file_name: upload.file_name,
      created_at: upload.created_at,
      devices_found: upload.devices_found,
      site_id: upload.site_id,
      site_name: upload.site?.name || "No site",
    }));

    return { uploads, error: null };
  } catch (error) {
    console.error("Error fetching uploads:", error);
    return { uploads: [], error: error as Error };
  }
}
