import assert from "node:assert/strict";

// Import emitted JavaScript with plain Node, not a TS loader that repairs ESM paths.
const { default: app } = await import("../.server/app.js");
const response = await app.request("http://localhost/healthz");
assert.equal(response.status, 200);
const health = await response.json();
assert.equal(health.status, "ok");
assert.equal(health.widgetCount, 8);
console.info("Emitted Node server starts and finds all eight bundled MCP Apps.");
