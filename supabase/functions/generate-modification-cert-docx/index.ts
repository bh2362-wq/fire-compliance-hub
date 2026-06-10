// BS 5839-1 Modification Certificate DOCX generator.
//
// Takes a ModificationPayload directly (no DB read — the SmartForm
// already has the data on the client) and fills the BHO Word template
// at _modification-template.ts via exact-text placeholder substitution
// (same engine as generate-callout-docx + generate-bs5839-cert-docx).
//
// Returns { storage_path, signed_url, docx_base64, certificate_number,
// diagnostics } so the client can either:
//   - decode docx_base64 for a direct .docx download, OR
//   - hand storage_path to convert-quote-pdf for the cloud DOCX→PDF
//     chain (matching how downloadBs5839CertPdfViaCloud works).
//
// Output bucket: bs5839-cert-outputs (reused — same lifecycle policies
// as the Installation/Commissioning/Acceptance outputs).
//
// Placeholders in the template:
//   [PREMISES_NAME]            site name
//   [PREMISES_ADDRESS]         site address (joined line)
//   [PREMISES_POSTCODE]
//   [JOB_NUMBER]
//   [ENGINEER_NAME]
//   [ENGINEER_POSITION]
//   [ENGINEER_SIGNATURE]       typed name (drawn-sig embedding is a
//                              follow-up; today renders the typed name)
//   [ENGINEER_SIGNED_DATE]     formatted UK date
//   [COMPANY_NAME_ADDRESS]     "BHO Fire Ltd, St Georges Business Park…"
//   [MODIFICATIONS_DESC]       description_of_modifications
//   [VARIATIONS_DESC]          joined variations (or "—" if none)
//   [TESTED_BOX]               X or " " (post-mod testing complete)
//   [RECORDS_BOX]              X or " " (records updated)
//   [CUSTOMER_NAME]
//   [CUSTOMER_PRINT]
//   [CUSTOMER_POSITION]
//   [CUSTOMER_DATE]

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { MODIFICATION_TEMPLATE_BASE64 } from "./_modification-template.ts";

const BUCKET = "bs5839-cert-outputs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

// ── XML helpers — copied verbatim from generate-bs5839-cert-docx so
//    fill semantics stay identical across the cert family.

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

