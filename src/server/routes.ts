import type { Hono } from "hono";
import { defaultConfig, resourceUri, widgets } from "../shared/config.js";
import { handleHttp, validateLocalOrigin } from "./http.js";
import { createWorkplaceHandler, demoPolicy, serverInfo } from "./mcp.js";
import { APP_MIME_TYPE, MAX_WIDGET_HTML_BYTES, readWidgetHtml, WidgetBundleError } from "./widget.js";

export type WorkplaceOptions = {
  widgetHtmlPath?: string;
  now?: () => number;
  localDevOrigin?: string;
};

export function registerWorkplaceRoutes(app: Hono, options: WorkplaceOptions = {}): void {
  if (options.localDevOrigin) validateLocalOrigin(options.localDevOrigin);
  const loadWidget = () => readWidgetHtml(options.widgetHtmlPath);
  const handler = createWorkplaceHandler(loadWidget, options.now);
  const metadataPolicy = { methods: ["GET", "HEAD"], localDevOrigin: options.localDevOrigin };
  const metadata = {
    serverInfo,
    endpoint: "/mcp",
    transport: "streamable-http",
    ...demoPolicy,
    widgetCount: widgets.length,
    appOnlyToolCount: 1,
  };
  const bundleStatus = async () => {
    try {
      const html = await loadWidget();
      return { status: "ready" as const, bytes: Buffer.byteLength(html, "utf8"), maxBytesExclusive: MAX_WIDGET_HTML_BYTES };
    } catch (error) {
      return {
        status: "unavailable" as const,
        message: error instanceof WidgetBundleError ? error.message : "Widget bundle is unavailable. Run pnpm build.",
        maxBytesExclusive: MAX_WIDGET_HTML_BYTES,
      };
    }
  };
  app.all("/mcp", c => handleHttp(c.req.raw, handler, {
    methods: ["POST"],
    localDevOrigin: options.localDevOrigin,
    methodMessage: "This stateless MCP endpoint accepts POST /mcp. Connect with an MCP client; browse / for the showcase or /catalog.json for metadata. GET streams and DELETE sessions are not supported.",
  }));
  app.all("/healthz", c => handleHttp(c.req.raw, async () => {
    const resource = await bundleStatus();
    const ready = resource.status === "ready";
    return Response.json({ status: ready ? "ok" : "degraded", ...metadata, resource }, { status: ready ? 200 : 503 });
  }, metadataPolicy));
  app.all("/catalog.json", c => handleHttp(c.req.raw, async () => {
    const resource = await bundleStatus();
    return Response.json({
      status: resource.status === "ready" ? "ok" : "degraded",
      ...metadata,
      defaults: defaultConfig,
      resource,
      widgets: widgets.map(widget => ({
        ...widget,
        status: resource.status,
        resourceUri: resourceUri(widget.id),
        mimeType: APP_MIME_TYPE,
        configRequired: true,
      })),
    });
  }, metadataPolicy));
  app.notFound(c => c.json({ error: "Not found. Use /mcp, /healthz, or /catalog.json. Run pnpm build to prepare the public showcase." }, 404, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }));
}
