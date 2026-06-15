/**
 * generate-maintenance-proposal-docx
 *
 * Renders a maintenance_proposals row through master-maintenance-
 * proposal.docx in the quote-assets bucket. Mirrors generate-quote-docx
 * in shape — fill placeholders → zip → upload → write latest_docx_path.
 *
 * Engineer needs to author master-maintenance-proposal.docx and upload
 * to storage bucket "quote-assets" (path: master-maintenance-proposal.docx).
 * Recognised placeholders — drop these into the Word doc cells:
 *
 *   Header / refs
 *     [Proposal Ref]            → proposal_number
 *     [Date Issued]             → created_at, "12 June 2026" style
 *     [Valid Until]             → valid_until
 *
 *   Client / site
 *     [Client Company]          → customers.name
 *     [Client Contact]          → customers.contact_name
 *     [Client Email]            → customers.contact_email
 *     [Client Phone]            → customers.contact_phone
 *     [Client Address]          → customers.address + city + postcode
 *     [Site Name]               → sites.name
 *     [Site Address]            → sites.address + city + postcode
 *
 *   Proposal body
 *     [Title]                   → maintenance_proposals.title
 *     [Introduction]            → maintenance_proposals.introduction
 *
 *   Service config
 *     [Visits Per Year]         → service_visits_per_year
 *     [PPM Interval]            → ppm_interval_months (months)
 *     [SLA Tier]                → sla_tier
 *     [Fault Response]          → fault_response_hours (hrs)
 *     [OOH Response]            → ooh_response_hours (hrs)
 *
 *   Pricing
 *     [Annual Fee]              → annual_fee, £ formatted
 *     [Payment Terms]           → payment_terms
 *     [Callout Charge]          → callout_charge, £
 *     [OOH Callout Charge]      → ooh_callout_charge, £
 *     [Parts Markup]            → parts_markup_percent, %
 *     [VAT Rate]                → vat_rate, %
 *
 *   Acceptance block (filled when customer has accepted via the portal)
 *     [Customer Signature]      → typed name (no prefix); format the cell
 *                                 with a script font (Lucida Handwriting, etc.)
 *     [Customer Print Name]     → accepted_by_name
 *     [Customer Date]           → client_accepted_at, "12 June 2026"
 *     [Customer PO Number]      → client_po_number
 *
 *   Issued-by block (footer)
 *     [Estimator Name]          → profiles.full_name of created_by
 *     [Estimator Email]         → profiles.email of created_by
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── XML helpers — mirror the ones in generate-quote-docx ──────────────────────
//
// Kept inline because Supabase Edge Functions don't have a shared-module
// convention; pulling these out into a deno.land URL would couple deploys.

function xmlEscapeSearch(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function replaceAllWtText(xml: string, placeholder: string, value: string): string {
  const safe = xmlEscapeSearch(placeholder).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(<w:t(?:\\s[^>]*)?>)([^<]*?)${safe}([^<]*?)(</w:t>)`, "g");
  return xml.replace(re, (_m, openTag, before, after, closeTag) =>
    `${openTag}${before}${escapeXmlText(value)}${after}${closeTag}`,
  );
}

function findEnclosingWpStart(xml: string, fromIdx: number): number {
  const slice = xml.substring(0, fromIdx);
  return slice.lastIndexOf("<w:p");
}

function removePairedParagraphs(xml: string, placeholder: string): string {
  const phIdx = xml.indexOf(xmlEscapeSearch(placeholder));
  if (phIdx < 0) return xml;
  const valueStart = findEnclosingWpStart(xml, phIdx);
  if (valueStart < 0) return xml;
  const valueEndMarker = "</w:p>";
  const valueEnd = xml.indexOf(valueEndMarker, phIdx) + valueEndMarker.length;
  if (valueEnd <= 0) return xml;
  const prevCloseIdx = xml.lastIndexOf(valueEndMarker, valueStart);
  if (prevCloseIdx < 0) return xml;
  const labelStart = findEnclosingWpStart(xml, prevCloseIdx);
  if (labelStart < 0) return xml;
  return xml.substring(0, labelStart) + xml.substring(valueEnd);
}

function fieldOrOmit(xml: string, placeholder: string, value: string | null | undefined): string {
  if (value && String(value).trim()) return replaceAllWtText(xml, placeholder, String(value).trim());
  return removePairedParagraphs(xml, placeholder);
}

function formatDateDdMMMMyyyy(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const months = ["January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  } catch {
    return "";
  }
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "";
  return `£${Number(n).toFixed(2)}`;
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  let body: { proposal_id?: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!body.proposal_id) {
    return new Response(JSON.stringify({ error: "proposal_id is required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase: SupabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Fetch the proposal + customer + site + issuer profile in one
    //    join so the renderer doesn't N+1.
    const { data: row, error: fetchErr } = await supabase
      .from("maintenance_proposals")
      .select(
        `*,
         customer:customers(id, name, contact_name, contact_email, contact_phone, address, city, postcode),
         site:sites(id, name, address, city, postcode)`,
      )
      .eq("id", body.proposal_id)
      .maybeSingle();
    if (fetchErr || !row) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const proposal = row as Record<string, unknown>;
    const customer = (proposal.customer as Record<string, unknown> | null) ?? null;
    const site = (proposal.site as Record<string, unknown> | null) ?? null;

    let issuer: { name: string; email: string } = { name: "", email: "" };
    if (proposal.created_by) {
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", proposal.created_by)
        .maybeSingle();
      const pr = p as { full_name?: string | null; email?: string | null } | null;
      issuer = {
        name: pr?.full_name?.trim() ?? "",
        email: pr?.email?.trim() ?? "",
      };
    }

    // 2. Load the master template from quote-assets bucket. Engineer
    //    needs to upload master-maintenance-proposal.docx separately;
    //    until then we surface a friendly error so the dashboard can
    //    show what to do next instead of a generic 500.
    const { data: tmplBlob, error: tmplErr } = await supabase.storage
      .from("quote-assets")
      .download("master-maintenance-proposal.docx");
    if (tmplErr || !tmplBlob) {
      return new Response(
        JSON.stringify({
          error:
            "master-maintenance-proposal.docx not found in the quote-assets bucket. " +
            "Author the template in Word using the placeholders listed in the " +
            "generate-maintenance-proposal-docx function header, then upload to " +
            "supabase storage: bucket=quote-assets, name=master-maintenance-proposal.docx.",
        }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
    const tmplBytes = new Uint8Array(await tmplBlob.arrayBuffer());

    // 3. Unzip + read document.xml.
    const zip = await JSZip.loadAsync(tmplBytes);
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) {
      throw new Error("master-maintenance-proposal.docx is missing word/document.xml");
    }
    let xml = await documentFile.async("string");

    // 4. Compose render-ready strings.
    const clientCompany = (customer?.name as string | null) ?? "";
    const clientContact = (customer?.contact_name as string | null) ?? "";
    const clientEmail = (customer?.contact_email as string | null) ?? "";
    const clientPhone = (customer?.contact_phone as string | null) ?? "";
    const clientAddress = [
      customer?.address, customer?.city, customer?.postcode,
    ].filter(Boolean).join(", ");
    const siteName = (site?.name as string | null) ?? "";
    const siteAddress = [
      site?.address, site?.city, site?.postcode,
    ].filter(Boolean).join(", ");

    const annualFee = fmtMoney(proposal.annual_fee as number | null);
    const callout = fmtMoney(proposal.callout_charge as number | null);
    const oohCallout = fmtMoney(proposal.ooh_callout_charge as number | null);
    const partsMarkup = proposal.parts_markup_percent != null
      ? `${Number(proposal.parts_markup_percent).toFixed(0)}%` : "";
    const vatRate = proposal.vat_rate != null
      ? `${Number(proposal.vat_rate).toFixed(0)}%` : "";

    const visitsPerYear = proposal.service_visits_per_year != null
      ? String(proposal.service_visits_per_year) : "";
    const ppmInterval = proposal.ppm_interval_months != null
      ? `${proposal.ppm_interval_months} months` : "";
    const faultResp = proposal.fault_response_hours != null
      ? `${proposal.fault_response_hours} hours` : "";
    const oohResp = proposal.ooh_response_hours != null
      ? `${proposal.ooh_response_hours} hours` : "";

    // Strip the "typed:" prefix from the acceptance signature so the
    // cell renders just the name (cell is formatted with a script font
    // in the template).
    const sigRaw = (proposal.client_acceptance_signature as string | null) ?? "";
    const customerSignature = sigRaw.startsWith("typed:")
      ? sigRaw.slice("typed:".length).trim() : "";

    // 5. Fill placeholders.
    xml = replaceAllWtText(xml, "[Proposal Ref]", String(proposal.proposal_number ?? ""));
    xml = replaceAllWtText(xml, "[Date Issued]", formatDateDdMMMMyyyy(proposal.created_at as string));
    xml = replaceAllWtText(xml, "[Valid Until]", formatDateDdMMMMyyyy(proposal.valid_until as string | null));

    xml = fieldOrOmit(xml, "[Client Company]", clientCompany);
    xml = fieldOrOmit(xml, "[Client Contact]", clientContact);
    xml = fieldOrOmit(xml, "[Client Email]", clientEmail);
    xml = fieldOrOmit(xml, "[Client Phone]", clientPhone);
    xml = fieldOrOmit(xml, "[Client Address]", clientAddress);
    xml = fieldOrOmit(xml, "[Site Name]", siteName);
    xml = fieldOrOmit(xml, "[Site Address]", siteAddress);

    xml = fieldOrOmit(xml, "[Title]", (proposal.title as string | null) ?? "");
    xml = fieldOrOmit(xml, "[Introduction]", (proposal.introduction as string | null) ?? "");

    xml = fieldOrOmit(xml, "[Visits Per Year]", visitsPerYear);
    xml = fieldOrOmit(xml, "[PPM Interval]", ppmInterval);
    xml = fieldOrOmit(xml, "[SLA Tier]", (proposal.sla_tier as string | null) ?? "");
    xml = fieldOrOmit(xml, "[Fault Response]", faultResp);
    xml = fieldOrOmit(xml, "[OOH Response]", oohResp);

    xml = fieldOrOmit(xml, "[Annual Fee]", annualFee);
    xml = fieldOrOmit(xml, "[Payment Terms]", (proposal.payment_terms as string | null) ?? "");
    xml = fieldOrOmit(xml, "[Callout Charge]", callout);
    xml = fieldOrOmit(xml, "[OOH Callout Charge]", oohCallout);
    xml = fieldOrOmit(xml, "[Parts Markup]", partsMarkup);
    xml = fieldOrOmit(xml, "[VAT Rate]", vatRate);

    // Acceptance — replaceAllWtText (not fieldOrOmit) since these sit in
    // table cells: empty value blanks the cell rather than collapsing
    // the row, matching the PR #230 contract for quote-acceptance cells.
    xml = replaceAllWtText(xml, "[Customer Signature]", customerSignature);
    xml = replaceAllWtText(xml, "[Customer Print Name]", (proposal.accepted_by_name as string | null) ?? "");
    xml = replaceAllWtText(xml, "[Customer Date]", formatDateDdMMMMyyyy(proposal.client_accepted_at as string | null));
    xml = replaceAllWtText(xml, "[Customer PO Number]", (proposal.client_po_number as string | null) ?? "");

    xml = fieldOrOmit(xml, "[Estimator Name]", issuer.name);
    xml = fieldOrOmit(xml, "[Estimator Email]", issuer.email);

    // 6. Re-zip and upload.
    zip.file("word/document.xml", xml);
    const docxBytes = await zip.generateAsync({ type: "uint8array" });

    const storagePath = `maintenance-proposals/${proposal.proposal_number}.docx`;
    const { error: upErr } = await supabase.storage
      .from("quote-outputs")
      .upload(storagePath, docxBytes, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed, error: signErr } = await supabase.storage
      .from("quote-outputs")
      .createSignedUrl(storagePath, 3600);
    if (signErr || !signed?.signedUrl) throw new Error("Failed to sign URL");

    // 7. Write back path + clear cached PDF (regenerate on next download).
    await supabase
      .from("maintenance_proposals")
      .update({ latest_docx_path: storagePath, latest_pdf_path: null })
      .eq("id", body.proposal_id);

    return new Response(
      JSON.stringify({
        storage_path: storagePath,
        signed_url: signed.signedUrl,
        file_size_bytes: docxBytes.byteLength,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[generate-maintenance-proposal-docx]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
