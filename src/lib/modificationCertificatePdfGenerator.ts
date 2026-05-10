import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { ModificationPayload } from "@/services/newCertificateService";

const C = {
  textDark:    [0, 0, 0]       as [number, number, number],
  textGrey:    [80, 80, 80]    as [number, number, number],
  borderGrey:  [180, 180, 180] as [number, number, number],
  lightGrey:   [242, 242, 242] as [number, number, number],
  sectionBg:   [217, 217, 217] as [number, number, number],
  yellowBanner:[255, 255, 204] as [number, number, number],
  green:       [146, 208, 80]  as [number, number, number],
  amber:       [255, 192, 0]   as [number, number, number],
  red:         [220, 38, 38]   as [number, number, number],
  white:       [255, 255, 255] as [number, number, number],
  navyBg:      [30, 41, 90]    as [number, number, number],
};

function sanitize(t: string | null | undefined): string {
  if (!t) return "";
  return String(t).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "-").replace(/\u00A0/g, " ").replace(/[^\x00-\x7F\xA3\xC0-\xFF]/g, "").trim();
}

function yn(v: string | undefined): string { return v === "Yes" ? "YES" : v === "No" ? "NO" : "—"; }

function resultColor(r: string): [number, number, number] {
  if (r === "Pass") return C.green;
  if (r === "Fail") return C.red;
  if (r === "Partial") return C.amber;
  return C.lightGrey;
}


async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url); const b = await r.blob();
    return new Promise((res) => { const fr = new FileReader(); fr.onloadend = () => res(fr.result as string); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch { return null; }
}

/** Load logo and get natural dimensions for aspect-ratio-correct placement */
async function loadLogoWithSize(url: string): Promise<{ base64: string; w: number; h: number } | null> {
  const base64 = await loadImageAsBase64(url);
  if (!base64) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ base64, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ base64, w: 100, h: 100 }); // fallback square
    img.src = base64;
  });
}

/** Fit image into a bounding box preserving aspect ratio */
function fitToBox(naturalW: number, naturalH: number, maxW: number, maxH: number): [number, number] {
  const ratio = naturalW / naturalH;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  return [w, h];
}

