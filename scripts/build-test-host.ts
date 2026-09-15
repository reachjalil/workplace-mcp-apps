import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { widgetOrigin } from "../tests/host-config";

const root = fileURLToPath(new URL("../", import.meta.url));
await Promise.all(["generated/widget.html", "public/index.html"].map(path => access(`${root}${path}`))).catch(() => {
  throw new Error("Product build missing. Ask the product owner to run pnpm build; the browser suite only builds its own host.");
});

await build({
  configFile: false,
  root: `${root}tests/host`,
  publicDir: false,
  base: "./",
  plugins: [viteSingleFile()],
  define: { "import.meta.env.VITE_WIDGET_ORIGIN": JSON.stringify(widgetOrigin) },
  build: {
    outDir: `${root}.test-host/site`,
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
