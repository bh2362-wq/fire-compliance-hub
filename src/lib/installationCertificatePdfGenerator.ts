import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { InstallationPayload } from "@/services/newCertificateService";

const C = {
  black:       [0, 0, 0]       as [number, number, number],
  white:       [255, 255, 255] as [number, number, number],
  textDark:    [0, 0, 0]       as [number, number, number],
  textGrey:    [80, 80, 80]    as [number, number, number],
  borderGrey:  [180, 180, 180] as [number, number, number],
  lightGrey:   [242, 242, 242] as [number, number, number],
  sectionBg:   [217, 217, 217] as [number, number, number],
  yellowBanner:[255, 255, 204] as [number, number, number],
  green:       [146, 208, 80]  as [number, number, number],
  amber:       [255, 192, 0]   as [number, number, number],
  red:         [220, 38, 38]   as [number, number, number],
  navyBg:      [30, 41, 90]    as [number, number, number],
};

function sanitize(t: string | null | undefined): string {
  if (!t) return "";
  return String(t)
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "-").replace(/\u2014/g, "--").replace(/\u00A0/g, " ")
    .replace(/[^\x00-\x7F\xA3\xC0-\xFF]/g, "").trim();
}

function yn(v: string | undefined): string {
  return v === "Yes" ? "YES" : v === "No" ? "NO" : "—";
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return new Promise((res) => {
      const fr = new FileReader();
      fr.onloadend = () => res(fr.result as string);
      fr.onerror = () => res(null);
      fr.readAsDataURL(b);
    });
  } catch { return null; }
}

