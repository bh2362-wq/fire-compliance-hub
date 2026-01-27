import { supabase } from "@/integrations/supabase/client";
import { ParseResult } from "@/lib/parsers/csvParser";

export async function parsePDF(file: File): Promise<ParseResult> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return {
        success: false,
        devices: [],
        headers: [],
        totalRows: 0,
        errors: ["You must be signed in to parse PDF files"],
        summary: {
          totalDevices: 0,
          testedDevices: 0,
          faultDevices: 0,
          unknownDevices: 0,
        },
      };
    }

    const formData = new FormData();
    formData.append("file", file);

    // Use direct fetch instead of supabase.functions.invoke for FormData
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/parse-pdf`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("PDF parse error:", errorData);
      return {
        success: false,
        devices: [],
        headers: [],
        totalRows: 0,
        errors: [errorData.error || `Failed to parse PDF (${response.status})`],
        summary: {
          totalDevices: 0,
          testedDevices: 0,
          faultDevices: 0,
          unknownDevices: 0,
        },
      };
    }

    const result = await response.json();

    // Normalize the response to match ParseResult interface
    if (result.devices) {
      result.devices = result.devices.map(
        (device: Record<string, unknown>, index: number) => ({
          id: `${device.loop}-${device.address}`,
          loop: device.loop || "1",
          address: device.address || String(index + 1),
          deviceType: device.deviceType || "Unknown",
          location: device.location || "Not specified",
          status:
            device.status === "pass"
              ? "passed"
              : device.status === "fault"
              ? "fault"
              : "untested",
          rawData: device.rawData || {},
        })
      );

      // Recalculate summary with normalized status values
      result.summary = {
        totalDevices: result.devices.length,
        testedDevices: result.devices.filter(
          (d: { status: string }) => d.status === "passed"
        ).length,
        faultDevices: result.devices.filter(
          (d: { status: string }) => d.status === "fault"
        ).length,
        unknownDevices: result.devices.filter(
          (d: { status: string }) => !["passed", "fault"].includes(d.status)
        ).length,
      };
    }

    return result as ParseResult;
  } catch (error) {
    console.error("PDF parsing error:", error);
    return {
      success: false,
      devices: [],
      headers: [],
      totalRows: 0,
      errors: [
        `Failed to parse PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
      summary: {
        totalDevices: 0,
        testedDevices: 0,
        faultDevices: 0,
        unknownDevices: 0,
      },
    };
  }
}
