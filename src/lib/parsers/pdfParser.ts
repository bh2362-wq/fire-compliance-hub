import { supabase } from "@/integrations/supabase/client";
import { ParseResult } from "@/lib/parsers/csvParser";

export async function parsePDF(file: File): Promise<ParseResult> {
  try {
    const formData = new FormData();
    formData.append("file", file);

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

    const response = await supabase.functions.invoke("parse-pdf", {
      body: formData,
    });

    if (response.error) {
      console.error("PDF parse error:", response.error);
      return {
        success: false,
        devices: [],
        headers: [],
        totalRows: 0,
        errors: [response.error.message || "Failed to parse PDF"],
        summary: {
          totalDevices: 0,
          testedDevices: 0,
          faultDevices: 0,
          unknownDevices: 0,
        },
      };
    }

    const result = response.data;

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
