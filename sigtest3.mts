import { jsPDF } from "/dev-server/node_modules/.bun/jspdf@4.0.0/node_modules/jspdf/dist/jspdf.es.min.js";
import { CAVEAT_REGULAR_BASE64 } from "./src/lib/fonts/caveat-font.ts";
import fs from "fs";

const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
doc.addFileToVFS("Caveat-Regular.ttf", CAVEAT_REGULAR_BASE64);
doc.addFont("Caveat-Regular.ttf", "Caveat", "normal");

const pw = doc.internal.pageSize.getWidth();
const ml = 12, mr = 12;
const cw = pw - ml - mr;
let y = 30;

const labels = ["Prepared By", "Reviewed By", "Client"];
const autoNames = ["Mike Stone", "B Holden", null];
const titles = ["QA Manager", "Company Director", ""];
const sigW = (cw - 10) / 3;
const generatedDate = "27/04/2026";

for (let i = 0; i < 3; i++) {
  const x = ml + i * (sigW + 5);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 100, 100);
  doc.text(labels[i], x, y);
  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y + 2, sigW, 20, 1, 1, "FD");
  if (autoNames[i]) {
    doc.setFont("Caveat", "normal");
    doc.setFontSize(32);
    doc.setTextColor(30, 41, 90);
    const tw = doc.getTextWidth(autoNames[i]);
    doc.text(autoNames[i], x + (sigW - tw) / 2, y + 16);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.text(autoNames[i], x, y + 26);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    doc.text(titles[i], x, y + 30);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${generatedDate}`, x, y + 34);
  }
}

fs.writeFileSync("/tmp/sigtest3.pdf", Buffer.from(doc.output("arraybuffer")));
console.log("written");
