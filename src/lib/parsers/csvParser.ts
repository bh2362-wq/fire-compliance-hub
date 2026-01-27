export interface ParsedDevice {
  id: string;
  loop: string;
  address: string;
  deviceType: string;
  location: string;
  status: string;
  lastTest?: string;
  rawData: Record<string, string>;
}

export interface ParseResult {
  success: boolean;
  devices: ParsedDevice[];
  headers: string[];
  totalRows: number;
  errors: string[];
  summary: {
    totalDevices: number;
    testedDevices: number;
    faultDevices: number;
    unknownDevices: number;
  };
}

// Common column name mappings for fire panel logs
const COLUMN_MAPPINGS: Record<string, string[]> = {
  loop: ["loop", "loop_no", "loop_number", "lp", "circuit"],
  address: ["address", "addr", "device_address", "zone_address", "point"],
  deviceType: ["type", "device_type", "device", "device_name", "equipment"],
  location: ["location", "loc", "zone", "area", "description", "desc"],
  status: ["status", "state", "result", "test_result", "condition"],
  lastTest: ["date", "test_date", "last_test", "tested", "timestamp"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");
}

function findMappedColumn(headers: string[], targetField: string): string | null {
  const possibleNames = COLUMN_MAPPINGS[targetField] || [];
  const normalizedHeaders = headers.map(normalizeHeader);

  for (const name of possibleNames) {
    const index = normalizedHeaders.indexOf(name);
    if (index !== -1) {
      return headers[index];
    }
  }

  // Fuzzy match - check if any header contains the target
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (normalized.includes(targetField) || possibleNames.some((n) => normalized.includes(n))) {
      return header;
    }
  }

  return null;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function detectDelimiter(content: string): string {
  const firstLines = content.split("\n").slice(0, 5).join("\n");
  const commas = (firstLines.match(/,/g) || []).length;
  const semicolons = (firstLines.match(/;/g) || []).length;
  const tabs = (firstLines.match(/\t/g) || []).length;

  if (tabs > commas && tabs > semicolons) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

function determineStatus(value: string): string {
  const normalized = value.toLowerCase().trim();

  const passTerms = ["pass", "ok", "good", "tested", "normal", "active", "1", "true", "yes"];
  const failTerms = ["fail", "fault", "error", "alarm", "0", "false", "no", "bad"];
  const pendingTerms = ["pending", "untested", "unknown", "n/a", ""];

  if (passTerms.some((t) => normalized.includes(t))) return "passed";
  if (failTerms.some((t) => normalized.includes(t))) return "fault";
  if (pendingTerms.some((t) => normalized === t)) return "untested";

  return value || "unknown";
}

export function parseCSV(content: string): ParseResult {
  const errors: string[] = [];
  const devices: ParsedDevice[] = [];

  try {
    // Normalize line endings and split
    const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim());

    if (lines.length < 2) {
      return {
        success: false,
        devices: [],
        headers: [],
        totalRows: 0,
        errors: ["File must contain headers and at least one data row"],
        summary: { totalDevices: 0, testedDevices: 0, faultDevices: 0, unknownDevices: 0 },
      };
    }

    // Detect delimiter and parse headers
    const delimiter = detectDelimiter(content);
    const headers = delimiter === ","
      ? parseCSVLine(lines[0])
      : lines[0].split(delimiter).map((h) => h.trim());

    // Find column mappings
    const columnMap: Record<string, string | null> = {
      loop: findMappedColumn(headers, "loop"),
      address: findMappedColumn(headers, "address"),
      deviceType: findMappedColumn(headers, "deviceType"),
      location: findMappedColumn(headers, "location"),
      status: findMappedColumn(headers, "status"),
      lastTest: findMappedColumn(headers, "lastTest"),
    };

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const values = delimiter === ","
          ? parseCSVLine(line)
          : line.split(delimiter).map((v) => v.trim());

        // Create raw data object
        const rawData: Record<string, string> = {};
        headers.forEach((header, idx) => {
          rawData[header] = values[idx] || "";
        });

        // Extract mapped fields
        const getValue = (field: string): string => {
          const column = columnMap[field];
          if (!column) return "";
          const idx = headers.indexOf(column);
          return idx >= 0 ? values[idx] || "" : "";
        };

        const loop = getValue("loop") || "1";
        const address = getValue("address") || `${i}`;
        const statusRaw = getValue("status");

        devices.push({
          id: `${loop}-${address}`,
          loop,
          address,
          deviceType: getValue("deviceType") || "Unknown",
          location: getValue("location") || "Not specified",
          status: determineStatus(statusRaw),
          lastTest: getValue("lastTest") || undefined,
          rawData,
        });
      } catch (err) {
        errors.push(`Row ${i + 1}: Failed to parse`);
      }
    }

    // Calculate summary
    const summary = {
      totalDevices: devices.length,
      testedDevices: devices.filter((d) => d.status === "passed").length,
      faultDevices: devices.filter((d) => d.status === "fault").length,
      unknownDevices: devices.filter((d) => !["passed", "fault"].includes(d.status)).length,
    };

    return {
      success: true,
      devices,
      headers,
      totalRows: lines.length - 1,
      errors,
      summary,
    };
  } catch (err) {
    return {
      success: false,
      devices: [],
      headers: [],
      totalRows: 0,
      errors: [`Failed to parse CSV: ${err instanceof Error ? err.message : "Unknown error"}`],
      summary: { totalDevices: 0, testedDevices: 0, faultDevices: 0, unknownDevices: 0 },
    };
  }
}

export function parseTXT(content: string): ParseResult {
  // Try to parse as CSV first (common for exported logs)
  const csvResult = parseCSV(content);
  if (csvResult.success && csvResult.devices.length > 0) {
    return csvResult;
  }

  // Fall back to line-based parsing for simple formats
  const lines = content.split("\n").filter((l) => l.trim());
  const devices: ParsedDevice[] = [];

  // Pattern matching for common log formats
  // Example: "Loop 1 Address 23: Smoke Detector - Zone A - PASS"
  const patterns = [
    /loop\s*(\d+)\s*(?:address|addr)\s*(\d+)[:\s]*(.+?)(?:\s*-\s*|\s+)(pass|fail|ok|fault|alarm)/i,
    /(\d+)[\/\-](\d+)[:\s]+(.+?)\s+(pass|fail|ok|fault|alarm)/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        devices.push({
          id: `${match[1]}-${match[2]}`,
          loop: match[1],
          address: match[2],
          deviceType: match[3]?.trim() || "Unknown",
          location: "Parsed from log",
          status: determineStatus(match[4]),
          rawData: { raw: line },
        });
        break;
      }
    }
  }

  const summary = {
    totalDevices: devices.length,
    testedDevices: devices.filter((d) => d.status === "passed").length,
    faultDevices: devices.filter((d) => d.status === "fault").length,
    unknownDevices: devices.filter((d) => !["passed", "fault"].includes(d.status)).length,
  };

  return {
    success: devices.length > 0,
    devices,
    headers: [],
    totalRows: lines.length,
    errors: devices.length === 0 ? ["Could not extract device data from file"] : [],
    summary,
  };
}
