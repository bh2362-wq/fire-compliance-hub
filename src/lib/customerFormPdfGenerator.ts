import jsPDF from "jspdf";
import { FormTemplate, FormFieldDefinition } from "@/services/customerFormService";

interface FormPdfData {
  template: FormTemplate;
  formData: Record<string, unknown>;
  signatures: Record<string, string>;
  siteName?: string;
  customerName?: string;
  completedDate?: string;
}

export function generateCustomerFormPdf(data: FormPdfData): jsPDF {
  const { template, formData, signatures, siteName, customerName, completedDate } = data;
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const checkNewPage = (needed: number) => {
    if (y + needed > 270) {
      doc.addPage();
      y = 20;
    }
  };

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(template.name, pageWidth / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Form: ${template.form_code}`, pageWidth / 2, y, { align: "center" });
  y += 10;

  // Meta info
  doc.setTextColor(0);
  doc.setFontSize(9);
  if (customerName) { doc.text(`Customer: ${customerName}`, margin, y); y += 5; }
  if (siteName) { doc.text(`Site: ${siteName}`, margin, y); y += 5; }
  if (completedDate) { doc.text(`Completed: ${completedDate}`, margin, y); y += 5; }
  y += 5;

  // Draw a separator
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Group fields by page then section
  const pages = Array.from({ length: template.page_count }, (_, i) => i + 1);

  for (const page of pages) {
    if (page > 1) {
      doc.addPage();
      y = 20;
    }

    const fields = (template.field_schema || []).filter((f) => f.page === page);
    const sections: Record<string, FormFieldDefinition[]> = {};
    fields.forEach((f) => {
      const section = f.section || "General";
      if (!sections[section]) sections[section] = [];
      sections[section].push(f);
    });

    for (const [section, sectionFields] of Object.entries(sections)) {
      checkNewPage(15);
      // Section header
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y - 4, contentWidth, 7, "F");
      doc.text(section, margin + 3, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      for (const field of sectionFields) {
        if (field.type === "signature") {
          checkNewPage(35);
          doc.setFont("helvetica", "bold");
          doc.text(`${field.label}:`, margin, y);
          y += 2;
          doc.setFont("helvetica", "normal");

          const sig = signatures[field.id];
          if (sig) {
            try {
              doc.addImage(sig, "PNG", margin, y, 50, 20);
              y += 22;
            } catch {
              doc.text("[Signature captured]", margin + 5, y + 10);
              y += 15;
            }
          } else {
            doc.text("[Not signed]", margin + 5, y + 5);
            y += 10;
          }
          y += 3;
          continue;
        }

        if (field.type === "table") {
          const tableData = (formData[field.id] as string[][]) || [];
          const cols = field.tableColumns || [];
          checkNewPage(15 + tableData.length * 6);

          doc.setFont("helvetica", "bold");
          doc.text(`${field.label}:`, margin, y);
          y += 5;

          // Table header
          const colWidth = contentWidth / (cols.length + 1);
          doc.setFillColor(230, 230, 230);
          doc.rect(margin, y - 3, contentWidth, 6, "F");
          doc.setFont("helvetica", "bold");
          doc.text("#", margin + 1, y);
          cols.forEach((col, ci) => {
            doc.text(col, margin + colWidth * (ci + 1) + 1, y);
          });
          y += 5;
          doc.setFont("helvetica", "normal");

          for (let ri = 0; ri < tableData.length; ri++) {
            checkNewPage(6);
            if (ri % 2 === 0) {
              doc.setFillColor(248, 248, 248);
              doc.rect(margin, y - 3, contentWidth, 5, "F");
            }
            doc.text(String(ri + 1), margin + 1, y);
            (tableData[ri] || []).forEach((val, ci) => {
              doc.text(String(val || ""), margin + colWidth * (ci + 1) + 1, y);
            });
            y += 5;
          }
          y += 3;
          continue;
        }

        // Standard fields
        checkNewPage(10);
        const value = formData[field.id];
        const displayValue = value === true ? "Yes" : value === false ? "No" : String(value || "—");

        doc.setFont("helvetica", "bold");
        const labelLines = doc.splitTextToSize(`${field.label}:`, contentWidth - 5);
        doc.text(labelLines, margin, y);
        y += labelLines.length * 4;

        doc.setFont("helvetica", "normal");
        const valueLines = doc.splitTextToSize(displayValue, contentWidth - 10);
        doc.text(valueLines, margin + 5, y);
        y += valueLines.length * 4 + 2;
      }

      y += 3;
    }
  }

  return doc;
}

export function downloadCustomerFormPdf(data: FormPdfData) {
  const doc = generateCustomerFormPdf(data);
  const fileName = `${data.template.form_code}_${data.siteName?.replace(/\s+/g, "_") || "form"}_${data.completedDate || "draft"}.pdf`;
  doc.save(fileName);
}
