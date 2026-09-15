import { Hono } from "hono";
import { registerWorkplaceRoutes, type WorkplaceOptions } from "./src/server/routes";

export function createApp(options: WorkplaceOptions = {}) {
  const app = new Hono();
  registerWorkplaceRoutes(app, options);
  return app;
}

export default createApp();
