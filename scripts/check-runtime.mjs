import assert from "node:assert/strict";

// Import emitted JavaScript with plain Node, not a TS loader that repairs ESM paths.
const { default: app } = await import("../.server/app.js");
const response = await app.request("http://localhost/healthz");
assert.equal(response.status, 200);
const health = await response.json();
assert.equal(health.status, "ok");
assert.equal(health.widgetCount, 8);
const page = await app.request("http://localhost/");
assert.equal(page.status, 200, "Showcase must be available without dev-only static middleware");
const html = await page.text();
assert.match(html, /rel="icon" href="data:image\/svg\+xml,/);
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
assert(assets.length >= 2, "Showcase must link its JavaScript and CSS");
for (const path of assets) {
  const asset = await app.request(`http://localhost${path}`);
  assert.equal(asset.status, 200, `Missing generated asset ${path}`);
  assert.match(asset.headers.get("cache-control"), /immutable/);
}
const notices = await app.request("http://localhost/licenses.txt");
assert.equal(notices.status, 200);
assert.equal((await app.request("http://localhost/assets/package.json")).status, 404);
assert.equal((await app.request("http://localhost/assets/%2e%2e%2f.env.local")).status, 404);
console.info("Emitted Node server starts, serves the showcase/assets, refuses unrelated files, and finds all eight bundled MCP Apps.");