export async function generateInstallationCertificatePDF(
  payload: InstallationPayload,
  options?: { autoSign?: boolean }
): Promise<{ base64: string; fileName: string }> {
  const { data: company } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
  const logoUrl = company?.report_logo_url || company?.company_logo_url || null;
  const logoB64 = logoUrl ? await loadImageAsBase64(logoUrl) : null;
  const companyName = sanitize(company?.company_name) || "BHO Fire & Security Ltd";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ML = 12, MR = 12, CW = pw - ML - MR;
  let page = 1, y = 0;

  function drawHeader() {
    y = 8;
    // Navy bar
    doc.setFillColor(...C.navyBg);
    doc.rect(ML, y, CW, 16, "F");

    if (logoB64) {
      try { doc.addImage(logoB64, "PNG", ML + 2, y + 1, 28, 14, undefined, "FAST"); } catch {}
    }

    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
    doc.text("FIRE DETECTION & ALARM SYSTEM", pw / 2, y + 6, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("INSTALLATION CERTIFICATE   |   BS 5839-1:2025 Annex E   |   BAFE FD/02", pw / 2, y + 12, { align: "center" });

    const certRef = sanitize(payload.certificate_reference) || "DRAFT";
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
    doc.text(`Cert: ${certRef}`, pw - MR - 2, y + 6, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(`Issuer: ${companyName}`, pw - MR - 2, y + 12, { align: "right" });

    y += 20;
  }

  function drawFooter() {
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
      doc.setPage(p);
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey);
      doc.text(`${companyName}  |  Installation Certificate  |  BS 5839-1:2025`, ML, ph - 5);
      doc.text(`Page ${p} of ${doc.getNumberOfPages()}  |  Ref: ${sanitize(payload.certificate_reference) || "DRAFT"}`, pw - MR, ph - 5, { align: "right" });
      doc.setDrawColor(...C.borderGrey); doc.setLineWidth(0.3);
      doc.line(ML, ph - 7, pw - MR, ph - 7);
    }
  }

  function drawSection(title: string) {
    if (y > ph - 50) { doc.addPage(); drawHeader(); page++; }
    doc.setFillColor(...C.sectionBg);
    doc.rect(ML, y, CW, 6, "F");
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.textDark);
    doc.text(title, ML + 3, y + 4.2);
    y += 7;
  }

  function checkPage(needed: number) {
    if (y + needed > ph - 18) { doc.addPage(); drawHeader(); page++; }
  }

  function twoCol(rows: [string, string][], labelW = 52) {
    autoTable(doc, {
      startY: y,
      body: rows.map(([l, v]) => [{ content: l, styles: { fontStyle: "bold", fillColor: C.lightGrey } }, v]),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2.2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: labelW }, 1: { cellWidth: CW - labelW } },
      margin: { left: ML, right: MR },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ── PAGE 1 ──────────────────────────────────────────────────────────────────
  drawHeader();

  // Cert header row
  drawSection("1. Certificate Details");
  twoCol([
    ["Certificate Reference", sanitize(payload.certificate_reference) || "(Auto-generated on save)"],
    ["Date of Completion", payload.date_of_completion ? format(new Date(payload.date_of_completion), "dd MMMM yyyy") : "—"],
    ["Job / Contract Reference", sanitize(payload.job_number) || "—"],
    ["Nature of Works", sanitize(payload.work_type) || "—"],
  ]);

  drawSection("2. Premises Details");
  twoCol([
    ["Premises Name", sanitize(payload.premises_name)],
    ["Address", sanitize(payload.premises_address)],
    ["Postcode", sanitize(payload.premises_postcode)],
    ["Occupancy Type", sanitize(payload.occupancy_type)],
  ]);

  drawSection("3. Responsible Person");
  twoCol([
    ["Name", sanitize(payload.responsible_person_name)],
    ["Position / Title", sanitize(payload.responsible_person_position)],
    ["Telephone", sanitize(payload.responsible_person_telephone)],
    ["Email", sanitize(payload.responsible_person_email)],
  ]);

  drawSection("4. System Details");
  twoCol([
    ["System Category (BS 5839-1)", (payload.system_categories ?? []).join(", ") || "—"],
    ["System Type", sanitize(payload.system_type)],
    ["Panel Manufacturer", sanitize(payload.panel_manufacturer)],
    ["Panel Model", sanitize(payload.panel_model)],
    ["Panel Software Version", sanitize(payload.panel_software_version) || "—"],
    ["Panel Serial Number", sanitize(payload.panel_serial_number) || "—"],
    ["Number of Zones", payload.number_of_zones ? String(payload.number_of_zones) : "—"],
    ["Total Devices Installed", payload.total_devices_installed ? String(payload.total_devices_installed) : "—"],
    ["Areas Covered by System", sanitize(payload.areas_covered) || "—"],
    ["Areas Excluded from System", sanitize(payload.areas_excluded) || "None"],
  ]);

  drawSection("5. Installation Details");
  twoCol([
    ["Standard Installed To", sanitize(payload.standard_installed_to) || "BS 5839-1:2017+A2:2019"],
    ["Cable Types Used", sanitize(payload.cable_types_used) || "—"],
    ["Standby Power Type", sanitize(payload.standby_power_type) || "—"],
    ["Battery Capacity (Ah)", sanitize(payload.battery_capacity_ah) || "—"],
    ["As-Installed Drawings Provided", yn(payload.as_installed_drawings_provided)],
    ["O&M Manual Provided", yn(payload.om_manual_provided)],
    ["System Log Book Provided", yn(payload.logbook_provided)],
  ]);

  checkPage(30);
  autoTable(doc, {
    startY: y,
    head: [["Description of Installation Works"]],
    body: [[sanitize(payload.description_of_works) || "—"]],
    theme: "grid",
    headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8.5, cellPadding: 3, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    margin: { left: ML, right: MR },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // Variations
  drawSection("6. Variations from Specification (BS 5839-1 Cl. 5)");
  if (payload.variations_present !== "Yes" || !payload.variations?.length) {
    autoTable(doc, {
      startY: y,
      body: [[{ content: payload.variations_present === "No" ? "No variations from the agreed specification." : "Not declared.", styles: { halign: "center", fontStyle: "italic", textColor: C.textGrey, fillColor: C.lightGrey } }]],
      theme: "grid", styles: { fontSize: 8.5, cellPadding: 3, lineColor: C.borderGrey, lineWidth: 0.2 }, margin: { left: ML, right: MR },
    });
  } else {
    autoTable(doc, {
      startY: y,
      head: [["#", "Variation Description", "Justification", "BS Clause", "Agreed with RP?"]],
      body: (payload.variations || []).map((v, i) => [String(i + 1), sanitize(v.description), sanitize(v.justification), sanitize(v.bs_clause) || "—", v.agreed_with_rp || "—"]),
      theme: "grid",
      headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.8, cellPadding: 2, lineColor: C.borderGrey, lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 8, halign: "center" }, 3: { cellWidth: 20 }, 4: { cellWidth: 22, halign: "center" } },
      margin: { left: ML, right: MR },
    });
  }
  y = (doc as any).lastAutoTable.finalY + 4;

  // Outstanding works
  drawSection("7. Outstanding Works");
  if (payload.outstanding_works_present !== "Yes" || !payload.outstanding_works?.length) {
    autoTable(doc, {
      startY: y,
      body: [[{ content: payload.outstanding_works_present === "No" ? "No outstanding works at time of issue." : "Not declared.", styles: { halign: "center", fontStyle: "italic", textColor: C.textGrey, fillColor: C.lightGrey } }]],
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

  // Installer Declaration
  checkPage(70);
  drawSection("8. Installer Declaration");
  autoTable(doc, {
    startY: y,
    body: [[{
      content: "I/We certify that the fire detection and fire alarm system described in this certificate has been installed in accordance with BS 5839-1:2025 (or the version current at the time of design) and the agreed specification. The system is ready for commissioning. Any variations from the specification are recorded above.",
      styles: { fontStyle: "italic", fillColor: C.yellowBanner, cellPadding: 3 },
    }]],
    theme: "grid", styles: { fontSize: 8.5, lineColor: C.borderGrey, lineWidth: 0.2 }, margin: { left: ML, right: MR },
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  twoCol([
    ["Company Name", sanitize(payload.company_name) || companyName],
    ["Company Address", sanitize(payload.company_address) || sanitize(company?.address) || ""],
    ["FIA Member Number", sanitize(payload.fia_member_number) || "—"],
    ["BAFE SP203 Registration", sanitize(payload.bafe_registration) || "N/A"],
    ["Engineer Name", sanitize(payload.engineer_name)],
    ["Position", sanitize(payload.engineer_position)],
  ]);

  // Signature boxes
  checkPage(48);
  const engineerName = sanitize(payload.engineer_name) || "";
  const sigW = (CW - 8) / 2;
  const sigPairs = [
    { label: "Engineer Signature", sig: payload.engineer_signature, name: engineerName, date: payload.engineer_signed_date, autoSign: options?.autoSign },
    { label: "Responsible Person Acknowledgement", sig: payload.rp_signature, name: sanitize(payload.rp_name_signed), date: payload.rp_signed_date, autoSign: false },
  ];

  for (let i = 0; i < 2; i++) {
    const sp = sigPairs[i];
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
        const w = doc.getTextWidth(n);
        doc.text(n, x + (sigW - w) / 2, y + 16);
      } else {
        try { doc.addImage(sv, "PNG", x + 2, y + 4, sigW - 4, 16, undefined, "FAST"); } catch {}
      }
    } else if (sp.autoSign && sp.name) {
      doc.setFont("times", "italic"); doc.setFontSize(22); doc.setTextColor(30, 41, 90);
      const w = doc.getTextWidth(sp.name);
      doc.text(sp.name, x + (sigW - w) / 2, y + 16);
    }

    if (sp.name) { doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.textDark); doc.text(sp.name, x, y + 28); }
    if (sp.date) { doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey); doc.text(`Date: ${format(new Date(sp.date), "dd/MM/yyyy")}`, x, y + 33); }
  }
  y += 42;

  drawFooter();
  const filename = `${sanitize(payload.certificate_reference) || "Installation-Certificate"}.pdf`;
  doc.save(filename);
  const base64 = doc.output("datauristring").split(",")[1] ?? "";
  return { base64, fileName: filename };
}
