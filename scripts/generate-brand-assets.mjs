import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { brandLogoSvg } from "./lib/brand.mjs";

const root = process.cwd();
const distDir = path.join(root, "dist");
const assetsDir = path.join(distDir, "assets");
const socialDir = path.join(distDir, "social");

await mkdir(assetsDir, { recursive: true });
await mkdir(socialDir, { recursive: true });

const squareSvg = buildSquareSvg();
const faviconSvg = buildFaviconSvg();
const socialBannerSvg = buildBannerSvg();

await Promise.all([
  writeFile(path.join(assetsDir, "brand-mark.svg"), brandLogoSvg(), "utf8"),
  writeFile(path.join(assetsDir, "brand-square-social.svg"), squareSvg, "utf8"),
  writeFile(path.join(assetsDir, "favicon.svg"), faviconSvg, "utf8"),
  writeFile(path.join(socialDir, "brand-banner-x.svg"), socialBannerSvg, "utf8"),
  writeFile(path.join(socialDir, "brand-instagram-profile.svg"), squareSvg, "utf8"),
  writeFile(path.join(socialDir, "brand-x-profile.svg"), squareSvg, "utf8"),
]);

console.log("Marka paket dosyalari uretildi.");

function buildSquareSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1080" y2="1080" gradientUnits="userSpaceOnUse">
      <stop stop-color="#111827" />
      <stop offset="1" stop-color="#2b1408" />
    </linearGradient>
    <linearGradient id="accent" x1="180" y1="140" x2="900" y2="900" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ef4444" />
      <stop offset="0.55" stop-color="#f97316" />
      <stop offset="1" stop-color="#facc15" />
    </linearGradient>
    <linearGradient id="green" x1="240" y1="260" x2="820" y2="900" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22c55e" />
      <stop offset="1" stop-color="#16a34a" />
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" rx="260" fill="url(#bg)" />
  <circle cx="380" cy="360" r="210" fill="url(#accent)" opacity="0.94" />
  <circle cx="670" cy="650" r="210" fill="url(#green)" opacity="0.94" />
  <path d="M560 220 425 520h120l-100 284 252-330H558l102-254Z" fill="#fff7ed" />
  <path d="M214 622h120l76 128h226l76-128h146" fill="none" stroke="#fff7ed" stroke-width="52" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="420" cy="830" r="42" fill="#fff7ed" />
  <circle cx="640" cy="830" r="42" fill="#fff7ed" />
</svg>`;
}

function buildFaviconSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="128" height="128" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111827" />
      <stop offset="100%" stop-color="#2b1408" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ef4444" />
      <stop offset="55%" stop-color="#f97316" />
      <stop offset="100%" stop-color="#facc15" />
    </linearGradient>
    <linearGradient id="green" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22c55e" />
      <stop offset="100%" stop-color="#16a34a" />
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="80" height="80" rx="24" fill="url(#bg)" />
  <circle cx="30" cy="29" r="16" fill="url(#accent)" opacity="0.92" />
  <circle cx="56" cy="53" r="16" fill="url(#green)" opacity="0.92" />
  <path d="M45 19 35 43h10l-8 26 17-29H44l9-21Z" fill="#fff7ed" />
  <path d="M19 52h9l6 12h18l6-12h11" fill="none" stroke="#fff7ed" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="38" cy="69" r="4.2" fill="#fff7ed" />
  <circle cx="56" cy="69" r="4.2" fill="#fff7ed" />
</svg>`;
}

function buildBannerSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1500" height="500" viewBox="0 0 1500 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1500" y2="500" gradientUnits="userSpaceOnUse">
      <stop stop-color="#111827" />
      <stop offset="1" stop-color="#2b1408" />
    </linearGradient>
    <linearGradient id="accent" x1="100" y1="80" x2="620" y2="420" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ef4444" />
      <stop offset="0.55" stop-color="#f97316" />
      <stop offset="1" stop-color="#facc15" />
    </linearGradient>
    <linearGradient id="green" x1="260" y1="180" x2="760" y2="480" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22c55e" />
      <stop offset="1" stop-color="#16a34a" />
    </linearGradient>
  </defs>
  <rect width="1500" height="500" rx="36" fill="url(#bg)" />
  <circle cx="240" cy="168" r="88" fill="url(#accent)" opacity="0.94" />
  <circle cx="362" cy="290" r="88" fill="url(#green)" opacity="0.94" />
  <path d="M324 104 268 232h48l-40 118 106-136H322l44-110Z" fill="#fff7ed" />
  <path d="M146 278h50l34 58h100l34-58h60" fill="none" stroke="#fff7ed" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="238" cy="366" r="15" fill="#fff7ed" />
  <circle cx="334" cy="366" r="15" fill="#fff7ed" />
  <text x="520" y="208" fill="white" font-size="74" font-family="Arial, sans-serif" font-weight="700">Aktuel Karsilastirma</text>
  <text x="520" y="270" fill="#fdba74" font-size="30" font-family="Arial, sans-serif">Turkiye marketlerinin gunluk firsat akisi</text>
  <text x="520" y="346" fill="#cbd5e1" font-size="28" font-family="Arial, sans-serif">BIM, Sok, Migros, A101 ve daha fazlasi tek yerde.</text>
</svg>`;
}
