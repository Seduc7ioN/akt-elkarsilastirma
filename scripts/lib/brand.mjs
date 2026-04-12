export function renderBrandMark({ className = "", title = "Aktuel Karsilastirma" } = {}) {
  const classAttr = className ? ` class="${className}"` : "";
  return `<svg${classAttr} viewBox="0 0 88 88" role="img" aria-label="${escapeHtml(title)}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="brandBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#111827" />
        <stop offset="100%" stop-color="#2b1408" />
      </linearGradient>
      <linearGradient id="brandAccent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ef4444" />
        <stop offset="55%" stop-color="#f97316" />
        <stop offset="100%" stop-color="#facc15" />
      </linearGradient>
      <linearGradient id="brandGreen" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#22c55e" />
        <stop offset="100%" stop-color="#16a34a" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="80" height="80" rx="24" fill="url(#brandBg)" />
    <circle cx="30" cy="29" r="16" fill="url(#brandAccent)" opacity="0.92" />
    <circle cx="56" cy="53" r="16" fill="url(#brandGreen)" opacity="0.92" />
    <path d="M45 19 35 43h10l-8 26 17-29H44l9-21Z" fill="#fff7ed" />
    <path d="M19 52h9l6 12h18l6-12h11" fill="none" stroke="#fff7ed" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="38" cy="69" r="4.2" fill="#fff7ed" />
    <circle cx="56" cy="69" r="4.2" fill="#fff7ed" />
  </svg>`;
}

export function brandLogoSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brandBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111827" />
      <stop offset="100%" stop-color="#2b1408" />
    </linearGradient>
    <linearGradient id="brandAccent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ef4444" />
      <stop offset="55%" stop-color="#f97316" />
      <stop offset="100%" stop-color="#facc15" />
    </linearGradient>
    <linearGradient id="brandGreen" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22c55e" />
      <stop offset="100%" stop-color="#16a34a" />
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="80" height="80" rx="24" fill="url(#brandBg)" />
  <circle cx="30" cy="29" r="16" fill="url(#brandAccent)" opacity="0.92" />
  <circle cx="56" cy="53" r="16" fill="url(#brandGreen)" opacity="0.92" />
  <path d="M45 19 35 43h10l-8 26 17-29H44l9-21Z" fill="#fff7ed" />
  <path d="M19 52h9l6 12h18l6-12h11" fill="none" stroke="#fff7ed" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="38" cy="69" r="4.2" fill="#fff7ed" />
  <circle cx="56" cy="69" r="4.2" fill="#fff7ed" />
</svg>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
