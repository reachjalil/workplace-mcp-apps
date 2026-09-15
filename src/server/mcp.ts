import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import packageJson from "../../package.json" with { type: "json" };
import { configSchema, resourceUri, widgets, widgetSchema, type WidgetId } from "../shared/config.js";
import { createSnapshot, snapshotSchema, type Snapshot } from "../shared/data.js";
import { APP_MIME_TYPE } from "./widget.js";

export const serverInfo = { name: packageJson.name, version: packageJson.version };
export const MAX_SNAPSHOT_STEP = 9999;
export const snapshotArgumentsSchema = z.object({
  widget: widgetSchema,
  config: configSchema,
  step: z.number().int().min(0).max(MAX_SNAPSHOT_STEP).optional(),
}).strict();
export const launchArgumentsSchema = z.object({ config: configSchema }).strict();
export const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
export const resourceMeta = {
  ui: {
    prefersBorder: false,
    csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] },
  },
};
export const demoPolicy = {
  mode: "shared-demo",
  demo: true,
  synthetic: true,
  readOnly: true,
  identity: "none",
  authentication: "none",
  providers: "none",
  persistence: "none",
} as const;

function textFallback(snapshot: Snapshot): string {
  const summaries: Record<WidgetId, () => string> = {
    agenda: () => snapshot.agenda.meetings.map(item => `${item.time} ${item.title} (${item.minutes} min)`).join("\n"),
    brief: () => `${snapshot.brief.headline}\n${snapshot.brief.meetings} meetings, ${snapshot.brief.replies} replies, ${snapshot.brief.tasks} tasks; ${snapshot.brief.focusMinutes} focus minutes.`,
    attention: () => snapshot.attention.map(item => `${item.category}: ${item.title} — ${item.detail}`).join("\n"),
    goals: () => `${snapshot.goals.percent}% progress; ${snapshot.goals.completed} of ${snapshot.goals.total} checkpoints complete.\n${snapshot.goals.items.map(item => `${item.title}: ${item.percent}% (${item.status})`).join("\n")}`,
    leave: () => `${snapshot.leave.available} sample days available, ${snapshot.leave.used} used. Next break: ${snapshot.leave.next}. ${snapshot.leave.policy}.`,
    learning: () => `${snapshot.learning.completed} of ${snapshot.learning.total} lessons complete (${snapshot.learning.percent}%). Next: ${snapshot.learning.title}, ${snapshot.learning.duration}; due ${snapshot.learning.deadline}.`,
    updates: () => snapshot.updates.map(item => `${item.category}: ${item.title} — ${item.excerpt}`).join("\n"),
    actions: () => snapshot.actions.map(item => `${item.title}: ${item.description}`).join("\n"),
  };
  const title = widgets.find(widget => widget.id === snapshot.widget)!.title;
  return `${title}\nSynthetic shared demo, read-only. Labels are presentation settings, not an authenticated identity. Nothing is sent, stored, or changed.\n\n${summaries[snapshot.widget]()}`;
}

function snapshotResult(snapshot: Snapshot) {
  return {
    content: [{ type: "text" as const, text: textFallback(snapshot) }],
    structuredContent: snapshot,
  };
}

export function createWorkplaceHandler(loadWidget: () => Promise<string>, now: () => number = Date.now) {
  return createMcpHandler(server => {
    for (const widget of widgets) {
      const uri = resourceUri(widget.id);
      server.registerTool(widget.tool, {
        title: widget.title,
        description: `${widget.description} Read-only synthetic shared demo; no real providers, accounts, or writes. Pass config: {} for the default presentation.`,
        inputSchema: launchArgumentsSchema,
        outputSchema: snapshotSchema,
        annotations: readOnlyAnnotations,
        _meta: { ui: { resourceUri: uri, visibility: ["model", "app"] } },
      }, ({ config }) => snapshotResult(createSnapshot(widget.id, config, now())));
      server.registerResource(widget.id, uri, {
        title: widget.title,
        description: "Self-contained workplace demo widget. All data is synthetic and read-only.",
        mimeType: APP_MIME_TYPE,
        _meta: resourceMeta,
      }, async () => ({
        contents: [{ uri, mimeType: APP_MIME_TYPE, text: await loadWidget(), _meta: resourceMeta }],
      }));
    }
    server.registerTool("get_workplace_snapshot", {
      title: "Refresh workplace demo snapshot",
      description: "App-only read of synthetic demo data. Optional step advances the sample without writing or storing anything. Config is required; {} uses defaults.",
      inputSchema: snapshotArgumentsSchema,
      outputSchema: snapshotSchema,
      annotations: readOnlyAnnotations,
      _meta: { ui: { visibility: ["app"] } },
    }, ({ widget, config, step }) => snapshotResult(createSnapshot(widget, config, now(), step)));
  }, {
    serverInfo,
    maxSubscriptions: 0,
    instructions: "This server is a public, read-only, synthetic shared demo. Company, viewer, and team are fictional presentation labels, not identity or access controls. No real providers, accounts, authentication, storage, or business actions are connected. Every launch tool requires config; use {} for defaults.",
  });
}
