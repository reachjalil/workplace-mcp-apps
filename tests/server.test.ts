import { getRequestListener } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { once } from "node:events";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { defaultConfig, resourceUri, widgets } from "../src/shared/config";
import { createSnapshot, snapshotSchema } from "../src/shared/data";
import { handleHttp, LOCAL_FIXTURE_ORIGIN, MAX_REQUEST_BYTES } from "../src/server/http";
import { MAX_SNAPSHOT_STEP, serverInfo } from "../src/server/mcp";
import { MAX_WIDGET_HTML_BYTES, readWidgetHtml, validateWidgetHtml } from "../src/server/widget";

const now = Date.UTC(2026, 0, 6, 12);
const fixture = '<!doctype html><html><head><meta charset="utf-8"><style>body{color:#123}</style></head><body><main id="root">Synthetic workplace demo</main><script type="module">document.documentElement.dataset.demo="true";</script></body></html>';
const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: {} });
let directory: string;
let bundlePath: string;
let app: ReturnType<typeof createApp>;
let server: Server;
let origin: string;
let client: Client;

async function connect(browserOrigin?: string): Promise<Client> {
  const connection = new Client({ name: "workplace-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", origin), browserOrigin ? { requestInit: { headers: { Origin: browserOrigin } } } : undefined);
  try {
    await connection.connect(transport);
    return connection;
  } catch (error) {
    await connection.close();
    throw error;
  }
}

async function post(body: string, headers: Record<string, string> = {}) {
  return fetch(`${origin}/mcp`, { method: "POST", headers: { ...jsonHeaders, ...headers }, body });
}

