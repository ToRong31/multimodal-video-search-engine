async function toJson(resp) {
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return text; }
}

export async function httpGet(url, opts = {}) {
  const resp = await fetch(url, { method: 'GET', ...opts });
  const data = await toJson(resp);
  if (!resp.ok) throw new Error(data?.detail || `${resp.status} ${resp.statusText}`);
  return data;
}

export async function httpPost(url, body, opts = {}) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: JSON.stringify(body),
    ...opts,
  });
  const data = await toJson(resp);
  if (!resp.ok) throw new Error(data?.detail || `${resp.status} ${resp.statusText}`);
  return data;
}
