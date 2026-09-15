import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "../app";
import { fixtureTime, hostOrigin, hostPort, widgetCsp } from "./host-config";

const root = fileURLToPath(new URL("../", import.meta.url));
const hostHtml = await readFile(`${root}.test-host/site/index.html`, "utf8");
const widgetHtml = await readFile(`${root}generated/widget.html`, "utf8");
const app = createApp({ widgetHtmlPath: `${root}generated/widget.html`, now: () => fixtureTime });
app.get("/test-host", c => c.redirect("/test-host/"));
app.get("/test-host/", c => c.html(hostHtml, 200, { "Cache-Control": "no-store" }));
app.get("/test-host/ready", c => c.json({ ready: true, fixture: "independent-sdk-host" }));
app.get("/favicon.ico", c => c.body(null, 204));
app.use("*", serveStatic({ root: `${root}public`, onFound: (_path, c) => c.header("Cache-Control", "no-store") }));

const isolated = new Hono();
isolated.get("/widget", c => c.html(widgetHtml, 200, {
  "Content-Security-Policy": widgetCsp,
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": hostOrigin,
  "Vary": "Origin",
}));
isolated.get("/favicon.ico", c => c.body(null, 204));

const servers: Server[] = [];
async function stop() {
  await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
}

try {
  for (const [handler, port] of [[isolated.fetch, hostPort + 1], [app.fetch, hostPort]] as const) {
    const server = createServer(getRequestListener(handler, { overrideGlobalObjects: false }));
    servers.push(server);
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
  }
} catch (error) {
  await stop();
  throw error;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void stop(); });
}