function fillRaw(xml: string, placeholder: string, value: string): string {
  // Used for the checkbox glyphs — empty string preserved (not em-dash).
  return replaceWtText(xml, placeholder, value);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  // Chunked to avoid call-stack limits on large outputs.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

// ── Payload shape — minimal subset that the template needs.
//    Mirrors src/services/newCertificateService.ts::ModificationPayload
//    but only the fields we render. Extra fields are ignored.

interface ModificationPayload {
  certificate_reference?: string;
  premises_name?: string;
  premises_address?: string;
  premises_postcode?: string;
  job_number?: string;

  description_of_modifications?: string;

  // Either a joined string or an array of "Cl. X — Reason — Justification"
  // entries — the InstallVariationEntry shape on the client.
  variations?: Array<{
    clause?: string; description?: string; reason?: string; justification?: string;
  }> | string;
  variations_present?: "Yes" | "No" | "";

  // Maps to TESTED_BOX — testing complete if post_mod_tests has any pass
  // results OR the engineer flagged system_status as Satisfactory.
  system_status?: string;

  engineer_name?: string;
  engineer_position?: string;
  engineer_signature?: string;
  engineer_signed_date?: string;

  rp_name_signed?: string;
  rp_signature?: string;
  rp_signed_date?: string;
  responsible_person_name?: string;
}

function composeVariationsBlock(p: ModificationPayload): string {
  if (!p.variations) return "";
  if (typeof p.variations === "string") return p.variations;
  if (!Array.isArray(p.variations) || p.variations.length === 0) return "";
  return p.variations
    .map((v, i) => {
      const parts = [
        v.clause ? `Cl. ${v.clause}` : null,
        v.description || null,
        v.reason ? `Reason: ${v.reason}` : null,
        v.justification ? `Justification: ${v.justification}` : null,
      ].filter(Boolean);
      return `${i + 1}. ${parts.join(" — ")}`;
    })
    .join("\n");
}

interface CompanyRow {
  company_name: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
}

async function loadCompany(supabase: ReturnType<typeof createClient>): Promise<CompanyRow | null> {
  const { data } = await supabase
    .from("company_settings")
    .select("company_name, address, city, postcode")
    .limit(1)
    .maybeSingle();
  return data as CompanyRow | null;
}

function composeCompanyLine(c: CompanyRow | null): string {
  if (!c) return "BHO Fire Ltd";
  const parts = [c.company_name, c.address, c.city, c.postcode]
    .filter((x): x is string => !!x && x.trim() !== "");
  return parts.length > 0 ? parts.join(", ") : "BHO Fire Ltd";
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const payload: ModificationPayload = (body?.payload ?? {}) as ModificationPayload;

    if (!payload || !payload.certificate_reference) {
      return new Response(
        JSON.stringify({ error: "Missing payload.certificate_reference" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const company = await loadCompany(supabase);

    // Load template + extract document.xml for substitution.
    const templateBytes = base64ToBytes(MODIFICATION_TEMPLATE_BASE64);
    const zip = await JSZip.loadAsync(templateBytes);
    const docFile = zip.file("word/document.xml");
    if (!docFile) throw new Error("Template is missing word/document.xml");
    let xml = await docFile.async("string");

    // Site address — join address + city; postcode lives in its own slot.
    const addrLine = [payload.premises_address].filter(Boolean).join(", ");

    // Variations + tested/records checkboxes
    const variationsBlock = composeVariationsBlock(payload);
    const tested = payload.system_status === "Satisfactory" ||
                   payload.system_status === "Satisfactory with Observations";
    const records = !!(payload.engineer_competency_confirmed
      ?? (payload as { records_updated?: boolean }).records_updated);

    // Replace all placeholders. Empty values render as em-dash to match
    // the rest of the cert family. Checkbox glyphs use the raw filler so
    // the visual stays an "X" vs blank, not "—".
    xml = fill(xml, "[PREMISES_NAME]", payload.premises_name);
    xml = fill(xml, "[PREMISES_ADDRESS]", addrLine);
    xml = fill(xml, "[PREMISES_POSTCODE]", payload.premises_postcode);
    xml = fill(xml, "[JOB_NUMBER]", payload.job_number);
    xml = fill(xml, "[ENGINEER_NAME]", payload.engineer_name);
    xml = fill(xml, "[ENGINEER_POSITION]", payload.engineer_position);
    xml = fill(xml, "[ENGINEER_SIGNATURE]",
      payload.engineer_signature?.startsWith("typed:")
        ? payload.engineer_signature.slice(6)
        : payload.engineer_name);
    xml = fill(xml, "[ENGINEER_SIGNED_DATE]", fmtDate(payload.engineer_signed_date));
    xml = fill(xml, "[COMPANY_NAME_ADDRESS]", composeCompanyLine(company));
    xml = fill(xml, "[MODIFICATIONS_DESC]", payload.description_of_modifications);
    xml = fill(xml, "[VARIATIONS_DESC]",
      payload.variations_present === "No" ? "None" : (variationsBlock || "None"));
    xml = fillRaw(xml, "[TESTED_BOX]", tested ? "X" : " ");
    xml = fillRaw(xml, "[RECORDS_BOX]", records ? "X" : " ");
    xml = fill(xml, "[CUSTOMER_NAME]",
      payload.rp_signature?.startsWith("typed:")
        ? payload.rp_signature.slice(6)
        : payload.rp_name_signed);
    xml = fill(xml, "[CUSTOMER_PRINT]",
      payload.rp_name_signed || payload.responsible_person_name);
    xml = fill(xml, "[CUSTOMER_POSITION]",
      (payload as { rp_position?: string }).rp_position);
    xml = fill(xml, "[CUSTOMER_DATE]", fmtDate(payload.rp_signed_date));

    zip.file("word/document.xml", xml);
    const outBytes = await zip.generateAsync({ type: "uint8array" });

    // Upload to cert outputs bucket. Path keyed by certificate_reference
    // so re-runs overwrite the same object — single source of truth.
    const safeRef = payload.certificate_reference.replace(/[^A-Za-z0-9._-]/g, "_");
    const storagePath = `modification/${safeRef}.docx`;
    let uploadError: string | null = null;
    let signedUrl: string | null = null;
    try {
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, outBytes, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });
      if (upErr) {
        uploadError = upErr.message;
      } else {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(storagePath, 60 * 60); // 1 hour
        signedUrl = signed?.signedUrl ?? null;
      }
    } catch (e) {
      uploadError = e instanceof Error ? e.message : String(e);
    }

    return new Response(
      JSON.stringify({
        cert_type: "modification",
        certificate_number: payload.certificate_reference,
        storage_path: uploadError ? null : storagePath,
        signed_url: signedUrl,
        bucket: BUCKET,
        docx_base64: bytesToBase64(outBytes),
        diagnostics: {
          template_bytes: templateBytes.length,
          output_bytes: outBytes.length,
          storage_upload_error: uploadError,
        },
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-modification-cert-docx] fatal:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
