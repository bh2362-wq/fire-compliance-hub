import puppeteer from "puppeteer-core";
import fs from "fs";

const browser = await puppeteer.launch({
  executablePath: "/bin/chromium",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
page.on("console", m => console.log("[console]", m.type(), m.text()));
page.on("pageerror", e => console.log("[pageerror]", e.message));
await page.goto("http://localhost:8765/", { waitUntil: "networkidle0" });
await new Promise(r => setTimeout(r, 4000));
const title = await page.title();
const h1 = await page.evaluate(() => document.querySelector("h1")?.textContent);
const hasB64 = await page.evaluate(() => !!(window as any)._pdfBase64);
console.log("title:", title, "h1:", h1, "hasB64:", hasB64);
if (hasB64) {
  const b64 = await page.evaluate(() => (window as any)._pdfBase64);
  fs.writeFileSync("/tmp/sigtest_browser.pdf", Buffer.from(b64, "base64"));
  console.log("wrote pdf", b64.length);
}
await browser.close();
