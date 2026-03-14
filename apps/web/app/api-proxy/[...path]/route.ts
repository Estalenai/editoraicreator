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

function resolveUpstreamBaseUrl(requestUrl: string) {
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

function buildUpstreamUrl(baseUrl: string, pathSegments: string[], requestUrl: string) {
  const upstream = new URL(baseUrl);
  const requestSearch = new URL(requestUrl).search;
  const upstreamPath = [upstream.pathname.replace(/\/+$/, ""), ...pathSegments].filter(Boolean).join("/");
  upstream.pathname = upstreamPath.startsWith("/") ? upstreamPath : `/${upstreamPath}`;
  upstream.search = requestSearch;
  return upstream.toString();
}

async function proxy(request: Request, context: { params: { path?: string[] } }) {
  const upstreamBaseUrl = resolveUpstreamBaseUrl(request.url);
  if (!upstreamBaseUrl) {
    return Response.json(
      {
        error: "api_base_url_missing",
        message: "A API de producao nao esta configurada para o frontend.",
      },
      { status: 500 }
    );
  }

  const pathSegments = Array.isArray(context.params.path) ? context.params.path : [];
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const upstreamResponse = await fetch(buildUpstreamUrl(upstreamBaseUrl, pathSegments, request.url), init);
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("content-encoding");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export const dynamic = "force-dynamic";

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as OPTIONS };
