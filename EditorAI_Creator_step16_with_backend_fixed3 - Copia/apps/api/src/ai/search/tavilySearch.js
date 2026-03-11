import { SearchProviderNotConfiguredError, SearchProviderError } from "./searchProviderBase.js";

/**
 * Tavily Search API
 * Env: TAVILY_API_KEY
 */
export async function tavilySearch({ q, maxResults = 10 }) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new SearchProviderNotConfiguredError("tavily");

  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query: q,
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new SearchProviderError("Tavily search failed", { status: resp.status, body: text });
  }

  const data = await resp.json();
  const items = (data?.results || []).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content || "",
    source: "tavily",
    score: r.score ?? null
  }));
  return { items, raw: data };
}
