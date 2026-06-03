// Callout report DOCX generator — first cut.
//
// Architecture: opens the BHO callout template (assets/callout-
// template-baseline.docx, embedded as base64 in _template-data.ts so
// we don't need a separate storage upload step), runs placeholder
// substitution against the bundle the client posts, and returns the
// filled DOCX as base64 in the response body so the frontend can
// download it without a storage roundtrip.
//
// Template note: the baseline is a copy of the C&E template — same
// BHO styling, but the placeholders are C&E-flavoured. The
// callout-specific ones (fault reported, action taken, isolation
// details) are folded into the closest C&E sections for now
// (General Observations ≈ fault narrative). When the callout
// template is refined the placeholder list here will need to follow.
//
// The C&E-specific placeholders (sound meter, audibility, remedials,
// device register, attachments) intentionally aren't filled — they
// render as "—" in the output. That's the agreed "starting point"
// behaviour from the PR scoping question. Refinement pass on the
// template will swap those for callout-specific sections.

import JSZip from "npm:jszip@3.10.1";
import { CALLOUT_TEMPLATE_BASE64 } from "./_template-data.ts";

// ──────────────────────────────────────────────────────────────────────
// CORS — matches every other edge function in the project.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

// ──────────────────────────────────────────────────────────────────────
// Bundle types — must match CalloutReportInput in
// src/lib/calloutReportPdfGenerator.ts. Narrowed to fields we render.

