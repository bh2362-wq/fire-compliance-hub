import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

export async function generateDeclinationPDF(p: any): Promise<{ base64: string; fileName: string }> {
  const { data: company } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const C = { navy:[30,41,90] as [number,number,number], white:[255,255,255] as [number,number,number], border:[200,200,200] as [number,number,number], text:[20,20,20] as [number,number,number], amber:[217,119,6] as [number,number,number], amberBg:[254,243,199] as [number,number,number] };
  const pw = doc.internal.pageSize.getWidth(); const ML = 14; const CW = pw - 28;
  const companyName = company?.company_name || "BHO Fire & Security Ltd";

  doc.setFillColor(...C.navy); doc.rect(0,0,pw,18,"F");
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
  doc.text(companyName, ML, 8);
  doc.text("DECLINATION OF RECOMMENDED WORKS", pw/2, 8, { align:"center" });
  doc.setFontSize(7); doc.setFont("helvetica","normal");
  doc.text(`CONFIDENTIAL FIRE SAFETY DOCUMENT | ${new Date().toLocaleDateString("en-GB")}`, pw/2, 14, { align:"center" });

  doc.setFillColor(...C.amberBg); doc.setDrawColor(...C.amber); doc.setLineWidth(0.5);
  doc.roundedRect(ML, 22, CW, 14, 1, 1, "FD");
  doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.amber);
  doc.text("IMPORTANT — THIS DOCUMENT RECORDS THE RESPONSIBLE PERSON'S DECISION TO DECLINE RECOMMENDED FIRE SAFETY WORKS.", pw/2, 30, { align:"center", maxWidth: CW-4 });

  let y = 40;
  autoTable(doc, {
    startY: y,
    body: [
      [{content:"Premises",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.premises_name, {content:"Address",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.premises_address],
      [{content:"Responsible Person",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.responsible_person_name, {content:"Role",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.responsible_person_role],
    ],
    theme:"grid", styles:{fontSize:8, cellPadding:2.5, textColor:C.text, lineColor:C.border, lineWidth:0.2},
    columnStyles:{0:{cellWidth:40},2:{cellWidth:30}}, margin:{left:ML,right:14,top:22},
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  doc.setFillColor(...C.navy); doc.rect(ML,y,CW,8,"F");
  doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
  doc.text("WORKS DECLINED", ML+3, y+5.5); y += 10;
  autoTable(doc, {
    startY: y,
    body: [
      [{content:"Recommended Works",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, {content:p.recommended_works, colSpan:3}],
      [{content:"Standard Reference",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, {content:p.standard_reference, colSpan:3}],
      [{content:"Risk of Non-Completion",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, {content:p.risk_statement, colSpan:3}],
    ],
    theme:"grid", styles:{fontSize:8, cellPadding:3, textColor:C.text, lineColor:C.border, lineWidth:0.2},
    columnStyles:{0:{cellWidth:45}}, margin:{left:ML,right:14,top:22},
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  doc.setFillColor(...C.navy); doc.rect(ML,y,CW,8,"F");
  doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
  doc.text("RISK ACCEPTANCE STATEMENT", ML+3, y+5.5); y += 10;
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(...C.text);
  const lines = doc.splitTextToSize(p.risk_accepted_statement || "", CW);
  doc.text(lines, ML, y); y += lines.length * 4 + 6;

  doc.setFillColor(...C.navy); doc.rect(ML,y,CW,8,"F");
  doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
  doc.text("SIGNATURES", ML+3, y+5.5); y += 10;
  autoTable(doc, {
    startY: y,
    body: [
      [{content:"Signed by (Responsible Person)",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.signed_by, {content:"Date",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.signed_date],
      [{content:"Role",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.responsible_person_role, {content:"",styles:{fillColor:[230,230,240]}}, ""],
      [{content:"Signature",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, {content:p.signature,styles:{fontStyle:"italic",fontSize:12,textColor:C.navy}}, {content:"",styles:{fillColor:[230,230,240]}}, ""],
      [{content:"BHO Fire Representative",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.bho_representative, {content:"Witness",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, p.witnessed_by],
      [{content:"BHO Signature",styles:{fontStyle:"bold",fillColor:[230,230,240]}}, {content:p.bho_signature,styles:{fontStyle:"italic",fontSize:12,textColor:C.navy}}, {content:"",styles:{fillColor:[230,230,240]}}, ""],
    ],
    theme:"grid", styles:{fontSize:8.5, cellPadding:3, textColor:C.text, lineColor:C.border, lineWidth:0.2},
    columnStyles:{0:{cellWidth:50},2:{cellWidth:25}}, margin:{left:ML,right:14,top:22},
  });

  const total = doc.getNumberOfPages();
  for (let i=1;i<=total;i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.border); doc.setLineWidth(0.2); doc.line(ML,284,pw-14,284);
    doc.setFontSize(6.5); doc.setFont("helvetica","normal"); doc.setTextColor(128,128,128);
    doc.text(`${companyName} | Declination of Works | ${new Date().toLocaleDateString("en-GB")} | CONFIDENTIAL`, ML, 289, {maxWidth:CW-20});
    doc.text(`Page ${i} of ${total}`, pw-14, 289, {align:"right"});
  }
  const fileName = `Declination-of-Works-${p.premises_name?.replace(/\s+/g,"-")||"document"}.pdf`;
  const base64 = doc.output("datauristring").split(",")[1] ?? "";
  doc.save(fileName);
  return { base64, fileName };
}
