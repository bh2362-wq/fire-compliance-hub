import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { PurchaseOrder } from "@/services/purchaseOrderService";

interface CompanySettings {
  company_name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  phone?: string | null;
  email?: string | null;
  company_logo_url?: string | null;
  vat_number?: string | null;
}

export async function generatePurchaseOrderPDF(
  purchaseOrder: PurchaseOrder,
  companySettings: CompanySettings | null
): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Colors
  const primaryColor: [number, number, number] = [30, 41, 59]; // slate-800
  const accentColor: [number, number, number] = [220, 38, 38]; // red-600
  const mutedColor: [number, number, number] = [100, 116, 139]; // slate-500
  
  let yPos = 20;

  // Header - Company Logo and Info
  if (companySettings?.company_logo_url) {
    try {
      const img = await loadImage(companySettings.company_logo_url);
      doc.addImage(img, "PNG", 15, yPos, 40, 20);
    } catch (e) {
      console.warn("Could not load company logo");
    }
  }

  // Company name and details (right side)
  doc.setFontSize(18);
  doc.setTextColor(...primaryColor);
  doc.setFont("helvetica", "bold");
  doc.text(companySettings?.company_name || "Company Name", pageWidth - 15, yPos + 5, { align: "right" });
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedColor);
  
  let companyInfoY = yPos + 12;
  if (companySettings?.address) {
    doc.text(companySettings.address, pageWidth - 15, companyInfoY, { align: "right" });
    companyInfoY += 4;
  }
  if (companySettings?.city || companySettings?.postcode) {
    doc.text(`${companySettings?.city || ""} ${companySettings?.postcode || ""}`.trim(), pageWidth - 15, companyInfoY, { align: "right" });
    companyInfoY += 4;
  }
  if (companySettings?.phone) {
    doc.text(`Tel: ${companySettings.phone}`, pageWidth - 15, companyInfoY, { align: "right" });
    companyInfoY += 4;
  }
  if (companySettings?.email) {
    doc.text(companySettings.email, pageWidth - 15, companyInfoY, { align: "right" });
  }

  yPos = 50;

  // PURCHASE ORDER title
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...accentColor);
  doc.text("PURCHASE ORDER", 15, yPos);
  
  // PO Number
  doc.setFontSize(12);
  doc.setTextColor(...primaryColor);
  doc.text(purchaseOrder.po_number, 15, yPos + 8);

  yPos = 70;

  // Two column layout - Supplier info and PO details
  // Left: Supplier
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...mutedColor);
  doc.text("SUPPLIER", 15, yPos);
  
  yPos += 6;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryColor);
  doc.setFontSize(11);
  doc.text(purchaseOrder.supplier?.name || "Unknown Supplier", 15, yPos);
  
  yPos += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...mutedColor);
  
  if (purchaseOrder.supplier?.address) {
    doc.text(purchaseOrder.supplier.address, 15, yPos);
    yPos += 4;
  }
  if (purchaseOrder.supplier?.city || purchaseOrder.supplier?.postcode) {
    doc.text(`${purchaseOrder.supplier?.city || ""} ${purchaseOrder.supplier?.postcode || ""}`.trim(), 15, yPos);
    yPos += 4;
  }
  if (purchaseOrder.supplier?.email) {
    doc.text(purchaseOrder.supplier.email, 15, yPos);
    yPos += 4;
  }
  if (purchaseOrder.supplier?.phone) {
    doc.text(`Tel: ${purchaseOrder.supplier.phone}`, 15, yPos);
  }

  // Right: PO Details
  const rightColX = 120;
  let rightY = 70;
  
  const poDetails = [
    { label: "Order Date", value: format(new Date(purchaseOrder.order_date), "dd MMMM yyyy") },
    { label: "Expected Delivery", value: purchaseOrder.expected_delivery_date ? format(new Date(purchaseOrder.expected_delivery_date), "dd MMMM yyyy") : "TBC" },
    { label: "Reference", value: purchaseOrder.reference || "-" },
    { label: "Status", value: purchaseOrder.status.toUpperCase() },
  ];

  poDetails.forEach((detail) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...mutedColor);
    doc.text(detail.label, rightColX, rightY);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text(detail.value, rightColX + 45, rightY);
    
    rightY += 6;
  });

  yPos = Math.max(yPos, rightY) + 15;

  // Line items table
  const tableData = (purchaseOrder.line_items || []).map((item, index) => [
    (index + 1).toString(),
    item.description,
    item.quantity.toString(),
    `£${item.unit_price.toFixed(2)}`,
    `£${item.total_price.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [["#", "Description", "Qty", "Unit Price", "Total"]],
    body: tableData,
    theme: "plain",
    headStyles: {
      fillColor: [241, 245, 249], // slate-100
      textColor: primaryColor,
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      textColor: primaryColor,
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
    },
    margin: { left: 15, right: 15 },
  });

  // Totals section
  yPos = (doc as any).lastAutoTable.finalY + 10;

  const totalsX = pageWidth - 70;
  
  // Subtotal
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedColor);
  doc.text("Subtotal:", totalsX, yPos);
  doc.setTextColor(...primaryColor);
  doc.text(`£${purchaseOrder.subtotal?.toFixed(2) || "0.00"}`, pageWidth - 15, yPos, { align: "right" });
  
  yPos += 6;
  
  // VAT
  doc.setTextColor(...mutedColor);
  doc.text(`VAT (${purchaseOrder.vat_rate || 20}%):`, totalsX, yPos);
  doc.setTextColor(...primaryColor);
  doc.text(`£${purchaseOrder.vat_amount?.toFixed(2) || "0.00"}`, pageWidth - 15, yPos, { align: "right" });
  
  yPos += 8;
  
  // Total
  doc.setFillColor(241, 245, 249);
  doc.rect(totalsX - 5, yPos - 5, pageWidth - totalsX + 5 - 10, 12, "F");
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryColor);
  doc.text("TOTAL:", totalsX, yPos + 3);
  doc.setTextColor(...accentColor);
  doc.text(`£${purchaseOrder.total_amount?.toFixed(2) || "0.00"}`, pageWidth - 15, yPos + 3, { align: "right" });

  // Notes section
  if (purchaseOrder.notes) {
    yPos += 25;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...mutedColor);
    doc.text("NOTES", 15, yPos);
    
    yPos += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...primaryColor);
    
    const splitNotes = doc.splitTextToSize(purchaseOrder.notes, pageWidth - 30);
    doc.text(splitNotes, 15, yPos);
  }

  // Delivery address if different
  if (purchaseOrder.delivery_address) {
    yPos += 20;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...mutedColor);
    doc.text("DELIVERY ADDRESS", 15, yPos);
    
    yPos += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...primaryColor);
    
    const splitAddress = doc.splitTextToSize(purchaseOrder.delivery_address, pageWidth - 30);
    doc.text(splitAddress, 15, yPos);
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...mutedColor);
  doc.text(
    `Generated on ${format(new Date(), "dd/MM/yyyy 'at' HH:mm")}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );

  return doc;
}

async function loadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function downloadPurchaseOrderPDF(
  purchaseOrder: PurchaseOrder,
  companySettings: CompanySettings | null
): Promise<void> {
  const doc = await generatePurchaseOrderPDF(purchaseOrder, companySettings);
  doc.save(`${purchaseOrder.po_number}.pdf`);
}