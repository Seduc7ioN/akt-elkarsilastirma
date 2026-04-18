export function supabaseClient({ url, key }) {
  if (!url || !key) throw new Error("SUPABASE_URL ve SUPABASE_ANON_KEY gerekli");
  const base = url.replace(/\/$/, "") + "/rest/v1";
  const headers = () => ({ apikey: key, Authorization: `Bearer ${key}` });

  async function query(table, params = "") {
    const res = await fetch(`${base}/${table}?${params}`, { headers: headers() });
    if (!res.ok) throw new Error(`${table} ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async function queryAll(table, params = "", pageSize = 1000, maxRows = 20000) {
    const all = [];
    let total = Infinity;
    for (let start = 0; start < Math.min(total, maxRows); start += pageSize) {
      const end = start + pageSize - 1;
      const res = await fetch(`${base}/${table}?${params}`, {
        headers: { ...headers(), Range: `${start}-${end}`, "Range-Unit": "items", Prefer: "count=exact" },
      });
      if (!res.ok && res.status !== 206 && res.status !== 200) {
        throw new Error(`${table} ${res.status}: ${await res.text()}`);
      }
      const rows = await res.json();
      all.push(...rows);
      const range = res.headers.get("content-range");
      if (range) {
        const match = range.match(/\/(\d+|\*)$/);
        if (match && match[1] !== "*") total = Number(match[1]);
      }
      if (rows.length < pageSize) break;
    }
    return all;
  }

  return { query, queryAll };
}
