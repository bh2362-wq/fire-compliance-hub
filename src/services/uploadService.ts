import { supabase } from "@/integrations/supabase/client";
import { ParseResult, ParsedDevice } from "@/lib/parsers/csvParser";

export interface FileUploadRecord {
  id: string;
  visit_id: string | null;
  site_id: string | null;
  file_name: string;
  file_type: string;
  file_size: number | null;
  devices_found: number;
  devices_passed: number;
  devices_failed: number;
  parsing_errors: string[];
  created_at: string;
}

export interface SaveUploadParams {
  visitId?: string;
  siteId?: string;
  file: File;
  parseResult: ParseResult;
}

export async function saveFileUpload({
  visitId,
  siteId,
  file,
  parseResult,
}: SaveUploadParams): Promise<{ uploadId: string; error: Error | null }> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    // Insert file upload record
    const { data: uploadData, error: uploadError } = await supabase
      .from("file_uploads")
      .insert({
        visit_id: visitId || null,
        site_id: siteId || null,
        uploaded_by: user?.id || null,
        file_name: file.name,
        file_type: file.type || file.name.split(".").pop() || "unknown",
        file_size: file.size,
        parsed_at: new Date().toISOString(),
        devices_found: parseResult.summary.totalDevices,
        devices_passed: parseResult.summary.testedDevices,
        devices_failed: parseResult.summary.faultDevices,
        parsing_errors: parseResult.errors,
      })
      .select("id")
      .single();

    if (uploadError) throw uploadError;

    const uploadId = uploadData.id;

    // Insert parsed device tests if we have devices
    if (parseResult.devices.length > 0) {
      const deviceTests = parseResult.devices.map((device: ParsedDevice) => ({
        upload_id: uploadId,
        visit_id: visitId || null,
        loop: device.loop,
        address: device.address,
        device_type: device.deviceType,
        location: device.location,
        status: device.status,
        raw_data: device.rawData,
        matched: false,
      }));

      // Insert in batches of 100 to avoid payload limits
      const batchSize = 100;
      for (let i = 0; i < deviceTests.length; i += batchSize) {
        const batch = deviceTests.slice(i, i + batchSize);
        const { error: testsError } = await supabase
          .from("parsed_device_tests")
          .insert(batch);

        if (testsError) {
          console.error("Error inserting device tests batch:", testsError);
        }
      }
    }

    return { uploadId, error: null };
  } catch (error) {
    console.error("Error saving file upload:", error);
    return { uploadId: "", error: error as Error };
  }
}

// Marker filename used for the synthetic upload row that backs all the
// manual device ticks recorded against a single visit. One row per visit
// is reused for every tick from every surface (wizard, admin panel,
// engineer field app) so we satisfy the NOT NULL parsed_device_tests.upload_id
// constraint on environments where the relaxing migration hasn't applied.
const MANUAL_TICKS_FILENAME = "__manual_ticks__";

/**
 * Ensure there is a single synthetic file_uploads row for this visit that
 * the per-device tick inserts can reference. Throws on failure rather
 * than returning null so the calling tick path surfaces the real
 * underlying reason (RLS, FK, etc.) instead of silently re-hitting the
 * NOT NULL constraint on parsed_device_tests.upload_id.
 */
export async function ensureManualTicksUploadId(
  visitId: string,
  siteId?: string,
): Promise<string> {
  // Look for an existing row first.
  const { data: existing, error: selErr } = await supabase
    .from("file_uploads")
    .select("id")
    .eq("visit_id", visitId)
    .eq("file_name", MANUAL_TICKS_FILENAME)
    .maybeSingle();
  if (selErr) {
    console.error("[ensureManualTicksUploadId] select failed:", selErr);
    throw new Error(`Couldn't look up manual-ticks upload row: ${selErr.message}`);
  }
  if (existing?.id) return existing.id as string;

  // Create one.
  const { data: user } = await supabase.auth.getUser();
  const { data: created, error: insErr } = await supabase
    .from("file_uploads")
    .insert({
      visit_id: visitId,
      site_id: siteId ?? null,
      uploaded_by: user?.user?.id ?? null,
      file_name: MANUAL_TICKS_FILENAME,
      file_type: "manual",
    })
    .select("id")
    .single();
  if (insErr || !created) {
    console.error("[ensureManualTicksUploadId] insert failed:", insErr);
    throw new Error(
      `Couldn't create manual-ticks upload row: ${insErr?.message ?? "unknown error"}`,
    );
  }
  return created.id as string;
}

export async function getUploadHistory(options?: {
  visitId?: string;
  siteId?: string;
  limit?: number;
}): Promise<{ uploads: FileUploadRecord[]; error: Error | null }> {
  try {
    let query = supabase
      .from("file_uploads")
      .select("*")
      .order("created_at", { ascending: false });

    if (options?.visitId) {
      query = query.eq("visit_id", options.visitId);
    }

    if (options?.siteId) {
      query = query.eq("site_id", options.siteId);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { uploads: data as FileUploadRecord[], error: null };
  } catch (error) {
    console.error("Error fetching upload history:", error);
    return { uploads: [], error: error as Error };
  }
}

export async function getUploadWithTests(uploadId: string) {
  try {
    const [uploadResult, testsResult] = await Promise.all([
      supabase.from("file_uploads").select("*").eq("id", uploadId).single(),
      supabase
        .from("parsed_device_tests")
        .select("*")
        .eq("upload_id", uploadId)
        .order("loop", { ascending: true })
        .order("address", { ascending: true }),
    ]);

    if (uploadResult.error) throw uploadResult.error;

    return {
      upload: uploadResult.data,
      tests: testsResult.data || [],
      error: null,
    };
  } catch (error) {
    console.error("Error fetching upload with tests:", error);
    return { upload: null, tests: [], error: error as Error };
  }
}
