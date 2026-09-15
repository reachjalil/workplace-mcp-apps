import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { fileURLToPath } from "node:url";
import { createApp } from "../app";
import { LOCAL_FIXTURE_ORIGIN } from "../src/server/http";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
const app = createApp({ localDevOrigin: LOCAL_FIXTURE_ORIGIN });
app.use("*", serveStatic({
  root: fileURLToPath(new URL("../public/", import.meta.url)),
  onFound: (_path, c) => { c.header("Cache-Control", "no-store"); },
}));
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, info => {
  console.info(`Workplace demo listening on http://127.0.0.1:${info.port}; MCP endpoint /mcp. Read-only synthetic data only.`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close();
  });
}
