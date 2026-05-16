/**
 * analyze-photo edge function
 *
 * Accepts a base64 image and optional context.
 * Uses Claude claude-sonnet-4-5 (vision) to:
 *  - Identify fire alarm panel fault screens
 *  - Identify physical defects in photos
 *  - Extract and structure fault information
 *  - Ask for clarification when uncertain
 *
 * POST body:
 *   image_base64: string          — raw base64 (no data: prefix)
 *   media_type:   string          — "image/jpeg" | "image/png" | "image/webp"
 *   context?:     string          — e.g. "BS5839 quarterly service, Gent Vigilon panel, Palantir 20 Soho Square"
 *   existing_defects?: string[]   — descriptions of defects already on the form (to avoid duplication)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const SYSTEM_PROMPT = `You are a senior fire alarm engineer with 25 years of hands-on experience across the full range of UK fire detection systems. You have deep knowledge of:

PANEL MANUFACTURERS & MODELS:
- Gent by Honeywell: Vigilon, Vigilon Plus, S4 (loop addressing: Lx Dxxx)
- Advanced Electronics: MxPro 4, MxPro 5, Axis EN (zone/loop/device addressing)
- Kentec Electronics: Syncro AS, Taktis (zone-based with loop addressing)
- Hochiki: HCP, ESP, FIRElink (loop and zone based)
- Notifier by Honeywell: ID3000, ID2000, NFS (L1.xxx addressing)
- Apollo: Discovery, XP95, Core Protocol (addressed)
- C-TEC: FP2000, Quantec (addressable and conventional)
- Napco / Fireclass: FC501, FC504 panels
- Ziton: ZP2, ZP3 (zone-based)
- Morley IAS: ZX Series, DXc (addressable)
- Texecom: Premier Elite (hybrid systems)
- Fulleon / Cooper: Conventional panels

FAULT READING:
When you see a panel screen, identify:
- Fault type: Loop fault, Device fault, Open circuit, Short circuit, Battery low/fail, PSU fault, Sounder fault, Input/output fault, Communication fault, Pre-alarm, Disabled device
- Zone/loop/device address: Extract exactly as shown (e.g. "Loop 1 Device 042", "Zone 3", "L1 D042")
- Panel identity: Name or ID visible on screen
- Number of faults: Count all fault entries shown
- Alarm conditions: Any live alarm or pre-alarm states

PHYSICAL DEFECTS:
- Damaged or missing components
- Incorrect wiring or connections
- Failed or discoloured detectors
- Obstruction within 500mm of detector
- Missing end-of-line resistors
- Unsecured cable runs
- Missing covers or access doors

SEVERITY CLASSIFICATION (BS 5839-1):
- Critical (Category 1): Active alarm, failed device preventing operation, live fire condition
- Major (Category 2): Fault requiring urgent attention within 24h — loop faults, device faults, battery failure, open/short circuit
- Minor (Category 3): Advisory — low battery, disabled device, minor physical damage
- Advisory: Recommendations, observations, good practice items

REGULATION REFERENCES:
- Loop/device faults: BS 5839-1:2025 Cl.25 (maintenance)
- Battery issues: BS 5839-1:2025 Cl.25.2 (standby power)
- False alarm history: BS 5839-1:2025 Cl.45.2
- Obstruction: BS 5839-1:2025 Cl.12.4
- Open circuit: BS 5839-1:2025 Cl.25.1

RESPONSE FORMAT:
Return ONLY valid JSON with no markdown, no code blocks, no preamble:

{
  "photo_type": "panel_screen | physical_defect | document | event_log | unknown",
  "confidence": "high | medium | low",
  "needs_clarification": false,
  "clarification_question": null,
  "panel_info": {
    "manufacturer": "Manufacturer name or null",
    "model": "Panel model or null",
    "panel_id": "Panel label/name visible or null",
    "total_faults_shown": 0
  },
  "detected_faults": [
    {
      "description": "Clear plain-English description of the fault as it would appear on a service certificate",
      "severity": "Critical | Major | Minor | Advisory",
      "location": "Zone/loop/device address and panel name if visible",
      "recommended_action": "Specific action required",
      "regulation_reference": "BS 5839-1:2025 Cl.X or relevant standard"
    }
  ],
  "summary": "One sentence: what the photo shows and key finding",
  "raw_text_extracted": "All text visible in the image, exactly as shown"
}

If no faults detected, return detected_faults as [].
If the image is unclear or you cannot determine fault details with confidence, set needs_clarification: true and provide a specific, helpful question in clarification_question.
NEVER invent faults that are not clearly visible in the image.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { image_base64, media_type, context, existing_defects } = body;

    if (!image_base64 || !media_type) {
      return new Response(JSON.stringify({ error: "image_base64 and media_type required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Build the user message
    const userText = [
      "Analyse this image for fire alarm faults or defects.",
      context ? `Context: ${context}` : "",
      existing_defects?.length
        ? `Already recorded defects (do not duplicate): ${existing_defects.join("; ")}`
        : "",
      "Return ONLY the JSON response as specified. No other text.",
    ].filter(Boolean).join("\n");

    // Retry on 429 / 5xx with exponential backoff to absorb concurrent-request rate limits
    let anthropicResp!: Response;
    let lastErr = "";
    const delays = [600, 1500, 3500, 7000];
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type, data: image_base64 } },
              { type: "text", text: userText },
            ],
          }],
        }),
      });
      if (anthropicResp.ok) break;
      const retriable = anthropicResp.status === 429 || anthropicResp.status >= 500;
      lastErr = await anthropicResp.text().catch(() => "");
      if (!retriable || attempt === delays.length) {
        console.error("Anthropic API error:", anthropicResp.status, lastErr);
        // Return 200 with structured fallback so the client doesn't crash
        return new Response(JSON.stringify({
          photo_type: "unknown",
          confidence: "low",
          needs_clarification: true,
          clarification_question: anthropicResp.status === 429
            ? "AI service is busy right now. Please try this photo again in a few seconds."
            : "AI analysis failed for this image. Please try again or describe the fault manually.",
          panel_info: { manufacturer: null, model: null, panel_id: null, total_faults_shown: 0 },
          detected_faults: [],
          summary: anthropicResp.status === 429 ? "Rate limited — retry shortly" : "Analysis unavailable",
          raw_text_extracted: "",
          fallback: true,
          upstream_status: anthropicResp.status,
        }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, delays[attempt] + jitter));
    }


    const data = await anthropicResp.json();
    const text = data.content?.find((b: any) => b.type === "text")?.text ?? "{}";

    // Parse the JSON response
    let parsed: any;
    try {
      // Strip any accidental markdown fences
      const clean = text.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      console.error("Failed to parse AI response:", text);
      // Return a structured error response the client can handle
      parsed = {
        photo_type: "unknown",
        confidence: "low",
        needs_clarification: true,
        clarification_question: "I wasn't able to analyse this image clearly. Could you describe what the photo shows — a panel screen, physical component, or document?",
        panel_info: { manufacturer: null, model: null, panel_id: null, total_faults_shown: 0 },
        detected_faults: [],
        summary: "Unable to parse image content",
        raw_text_extracted: text.slice(0, 500),
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("analyze-photo error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
