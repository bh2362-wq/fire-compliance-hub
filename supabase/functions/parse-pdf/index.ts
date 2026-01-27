import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ParsedDevice {
  loop: string;
  address: string;
  deviceType: string | null;
  location: string | null;
  status: string;
  rawData: Record<string, string>;
}

interface ParseResult {
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

// Fire panel log patterns for text extraction
const DEVICE_LINE_PATTERNS = [
  // Pattern: "Loop 1 Addr 001 - Smoke Detector - PASS"
  /loop\s*(\d+)\s*addr(?:ess)?\s*(\d+)[^\n]*?([A-Za-z\s]+detector|sounder|call\s*point|module|beacon)[^\n]*?(pass|fail|fault|ok|tested|untested)/i,
  // Pattern: "1-001 Optical Smoke PASS"
  /(\d+)-(\d+)\s+([A-Za-z\s]+)\s+(pass|fail|fault|ok|tested|untested)/i,
  // Pattern: "L01/A001 Type:Smoke Status:OK"
  /L(\d+)\/A(\d+)\s+Type:([^\s]+)\s+Status:(\w+)/i,
  // CSV-like: "1,1,Smoke Detector,Pass"
  /^(\d+),(\d+),([^,]+),(pass|fail|fault|ok|tested|untested)/im,
];

const STATUS_MAPPING: Record<string, string> = {
  pass: "pass",
  passed: "pass",
  ok: "pass",
  tested: "pass",
  normal: "pass",
  fail: "fault",
  failed: "fault",
  fault: "fault",
  faulty: "fault",
  alarm: "fault",
  untested: "untested",
  unknown: "untested",
  "n/a": "untested",
};

function normalizeStatus(status: string): string {
  const normalized = status.toLowerCase().trim();
  return STATUS_MAPPING[normalized] || "untested";
}

function parseTextContent(text: string): ParseResult {
  const lines = text.split("\n");
  const devices: ParsedDevice[] = [];
  const errors: string[] = [];
  const seenDevices = new Set<string>();

  console.log(`Parsing ${lines.length} lines of text`);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    for (const pattern of DEVICE_LINE_PATTERNS) {
      const match = trimmedLine.match(pattern);
      if (match) {
        const loop = match[1].padStart(2, "0");
        const address = match[2].padStart(3, "0");
        const deviceKey = `${loop}-${address}`;

        // Avoid duplicates
        if (seenDevices.has(deviceKey)) continue;
        seenDevices.add(deviceKey);

        const device: ParsedDevice = {
          loop,
          address,
          deviceType: match[3]?.trim() || null,
          location: null,
          status: normalizeStatus(match[4] || "untested"),
          rawData: { originalLine: trimmedLine },
        };

        devices.push(device);
        break;
      }
    }
  }

  // If no patterns matched, try to extract any loop/address pairs
  if (devices.length === 0) {
    console.log("No devices found with patterns, trying fallback extraction");
    const loopAddrPattern = /(\d{1,2})[-\/](\d{1,3})/g;
    let match;
    while ((match = loopAddrPattern.exec(text)) !== null) {
      const loop = match[1].padStart(2, "0");
      const address = match[2].padStart(3, "0");
      const deviceKey = `${loop}-${address}`;

      if (seenDevices.has(deviceKey)) continue;
      seenDevices.add(deviceKey);

      // Try to find status near this match
      const contextStart = Math.max(0, match.index - 50);
      const contextEnd = Math.min(text.length, match.index + 100);
      const context = text.substring(contextStart, contextEnd).toLowerCase();

      let status = "untested";
      if (context.includes("pass") || context.includes(" ok")) status = "pass";
      else if (context.includes("fail") || context.includes("fault"))
        status = "fault";

      devices.push({
        loop,
        address,
        deviceType: null,
        location: null,
        status,
        rawData: { context: text.substring(contextStart, contextEnd).trim() },
      });
    }
  }

  const summary = {
    totalDevices: devices.length,
    testedDevices: devices.filter((d) => d.status === "pass").length,
    faultDevices: devices.filter((d) => d.status === "fault").length,
    unknownDevices: devices.filter((d) => d.status === "untested").length,
  };

  if (devices.length === 0) {
    errors.push(
      "No device data could be extracted from this PDF. The format may not be supported."
    );
  }

  console.log(`Extracted ${devices.length} devices from PDF`);

  return {
    success: devices.length > 0,
    devices,
    headers: ["loop", "address", "deviceType", "location", "status"],
    totalRows: lines.length,
    errors,
    summary,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("Missing or invalid Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Validate user is authenticated
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the incoming form data
    const contentType = req.headers.get("content-type") || "";
    console.log("Content-Type:", contentType);
    
    let file: File | null = null;
    
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      file = formData.get("file") as File;
    } else {
      console.error("Invalid content type:", contentType);
      return new Response(JSON.stringify({ error: "Invalid content type. Expected multipart/form-data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing PDF: ${file.name}, size: ${file.size} bytes`);

    // Read the file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Extract text from PDF using basic text extraction
    // We'll look for text streams in the PDF structure
    let extractedText = "";

    // Convert to string and look for text content
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const pdfString = decoder.decode(uint8Array);

    // Extract text between stream and endstream markers
    const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
    let streamMatch;
    while ((streamMatch = streamRegex.exec(pdfString)) !== null) {
      const streamContent = streamMatch[1];
      // Try to extract readable text (filter for printable ASCII and common chars)
      const textContent = streamContent
        .replace(/[^\x20-\x7E\n\r\t]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (textContent.length > 10) {
        extractedText += textContent + "\n";
      }
    }

    // Also try to find text outside streams (sometimes PDFs have plain text)
    const plainTextRegex = /\(([^)]+)\)/g;
    let textMatch;
    while ((textMatch = plainTextRegex.exec(pdfString)) !== null) {
      const text = textMatch[1];
      if (text.length > 2 && /[a-zA-Z0-9]/.test(text)) {
        extractedText += text + " ";
      }
    }

    // Try BT...ET text blocks
    const btRegex = /BT\s*([\s\S]*?)\s*ET/g;
    let btMatch;
    while ((btMatch = btRegex.exec(pdfString)) !== null) {
      const btContent = btMatch[1];
      // Extract Tj and TJ operators
      const tjRegex = /\(([^)]*)\)\s*Tj|\[(.*?)\]\s*TJ/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(btContent)) !== null) {
        const text = tjMatch[1] || tjMatch[2] || "";
        extractedText += text.replace(/[^\x20-\x7E]/g, " ") + " ";
      }
    }

    console.log(
      `Extracted ${extractedText.length} characters of text from PDF`
    );

    if (extractedText.length < 50) {
      return new Response(
        JSON.stringify({
          success: false,
          devices: [],
          headers: [],
          totalRows: 0,
          errors: [
            "Could not extract readable text from this PDF. It may be scanned/image-based or use an unsupported encoding.",
          ],
          summary: {
            totalDevices: 0,
            testedDevices: 0,
            faultDevices: 0,
            unknownDevices: 0,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse the extracted text for device data
    const result = parseTextContent(extractedText);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("PDF parsing error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to parse PDF",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
