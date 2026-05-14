// Emergency Lighting PDF generator stub
// Full implementation follows the same pattern as BS5839 and ASD PDF generators
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { ELPayload } from "@/services/emergencyLightingService";

export async function generateELCertificatePDF(p: ELPayload): Promise<void> {
  const { data: company } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const C = { navy: [30,41,90] as [number,number,number], white: [255,255,255] as [number,number,number], border: [200,200,200] as [number,number,number], text: [20,20,20] as [number,number,number], grey: [245,245,245] as [number,number,number], green: [22,163,74] as [number,number,number], red: [185,28,28] as [number,number,number] };
  const pw = doc.internal.pageSize.getWidth(); const ML = 14; const CW = pw - 28;
  const companyName = company?.company_name || "BHO Fire & Security Ltd";
  
  // Header
  doc.setFillColor(...C.navy); doc.rect(0,0,pw,18,"F");
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
  doc.text(companyName, ML, 8);
  doc.text("EMERGENCY LIGHTING CERTIFICATE", pw/2, 8, { align: "center" });
  doc.setFontSize(7); doc.setFont("helvetica","normal");
  doc.text(`${p.cert_reference} | ${p.form_type.replace(/_/g," ").toUpperCase()}`, pw/2, 12.5, { align: "center" });
  // Standard reference (orange accent)
  doc.setFontSize(7.5); doc.setFont("helvetica","bold"); doc.setTextColor(245,130,32);
  doc.text("BS 5266-1:2016  ·  BS EN 1838:2013  ·  BAFE SP203-1", pw/2, 16.5, { align: "center" });
  doc.setTextColor(...C.text);

  // Status
  const statusColor = p.overall_status === "Satisfactory" ? C.green : p.overall_status === "Satisfactory with observations" ? [217,119,6] as [number,number,number] : C.red;
  doc.setFillColor(240,253,244); doc.setDrawColor(...statusColor); doc.setLineWidth(0.5);
  doc.roundedRect(ML, 22, CW, 9, 1, 1, "FD");
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(...statusColor);
  doc.text(`Status: ${p.overall_status.toUpperCase()}`, pw/2, 29, { align: "center" });

  // Meta
  autoTable(doc, {
    startY: 35,
    body: [
      [{ content:"Certificate Reference",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.cert_reference, {content:"Date",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.cert_date],
      [{ content:"Premises",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.premises_name, {content:"Responsible Person",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.responsible_person],
      [{ content:"Address",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, `${p.premises_address} ${p.premises_postcode}`.trim(), {content:"System Type",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.system_type],
      [{ content:"Mode",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.system_mode, {content:"Duration Rating",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.duration_rating],
      [{ content:"Total Luminaires",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, String(p.total_luminaires), {content:"Total Signs",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, String(p.total_exit_signs)],
      [{ content:"Next Inspection",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.next_inspection_date, {content:"EICR Reference",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.eicr_reference || "—"],
    ],
    theme:"grid", styles:{ fontSize:8, cellPadding:2.5, textColor:C.text, lineColor:C.border, lineWidth:0.2 },
    columnStyles:{ 0:{cellWidth:40}, 2:{cellWidth:30} }, margin:{left:ML,right:14,top:22},
  });

  let y = (doc as any).lastAutoTable.finalY + 5;

  // Checklist summary (deviations only)
  const deviations = p.checklist.filter(c => c.result === "7");
  if (deviations.length > 0) {
    doc.setFillColor(...C.navy); doc.rect(ML, y, CW, 8, "F");
    doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
    doc.text("DEVIATIONS IDENTIFIED (EPM6C Annex M)", ML+3, y+5.5); y += 10;
    autoTable(doc, {
      startY: y,
      head: [["Clause","Description","Notes"]],
      body: deviations.map(d => [d.clause, d.description, d.notes || "—"]),
      theme:"grid",
      headStyles:{ fillColor:C.navy, textColor:C.white, fontSize:7.5 },
      styles:{ fontSize:8, cellPadding:2.5, textColor:C.text, lineColor:C.border, lineWidth:0.2 },
      columnStyles:{ 0:{cellWidth:15}, 1:{cellWidth:CW-50} },
      margin:{left:ML,right:14,top:22},
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // Defects
  if (p.defects.length > 0) {
    doc.setFillColor(...C.navy); doc.rect(ML, y, CW, 8, "F");
    doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
    doc.text("DEFECTS & RECOMMENDATIONS", ML+3, y+5.5); y += 10;
    autoTable(doc, {
      startY: y,
      head: [["Location","Description","Priority","Remediated"]],
      body: p.defects.map(d => [d.location, d.description, d.priority, d.remediated ? `Yes — ${d.remediation_date}` : "No"]),
      theme:"grid",
      headStyles:{ fillColor:C.navy, textColor:C.white, fontSize:7.5 },
      styles:{ fontSize:8, cellPadding:2.5, textColor:C.text, lineColor:C.border, lineWidth:0.2 },
      margin:{left:ML,right:14,top:22},
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // Declaration
  doc.setFillColor(...C.navy); doc.rect(ML, y, CW, 8, "F");
  doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
  doc.text("DECLARATION", ML+3, y+5.5); y += 10;
  doc.setFontSize(7.5); doc.setFont("helvetica","normal"); doc.setTextColor(80,80,80);
  doc.text(`This certificate is issued in accordance with ${p.standard_references} and is based on the EPM6C model certificate (Annex M of BS 5266-1:2016).`, ML, y, { maxWidth: CW }); y += 8;
  autoTable(doc, {
    startY: y,
    body: [
      [{ content:"Engineer",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.engineer_name, {content:"Date",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.engineer_date],
      [{ content:"Company",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.engineer_company || companyName, {content:"",styles:{fillColor:[230,230,240]}}, ""],
      [{ content:"Signature",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, {content:p.engineer_signature, styles:{fontStyle:"italic",textColor:C.navy}}, {content:"",styles:{fillColor:[230,230,240]}}, ""],
      [{ content:"Client",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.client_name, {content:"Date",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.client_date],
      [{ content:"Signature",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, {content:p.client_signature, styles:{fontStyle:"italic",textColor:C.navy}}, {content:"",styles:{fillColor:[230,230,240]}}, ""],
    ],
    theme:"grid", styles:{fontSize:8.5, cellPadding:3, textColor:C.text, lineColor:C.border, lineWidth:0.2},
    columnStyles:{ 0:{cellWidth:30}, 2:{cellWidth:20} }, margin:{left:ML,right:14,top:22},
  });

  // Footer
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.border); doc.setLineWidth(0.2); doc.line(ML, 284, pw-14, 284);
    doc.setFontSize(6.5); doc.setFont("helvetica","normal"); doc.setTextColor(128,128,128);
    doc.text(`${companyName} | ${p.cert_reference} | ${p.standard_references}`, ML, 289, { maxWidth: CW-20 });
    doc.text(`Page ${i} of ${total}`, pw-14, 289, { align:"right" });
  }
  doc.save(`${p.cert_reference || "EL-Certificate"}.pdf`);
}
