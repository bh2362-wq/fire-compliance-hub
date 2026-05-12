import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { VisualTaskBriefing, VTBPPEItem, VTBTaskStep } from "@/services/vtbService";

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  navy:        [30, 41, 90]    as [number, number, number],
  white:       [255, 255, 255] as [number, number, number],
  black:       [0, 0, 0]       as [number, number, number],
  textDark:    [20, 20, 20]    as [number, number, number],
  textGrey:    [80, 80, 80]    as [number, number, number],
  lightGrey:   [245, 245, 245] as [number, number, number],
  borderGrey:  [200, 200, 200] as [number, number, number],
  sectionBg:   [230, 230, 230] as [number, number, number],
  green:       [22, 163, 74]   as [number, number, number],
  greenLight:  [220, 252, 231] as [number, number, number],
  red:         [185, 28, 28]   as [number, number, number],
  redLight:    [254, 226, 226] as [number, number, number],
  amber:       [217, 119, 6]   as [number, number, number],
  amberLight:  [254, 243, 199] as [number, number, number],
  yellow:      [253, 224, 71]  as [number, number, number],
  stepBg:      [241, 245, 249] as [number, number, number],
};

function sanitize(t: string | null | undefined): string {
  if (!t) return "";
  return String(t).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "-").replace(/\u00A0/g, " ").replace(/[^\x00-\x7F\xA3\xC0-\xFF]/g, "").trim();
}

async function loadLogoWithSize(url: string): Promise<{ base64: string; w: number; h: number } | null> {
  try {
    const r = await fetch(url); const b = await r.blob();
    const base64 = await new Promise<string>((res) => {
      const fr = new FileReader(); fr.onloadend = () => res(fr.result as string); fr.onerror = () => res(""); fr.readAsDataURL(b);
    });
    if (!base64) return null;
    return new Promise((resolve) => {
      const img = new Image(); img.onload = () => resolve({ base64, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ base64, w: 100, h: 100 }); img.src = base64;
    });
  } catch { return null; }
}

function fitToBox(nw: number, nh: number, mw: number, mh: number): [number, number] {
  const r = nw / nh; let w = mw, h = w / r;
  if (h > mh) { h = mh; w = h * r; } return [w, h];
}

