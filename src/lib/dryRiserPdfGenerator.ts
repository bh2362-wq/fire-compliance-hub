import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { DRPayload } from "@/services/dryRiserService";

export async function generateDryRiserPDF(p: DRPayload): Promise<void> {
  const { data: company } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const C = { navy:[30,41,90] as [number,number,number], white:[255,255,255] as [number,number,number], border:[200,200,200] as [number,number,number], text:[20,20,20] as [number,number,number], green:[22,163,74] as [number,number,number], red:[185,28,28] as [number,number,number] };
  const pw = doc.internal.pageSize.getWidth(); const ML = 14; const CW = pw - 28;
  const companyName = company?.company_name || "BHO Fire & Security Ltd";
  const formLabel = p.form_type === "pressure_test" ? "ANNUAL HYDRAULIC PRESSURE TEST" : "6-MONTHLY VISUAL INSPECTION";

  doc.setFillColor(...C.navy); doc.rect(0,0,pw,18,"F");
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
  doc.text(companyName, ML, 8);
  doc.text(`DRY RISER — ${formLabel}`, pw/2, 8, { align:"center" });
  doc.setFontSize(7); doc.setFont("helvetica","normal");
  doc.text(`${p.cert_reference} | BS 9990:2015`, pw/2, 14, { align:"center" });

  const statusColor = p.overall_status === "Compliant" ? C.green : C.red;
  doc.setFillColor(p.overall_status==="Compliant"?240:254, p.overall_status==="Compliant"?253:226, p.overall_status==="Compliant"?244:226);
  doc.setDrawColor(...statusColor); doc.setLineWidth(0.5);
  doc.roundedRect(ML, 22, CW, 9, 1, 1, "FD");
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(...statusColor);
  doc.text(`Status: ${p.overall_status.toUpperCase()}`, pw/2, 29, { align:"center" });

  autoTable(doc, {
    startY: 35,
    body: [
      [{content:"Certificate Ref",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.cert_reference, {content:"Date",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.cert_date],
      [{content:"Premises",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.premises_name, {content:"Next Inspection",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.next_inspection_date],
      [{content:"Address",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, `${p.premises_address} ${p.premises_postcode}`.trim(), {content:"Responsible Person",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.responsible_person],
      [{content:"Building Height",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, `${p.building_height_m}m`, {content:"No. of Risers",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, String(p.num_risers)],
      [{content:"Inlet Type",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.inlet_type, {content:"Inlet Location",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.inlet_location],
    ],
    theme:"grid", styles:{fontSize:8, cellPadding:2.5, textColor:C.text, lineColor:C.border, lineWidth:0.2},
    columnStyles:{0:{cellWidth:40},2:{cellWidth:35}}, margin:{left:ML,right:14,top:22},
  });

  let y = (doc as any).lastAutoTable.finalY + 5;

  // Visual inspection failures
  const fails = p.visual_checks.filter(c => c.result === "Fail");
  if (fails.length > 0) {
    doc.setFillColor(...C.navy); doc.rect(ML, y, CW, 8, "F");
    doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
    doc.text("DEFECTS IDENTIFIED", ML+3, y+5.5); y += 10;
    autoTable(doc, {
      startY: y,
      head: [["Category","Description","Notes"]],
      body: fails.map(f => [f.category, f.description, f.notes || "—"]),
      theme:"grid",
      headStyles:{fillColor:C.navy,textColor:C.white,fontSize:7.5},
      styles:{fontSize:8, cellPadding:2.5, textColor:C.text, lineColor:C.border, lineWidth:0.2},
      margin:{left:ML,right:14,top:22},
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // Pressure test results (annual only)
  if (p.form_type === "pressure_test") {
    doc.setFillColor(...C.navy); doc.rect(ML, y, CW, 8, "F");
    doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
    doc.text("HYDRAULIC PRESSURE TEST RESULTS", ML+3, y+5.5); y += 10;
    autoTable(doc, {
      startY: y,
      body: [
        [{content:"Test Pressure",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, `${p.test_pressure_bar} bar (${Math.round(p.test_pressure_bar*100)} kPa)`, {content:"Duration",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, `${p.test_duration_mins} minutes`],
        [{content:"Pressure at Start",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, `${p.pressure_at_start_bar} bar`, {content:"Pressure at End",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, `${p.pressure_at_end_bar} bar`],
        [{content:"Pressure Drop",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, `${p.pressure_drop_bar} bar`, {content:"Leaks Found",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.leaks_found ? "YES" : "None"],
        [{content:"Air Release Functional",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.air_release_functional ? "✓ Yes" : "No", {content:"Drain Functional",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.drain_functional ? "✓ Yes" : "No"],
        [{content:"TEST RESULT",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, {content:p.pressure_test_result, styles:{fontStyle:"bold",textColor:p.pressure_test_result==="Pass"?C.green:C.red}}, {content:"",styles:{fillColor:[230,230,240]}}, ""],
      ],
      theme:"grid", styles:{fontSize:8, cellPadding:2.5, textColor:C.text, lineColor:C.border, lineWidth:0.2},
      columnStyles:{0:{cellWidth:45},2:{cellWidth:40}}, margin:{left:ML,right:14,top:22},
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // Floor records
  if (p.floor_records.length > 0) {
    doc.setFillColor(...C.navy); doc.rect(ML, y, CW, 8, "F");
    doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
    doc.text("LANDING VALVE RECORDS", ML+3, y+5.5); y += 10;
    autoTable(doc, {
      startY: y,
      head: [["Floor","Valve","Box","Signage","Pressure (bar)","Notes"]],
      body: p.floor_records.map(fr => [fr.floor_level, fr.valve_condition, fr.box_condition, fr.signage_present?"✓":"✗", fr.pressure_bar?.toString()||"—", fr.notes||"—"]),
      theme:"grid",
      headStyles:{fillColor:C.navy,textColor:C.white,fontSize:7.5},
      styles:{fontSize:8, cellPadding:2.5, textColor:C.text, lineColor:C.border, lineWidth:0.2},
      margin:{left:ML,right:14,top:22},
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // Declaration
  doc.setFillColor(...C.navy); doc.rect(ML, y, CW, 8, "F");
  doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
  doc.text("DECLARATION", ML+3, y+5.5); y += 10;
  autoTable(doc, {
    startY: y,
    body: [
      [{content:"Engineer",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.engineer_name, {content:"Date",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.engineer_date],
      [{content:"Signature",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, {content:p.engineer_signature,styles:{fontStyle:"italic",textColor:C.navy}}, {content:"",styles:{fillColor:[230,230,240]}}, ""],
      [{content:"Client",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.client_name, {content:"Date",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.client_date],
      [{content:"Signature",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, {content:p.client_signature,styles:{fontStyle:"italic",textColor:C.navy}}, {content:"",styles:{fillColor:[230,230,240]}}, ""],
    ],
    theme:"grid", styles:{fontSize:8.5, cellPadding:3, textColor:C.text, lineColor:C.border, lineWidth:0.2},
    columnStyles:{0:{cellWidth:30},2:{cellWidth:20}}, margin:{left:ML,right:14,top:22},
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.border); doc.setLineWidth(0.2); doc.line(ML, 284, pw-14, 284);
    doc.setFontSize(6.5); doc.setFont("helvetica","normal"); doc.setTextColor(128,128,128);
    doc.text(`${companyName} | ${p.cert_reference} | ${p.standard_references}`, ML, 289, { maxWidth: CW-20 });
    doc.text(`Page ${i} of ${total}`, pw-14, 289, { align:"right" });
  }
  doc.save(`${p.cert_reference || "DryRiser-Certificate"}.pdf`);
}
