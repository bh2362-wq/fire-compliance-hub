import puppeteer from "puppeteer-core";
import fs from "fs";
const browser = await puppeteer.launch({ executablePath: "/bin/chromium", headless: "new", args: ["--no-sandbox","--disable-gpu"] });
const page = await browser.newPage();
page.on("console", m => console.log("[c]", m.type(), m.text().slice(0,200)));
page.on("pageerror", e => console.log("[err]", e.message));
await page.goto("http://localhost:8765/", { waitUntil: "networkidle0" });
await new Promise(r => setTimeout(r, 5000));
const title = await page.title();
const hasB64 = await page.evaluate(() => !!(window as any)._pdfBase64);
console.log("title:", title, "hasB64:", hasB64);
if (hasB64) {
  const b64 = await page.evaluate(() => (window as any)._pdfBase64);
  fs.writeFileSync("/tmp/sigtest_browser.pdf", Buffer.from(b64, "base64"));
  console.log("wrote", b64.length);
}
await browser.close();