export async function generateModificationCertificatePDF(
  payload: ModificationPayload,
  options?: { autoSign?: boolean }
): Promise<void> {
  const { data: company } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
  const logoUrl = company?.report_logo_url || company?.company_logo_url || null;
  const logoData = logoUrl ? await loadLogoWithSize(logoUrl) : null;
  const companyName = sanitize(company?.company_name) || "BHO Fire & Security Ltd";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  const ML = 12, MR = 12, CW = pw - ML - MR;
  let y = 0;

  function drawHeader() {
    y = 8;
    doc.setFillColor(...C.navyBg); doc.rect(ML, y, CW, 16, "F");
    if (logoData) {
      try {
        const [logoW, logoH] = fitToBox(logoData.w, logoData.h, 34, 13);
        const logoY = y + 1.5 + (13 - logoH) / 2;
        doc.addImage(logoData.base64, "PNG", ML + 2, logoY, logoW, logoH, undefined, "FAST");
      } catch {}
    }
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
    doc.text("FIRE DETECTION & ALARM SYSTEM", pw / 2, y + 6, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("MODIFICATION CERTIFICATE   |   BS 5839-1:2025 Annex F   |   BAFE FD/05", pw / 2, y + 12, { align: "center" });
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
    doc.text(`Cert: ${sanitize(payload.certificate_reference) || "DRAFT"}`, pw - MR - 2, y + 6, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(`Issuer: ${companyName}`, pw - MR - 2, y + 12, { align: "right" });
    y += 20;
  }

  function drawFooter() {
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
      doc.setPage(p);
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey);
      doc.text(`${companyName}  |  Modification Certificate  |  BS 5839-1:2025`, ML, ph - 5);
      doc.text(`Page ${p} of ${doc.getNumberOfPages()}  |  Ref: ${sanitize(payload.certificate_reference) || "DRAFT"}`, pw - MR, ph - 5, { align: "right" });
      doc.setDrawColor(...C.borderGrey); doc.setLineWidth(0.3); doc.line(ML, ph - 7, pw - MR, ph - 7);
    }
  }

  function drawSection(title: string) {
    if (y > ph - 50) { doc.addPage(); drawHeader(); }
    doc.setFillColor(...C.sectionBg); doc.rect(ML, y, CW, 6, "F");
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.textDark);
    doc.text(title, ML + 3, y + 4.2); y += 7;
  }

  function checkPage(n: number) { if (y + n > ph - 18) { doc.addPage(); drawHeader(); } }

  function twoCol(rows: [string, string][], lw = 58) {
    autoTable(doc, {
      startY: y,
      body: rows.map(([l, v]) => [{ content: l, styles: { fontStyle: "bold", fillColor: C.lightGrey } }, v]),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2.2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: lw }, 1: { cellWidth: CW - lw } },
      margin: { left: ML, right: MR },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ── Content ──────────────────────────────────────────────────────────────────
  drawHeader();

  drawSection("1. Certificate Details");
  twoCol([
    ["Certificate Reference", sanitize(payload.certificate_reference) || "(Auto on save)"],
    ["Date of Modification", payload.date_of_modification ? format(new Date(payload.date_of_modification), "dd MMMM yyyy") : "—"],
    ["Job Number", sanitize(payload.job_number) || "—"],
  ]);

  drawSection("2. Premises Details");
  twoCol([
    ["Premises Name", sanitize(payload.premises_name)],
    ["Address", sanitize(payload.premises_address)],
    ["Postcode", sanitize(payload.premises_postcode)],
  ]);

  drawSection("3. Responsible Person");
  twoCol([
    ["Name", sanitize(payload.responsible_person_name)],
    ["Telephone", sanitize(payload.responsible_person_telephone)],
    ["Email", sanitize(payload.responsible_person_email)],
  ]);

  drawSection("4. Existing System References (BS 5839-1 Cl. 46.1)");
  twoCol([
    ["Original Installation Certificate Ref.", sanitize(payload.original_installation_cert_ref) || "—"],
    ["Original Commissioning Certificate Ref.", sanitize(payload.original_commissioning_cert_ref) || "—"],
    ["Previous Modification Certificate Ref.", sanitize(payload.previous_modification_cert_ref) || "N/A"],
    ["Existing System Category", (payload.existing_system_category ?? []).join(", ") || "—"],
    ["Existing Panel Manufacturer", sanitize(payload.existing_panel_manufacturer) || "—"],
    ["Existing Panel Model", sanitize(payload.existing_panel_model) || "—"],
  ]);

  drawSection("5. Details of Modification (BS 5839-1 Cl. 46)");
  const reasonStr = payload.reason_for_modification === "Other"
    ? `Other: ${sanitize(payload.reason_other)}`
    : sanitize(payload.reason_for_modification) || "—";
  twoCol([["Reason for Modification", reasonStr]]);

  // Scope matrix
  const scopeRows: [string, string, string][] = [
    ["Devices added",    yn(payload.devices_added),    payload.devices_added === "Yes" ? `${payload.devices_added_count ?? "—"} devices` : ""],
    ["Devices removed",  yn(payload.devices_removed),  payload.devices_removed === "Yes" ? `${payload.devices_removed_count ?? "—"} devices` : ""],
    ["Zones added",      yn(payload.zones_added),      payload.zones_added === "Yes" ? `${payload.zones_added_count ?? "—"} zones` : ""],
    ["Zones removed",    yn(payload.zones_removed),    payload.zones_removed === "Yes" ? `${payload.zones_removed_count ?? "—"} zones` : ""],
    ["Panel changes",    yn(payload.panel_changes),    sanitize(payload.panel_changes_description)],
    ["Cable additions",  yn(payload.cable_additions),  sanitize(payload.cable_additions_description)],
    ["Ancillary changes",yn(payload.ancillary_changes),sanitize(payload.ancillary_description)],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Modification Type", "Carried out?", "Detail"]],
    body: scopeRows,
    theme: "grid",
    headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 22, halign: "center" }, 2: { cellWidth: CW - 46 - 22 } },
    margin: { left: ML, right: MR },
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  autoTable(doc, {
    startY: y,
    head: [["Full Description of Modification Works"]],
    body: [[sanitize(payload.description_of_modifications) || "—"]],
    theme: "grid",
    headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8.5, cellPadding: 3, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    margin: { left: ML, right: MR },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  drawSection("6. System After Modification");
  twoCol([
    ["System Category Changed?", yn(payload.system_category_changed)],
    ["System Category (Post-Modification)", payload.system_category_changed === "Yes" ? (payload.new_system_category ?? []).join(", ") : "Unchanged — " + (payload.existing_system_category ?? []).join(", ")],
    ["Areas Affected by Modification", sanitize(payload.areas_affected) || "—"],
    ["Standard Installed To", sanitize(payload.standard_modified_to) || "BS 5839-1:2017+A2:2019"],
    ["Cable Types Used", sanitize(payload.cable_types_used) || "—"],
  ]);

  // Post-mod commissioning tests
  drawSection("7. Post-Modification Commissioning Tests (BS 5839-1 Cl. 46.2)");
  const tests = payload.post_mod_tests ?? [];
  if (tests.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Test Item", "BS Clause", "Result", "Comments"]],
      body: tests.map((t) => [
        sanitize(t.item), t.bs_clause,
        { content: t.result || "—", styles: { fontStyle: "bold", halign: "center", fillColor: t.result ? resultColor(t.result) : C.lightGrey, textColor: t.result === "Pass" || t.result === "Fail" ? C.white : C.textDark } },
        sanitize(t.comment) || "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: CW * 0.44 }, 1: { cellWidth: 20 }, 2: { cellWidth: 18, halign: "center" }, 3: { cellWidth: CW - CW * 0.44 - 20 - 18 } },
      margin: { left: ML, right: MR },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
    twoCol([
      ["New devices tested", String(payload.new_devices_tested ?? "—")],
      ["Modified devices re-tested", String(payload.modified_devices_tested ?? "—")],
    ], 70);
  } else {
    autoTable(doc, {
      startY: y,
      body: [[{ content: "No post-modification tests recorded.", styles: { halign: "center", fontStyle: "italic", textColor: C.textGrey, fillColor: C.lightGrey } }]],
      theme: "grid", styles: { fontSize: 8.5, cellPadding: 3, lineColor: C.borderGrey, lineWidth: 0.2 }, margin: { left: ML, right: MR },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // Variations
  drawSection("8. Variations from BS 5839-1");
  if (payload.variations_present !== "Yes" || !payload.variations?.length) {
    autoTable(doc, {
      startY: y,
      body: [[{ content: payload.variations_present === "No" ? "No variations." : "Not declared.", styles: { halign: "center", fontStyle: "italic", textColor: C.textGrey, fillColor: C.lightGrey } }]],
      theme: "grid", styles: { fontSize: 8.5, cellPadding: 3, lineColor: C.borderGrey, lineWidth: 0.2 }, margin: { left: ML, right: MR },
    });
  } else {
    autoTable(doc, {
      startY: y,
      head: [["#", "Variation", "Justification", "BS Clause", "Agreed?"]],
      body: (payload.variations || []).map((v, i) => [String(i + 1), sanitize(v.description), sanitize(v.justification), sanitize(v.bs_clause) || "—", v.agreed_with_rp || "—"]),
      theme: "grid",
      headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.8, cellPadding: 2, lineColor: C.borderGrey, lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 8, halign: "center" }, 3: { cellWidth: 20 }, 4: { cellWidth: 18, halign: "center" } },
      margin: { left: ML, right: MR },
    });
  }
  y = (doc as any).lastAutoTable.finalY + 4;

  // Outstanding works
  drawSection("9. Outstanding Works");
  if (payload.outstanding_works_present !== "Yes" || !payload.outstanding_works?.length) {
    autoTable(doc, {
      startY: y,
      body: [[{ content: payload.outstanding_works_present === "No" ? "No outstanding works." : "Not declared.", styles: { halign: "center", fontStyle: "italic", textColor: C.textGrey, fillColor: C.lightGrey } }]],
      theme: "grid", styles: { fontSize: 8.5, cellPadding: 3, lineColor: C.borderGrey, lineWidth: 0.2 }, margin: { left: ML, right: MR },
    });
  } else {
    autoTable(doc, {
      startY: y,
      head: [["#", "Description", "Target Date", "Responsibility"]],
      body: (payload.outstanding_works || []).map((w, i) => [String(i + 1), sanitize(w.description), sanitize(w.target_date) || "—", sanitize(w.responsibility) || "—"]),
      theme: "grid",
      headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8.5, cellPadding: 2, lineColor: C.borderGrey, lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 8, halign: "center" }, 2: { cellWidth: 28 }, 3: { cellWidth: 36 } },
      margin: { left: ML, right: MR },
    });
  }
  y = (doc as any).lastAutoTable.finalY + 4;

  // Post-modification system status
  drawSection("10. Post-Modification System Status");
  const status = sanitize(payload.system_status) || "—";
  autoTable(doc, {
    startY: y,
    body: [[{
      content: status.toUpperCase(),
      styles: { halign: "center", fontStyle: "bold", fontSize: 12, cellPadding: 4,
        fillColor: status.startsWith("Satisfactory") ? C.green : status === "Unsatisfactory" ? C.red : C.lightGrey,
        textColor: status !== "—" ? C.white : C.textDark,
      },
    }]],
    theme: "grid", styles: { lineColor: C.borderGrey, lineWidth: 0.2 }, margin: { left: ML, right: MR },
  });
  y = (doc as any).lastAutoTable.finalY + 3;
  if (payload.final_remarks) {
    twoCol([["Final Remarks", sanitize(payload.final_remarks)]]);
  } else { y += 2; }

  // Engineer declaration
  checkPage(80);
  drawSection("11. Engineer Declaration");
  autoTable(doc, {
    startY: y,
    body: [[{
      content: "I certify that the modifications to the fire detection and fire alarm system described in this certificate have been carried out in accordance with BS 5839-1:2025. The post-modification tests recorded above have been completed and the system status is as stated. Any parts of the system not affected by these works remain in the condition described in the original certificates.",
      styles: { fontStyle: "italic", fillColor: C.yellowBanner, cellPadding: 3 },
    }]],
    theme: "grid", styles: { fontSize: 8.5, lineColor: C.borderGrey, lineWidth: 0.2 }, margin: { left: ML, right: MR },
  });
  y = (doc as any).lastAutoTable.finalY + 3;
  twoCol([
    ["Company Name", sanitize(payload.company_name) || companyName],
    ["FIA Member Number", sanitize(payload.fia_member_number) || "—"],
    ["Engineer Name", sanitize(payload.engineer_name)],
    ["Position", sanitize(payload.engineer_position)],
  ]);

  // Signature boxes
  checkPage(48);
  const sigW = (CW - 8) / 2;
  const pairs = [
    { label: "Engineer Signature", sig: payload.engineer_signature, name: sanitize(payload.engineer_name), date: payload.engineer_signed_date, auto: options?.autoSign },
    { label: "Responsible Person", sig: payload.rp_signature, name: sanitize(payload.rp_name_signed), date: payload.rp_signed_date, auto: false },
  ];
  for (let i = 0; i < 2; i++) {
    const sp = pairs[i];
    const x = ML + i * (sigW + 8);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.textGrey);
    doc.text(sp.label, x, y);
    doc.setFillColor(...C.lightGrey); doc.setDrawColor(...C.borderGrey); doc.setLineWidth(0.3);
    doc.roundedRect(x, y + 2, sigW, 22, 1, 1, "FD");
    if (sp.sig) {
      const sv = sp.sig;
      if (sv.startsWith("typed:")) {
        const n = sv.replace("typed:", "");
        doc.setFontSize(18); doc.setFont("helvetica", "bolditalic"); doc.setTextColor(...C.textDark);
        doc.text(n, x + (sigW - doc.getTextWidth(n)) / 2, y + 16);
      } else { try { doc.addImage(sv, "PNG", x + 2, y + 4, sigW - 4, 16, undefined, "FAST"); } catch {} }
    } else if (sp.auto && sp.name) {
      doc.setFont("times", "italic"); doc.setFontSize(22); doc.setTextColor(30, 41, 90);
      doc.text(sp.name, x + (sigW - doc.getTextWidth(sp.name)) / 2, y + 16);
    }
    if (sp.name) { doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.textDark); doc.text(sp.name, x, y + 28); }
    if (sp.date) { doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey); doc.text(`Date: ${format(new Date(sp.date), "dd/MM/yyyy")}`, x, y + 33); }
  }

  drawFooter();
  doc.save(`${sanitize(payload.certificate_reference) || "Modification-Certificate"}.pdf`);
}