interface Bundle {
  ref: string;
  visitDate: string | null;
  priorityLabel: string | null;
  commercialLabel: string | null;
  customer: {
    name: string | null;
    contactName: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  };
  site: {
    name: string | null;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  engineerName: string | null;
  panelMakeModel?: string | null;
  numZones?: number | null;
  numLoops?: number | null;
  affectedZones?: string[] | null;
  affectedLoops?: string[] | null;
  arcConnected?: boolean | null;
  callReceivedAt?: string | null;
  reportedBy?: string | null;
  reportMethod?: string | null;
  arrivedAt?: string | null;
  departedAt?: string | null;
  arcNotifiedAt?: string | null;
  fault: {
    reported: string | null;
    onArrival: string | null;
    found: string | null;
    actionTaken: string | null;
  } | null;
  partsUsed?: string | null;
  clientName?: string | null;
}

// ──────────────────────────────────────────────────────────────────────
// XML helpers — copied verbatim from generate-cause-effect-docx so the
// fill semantics stay consistent (em-dash on empty, attribute-aware
// <w:t> matching, ampersand escape parity).

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function xmlEscapeSearch(s: string): string {
  return s.replace(/&/g, "&amp;");
}

function replaceWtText(xml: string, placeholder: string, value: string): string {
  const safe = xmlEscapeSearch(placeholder).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(<w:t(?:\\s[^>]*)?>)([^<]*?)${safe}([^<]*?)(</w:t>)`, "g");
  return xml.replace(re, (_m, openTag, before, after, closeTag) =>
    `${openTag}${before}${escapeXmlText(value)}${after}${closeTag}`,
  );
}

function fill(xml: string, placeholder: string, value: string | null | undefined): string {
  const v = (value == null || (typeof value === "string" && value.trim() === ""))
    ? "—"
    : String(value).trim();
  return replaceWtText(xml, placeholder, v);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Join the four fault narrative sections into one paragraph for the
// General Observations placeholder. The C&E template has GenObs as a
// single placeholder, so we collapse rather than try to split. When
// the callout template gets refined, this can be unpacked into
// dedicated placeholders per section.
function composeFaultNarrative(fault: Bundle["fault"]): string {
  if (!fault) return "";
  const parts: string[] = [];
  if (fault.reported?.trim()) parts.push(`Reported: ${fault.reported.trim()}`);
  if (fault.onArrival?.trim()) parts.push(`On arrival: ${fault.onArrival.trim()}`);
  if (fault.found?.trim()) parts.push(`Found: ${fault.found.trim()}`);
  if (fault.actionTaken?.trim()) parts.push(`Action taken: ${fault.actionTaken.trim()}`);
  return parts.join("\n\n");
}

// ──────────────────────────────────────────────────────────────────────
// Main fill — only the overlapping placeholders from the C&E template
// get values; the C&E-specific ones (sound meter, audibility, etc.)
// are left as "—" until the template is refined for callouts.

function fillTemplate(bundle: Bundle, originalXml: string): string {
  let xml = originalXml;

  // ── Title row + REF/DATE ───────────────────────────────────────────
  xml = fill(xml, "[Job Ref]", bundle.ref);
  xml = fill(xml, "[Visit Date]", fmtDate(bundle.visitDate));

  // ── SITE info card ─────────────────────────────────────────────────
  xml = fill(xml, "[Site Name]", bundle.site.name);
  const addrParts = [bundle.site.address, bundle.site.city, bundle.site.postcode]
    .filter((p): p is string => !!p);
  xml = fill(xml, "[Site Address]", addrParts.length > 0 ? addrParts.join(", ") : null);
  xml = fill(xml, "[Site Contact Name]", bundle.customer.contactName);
  xml = fill(xml, "[Site Contact Phone]", bundle.customer.contactPhone ?? null);

  // ── JOB DETAILS info card ──────────────────────────────────────────
  xml = fill(xml, "[Customer]", bundle.customer.name);
  xml = fill(xml, "[Engineer]", bundle.engineerName);
  xml = fill(xml, "[Panel Make Model]", bundle.panelMakeModel ?? null);
  const deviceCount = bundle.numZones != null ? String(bundle.numZones) : null;
  xml = fill(xml, "[Device Count]", deviceCount);
  const arcStatus = bundle.arcConnected != null
    ? bundle.arcConnected ? "Yes" : "No"
    : null;
  xml = fill(xml, "[ARC Status]", arcStatus);

  // ── Fault narrative → General Observations placeholder ─────────────
  // First cut: collapse all four fault sections into the single GenObs
  // placeholder. Template refinement will split these out.
  const faultNarrative = composeFaultNarrative(bundle.fault);
  xml = fill(xml, "[General Observations]", faultNarrative);

  // ── Sign-off (§9) ──────────────────────────────────────────────────
  // Same fallthrough as the C&E §9 fix in PR #128 — engineer-typed
  // wins, customer record auto-fills the gap. calloutReportService
  // already applies this; we pass through whatever it computed.
  xml = fill(xml, "[Engineer Name]", bundle.engineerName);
  xml = fill(xml, "[Client Name]", bundle.clientName ?? bundle.customer.contactName ?? null);
  xml = fill(xml, "[Client Company]", bundle.customer.name);

  return xml;
}

// ──────────────────────────────────────────────────────────────────────
// Chunked base64 encode for the response body. String.fromCharCode +
// btoa blows up on large buffers, so walk the bytes in slices small
// enough for the call stack.

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// HTTP handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const bundle = (await req.json()) as Bundle;
    if (!bundle || typeof bundle !== "object") {
      throw new Error("Request body must be a JSON bundle");
    }

    const templateBytes = base64ToBytes(CALLOUT_TEMPLATE_BASE64);
    const zip = await JSZip.loadAsync(templateBytes);
    const documentXmlFile = zip.file("word/document.xml");
    if (!documentXmlFile) {
      throw new Error("Template missing word/document.xml — re-encode and redeploy");
    }
    const originalXml = await documentXmlFile.async("string");
    const filledXml = fillTemplate(bundle, originalXml);
    zip.file("word/document.xml", filledXml);

    const out = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    });

    return new Response(
      JSON.stringify({
        docx_base64: bytesToBase64(out),
        // Diagnostic echo so frontend logs can confirm template
        // version + how many bytes flowed through. Mirrors the C&E
        // function's debug-friendly response shape.
        diagnostics: {
          template_bytes: templateBytes.length,
          output_bytes: out.length,
          fault_narrative_filled: !!composeFaultNarrative(bundle.fault),
        },
      }),
      {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-callout-docx]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
