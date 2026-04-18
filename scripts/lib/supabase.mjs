const BASE_HEADERS = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

export function supabaseClient({ url, key }) {
  if (!url || !key) throw new Error("SUPABASE_URL ve SUPABASE_ANON_KEY gerekli");
  const base = url.replace(/\/$/, "") + "/rest/v1";
  async function query(table, params = "") {
    const res = await fetch(`${base}/${table}?${params}`, { headers: BASE_HEADERS(key) });
    if (!res.ok) throw new Error(`${table} ${res.status}: ${await res.text()}`);
    return res.json();
  }
  return { query };
}
