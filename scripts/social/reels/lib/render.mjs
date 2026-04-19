// HTML template → 1080x1920 PNG via Puppeteer.
import puppeteer from "puppeteer";
import { readFile } from "node:fs/promises";

const W = 1080, H = 1920;

export async function renderPng(templatePath, data, outPng) {
  let html = await readFile(templatePath, "utf8");
  // {{var}} veya {{#each list}}...{{/each}} minimal templating
  html = html.replaceAll(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, block) => {
    const arr = data[key] || [];
    return arr.map((item, idx) => {
      let b = block;
      b = b.replaceAll(/\{\{@index1\}\}/g, String(idx + 1));
      b = b.replaceAll(/\{\{(\w+)\}\}/g, (_m, k) => escapeHtml(item[k] ?? ""));
      return b;
    }).join("");
  });
  html = html.replaceAll(/\{\{(\w+)\}\}/g, (_, k) => escapeHtml(data[k] ?? ""));

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
    await page.screenshot({ path: outPng, type: "png", fullPage: false, clip: { x: 0, y: 0, width: W, height: H } });
  } finally {
    await browser.close();
  }
  return outPng;
}

function escapeHtml(v) {
  return String(v == null ? "" : v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
