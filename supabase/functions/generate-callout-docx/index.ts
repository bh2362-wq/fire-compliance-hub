// Callout report DOCX generator.
//
// Architecture: opens the BHO callout template (assets/callout-
// template-baseline.docx, embedded as base64 in _template-data.ts),
// runs placeholder substitution against the bundle the client posts,
// uploads the filled DOCX to the callout-outputs bucket, and returns
// the storage path + a signed download URL. The follow-on
// convert-quote-pdf invocation (with bucket: "callout-outputs") then
// renders the PDF.
//
// docx_base64 is also returned for callers that want the DOCX in-line
// without a second roundtrip (the "Save & download DOCX" wizard
// button still uses that path).
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { CALLOUT_TEMPLATE_BASE64 } from "./_template-data.ts";

const BUCKET = "callout-outputs";

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
  // Visit id from the wizard. Used as the storage path prefix so each
  // visit has a stable, predictable upload location (one DOCX per
  // visit; upsert overwrites on regenerate).
  visitId?: string;
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
  // Captured signatures from the wizard's Step 6. Either null
  // (engineer didn't sign) or a base64 data URL ("data:image/png;
  // base64,iVBORw..."). When set, the function embeds the bitmap
  // into the DOCX's §9 sign-off line in place of the underscore
  // glyphs. Mirrors generate-cause-effect-docx.
  engineerSignature?: string | null;
  clientSignature?: string | null;
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
// Signature embedding — ported from generate-cause-effect-docx.
//
// The template's §9 sign-off block has two underscore lines after the
// "Signature:" labels — one for engineer, one for client. When the
// wizard captured a signature (saved as a base64 PNG data URL on
// service_reports.engineer_signature / .client_signature, surfaced on
// the bundle as engineerSignature / clientSignature), embed the
// bitmap in place of the line.
//
// Doing it from the function rather than via a template placeholder
// keeps the .docx human-editable — engineers can re-author the
// template in Word without remembering to preserve obscure tags.

