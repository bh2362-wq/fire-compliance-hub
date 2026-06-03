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

  // Wizard step 2/3 — full narrative + defects.
  workCarriedOut?: string | null;
  defectsFound?: string | null;

  // Wizard step 4 — labour + mileage. Rendered as their own rows in
  // §4 alongside the parts list.
  labourHours?: number | null;
  mileageMiles?: number | null;

  // Wizard step 2/5 — isolation note (live state, captured on
  // arrival, refreshed on departure).
  isolationDetails?: string | null;

  // Wizard step 5 — recommendations + free-form follow-up notes.
  recommendations?: string | null;
  followupNotes?: string | null;

  // Wizard step 6 — client signing position.
  clientSignPosition?: string | null;

  // Wizard step 2 — §2 evidence photos. Bundle builder pre-signs each
  // photo's storage path; the edge function fetches the bytes
  // server-side and lays them out as a captioned grid in Appendix A.
  photos?: Array<{
    storage_path: string;
    caption: string | null;
    ordinal: number;
    signed_url?: string | null;
  }>;
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
// Main fill — fills placeholders against the REFINED callout template
// (assets/callout-template-baseline.docx run through
// scripts/_refine_callout_template.py). The placeholder names below
// match the renamed slots produced by that refiner:
//
//   [Fault Diagnosis]       — §3.1, was [Test Methodology]
//   [Parts List]            — §4.1, was [Sound Meter Make Model]
//   [Labour Hours]          — §4.1, was [Sound Meter Serial]
//   [Mileage Miles]         — §4.1, was [Calibration Due]
//   [Recommendations Block] — §5.3, was [General Observations]
//
// Anything still flagged as a C&E-only placeholder ([Test Equipment],
// the audibility tables, remedial cost table, compliance ticks)
// prints "—" until a follow-up Word edit deletes those blocks.

function fmtLabourHours(n: number | null | undefined): string | null {
  if (n == null) return null;
  // Trim trailing .0 so "1.0 hrs" reads as "1 hr"; keep fractional
  // precision otherwise (engineers log to the quarter-hour).
  const formatted = Number.isInteger(n) ? String(n) : n.toString();
  return `${formatted} ${n === 1 ? "hr" : "hrs"}`;
}

function fmtRecommendationsBlock(
  recommendations: string | null | undefined,
  followup: string | null | undefined,
): string | null {
  const r = (recommendations ?? "").trim();
  const f = (followup ?? "").trim();
  if (!r && !f) return null;
  if (r && f) return `${r}\n\n${f}`;
  return r || f;
}

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

  // ── §3 Investigation & actions ─────────────────────────────────────
  // §3.1 takes the fault diagnosis. The longer fault narrative
  // (reported / on arrival / found / action taken, all in one
  // paragraph) was the previous home for this data; we keep that
  // composition as a backup if the refined slot isn't populated.
  const faultNarrative = composeFaultNarrative(bundle.fault);
  xml = fill(xml, "[Fault Diagnosis]", bundle.fault?.found ?? faultNarrative);

  // ── §4 Materials & time ────────────────────────────────────────────
  // Three repurposed slots — the labels next to them now read "Parts
  // list:" / "Labour hours:" / "Mileage (miles):" per the refiner's
  // SUBSECTION_RENAMES.
  xml = fill(xml, "[Parts List]", bundle.partsUsed ?? null);
  xml = fill(xml, "[Labour Hours]", fmtLabourHours(bundle.labourHours));
  xml = fill(xml, "[Mileage Miles]",
    bundle.mileageMiles != null ? String(bundle.mileageMiles) : null,
  );

  // ── §5 Departure & follow-up ───────────────────────────────────────
  // §5.3 (renamed "Recommendations & follow-up") receives the
  // recommendations + free-form notes joined into one block.
  xml = fill(xml, "[Recommendations Block]",
    fmtRecommendationsBlock(bundle.recommendations, bundle.followupNotes),
  );

  // ── §6 Sign-off ────────────────────────────────────────────────────
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
// Photo evidence appendix
//
// Engineers attach photos to the callout in wizard step 2 (panel
// display, fault location, isolated devices). The bundle pre-signs
// each photo's storage URL; this code fetches the bytes server-side,
// registers each as a DOCX image relationship + content type (same
// plumbing as the signature embedder above), and lays them out in a
// 2-column captioned grid at the end of the document.
//
// Inserted before the trailing <w:sectPr> so the appendix inherits
// the page settings. Falls back to before </w:body> if no sectPr.
//
// Failure modes (each surfaces via diagnostics):
//   - signed URL fetch fails (network / RLS / expired token)
//   - response Content-Type isn't image/png or image/jpeg
//   - bytes empty (zero-byte upload)
// In each case the photo is skipped; the appendix renders with the
// remaining photos so the report ships even if one image is bad.

