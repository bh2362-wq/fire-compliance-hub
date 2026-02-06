import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface IntelligenceReportData {
  customerName: string;
  analysisData: any;
  xeroMetrics: any;
  aiAnalysis: string | null;
}

export function generateIntelligenceReportPdf(data: IntelligenceReportData) {
  const doc = new jsPDF();
  const { customerName, analysisData, xeroMetrics, aiAnalysis } = data;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Customer Intelligence Report", pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(customerName, pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(128);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 12;

  // Company Overview
  if (analysisData) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Company Overview", 14, y);
    y += 6;

    const overviewData = [
      ["Company Name", analysisData.company_name || "-"],
      ["Company Number", analysisData.company_number || "-"],
      ["Status", analysisData.company_status || "-"],
      ["Type", (analysisData.company_type || "").replace(/-/g, " ")],
      ["Incorporated", analysisData.date_of_creation || "-"],
      ["Risk Level", analysisData.risk_level?.toUpperCase() || "UNKNOWN"],
      ["SIC Codes", (analysisData.sic_codes || []).join(", ") || "-"],
    ];

    autoTable(doc, {
      startY: y,
      head: [],
      body: overviewData,
      theme: "plain",
      styles: { fontSize: 9 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 45 },
        1: { cellWidth: 120 },
      },
      margin: { left: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Risk Factors
  if (analysisData?.risk_factors?.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Risk Factors", 14, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [["Factor"]],
      body: analysisData.risk_factors.map((f: string) => [f]),
      theme: "striped",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [220, 53, 69] },
      margin: { left: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Positive Factors
  if (analysisData?.positive_factors?.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Positive Indicators", 14, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [["Indicator"]],
      body: analysisData.positive_factors.map((f: string) => [f]),
      theme: "striped",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 167, 69] },
      margin: { left: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Account Filing History
  const acctAnalysis = analysisData?.full_analysis?.account_analysis;
  if (acctAnalysis?.yearlyAccounts?.length > 0) {
    // Check if we need a new page
    if (y > 220) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Account Filing History", 14, y);
    y += 6;

    const accountTypeLabels: Record<string, string> = {
      "micro-entity": "Micro-Entity",
      small: "Small",
      medium: "Medium",
      full: "Full",
      dormant: "Dormant",
      "total-exemption": "Total Exemption",
      unknown: "Unknown",
    };

    autoTable(doc, {
      startY: y,
      head: [["Year", "Account Type", "Filing Status"]],
      body: acctAnalysis.yearlyAccounts.map((yr: any) => [
        yr.year,
        accountTypeLabels[yr.accountType] || yr.accountType,
        yr.isLate ? "LATE" : "On Time",
      ]),
      theme: "striped",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [52, 58, 64] },
      margin: { left: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Xero Payment Data
  if (xeroMetrics) {
    if (y > 220) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Payment Data", 14, y);
    y += 6;

    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);

    const paymentData = [
      ["Outstanding Invoices", String(xeroMetrics.invoiceCount)],
      ["Total Outstanding", formatCurrency(xeroMetrics.totalOutstanding)],
      ["Total Overdue", formatCurrency(xeroMetrics.totalOverdue)],
      ["Overdue Invoices", String(xeroMetrics.overdueCount)],
      ["Avg Days to Pay", `${xeroMetrics.averageDaysToPayEstimate} days`],
      ["Payment Trend", xeroMetrics.paymentTrend],
    ];

    autoTable(doc, {
      startY: y,
      head: [],
      body: paymentData,
      theme: "plain",
      styles: { fontSize: 9 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 45 },
        1: { cellWidth: 120 },
      },
      margin: { left: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // AI Analysis
  if (aiAnalysis) {
    if (y > 180) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("AI Analysis", 14, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const lines = doc.splitTextToSize(aiAnalysis, pageWidth - 28);
    const lineHeight = 4.5;

    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, 14, y);
      y += lineHeight;
    }
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(
      `Page ${i} of ${pageCount} | Confidential - ${customerName} Intelligence Report`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  doc.save(`${customerName.replace(/[^a-zA-Z0-9]/g, "_")}_Intelligence_Report.pdf`);
}
