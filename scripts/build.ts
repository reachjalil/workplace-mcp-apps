import { access, lstat, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { validateWidgetHtml } from "../src/server/widget";
import { bundledNotices } from "./notices";

const root = fileURLToPath(new URL("../", import.meta.url));
const ui = resolve(root, "src/ui");
const generated = resolve(root, "generated");
const publicDirectory = resolve(root, "public");

async function requireEntries() {
  for (const entry of ["widget.html", "widget.tsx", "showcase.html", "showcase.tsx"]) {
    try {
      await access(resolve(ui, entry));
    } catch {
      throw new Error(`Missing src/ui/${entry}. The frontend must provide both widget.html + widget.tsx and showcase.html + showcase.tsx before pnpm build.`);
    }
  }
  for (const output of [generated, publicDirectory]) {
    const info = await lstat(output).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (info && (!info.isDirectory() || info.isSymbolicLink())) {
      throw new Error(`Refusing to replace ${output}: build outputs must be real, dedicated directories.`);
    }
  }
}

async function main() {
  await requireEntries();
  const widgetNotices = bundledNotices();
  const siteNotices = bundledNotices();
  await build({
    configFile: false,
    root: ui,
    base: "./",
    publicDir: false,
    plugins: [react(), widgetNotices.plugin, viteSingleFile()],
    build: {
      outDir: generated,
      emptyOutDir: true,
      target: "es2022",
      sourcemap: false,
      cssCodeSplit: false,
      modulePreload: false,
      rollupOptions: {
        input: resolve(ui, "widget.html"),
        output: { inlineDynamicImports: true },
      },
    },
  });
  const widgetPath = resolve(generated, "widget.html");
  const html = await readFile(widgetPath, "utf8");
  const withNotices = `${html}\n<!--\n${widgetNotices.read().replaceAll("--", "—")}\n-->\n`;
  const bytes = validateWidgetHtml(withNotices);
  await writeFile(widgetPath, withNotices);
  console.info(`Widget verified: ${bytes} UTF-8 bytes, below 768 KiB, with inline scripts and styles.`);
  await build({
    configFile: false,
    root: ui,
    base: "/",
    publicDir: false,
    plugins: [react(), siteNotices.plugin],
    build: {
      outDir: publicDirectory,
      emptyOutDir: true,
      target: "es2022",
      sourcemap: false,
      rollupOptions: { input: resolve(ui, "showcase.html") },
    },
  });
  await rename(resolve(publicDirectory, "showcase.html"), resolve(publicDirectory, "index.html"));
  await writeFile(resolve(publicDirectory, "licenses.txt"), siteNotices.read());
  console.info("Showcase ready in public/index.html; Vercel serves public assets through its CDN.");
}

await main().catch(error => {
  console.error(error instanceof Error ? error.message : "Build failed.");
  process.exitCode = 1;
});
