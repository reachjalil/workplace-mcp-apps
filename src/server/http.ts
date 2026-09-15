export const MAX_REQUEST_BYTES = 64 * 1024;
export const LOCAL_FIXTURE_ORIGIN = "http://127.0.0.1:4173";
const allowedHeaders = ["Accept", "Content-Type", "MCP-Protocol-Version", "MCP-Session-Id", "MCP-Method", "MCP-Name", "Last-Event-ID"];
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parsedOrigin(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) return;
    return url;
  } catch {
    return;
  }
}

export function validateLocalOrigin(origin: string): void {
  const url = parsedOrigin(origin);
  if (!url || url.protocol !== "http:" || !loopbackHosts.has(url.hostname)) {
    throw new Error("The local fixture origin must be an exact http:// loopback origin, including its port.");
  }
}

function acceptsOrigin(request: Request, localDevOrigin?: string): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  if (!parsedOrigin(origin)) return false;
  const target = new URL(request.url);
  if (origin === target.origin) return true;
  return Boolean(localDevOrigin && loopbackHosts.has(target.hostname) && target.protocol === "http:" && origin === localDevOrigin);
}

export function httpError(status: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message } }, { status });
}

async function boundedRequest(request: Request): Promise<Request | Response> {
  const declared = request.headers.get("content-length");
  if (declared !== null && !/^\d+$/.test(declared)) return httpError(400, "Content-Length must be a non-negative byte count.");
  if (declared !== null && Number(declared) > MAX_REQUEST_BYTES) {
    void request.body?.cancel().catch(() => {});
    return httpError(413, "Request body exceeds the 64 KiB limit.");
  }
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") return httpError(415, "Compressed request bodies are not supported. Send application/json without content encoding.");
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        void reader.cancel().catch(() => {});
        return httpError(413, "Request body exceeds the 64 KiB limit.");
      }
      chunks.push(value);
    }
  } catch {
    return httpError(400, "The request body could not be read.");
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete("transfer-encoding");
  headers.set("content-length", String(size));
  return new Request(request.url, { method: request.method, headers, body, signal: request.signal });
}

type HttpPolicy = {
  methods: readonly string[];
  localDevOrigin?: string;
  methodMessage?: string;
};

export async function handleHttp(request: Request, handler: (request: Request) => Promise<Response> | Response, policy: HttpPolicy): Promise<Response> {
  const origin = request.headers.get("origin");
  const accepted = acceptsOrigin(request, policy.localDevOrigin);
  const methods = [...policy.methods, "OPTIONS"].join(", ");
  const methodError = () => httpError(405, policy.methodMessage ?? `Use ${policy.methods.join(" or ")} for this endpoint.`);
  let response: Response;
  if (!accepted) {
    response = httpError(403, "Origin is not allowed. Use this server's own origin or a non-browser MCP client without an Origin header.");
  } else if (request.method === "OPTIONS") {
    const requestedMethod = request.headers.get("access-control-request-method");
    const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "").split(",").map(header => header.trim().toLowerCase()).filter(Boolean);
    if (requestedMethod && !policy.methods.includes(requestedMethod)) {
      response = methodError();
    } else if (requestedHeaders.some(header => !allowedHeaders.some(allowed => allowed.toLowerCase() === header))) {
      response = httpError(403, "The requested CORS headers are not supported by this read-only endpoint.");
    } else {
      response = new Response(null, { status: 204 });
    }
  } else if (!policy.methods.includes(request.method)) {
    response = methodError();
  } else {
    try {
      const limited = request.method === "POST" ? await boundedRequest(request) : request;
      response = limited instanceof Response ? limited : await handler(limited);
    } catch {
      response = httpError(500, "The demo request could not be completed. Retry with valid MCP arguments or check /healthz.");
    }
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  if (accepted && origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", methods);
    headers.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));
    headers.set("Access-Control-Expose-Headers", "MCP-Protocol-Version, MCP-Session-Id, Allow");
  }
  if (response.status === 405 || request.method === "OPTIONS") headers.set("Allow", methods);
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}