const riskColor = (r: string): [number, number, number] => {
  if (r === "High")   return C.red;
  if (r === "Medium") return C.amber;
  return C.green;
};

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateVTBPDF(vtb: VisualTaskBriefing): Promise<void> {
  const { data: company } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
  const logoUrl = company?.report_logo_url || company?.company_logo_url || null;
  const logoData = logoUrl ? await loadLogoWithSize(logoUrl) : null;
  const companyName = sanitize(company?.company_name) || "BHO Fire & Security Ltd";
  const companyAddr = [company?.address, company?.city, company?.postcode].filter(Boolean).join(", ");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ML = 14, MR = 14, CW = pw - ML - MR;
  let y = 0;

  // ── Repeating page header (navy bar) ──────────────────────────────────────
  function drawPageHeader() {
    y = 0;
    doc.setFillColor(...C.navy);
    doc.rect(0, 0, pw, 18, "F");

    if (logoData) {
      try {
        const [lw, lh] = fitToBox(logoData.w, logoData.h, 30, 14);
        doc.addImage(logoData.base64, "PNG", ML, 2 + (14 - lh) / 2, lw, lh, undefined, "FAST");
      } catch {}
    } else {
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
      doc.text(companyName, ML, 12);
    }

    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
    doc.text("VISUAL TASK BRIEFING", pw / 2, 8, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text(`${sanitize(vtb.vtb_reference)}  |  ${sanitize(vtb.activity)}`, pw / 2, 14, { align: "center" });

    const rLevel = sanitize(vtb.risk_level);
    doc.setFillColor(...riskColor(rLevel));
    doc.roundedRect(pw - MR - 28, 4, 26, 10, 1.5, 1.5, "F");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
    doc.text(`${rLevel.toUpperCase()} RISK`, pw - MR - 15, 10.5, { align: "center" });

    y = 22;
  }

  function drawFooter() {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...C.borderGrey); doc.setLineWidth(0.2);
      doc.line(ML, ph - 10, pw - MR, ph - 10);
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey);
      doc.text(`${companyName}  |  ${sanitize(vtb.vtb_reference)}  |  Visual Task Briefing`, ML, ph - 5.5);
      doc.text(`Page ${i} of ${total}`, pw - MR, ph - 5.5, { align: "right" });
    }
  }

  function checkPage(needed: number) {
    if (y + needed > ph - 16) { doc.addPage(); drawPageHeader(); }
  }

  function sectionHeader(num: string, title: string, desc: string) {
    checkPage(16);
    doc.setFillColor(...C.navy);
    doc.rect(ML, y, CW, 9, "F");
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
    doc.text(`${num}   ${title.toUpperCase()}`, ML + 3, y + 6);
    y += 10;
    if (desc) {
      doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...C.textGrey);
      const lines = doc.splitTextToSize(sanitize(desc), CW);
      doc.text(lines, ML, y + 4);
      y += lines.length * 3.8 + 4;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ══════════════════════════════════════════════════════════════════════════
  drawPageHeader();

  // Big title block
  doc.setFillColor(...C.lightGrey);
  doc.rect(ML, y, CW, 28, "F");
  doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.navy);
  const titleLines = doc.splitTextToSize(sanitize(vtb.title), CW - 10);
  doc.text(titleLines, ML + 5, y + 10);
  doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey);
  doc.text(sanitize(vtb.activity), ML + 5, y + 10 + titleLines.length * 7 + 2);
  y += 32;

  // Meta grid
  autoTable(doc, {
    startY: y,
    body: [
      [
        { content: "Document Reference", styles: { fontStyle: "bold", fillColor: C.sectionBg } },
        sanitize(vtb.vtb_reference),
        { content: "Risk Level", styles: { fontStyle: "bold", fillColor: C.sectionBg } },
        { content: sanitize(vtb.risk_level), styles: { fontStyle: "bold", textColor: riskColor(sanitize(vtb.risk_level)) } },
      ],
      [
        { content: "Prepared By", styles: { fontStyle: "bold", fillColor: C.sectionBg } },
        sanitize(vtb.prepared_by) || "—",
        { content: "Date", styles: { fontStyle: "bold", fillColor: C.sectionBg } },
        vtb.prepared_date ? format(new Date(vtb.prepared_date), "dd MMMM yyyy") : "—",
      ],
      [
        { content: "Site", styles: { fontStyle: "bold", fillColor: C.sectionBg } },
        sanitize(vtb.site?.name) || "—",
        { content: "Principal Contractor", styles: { fontStyle: "bold", fillColor: C.sectionBg } },
        sanitize(vtb.principal_contractor) || "—",
      ],
      [
        { content: "Client", styles: { fontStyle: "bold", fillColor: C.sectionBg } },
        sanitize(vtb.client_name) || "—",
        { content: "Project Reference", styles: { fontStyle: "bold", fillColor: C.sectionBg } },
        sanitize(vtb.project_reference) || "—",
      ],
      [
        { content: "Issuing Company", styles: { fontStyle: "bold", fillColor: C.sectionBg } },
        { content: companyName, colSpan: 3 },
      ],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: CW / 2 - 38 }, 2: { cellWidth: 40 }, 3: { cellWidth: CW / 2 - 40 } },
    margin: { left: ML, right: MR, top: 22 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Important notice banner
  doc.setFillColor(...C.amberLight);
  doc.setDrawColor(...C.amber); doc.setLineWidth(0.5);
  doc.roundedRect(ML, y, CW, 18, 2, 2, "FD");
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.amber);
  doc.text("IMPORTANT — READ BEFORE COMMENCING WORK", ML + 5, y + 6);
  doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textDark); doc.setFontSize(7.5);
  const noticeLines = doc.splitTextToSize(
    "This Visual Task Briefing must be read by all operatives prior to commencing work. If any element of this task changes, this document must be revised and re-briefed. Any questions must be raised with the Supervisor before work begins.",
    CW - 10
  );
  doc.text(noticeLines, ML + 5, y + 11);
  y += 22;

  // Contents list
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.navy);
  doc.text("CONTENTS", ML, y + 5);
  y += 8;
  const sections = [
    "1.  Key Task Information & Control Measures",
    "2.  Work Plan & Location",
    "3.  Roles in Team & Competency Requirements",
    "4.  PPE Required",
    "5.  Do's and Don'ts",
  ];
  sections.forEach((s, i) => {
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textDark);
    doc.text(s, ML + 3, y);
    y += 5;
  });
  y += 4;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: KEY TASK INFORMATION & CONTROL MEASURES
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage(); drawPageHeader();
  sectionHeader("1", "Key Task Information & Control Measures",
    "Step-by-step breakdown of how this task is to be performed. Photos should be taken at each step during the first performance and added to this document.");

  const steps = vtb.task_steps ?? [];
  if (steps.length === 0) {
    doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.setTextColor(...C.textGrey);
    doc.text("No task steps generated.", ML, y); y += 8;
  } else {
    for (const step of steps) {
      checkPage(40);
      const stepW = CW;
      const headerH = 8;

      // Step header — numbered box
      doc.setFillColor(...C.navy);
      doc.roundedRect(ML, y, 12, 12, 1, 1, "F");
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
      doc.text(String(step.step_number), ML + 6, y + 8, { align: "center" });

      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.navy);
      doc.text(sanitize(step.title), ML + 15, y + 8);
      y += 15;

      // Description
      doc.setFillColor(...C.stepBg);
      const descLines = doc.splitTextToSize(sanitize(step.description), CW - 8);
      doc.rect(ML, y, CW, descLines.length * 4.2 + 6, "F");
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textDark);
      doc.text(descLines, ML + 4, y + 5);
      y += descLines.length * 4.2 + 8;

      // Tools + safety note in 2 columns
      if (step.tools_equipment?.length || step.safety_note) {
        checkPage(20);
        const colW = (CW - 4) / 2;

        // Tools column
        if (step.tools_equipment?.length) {
          doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.textGrey);
          doc.text("TOOLS & EQUIPMENT", ML, y);
          y += 4;
          step.tools_equipment.forEach(t => {
            doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textDark);
            doc.text(`• ${sanitize(t)}`, ML + 2, y); y += 4;
          });
        }

        // Safety note (highlighted)
        if (step.safety_note) {
          checkPage(14);
          y += 2;
          doc.setFillColor(...C.amberLight);
          doc.setDrawColor(...C.amber); doc.setLineWidth(0.3);
          const safetyLines = doc.splitTextToSize(`⚠ ${sanitize(step.safety_note)}`, CW - 8);
          doc.roundedRect(ML, y, CW, safetyLines.length * 4 + 5, 1, 1, "FD");
          doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.amber);
          doc.text(safetyLines, ML + 4, y + 4.5);
          y += safetyLines.length * 4 + 7;
        }
      }

      // Photo placeholder
      checkPage(18);
      doc.setDrawColor(...C.borderGrey); doc.setLineWidth(0.3); doc.setFillColor(...C.lightGrey);
      doc.roundedRect(ML, y, CW, 16, 1, 1, "FD");
      doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...C.textGrey);
      doc.text(`📷 Photo: ${sanitize(step.photo_prompt) || "Photo to be taken during first performance of this step"}`, ML + 4, y + 9.5);
      y += 19;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: WORK PLAN & LOCATION
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage(); drawPageHeader();
  sectionHeader("2", "Work Plan & Location",
    "Overview of the work area, access/egress routes, exclusion zones and known hazards. A site-specific location drawing should be obtained and attached.");

  const loc = vtb.work_location;
  const locRows: [string, string][] = [
    ["Work Area Description",  sanitize(loc?.description) || "—"],
    ["Access to Work Area",    sanitize(loc?.access_notes) || "—"],
    ["Emergency Egress",       sanitize(loc?.egress_notes) || "—"],
    ["Vehicle / Delivery Routes", sanitize(loc?.vehicle_routes) || "—"],
    ["Exclusion Zones",        sanitize(loc?.exclusion_zones) || "—"],
    ["Known Services",         sanitize(loc?.services) || "—"],
    ["Specific Hazard Areas",  sanitize(loc?.hazard_areas) || "—"],
  ];

  autoTable(doc, {
    startY: y,
    body: locRows.map(([l, v]) => [{ content: l, styles: { fontStyle: "bold", fillColor: C.sectionBg, cellWidth: 50 } }, v]),
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 3, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 52, fillColor: C.sectionBg }, 1: { cellWidth: CW - 52 } },
    margin: { left: ML, right: MR, top: 22 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Location drawing placeholder
  checkPage(40);
  doc.setFillColor(...C.lightGrey); doc.setDrawColor(...C.borderGrey); doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, 36, 2, 2, "FD");
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.textGrey);
  doc.text("WORK PLAN LOCATION DRAWING", pw / 2, y + 14, { align: "center" });
  doc.setFontSize(7.5); doc.setFont("helvetica", "italic");
  doc.text("Attach or sketch site-specific location drawing showing:", pw / 2, y + 20, { align: "center" });
  doc.setFontSize(7); doc.setFont("helvetica", "normal");
  doc.text("Access routes  •  Egress routes  •  Vehicle routes  •  Exclusion zones  •  Hazard areas  •  Work location", pw / 2, y + 26, { align: "center" });
  y += 40;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: TEAM ROLES & COMPETENCY
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage(); drawPageHeader();
  sectionHeader("3", "Roles in Team & Competency Requirements",
    "All personnel involved in this activity must hold the qualifications and competencies listed below. The Supervisor is responsible for verifying competency before work commences.");

  const roles = vtb.team_roles ?? [];
  if (roles.length === 0) {
    doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.setTextColor(...C.textGrey);
    doc.text("No team roles generated.", ML, y); y += 8;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Role", "Responsible Person", "Competency Required", "Qualifications / Certs"]],
      body: roles.map(r => [
        sanitize(r.role),
        sanitize(r.responsible_person) || "TBC",
        sanitize(r.competency_required),
        sanitize(r.qualifications),
      ]),
      theme: "grid",
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 34 }, 2: { cellWidth: CW * 0.36 }, 3: { cellWidth: CW - 34 - 34 - CW * 0.36 } },
      margin: { left: ML, right: MR, top: 22 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Sign-off table
  checkPage(30);
  doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.navy);
  doc.text("OPERATIVE BRIEFING ACKNOWLEDGEMENT", ML, y); y += 4;
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey);
  doc.text("All operatives must sign below to confirm they have read, understood and been briefed on this Visual Task Briefing.", ML, y); y += 5;

  autoTable(doc, {
    startY: y,
    head: [["Name (print)", "Company", "Date", "Signature"]],
    body: Array.from({ length: 8 }, () => ["", "", "", ""]),
    theme: "grid",
    headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 5, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: CW * 0.3 }, 1: { cellWidth: CW * 0.25 }, 2: { cellWidth: 26 }, 3: { cellWidth: CW - CW * 0.3 - CW * 0.25 - 26 } },
    margin: { left: ML, right: MR, top: 22 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4: PPE REQUIRED
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage(); drawPageHeader();
  sectionHeader("4", "PPE Required",
    "The following PPE is mandatory for this activity unless otherwise stated. It is the responsibility of each operative to ensure they are wearing appropriate PPE before commencing work.");

  const ppe = vtb.ppe_required ?? [];
  if (ppe.length > 0) {
    // Visual grid — 4 columns
    const cols = 4;
    const boxW = CW / cols - 3;
    const boxH = 22;
    const gapX = 4, gapY = 4;
    let col = 0;
    let rowStartY = y;

    ppe.forEach((item, idx) => {
      const x = ML + col * (boxW + gapX);
      const mandatory = item.mandatory !== false;
      doc.setFillColor(...(mandatory ? [232, 245, 233] as [number, number, number] : C.lightGrey));
      doc.setDrawColor(...(mandatory ? C.green : C.borderGrey));
      doc.setLineWidth(mandatory ? 0.5 : 0.2);
      doc.roundedRect(x, rowStartY, boxW, boxH, 2, 2, "FD");

      // Mandatory tick
      if (mandatory) {
        doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.green);
        doc.text("✓ MANDATORY", x + 3, rowStartY + 5);
      } else {
        doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey);
        doc.text("ASSESS RISK", x + 3, rowStartY + 5);
      }

      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.textDark);
      const nameLines = doc.splitTextToSize(sanitize(item.item), boxW - 6);
      doc.text(nameLines, x + 3, rowStartY + 10);

      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey);
      const specLines = doc.splitTextToSize(sanitize(item.specification), boxW - 6);
      doc.text(specLines, x + 3, rowStartY + 10 + nameLines.length * 3.5 + 2);

      col++;
      if (col === cols) {
        col = 0;
        rowStartY += boxH + gapY;
        checkPage(boxH + gapY);
      }
    });

    y = rowStartY + (col > 0 ? boxH + gapY : 0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5: DO'S AND DON'TS
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage(); drawPageHeader();
  sectionHeader("5", "Do's and Don'ts",
    "Critical safety rules for this activity. These must be briefed to all operatives and displayed prominently at the work location.");

  const dos   = vtb.dos   ?? [];
  const donts = vtb.donts ?? [];
  const maxRows = Math.max(dos.length, donts.length);

  if (maxRows > 0) {
    autoTable(doc, {
      startY: y,
      head: [
        [
          { content: "✓  DO", styles: { fillColor: C.green, textColor: C.white, fontStyle: "bold", fontSize: 10, halign: "center" } },
          { content: "✗  DON'T", styles: { fillColor: C.red, textColor: C.white, fontStyle: "bold", fontSize: 10, halign: "center" } },
        ],
      ],
      body: Array.from({ length: maxRows }, (_, i) => [
        dos[i] ? {
          content: `✓  ${sanitize(dos[i])}`,
          styles: { fillColor: C.greenLight, textColor: [14, 100, 46] as [number, number, number], fontStyle: "bold", fontSize: 8.5 },
        } : { content: "", styles: { fillColor: C.greenLight } },
        donts[i] ? {
          content: `✗  ${sanitize(donts[i])}`,
          styles: { fillColor: C.redLight, textColor: C.red, fontStyle: "bold", fontSize: 8.5 },
        } : { content: "", styles: { fillColor: C.redLight } },
      ]),
      theme: "grid",
      styles: { cellPadding: 4, lineColor: C.borderGrey, lineWidth: 0.2, valign: "middle" },
      columnStyles: { 0: { cellWidth: CW / 2 }, 1: { cellWidth: CW / 2 } },
      margin: { left: ML, right: MR, top: 22 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Compliance footer note
  checkPage(18);
  doc.setFillColor(...C.lightGrey); doc.setDrawColor(...C.borderGrey); doc.setLineWidth(0.2);
  doc.roundedRect(ML, y, CW, 14, 1, 1, "FD");
  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey);
  doc.text(
    `This Visual Task Briefing has been prepared in accordance with the requirements of SGG05G (Contractors Guide to Visual Task Briefings). It is an Appendix to the associated RAMS document ${sanitize(vtb.rams_document?.rams_number) || ""}. Prepared by: ${companyName}, ${companyAddr}.`,
    ML + 4, y + 5, { maxWidth: CW - 8 }
  );
  y += 16;

  drawFooter();
  doc.save(`${sanitize(vtb.vtb_reference) || "VTB"}.pdf`);
}