function chunkedPost(chunks: Uint8Array[]): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${origin}/mcp`, { method: "POST", headers: jsonHeaders }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.once("end", () => resolve({ status: response.statusCode!, headers: response.headers, body }));
      response.once("error", reject);
    });
    request.once("error", reject);
    request.setTimeout(5000, () => request.destroy(new Error("Chunked test request timed out")));
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "workplace-mcp-apps-"));
  bundlePath = join(directory, "widget.html");
  await writeFile(bundlePath, fixture);
  app = createApp({ widgetHtmlPath: bundlePath, now: () => now });
  server = createServer(getRequestListener(app.fetch, { overrideGlobalObjects: false }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  client = await connect();
});

afterAll(async () => {
  await client?.close();
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("SDK v1 over the real stateless HTTP endpoint", () => {
  it("initializes without an Origin header and advertises the synthetic server", () => {
    expect(client.getServerVersion()).toMatchObject(serverInfo);
    expect(client.getServerCapabilities()).toMatchObject({ tools: {}, resources: {} });
    expect(client.getInstructions()).toMatch(/synthetic shared demo/i);
    expect(client.getInstructions()).toMatch(/not identity/i);
  });

  it("discovers eight launch tools with required object config and one unbound app-only helper", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    for (const widget of widgets) {
      const tool = tools.find(tool => tool.name === widget.tool)!;
      expect(tool).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.required).toEqual(["config"]);
      expect(tool.inputSchema.properties?.config).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(tool._meta).toEqual({ ui: { resourceUri: resourceUri(widget.id), visibility: ["model", "app"] } });
      expect(tool.outputSchema?.type).toBe("object");
      expect(tool.description).toMatch(/synthetic shared demo/i);
    }
    const helper = tools.find(tool => tool.name === "get_workplace_snapshot")!;
    expect(helper._meta).toEqual({ ui: { visibility: ["app"] } });
    expect(helper.inputSchema.required).toEqual(["widget", "config"]);
    expect(helper.inputSchema.properties?.step).toMatchObject({ type: "integer", minimum: 0, maximum: 9999 });
    expect(helper.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  });

  it.each(widgets)("calls $tool with empty config and returns validated data plus useful fallback", async widget => {
    const result = await client.callTool({ name: widget.tool, arguments: { config: {} } });
    expect(result.isError).not.toBe(true);
    expect(snapshotSchema.parse(result.structuredContent)).toEqual(createSnapshot(widget.id, {}, now));
    expect(result.content).toEqual([{ type: "text", text: expect.stringContaining(widget.title) }]);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toMatch(/synthetic shared demo, read-only/i);
    expect(content[0].text).toMatch(/Nothing is sent, stored, or changed/);
    expect(content[0].text.length).toBeGreaterThan(200);
  });

  it("round-trips valid presentation overrides without creating an identity", async () => {
    const config = { company: " Sample Team ", viewer: " Casey ", team: "Engineering", accent: "teal", density: "compact", scenario: "focus", live: false, refreshSeconds: 15, seed: 0 };
    const result = await client.callTool({ name: "show_brief", arguments: { config } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ demo: true, config: { ...config, company: "Sample Team", viewer: "Casey" }, revision: 0, moment: 0 });
  });

  it("calls the app-only helper without a resource binding and leaves later calls unchanged", async () => {
    const config = { live: false, seed: 7 };
    const advanced = await client.callTool({ name: "get_workplace_snapshot", arguments: { widget: "goals", config, step: 2 } });
    expect(advanced.isError).not.toBe(true);
    expect(advanced.structuredContent).toEqual(createSnapshot("goals", config, now, 2));
    const original = await client.callTool({ name: "get_workplace_snapshot", arguments: { widget: "goals", config } });
    expect(original.structuredContent).toEqual(createSnapshot("goals", config, now));
    const defaults = await client.callTool({ name: "get_workplace_snapshot", arguments: { widget: "brief", config: {} } });
    expect(defaults.structuredContent).toMatchObject({ config: defaultConfig });
  });

  it.each([0, MAX_SNAPSHOT_STEP])("accepts helper step %i at a bound", async step => {
    const result = await client.callTool({ name: "get_workplace_snapshot", arguments: { widget: "brief", config: { live: false }, step } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ revision: defaultConfig.seed + step });
  });

  it.each([
    ["missing config", {}],
    ["null config", { config: null }],
    ["array config", { config: [] }],
    ["string config", { config: "{}" }],
    ["unknown outer field", { config: {}, extra: true }],
    ["unknown config field", { config: { provider: "none" } }],
    ["unsupported refresh interval", { config: { refreshSeconds: 5 } }],
    ["large seed", { config: { seed: 10000 } }],
    ["oversized label", { config: { company: "a".repeat(49) } }],
  ] as Array<[string, Record<string, unknown>]>)("rejects launch arguments: %s", async (_name, args) => {
    const result = await client.callTool({ name: "show_brief", arguments: args });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result.content)).toMatch(/Input validation error/);
  });

  it.each([
    ["negative step", { widget: "brief", config: {}, step: -1 }],
    ["fractional step", { widget: "brief", config: {}, step: 0.5 }],
    ["too large step", { widget: "brief", config: {}, step: 10000 }],
    ["string step", { widget: "brief", config: {}, step: "1" }],
    ["unknown widget", { widget: "unknown", config: {} }],
    ["missing config", { widget: "brief" }],
  ] as Array<[string, Record<string, unknown>]>)("rejects helper arguments: %s", async (_name, args) => {
    const result = await client.callTool({ name: "get_workplace_snapshot", arguments: args });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });

  it("reports unknown tools and resources as protocol errors", async () => {
    await expect(client.callTool({ name: "unknown_tool", arguments: { config: {} } })).rejects.toThrow(/not found/i);
    await expect(client.readResource({ uri: "ui://workplace/unknown.html" })).rejects.toThrow(/not found/i);
    await expect(client.readResource({ uri: "ui://workplace/agenda.html?variant=other" })).rejects.toThrow(/not found/i);
  });

  it("lists and reads eight exact UI resources backed by the same self-contained file", async () => {
    const { resources } = await client.listResources();
    expect(resources).toHaveLength(8);
    expect(resources.map(resource => resource.uri)).toEqual(widgets.map(widget => resourceUri(widget.id)));
    for (const resource of resources) {
      expect(resource.mimeType).toBe("text/html;profile=mcp-app");
      const result = await client.readResource({ uri: resource.uri });
      expect(result.contents).toHaveLength(1);
      const content = result.contents[0];
      expect(content.uri).toBe(resource.uri);
      expect(content.mimeType).toBe("text/html;profile=mcp-app");
      expect(content._meta).toEqual({ ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] } } });
      expect(content).not.toHaveProperty("_meta.ui.permissions");
      expect(content).not.toHaveProperty("_meta.ui.domain");
      expect("text" in content).toBe(true);
      if (!("text" in content)) throw new Error("Expected a text resource");
      expect(content.text).toBe(fixture);
      expect(content.text).not.toMatch(/<script\b[^>]*\bsrc\s*=/i);
      expect(Buffer.byteLength(content.text, "utf8")).toBeLessThan(768 * 1024);
    }
  });

  it("returns a useful resource error when the generated bundle is missing", async () => {
    const held = join(directory, "held-widget.html");
    await rename(bundlePath, held);
    try {
      await expect(client.readResource({ uri: resourceUri("brief") })).rejects.toThrow(/Run pnpm build/);
    } finally {
      await rename(held, bundlePath);
    }
  });
});

describe("read-only HTTP policy and metadata", () => {
  it("reports healthy demo mode and an eight-widget catalog without provider or identity claims", async () => {
    const healthResponse = await fetch(`${origin}/healthz`);
    const catalogResponse = await fetch(`${origin}/catalog.json`);
    expect(healthResponse.status).toBe(200);
    expect(catalogResponse.status).toBe(200);
    const expected = { status: "ok", mode: "shared-demo", demo: true, synthetic: true, readOnly: true, providers: "none", identity: "none", authentication: "none", persistence: "none", endpoint: "/mcp", widgetCount: 8 };
    expect(await healthResponse.json()).toMatchObject({ ...expected, resource: { status: "ready", bytes: Buffer.byteLength(fixture) } });
    const catalog = await catalogResponse.json();
    expect(catalog).toMatchObject(expected);
    expect(catalog.widgets).toHaveLength(8);
    expect(catalog.defaults).toEqual(defaultConfig);
    expect(catalog.widgets.every((widget: { status: string; configRequired: boolean }) => widget.status === "ready" && widget.configRequired)).toBe(true);
    for (const response of [healthResponse, catalogResponse]) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("vary")).toContain("Origin");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("reports missing bundle readiness without leaking filesystem paths", async () => {
    const unavailable = createApp({ widgetHtmlPath: join(directory, "missing.html") });
    const health = await unavailable.request("/healthz");
    expect(health.status).toBe(503);
    const healthText = await health.text();
    expect(healthText).toContain('"status":"degraded"');
    expect(healthText).toContain("pnpm build");
    expect(healthText).not.toContain(directory);
    const catalog = await unavailable.request("/catalog.json");
    expect(catalog.status).toBe(200);
    expect(await catalog.json()).toMatchObject({ status: "degraded", resource: { status: "unavailable" }, widgetCount: 8 });
  });

  it("initializes an SDK browser client from the same origin", async () => {
    const browserClient = await connect(origin);
    try {
      expect((await browserClient.listTools()).tools).toHaveLength(9);
    } finally {
      await browserClient.close();
    }
  });

  it("accepts the request's deployment origin without trusting forwarded origins", async () => {
    const response = await app.request("https://workplace.example/mcp", { method: "POST", headers: { ...jsonHeaders, Origin: "https://workplace.example" }, body: ping });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://workplace.example");
    await response.text();
    const spoofed = await app.request("https://workplace.example/mcp", { method: "POST", headers: { ...jsonHeaders, Origin: "https://other.example", "X-Forwarded-Host": "other.example", "X-Forwarded-Proto": "https" }, body: ping });
    expect(spoofed.status).toBe(403);
  });

  it.each(["https://other.example", "null", "https://workplace.example/path", "https://workplace.example.evil.test", "http://[", "https://one.example https://two.example"])("rejects invalid or foreign Origin %s", async badOrigin => {
    const response = await post(ping, { Origin: badOrigin });
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toContain("Origin");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a foreign Origin during an actual SDK initialization", async () => {
    await expect(connect("https://other.example")).rejects.toMatchObject({ code: 403, message: expect.stringContaining("Origin is not allowed") });
  });

  it("allows only the explicit local fixture origin, and only on a loopback server", async () => {
    const dev = createApp({ widgetHtmlPath: bundlePath, localDevOrigin: LOCAL_FIXTURE_ORIGIN });
    const init = { method: "POST", headers: { ...jsonHeaders, Origin: LOCAL_FIXTURE_ORIGIN }, body: ping };
    const permitted = await dev.request("http://127.0.0.1:3000/mcp", init);
    expect(permitted.status).toBe(200);
    await permitted.text();
    expect((await app.request("http://127.0.0.1:3000/mcp", init)).status).toBe(403);
    expect((await dev.request("https://workplace.example/mcp", init)).status).toBe(403);
    expect((await dev.request("http://127.0.0.1:3000/mcp", { ...init, headers: { ...jsonHeaders, Origin: "http://127.0.0.1:4174" } })).status).toBe(403);
    expect(() => createApp({ localDevOrigin: "https://other.example" })).toThrow(/loopback/);
  });

  it("returns narrow CORS preflight headers without credentials or wildcard origins", async () => {
    const response = await fetch(`${origin}/mcp`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,mcp-protocol-version,mcp-session-id" } });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toContain("MCP-Protocol-Version");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("access-control-expose-headers")).toContain("MCP-Session-Id");
    expect(response.headers.get("vary")).toContain("Origin");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not grant preflight requests for foreign origins, extra headers, or unsupported methods", async () => {
    const forbiddenOrigin = await fetch(`${origin}/mcp`, { method: "OPTIONS", headers: { Origin: "https://other.example", "Access-Control-Request-Method": "POST" } });
    expect(forbiddenOrigin.status).toBe(403);
    const forbiddenHeader = await fetch(`${origin}/mcp`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-unexpected" } });
    expect(forbiddenHeader.status).toBe(403);
    const forbiddenMethod = await fetch(`${origin}/mcp`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "DELETE" } });
    expect(forbiddenMethod.status).toBe(405);
  });

  it.each(["GET", "HEAD", "DELETE", "PUT"])("rejects %s sessions/streams with helpful endpoint guidance", async method => {
    const response = await fetch(`${origin}/mcp`, { method });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
    expect(response.headers.get("cache-control")).toBe("no-store");
    if (method !== "HEAD") expect(await response.text()).toContain("POST /mcp");
  });

  it("uses metadata-specific methods for preflight and supports HEAD without a body", async () => {
    const options = await fetch(`${origin}/healthz`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" } });
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
    const head = await fetch(`${origin}/healthz`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await fetch(`${origin}/catalog.json`, { method: "POST" })).status).toBe(405);
  });

  it("preserves SDK errors for malformed JSON and unsupported content types", async () => {
    const malformed = await post("{");
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toHaveProperty("error");
    const wrongType = await post(ping, { "Content-Type": "text/plain" });
    expect(wrongType.status).toBe(415);
    expect(wrongType.headers.get("cache-control")).toBe("no-store");
    const noAccept = await post(ping, { Accept: "text/plain" });
    expect(noAccept.status).toBe(406);
  });

  it("reports unexpected handler failures without echoing internal errors", async () => {
    const response = await handleHttp(new Request("http://localhost/mcp", { method: "POST", body: ping }), () => { throw new Error("private internal detail"); }, { methods: ["POST"] });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private internal detail");
  });
});

describe("streamed request byte budget", () => {
  it("accepts exactly 64 KiB sent over chunked HTTP", async () => {
    const bytes = Buffer.from(ping.padEnd(MAX_REQUEST_BYTES, " "));
    const response = await chunkedPost([bytes.subarray(0, 100), bytes.subarray(100, 32768), bytes.subarray(32768)]);
    expect(response.status).toBe(200);
    expect(response.body).toContain('"result"');
  });

  it("rejects an over-budget chunked HTTP body without Content-Length", async () => {
    const response = await chunkedPost([Buffer.alloc(32768, " "), Buffer.alloc(32768, " "), Buffer.from(" ")]);
    expect(response.status).toBe(413);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toContain("64 KiB");
  });

  it("checks actual streamed bytes even when a small length is declared and cancels the stream", async () => {
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(32768));
      },
      cancel() { cancelled = true; },
    });
    const request = new Request(`${origin}/mcp`, { method: "POST", headers: { ...jsonHeaders, "Content-Length": "1" }, body, duplex: "half" } as RequestInit & { duplex: "half" });
    const response = await app.fetch(request);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(4);
  });

  it("counts UTF-8 bytes rather than JavaScript characters", async () => {
    const response = await post("é".repeat(MAX_REQUEST_BYTES / 2 + 1));
    expect(response.status).toBe(413);
  });

  it("rejects excessive declared length before reading", async () => {
    const response = await app.request("/mcp", { method: "POST", headers: { ...jsonHeaders, "Content-Length": String(MAX_REQUEST_BYTES + 1) } });
    expect(response.status).toBe(413);
  });

  it("rejects invalid length and content encoding", async () => {
    const invalid = await app.request("/mcp", { method: "POST", headers: { ...jsonHeaders, "Content-Length": "-1" } });
    expect(invalid.status).toBe(400);
    const compressed = await post(ping, { "Content-Encoding": "gzip" });
    expect(compressed.status).toBe(415);
  });

  it("returns a bounded error when a request stream fails", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("private stream failure")); } });
    const request = new Request(`${origin}/mcp`, { method: "POST", headers: jsonHeaders, body, duplex: "half" } as RequestInit & { duplex: "half" });
    const response = await app.fetch(request);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("private stream failure");
  });
});

describe("self-contained resource build guard", () => {
  it("reads and validates a complete inline bundle", async () => {
    expect(await readWidgetHtml(bundlePath)).toBe(fixture);
    expect(validateWidgetHtml(fixture)).toBe(Buffer.byteLength(fixture));
  });

  it("enforces an exclusive 768 KiB UTF-8 resource limit", () => {
    const atLimit = fixture.padEnd(MAX_WIDGET_HTML_BYTES, " ");
    expect(validateWidgetHtml(atLimit.slice(0, -1))).toBe(MAX_WIDGET_HTML_BYTES - 1);
    expect(() => validateWidgetHtml(atLimit)).toThrow(/smaller than 768 KiB/);
    expect(() => validateWidgetHtml(fixture + "é".repeat(MAX_WIDGET_HTML_BYTES / 2))).toThrow(/smaller than 768 KiB/);
  });

  it.each([
    ["absolute script", '<script src="https://other.example/app.js"></script>'],
    ["relative script", '<script type="module" src="./assets/app.js"></script>'],
    ["unquoted script source", "<script src=/assets/app.js></script>"],
    ["stylesheet", '<link href="/assets/app.css" rel="stylesheet">'],
    ["module preload", '<link rel="modulepreload" href="/assets/app.js">'],
    ["CSS import", '<style>@import "https://other.example/app.css";</style>'],
    ["CSS asset", '<style>body{background:url(/images/sample.png)}</style>'],
  ])("rejects an unbundled %s", (_name, element) => {
    expect(() => validateWidgetHtml(fixture.replace("</head>", `${element}</head>`))).toThrow(/inline|bundled/);
  });

  it("rejects an external script even when its closing tag is missing", () => {
    expect(() => validateWidgetHtml(fixture.replace("</body>", '<script src="/assets/unclosed.js"></body>'))).toThrow(/inline/);
  });

  it("requires a complete HTML document and a nonempty inline entry", () => {
    expect(() => validateWidgetHtml("<div>Not an app</div>")).toThrow(/complete HTML/);
    expect(() => validateWidgetHtml("<html><body>Missing app</body></html>")).toThrow(/inline application script/);
    expect(() => validateWidgetHtml("<html><script></script></html>")).toThrow(/inline application script/);
  });

  it("does not confuse strings inside inline JavaScript with external HTML tags", () => {
    const html = '<html><body><script>const snippet = `<link rel="stylesheet" href="/not-a-real-tag.css">`;</script></body></html>';
    expect(validateWidgetHtml(html)).toBe(Buffer.byteLength(html));
  });
});
