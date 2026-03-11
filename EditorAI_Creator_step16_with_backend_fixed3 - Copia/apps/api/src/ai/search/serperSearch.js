import { SearchProviderNotConfiguredError, SearchProviderError } from "./searchProviderBase.js";

/**
 * Serper.dev (Google Search API)
 * Env: SERPER_API_KEY
 */
export async function serperSearch({ q, num = 10 }) {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new SearchProviderNotConfiguredError("serper");

  const resp = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ q, num })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new SearchProviderError("Serper search failed", { status: resp.status, body: text });
  }

  const data = await resp.json();
  const items = (data?.organic || []).map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || "",
    source: "serper",
    position: r.position ?? null
  }));
  return { items, raw: data };
}
