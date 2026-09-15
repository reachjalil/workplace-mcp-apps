import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Hono } from "hono";

/**
 * Hono's Vercel builder can inventory public/ before the build runs. Explicit
 * routes keep generated assets available without checking compiled JS into Git.
 * Only fixed entry files and content-hashed showcase assets can be read.
 */
export function registerShowcaseRoutes(app: Hono) {
  app.get("/", async c => {
    try {
      const html = await readFile(resolve(process.cwd(), "public/index.html"), "utf8");
      c.header("Cache-Control", "public, max-age=0, s-maxage=60");
      return c.html(html);
    } catch {
      return c.json({ error: "Showcase unavailable. Run pnpm build." }, 503);
    }
  });
  app.get("/assets/:file", async c => {
    const file = c.req.param("file");
    if (!/^showcase-[A-Za-z0-9_-]+\.(js|css)$/.test(file)) return c.notFound();
    try {
      const source = await readFile(resolve(process.cwd(), "public/assets", file), "utf8");
      c.header("Content-Type", file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8");
      c.header("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
      c.header("X-Content-Type-Options", "nosniff");
      return c.body(source);
    } catch {
      return c.notFound();
    }
  });
  app.get("/licenses.txt", async c => {
    try {
      c.header("Cache-Control", "public, max-age=0, s-maxage=60");
      return c.text(await readFile(resolve(process.cwd(), "public/licenses.txt"), "utf8"));
    } catch {
      return c.notFound();
    }
  });
}
