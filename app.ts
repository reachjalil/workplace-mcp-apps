import { Hono } from "hono";
import { registerWorkplaceRoutes, type WorkplaceOptions } from "./src/server/routes.js";
import { registerShowcaseRoutes } from "./src/server/showcase.js";

export function createApp(options: WorkplaceOptions = {}) {
  const app = new Hono();
  registerShowcaseRoutes(app);
  registerWorkplaceRoutes(app, options);
  return app;
}

export default createApp();
