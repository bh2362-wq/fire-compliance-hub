import puppeteer from "puppeteer-core";
import fs from "fs";

const browser = await puppeteer.launch({
  executablePath: "/bin/chromium",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.goto("http://localhost:8765/", { waitUntil: "networkidle0" });
// wait for title to become READY
await page.waitForFunction(() => document.title === "READY", { timeout: 15000 });
const b64 = await page.evaluate(() => (window as any)._pdfBase64);
fs.writeFileSync("/tmp/sigtest_browser.pdf", Buffer.from(b64, "base64"));
console.log("ok", b64.length);
await browser.close();