interface ZipLikeFiles {
  file: (name: string, data?: Uint8Array | string) => unknown;
  files: Record<string, { async: (t: string) => Promise<string> }>;
}

interface RegisteredPhoto {
  relId: string;
  drawingId: number;
  caption: string;
  ordinal: number;
}

interface PhotoAppendixDiagnostics {
  photos_received: number;
  photos_embedded: number;
  failures: Array<{ ordinal: number; reason: string }>;
}

const PHOTO_WIDTH_EMU = 2560000;  // ~2.8 inches
const PHOTO_HEIGHT_EMU = 1920000; // ~2.1 inches (4:3 aspect)

function guessExtension(contentType: string | null): "png" | "jpeg" | null {
  if (!contentType) return null;
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpeg";
  return null;
}

function buildPhotoRun(photo: RegisteredPhoto): string {
  // Inline DrawingML — same shape as buildSignatureRun above, but
  // sized for the appendix tile and named per-photo.
  return (
    '<w:r>' +
      '<w:drawing>' +
        '<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
          `<wp:extent cx="${PHOTO_WIDTH_EMU}" cy="${PHOTO_HEIGHT_EMU}"/>` +
          '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
          `<wp:docPr id="${photo.drawingId}" name="Photo${photo.ordinal}"/>` +
          '<wp:cNvGraphicFramePr>' +
            '<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>' +
          '</wp:cNvGraphicFramePr>' +
          '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
            '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
              '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
                '<pic:nvPicPr>' +
                  `<pic:cNvPr id="${photo.drawingId}" name="Photo${photo.ordinal}"/>` +
                  '<pic:cNvPicPr/>' +
                '</pic:nvPicPr>' +
                '<pic:blipFill>' +
                  `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${photo.relId}"/>` +
                  '<a:stretch><a:fillRect/></a:stretch>' +
                '</pic:blipFill>' +
                '<pic:spPr>' +
                  '<a:xfrm>' +
                    '<a:off x="0" y="0"/>' +
                    `<a:ext cx="${PHOTO_WIDTH_EMU}" cy="${PHOTO_HEIGHT_EMU}"/>` +
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

function buildPhotoCell(photo: RegisteredPhoto): string {
  const captionXml = photo.caption.trim().length > 0
    ? `<w:p><w:pPr><w:spacing w:before="60" w:after="0"/></w:pPr>` +
        `<w:r><w:rPr><w:i/><w:iCs/><w:sz w:val="18"/><w:color w:val="6B7280"/></w:rPr>` +
        `<w:t xml:space="preserve">${escapeXmlText(photo.caption.trim())}</w:t></w:r></w:p>`
    : "";
  return (
    "<w:tc>" +
      '<w:tcPr>' +
        '<w:tcW w:w="2500" w:type="pct"/>' +
        '<w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>' +
      '</w:tcPr>' +
      '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' + buildPhotoRun(photo) + '</w:p>' +
      captionXml +
    "</w:tc>"
  );
}

function buildPhotoAppendix(photos: RegisteredPhoto[]): string {
  const heading =
    '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="120"/></w:pPr>' +
      '<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="C53030"/></w:rPr>' +
        '<w:t xml:space="preserve">Appendix A — Photo evidence</w:t>' +
      "</w:r>" +
    "</w:p>";

  if (photos.length === 0) return "";

  const tblPr =
    "<w:tblPr>" +
      '<w:tblW w:w="5000" w:type="pct"/>' +
      '<w:tblLayout w:type="autofit"/>' +
    "</w:tblPr>";
  const tblGrid =
    "<w:tblGrid>" +
      '<w:gridCol w:w="4800"/>' +
      '<w:gridCol w:w="4800"/>' +
    "</w:tblGrid>";

  // Pair photos into rows of 2 — odd count gets an empty right cell.
  const rows: string[] = [];
  for (let i = 0; i < photos.length; i += 2) {
    const left = buildPhotoCell(photos[i]);
    const right = i + 1 < photos.length
      ? buildPhotoCell(photos[i + 1])
      : '<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p></w:tc>';
    rows.push(`<w:tr>${left}${right}</w:tr>`);
  }

  return heading + `<w:tbl>${tblPr}${tblGrid}${rows.join("")}</w:tbl>`;
}

function injectPhotoAppendix(xml: string, appendix: string): string {
  if (!appendix) return xml;
  const sectIdx = xml.lastIndexOf("<w:sectPr");
  const bodyEndIdx = xml.lastIndexOf("</w:body>");
  const insertAt = sectIdx > 0 && sectIdx < bodyEndIdx ? sectIdx : bodyEndIdx;
  if (insertAt < 0) return xml;
  return xml.slice(0, insertAt) + appendix + xml.slice(insertAt);
}

async function appendPhotoEvidence(
  zip: ZipLikeFiles,
  doc: string,
  bundle: Bundle,
  diag: PhotoAppendixDiagnostics,
): Promise<string> {
  const photos = bundle.photos ?? [];
  diag.photos_received = photos.length;
  if (photos.length === 0) return doc;

  // Load rels + content-types once; append per-photo, write back at
  // the end. Same pattern as the signature embedder.
  let relsXml: string;
  let ctXml: string;
  try {
    relsXml = await zip.files["word/_rels/document.xml.rels"].async("string");
    ctXml = await zip.files["[Content_Types].xml"].async("string");
  } catch (err) {
    console.warn("[generate-callout-docx] couldn't read rels/CT for photo appendix:", err);
    return doc;
  }

  const registered: RegisteredPhoto[] = [];

  for (const photo of photos) {
    if (!photo.signed_url) {
      diag.failures.push({ ordinal: photo.ordinal, reason: "no signed URL" });
      continue;
    }
    try {
      const resp = await fetch(photo.signed_url);
      if (!resp.ok) throw new Error(`http ${resp.status}`);
      const ext = guessExtension(resp.headers.get("Content-Type"))
        ?? (photo.storage_path.toLowerCase().endsWith(".png") ? "png" : "jpeg");
      const bytes = new Uint8Array(await resp.arrayBuffer());
      if (bytes.length === 0) throw new Error("empty body");

      const relId = `rIdPhoto${photo.ordinal}`;
      const fileName = `photo_${photo.ordinal}.${ext}`;
      zip.file(`word/media/${fileName}`, bytes);

      if (!relsXml.includes(`Id="${relId}"`)) {
        const rel = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${fileName}"/>`;
        relsXml = relsXml.replace("</Relationships>", `${rel}</Relationships>`);
      }
      if (!ctXml.includes(`Extension="${ext}"`)) {
        const mime = ext === "png" ? "image/png" : "image/jpeg";
        const entry = `<Default Extension="${ext}" ContentType="${mime}"/>`;
        ctXml = ctXml.replace(/<Default /, entry + "<Default ");
      }

      registered.push({
        relId,
        // 2000+ avoids collision with the signature embedder's 1001/1002
        drawingId: 2000 + photo.ordinal,
        caption: photo.caption ?? "",
        ordinal: photo.ordinal,
      });
      diag.photos_embedded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      diag.failures.push({ ordinal: photo.ordinal, reason: msg });
      console.warn(`[generate-callout-docx] photo ${photo.ordinal} skipped:`, msg);
    }
  }

  zip.file("word/_rels/document.xml.rels", relsXml);
  zip.file("[Content_Types].xml", ctXml);

  const appendix = buildPhotoAppendix(registered);
  return injectPhotoAppendix(doc, appendix);
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

    // Photo evidence appendix — fetches each photo via its pre-signed
    // URL, registers media/rels/content-types, lays out a captioned
    // 2-column grid before the trailing <w:sectPr>. Per-photo
    // failures surface via photo_diagnostics; the appendix renders
    // with whatever succeeded.
    const photoDiag: PhotoAppendixDiagnostics = {
      photos_received: 0,
      photos_embedded: 0,
      failures: [],
    };
    filledXml = await appendPhotoEvidence(
      zip as unknown as ZipLikeFiles,
      filledXml,
      bundle,
      photoDiag,
    );
    console.log("[generate-callout-docx] photo appendix:", JSON.stringify(photoDiag));

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
        // Photo embed diagnostics — received/embedded counts plus
        // per-photo failure reasons. Frontend toasts when some
        // photos were captured but didn't make it into Appendix A.
        photo_diagnostics: photoDiag,
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
