import { z } from "zod";

export const widgetIds = ["agenda", "brief", "attention", "goals", "leave", "learning", "updates", "actions"] as const;
export const widgetSchema = z.enum(widgetIds);
export type WidgetId = z.infer<typeof widgetSchema>;

/** Only presentation and synthetic-demo controls. Never place credentials here. */
export const configSchema = z.object({
  company: z.string().trim().min(1).max(48).default("Example Company"),
  viewer: z.string().trim().min(1).max(32).default("Alex"),
  team: z.enum(["Product", "Engineering", "Operations", "Design"]).default("Product"),
  accent: z.enum(["blue", "violet", "teal"]).default("blue"),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  scenario: z.enum(["balanced", "busy", "focus"]).default("balanced"),
  live: z.boolean().default(true),
  refreshSeconds: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(30),
  seed: z.number().int().min(0).max(9999).default(7),
}).strict();
export type DemoConfig = z.infer<typeof configSchema>;
export type DemoConfigInput = z.input<typeof configSchema>;
export const defaultConfig: DemoConfig = configSchema.parse({});

export const widgets: ReadonlyArray<{ id: WidgetId; title: string; tool: string; description: string; size: string }> = [
  { id: "agenda", title: "Today at a glance", tool: "show_agenda", description: "A tall timeline with meetings, focus time, and a day-at-a-glance brief.", size: "Tall · about 680px" },
  { id: "brief", title: "Your daily brief", tool: "show_brief", description: "A compact greeting and snapshot of meetings, replies, and work in progress.", size: "Short · about 230px" },
  { id: "attention", title: "Needs your attention", tool: "show_attention", description: "A filterable inbox of synthetic critical items, deadlines, and review requests.", size: "Medium · about 530px" },
  { id: "goals", title: "My goals", tool: "show_goals", description: "A progress ring and current-quarter goal checkpoints.", size: "Short · about 240px" },
  { id: "leave", title: "Time off", tool: "show_leave", description: "Available days, an upcoming break, and a clearly simulated request flow.", size: "Short · about 190px" },
  { id: "learning", title: "Keep learning", tool: "show_learning", description: "Learning progress and a featured next lesson.", size: "Short · about 250px" },
  { id: "updates", title: "Around the company", tool: "show_updates", description: "Department updates with selectable categories and expandable stories.", size: "Medium · about 330px" },
  { id: "actions", title: "Quick actions", tool: "show_actions", description: "Safe, in-widget mock actions for everyday workplace requests.", size: "Short · about 260px" },
];

/** Designed for a maximum of three equal-width masonry columns, never column spans. */
export const recommendedOrder: WidgetId[] = widgets.map(widget => widget.id);
export const resourceUri = (id: WidgetId) => `ui://workplace/${id}.html`;
