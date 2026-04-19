// Supabase REST helpers (service role key kullanir — write yetkisi).
const URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";

function hdrs(extra = {}) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function selectAll(table, params = "") {
  const q = params ? `?${params}` : "";
  const all = [];
  let from = 0, pageSize = 1000;
  for (;;) {
    const res = await fetch(`${URL}/rest/v1/${table}${q}`, {
      headers: hdrs({ Range: `${from}-${from + pageSize - 1}`, Prefer: "count=exact" }),
    });
    if (!res.ok) throw new Error(`GET ${table} ${res.status}: ${await res.text()}`);
    const page = await res.json();
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
    if (all.length > 100000) break;
  }
  return all;
}

export async function updateRow(table, id, patch, idCol = "id") {
  const res = await fetch(`${URL}/rest/v1/${table}?${idCol}=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: hdrs({ Prefer: "return=minimal" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH ${table} ${res.status}: ${await res.text()}`);
}

export async function uploadToStorage(bucket, objectPath, buf, contentType = "image/jpeg") {
  const url = `${URL}/storage/v1/object/${bucket}/${objectPath}`;
  let res = await fetch(url, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": contentType, "x-upsert": "true" },
    body: buf,
  });
  if (!res.ok) {
    // POST may fail if exists; try PUT
    res = await fetch(url, {
      method: "PUT",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": contentType, "x-upsert": "true" },
      body: buf,
    });
  }
  if (!res.ok) throw new Error(`Storage upload ${res.status}: ${await res.text()}`);
  return `${URL}/storage/v1/object/public/${bucket}/${objectPath}`;
}
