import { serperSearch } from "./serperSearch.js";
import { tavilySearch } from "./tavilySearch.js";

export async function webSearch({ q, limit = 10 }) {
  const provider = (process.env.SEARCH_PROVIDER || "serper").toLowerCase();
  if (provider === "serper") return serperSearch({ q, num: limit });
  if (provider === "tavily") return tavilySearch({ q, maxResults: limit });
  // fallback: try serper then tavily
  try {
    return await serperSearch({ q, num: limit });
  } catch {
    return await tavilySearch({ q, maxResults: limit });
  }
}