interface ZipLike {
  file: (name: string, data?: Uint8Array | string) => unknown;
  files: Record<string, unknown>;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

// EMU = English Metric Units. 914400 per inch. Sized to fit the
// signature line slot in the C&E-derived template.
const SIG_WIDTH_EMU = 2160000;  // ~2.36 inches
const SIG_HEIGHT_EMU = 900000;  // ~0.98 inches

function buildSignatureRun(relId: string, drawingId: number, name: string): string {
  return (
    '<w:r>' +
      '<w:drawing>' +
        '<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
          `<wp:extent cx="${SIG_WIDTH_EMU}" cy="${SIG_HEIGHT_EMU}"/>` +
          '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
          `<wp:docPr id="${drawingId}" name="${name}"/>` +
          '<wp:cNvGraphicFramePr>' +
            '<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>' +
          '</wp:cNvGraphicFramePr>' +
          '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
            '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
              '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
                '<pic:nvPicPr>' +
                  `<pic:cNvPr id="${drawingId}" name="${name}"/>` +
                  '<pic:cNvPicPr/>' +
                '</pic:nvPicPr>' +
                '<pic:blipFill>' +
                  `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}"/>` +
                  '<a:stretch><a:fillRect/></a:stretch>' +
                '</pic:blipFill>' +
                '<pic:spPr>' +
                  '<a:xfrm>' +
                    '<a:off x="0" y="0"/>' +
                    `<a:ext cx="${SIG_WIDTH_EMU}" cy="${SIG_HEIGHT_EMU}"/>` +
                  '</a:xfrm>' +
                  '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
                '</pic:spPr>' +
              '</pic:pic>' +
            '</a:graphicData>' +
          '</a:graphic>' +
        '</wp:inline>' +
      '</w:drawing>' +
    '</w:r>'
  );
}

// Add image bytes to word/media/<name>, register a new relationship
// in word/_rels/document.xml.rels, and return the rel id.
async function attachImageRel(
  zip: ZipLike,
  relsXml: string,
  fileName: string,
  bytes: Uint8Array,
  preferredRelId: string,
): Promise<string> {
  zip.file(`word/media/${fileName}`, bytes);
  if (relsXml.includes(`Id="${preferredRelId}"`)) return preferredRelId;
  const rel = `<Relationship Id="${preferredRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${fileName}"/>`;
  const newRels = relsXml.replace("</Relationships>", `${rel}</Relationships>`);
  zip.file("word/_rels/document.xml.rels", newRels);
  return preferredRelId;
}

// Ensure [Content_Types].xml has a Default entry for the given image
// extension/mime. The base template registers jpeg only; PNG-only
// signatures need their type declared or Word refuses to open the
// file.
function ensureContentType(ctXml: string, ext: string, mime: string): string {
  if (ctXml.includes(`Extension="${ext}"`)) return ctXml;
  const entry = `<Default Extension="${ext}" ContentType="${mime}"/>`;
  return ctXml.replace(/<Default /, entry + "<Default ");
}

// Locate the FIRST signature line (the run containing the underscore
// glyphs) AFTER a given anchor text. Returns [runStart, runEnd] for
// the enclosing <w:r>...</w:r>, or null when anchor/line not found.
function locateSignatureRun(xml: string, anchorText: string): [number, number] | null {
  const anchorIdx = xml.indexOf(anchorText);
  if (anchorIdx < 0) return null;
  const lineIdx = xml.indexOf("____________________________", anchorIdx);
  if (lineIdx < 0) return null;
  const runStart = xml.lastIndexOf("<w:r ", lineIdx);
  const runStartBare = xml.lastIndexOf("<w:r>", lineIdx);
  const start = Math.max(runStart, runStartBare);
  if (start < 0) return null;
  const runEnd = xml.indexOf("</w:r>", lineIdx);
  if (runEnd < 0) return null;
  return [start, runEnd + "</w:r>".length];
}

interface SignatureEmbedDiagnostics {
  engineer_provided: boolean;
  engineer_is_data_url: boolean;
  engineer_embedded: boolean;
  engineer_reason?: string;
  client_provided: boolean;
  client_is_data_url: boolean;
  client_embedded: boolean;
  client_reason?: string;
}

async function embedSignatures(
  zip: ZipLike,
  doc: string,
  bundle: Bundle,
  diag: SignatureEmbedDiagnostics,
): Promise<string> {
  const eng = bundle.engineerSignature ?? null;
  const cli = bundle.clientSignature ?? null;
  diag.engineer_provided = !!eng;
  diag.client_provided = !!cli;
  diag.engineer_is_data_url = typeof eng === "string" && eng.startsWith("data:image/");
  diag.client_is_data_url = typeof cli === "string" && cli.startsWith("data:image/");
  if (!eng && !cli) {
    diag.engineer_reason = "no signature on report row";
    diag.client_reason = "no signature on report row";
    return doc;
  }

  let relsXml = "";
  let ctXml = "";
  try {
    const relsFile = (zip as unknown as { files: Record<string, { async: (t: string) => Promise<string> }> })
      .files["word/_rels/document.xml.rels"];
    const ctFile = (zip as unknown as { files: Record<string, { async: (t: string) => Promise<string> }> })
      .files["[Content_Types].xml"];
    relsXml = await relsFile.async("string");
    ctXml = await ctFile.async("string");
  } catch {
    console.warn("Couldn't access rels/content-types; skipping signature embed");
    return doc;
  }

  const sigs = [
    { url: eng, anchor: "ENGINEER", relId: "rIdSigEngineer", drawingId: 1001, name: "EngineerSignature", file: "sig_engineer", who: "engineer" as const },
    { url: cli, anchor: "CLIENT / RESPONSIBLE PERSON", relId: "rIdSigClient", drawingId: 1002, name: "ClientSignature", file: "sig_client", who: "client" as const },
  ];

  const setReason = (who: "engineer" | "client", r: string) => {
    if (who === "engineer") diag.engineer_reason = r;
    else diag.client_reason = r;
  };
  const markEmbedded = (who: "engineer" | "client") => {
    if (who === "engineer") diag.engineer_embedded = true;
    else diag.client_embedded = true;
  };

  for (const s of sigs) {
    if (!s.url) { setReason(s.who, "no signature on report row"); continue; }
    const decoded = dataUrlToBytes(s.url);
    if (!decoded) {
      const head = s.url.slice(0, 30);
      const reason = `not a data URL (starts with "${head}")`;
      console.warn(`Signature for ${s.anchor}: ${reason}`);
      setReason(s.who, reason);
      continue;
    }
    const ext = decoded.mime === "image/png" ? "png" : decoded.mime === "image/jpeg" ? "jpeg" : "png";
    const fileName = `${s.file}.${ext}`;
    await attachImageRel(zip, relsXml, fileName, decoded.bytes, s.relId);
    // attachImageRel writes a new rels XML; re-read so next loop sees it.
    const relsFile2 = (zip as unknown as { files: Record<string, { async: (t: string) => Promise<string> }> })
      .files["word/_rels/document.xml.rels"];
    relsXml = await relsFile2.async("string");

    ctXml = ensureContentType(ctXml, ext, decoded.mime);

    const loc = locateSignatureRun(doc, s.anchor);
    if (!loc) {
      const reason = `anchor "${s.anchor}" or trailing underscore line not found`;
      console.warn(reason);
      setReason(s.who, reason);
      continue;
    }
    const [runStart, runEnd] = loc;
    doc = doc.slice(0, runStart) + buildSignatureRun(s.relId, s.drawingId, s.name) + doc.slice(runEnd);
    markEmbedded(s.who);
    setReason(s.who, "ok");
  }

  zip.file("[Content_Types].xml", ctXml);
  return doc;
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
    let filledXml = fillTemplate(bundle, originalXml);

    // Embed signatures if the wizard captured them. Modifies the zip
    // in place (adds image bytes, registers relationships, declares
    // the content type) and returns the updated document XML.
    const sigDiag: SignatureEmbedDiagnostics = {
      engineer_provided: false,
      engineer_is_data_url: false,
      engineer_embedded: false,
      client_provided: false,
      client_is_data_url: false,
      client_embedded: false,
    };
    filledXml = await embedSignatures(
      zip as unknown as ZipLike,
      filledXml,
      bundle,
      sigDiag,
    );
    console.log("[generate-callout-docx] signature embed:", JSON.stringify(sigDiag));

    zip.file("word/document.xml", filledXml);

    const out = await zip.generateAsync({
      type: "uint8array",
      // DEFLATE not STORED — MS Graph's headless DOCX→PDF converter
      // rejects STORED zips with "cannotOpenFile". Same constraint
      // the quote + C&E pipelines hit.
      compression: "DEFLATE",
    });

    // Upload to the callout-outputs bucket so convert-quote-pdf can
    // turn this into a PDF in a follow-on call. Service role key so
    // we can write regardless of the caller's RLS context. visitId
    // is the path prefix when provided — gives each visit a stable
    // location (upsert overwrites on regenerate). Falls back to ref
    // for callers that haven't been updated to send visitId yet.
    const pathPrefix = bundle.visitId ?? bundle.ref ?? crypto.randomUUID();
    const storagePath = `${pathPrefix}/callout-report.docx`;

    let signedUrl: string | null = null;
    let uploadError: string | null = null;
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, out, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 3600);
      if (signErr || !signed) throw signErr ?? new Error("signed-url returned no data");
      signedUrl = signed.signedUrl;
    } catch (err) {
      // Storage failure shouldn't kill the response — the docx_base64
      // path still works for direct-download callers. Surface the
      // reason via diagnostics so the frontend can fall back to
      // in-browser PDF and log why.
      uploadError = err instanceof Error ? err.message : String(err);
      console.error("[generate-callout-docx] storage upload failed:", uploadError);
    }

    return new Response(
      JSON.stringify({
        // Storage path + signed URL for the cloud DOCX→PDF chain.
        // null when the upload failed; callers should fall back to
        // docx_base64 or the legacy in-browser PDF generator.
        storage_path: uploadError ? null : storagePath,
        signed_url: signedUrl,
        bucket: BUCKET,
        // Back-compat: in-line DOCX bytes for direct-download. Same
        // payload as PR #132 so the wizard's "Save & download DOCX"
        // button keeps working with no frontend change.
        docx_base64: bytesToBase64(out),
        // Diagnostic echo so frontend logs can confirm template
        // version + how many bytes flowed through + whether the
        // upload landed. Mirrors the C&E function's debug-friendly
        // response shape.
        diagnostics: {
          template_bytes: templateBytes.length,
          output_bytes: out.length,
          fault_narrative_filled: !!composeFaultNarrative(bundle.fault),
          storage_upload_error: uploadError,
        },
        // Signature-specific echo. Mirrors C&E so the frontend can
        // toast a clear "didn't embed because X" message when a
        // signature was provided but didn't make it into the file.
        signature_diagnostics: sigDiag,
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
