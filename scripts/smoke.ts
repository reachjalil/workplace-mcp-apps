import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { widgets, resourceUri } from "../src/shared/config";
import { snapshotSchema } from "../src/shared/data";

const target = process.argv[2];
if (!target) throw new Error("Usage: pnpm smoke https://your-project.vercel.app");
const origin = new URL(target);
if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("Provide only a public origin, with no credentials, path, query or fragment.");
if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) throw new Error("Use HTTPS, or HTTP loopback for local development.");
const response = await fetch(new URL("/healthz", origin), { signal: AbortSignal.timeout(15000) });
assert.equal(response.status, 200, "Public health check must succeed without authentication");
const health = await response.json();
assert.equal(health.status, "ok");
assert.equal(health.widgetCount, 8);
const page = await fetch(origin, { signal: AbortSignal.timeout(15000) });
assert.equal(page.status, 200, "Public showcase must render without authentication");
const html = await page.text();
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
assert(assets.length >= 2);
for (const path of assets) {
  const asset = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000) });
  assert.equal(asset.status, 200, `Missing deployed asset ${path}`);
  assert((await asset.text()).length > 0);
}
const client = new Client({ name: "workplace-deployment-check", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL("/mcp", origin));
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const expectedHash = digest(await readFile(new URL("../generated/widget.html", import.meta.url), "utf8"));
try {
  await client.connect(transport, { timeout: 15000 });
  const catalog = await client.listTools();
  assert.equal(catalog.tools.length, 9);
  for (const widget of widgets) {
    assert(catalog.tools.some(tool => tool.name === widget.tool));
    const result = await client.callTool({ name: widget.tool, arguments: { config: { live: false, seed: 0 } } });
    assert.notEqual(result.isError, true);
    const data = snapshotSchema.parse(result.structuredContent);
    assert.equal(data.widget, widget.id);
    const resource = await client.readResource({ uri: resourceUri(widget.id) });
    assert.equal(resource.contents.length, 1);
    const content = resource.contents[0];
    assert.equal(content.mimeType, "text/html;profile=mcp-app");
    assert("text" in content);
    assert.equal(digest(content.text), expectedHash, "Deployed resource must match this build, including license notices");
  }
  const [first, next] = await Promise.all([0, 1].map(step => client.callTool({ name: "get_workplace_snapshot", arguments: { widget: "goals", config: { live: false, seed: 0 }, step } })));
  assert.equal(snapshotSchema.parse(next.structuredContent).goals.percent, snapshotSchema.parse(first.structuredContent).goals.percent + 1);
  console.info(JSON.stringify({ origin: origin.origin, status: "passed", showcase: true, assets: assets.length, launchTools: 8, resources: 8, dynamicHelper: true, resourceSha256: expectedHash }, null, 2));
} finally {
  await client.close();
}
