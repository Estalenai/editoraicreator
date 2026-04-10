const ENV_KEYS = [
  "APP_BASE_URL",
  "API_BASE_URL",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_APP_URL",
] as const;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function splitPathSegments(value: string) {
  return String(value || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function normalizeProxyPathSegments(basePathname: string, pathSegments: string[]) {
  const baseSegments = splitPathSegments(basePathname);
  const normalizedSegments = pathSegments
    .map((segment) => String(segment || "").trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);

  const baseAlreadyTargetsApi = baseSegments.at(-1) === "api";
  const pathAlreadyTargetsApi = normalizedSegments[0] === "api";

  if (!baseAlreadyTargetsApi && !pathAlreadyTargetsApi) {
    normalizedSegments.unshift("api");
  }

  if (baseAlreadyTargetsApi && pathAlreadyTargetsApi) {
    normalizedSegments.shift();
  }

  return [...baseSegments, ...normalizedSegments];
}

export function resolveUpstreamBaseUrl(requestUrl: string) {
  const currentOrigin = new URL(requestUrl).origin;

  for (const key of ENV_KEYS) {
    const rawValue = process.env[key];
    if (!rawValue) continue;

    try {
      const normalized = trimTrailingSlash(rawValue.trim());
      if (!normalized) continue;
      const parsed = new URL(normalized);
      if (parsed.origin === currentOrigin) continue;
      return normalized;
    } catch {
      continue;
    }
  }

  return "";
}

export function buildUpstreamUrl(baseUrl: string, pathSegments: string[], requestUrl: string) {
  const upstream = new URL(baseUrl);
  const requestSearch = new URL(requestUrl).search;
  const upstreamPathSegments = normalizeProxyPathSegments(upstream.pathname, pathSegments);
  upstream.pathname = `/${upstreamPathSegments.join("/")}`;
  upstream.search = requestSearch;
  return upstream.toString();
}
