import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

export const APP_MIME_TYPE = "text/html;profile=mcp-app";
export const MAX_WIDGET_HTML_BYTES = 768 * 1024;

export class WidgetBundleError extends Error {}

export function validateWidgetHtml(html: string): number {
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes >= MAX_WIDGET_HTML_BYTES) {
    throw new WidgetBundleError(`Widget HTML must be smaller than 768 KiB; received ${bytes} bytes. Reduce the embedded bundle and run pnpm build.`);
  }
  if (!/<html(?:\s|>)/i.test(html) || !/<\/html\s*>/i.test(html)) {
    throw new WidgetBundleError("Widget output must be a complete HTML document. Check src/ui/widget.html and run pnpm build.");
  }
  const document = html.replace(/<!--[\s\S]*?-->/g, "");
  const elements = document.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)(?:<\/\1\s*>|$)|<link\b([^>]*)>/gi);
  let hasScript = false;
  for (const element of elements) {
    const tag = element[1]?.toLowerCase();
    if (tag === "script") {
      if (/(?:^|\s)src\s*=/i.test(element[2])) {
        throw new WidgetBundleError("Widget scripts must be inline. Use the single-file widget build; external or relative script sources are not supported.");
      }
      hasScript ||= element[3].trim().length > 0;
    }
    if (tag === "style") {
      if (/@import\b/i.test(element[3])) {
        throw new WidgetBundleError("Widget CSS must be bundled, not loaded with @import.");
      }
      for (const url of element[3].matchAll(/url\(\s*([^)]+)\)/gi)) {
        const value = url[1].trim().replace(/^["']|["']$/g, "");
        if (!value.startsWith("data:") && !value.startsWith("#")) {
          throw new WidgetBundleError("Widget CSS assets must be inlined as data URLs.");
        }
      }
    }
    if (element[4] && /(?:^|\s)rel\s*=\s*(?:["'][^"']*\b(?:stylesheet|modulepreload|preload)\b|(?:stylesheet|modulepreload|preload)\b)/i.test(element[4])) {
      throw new WidgetBundleError("Widget styles and module dependencies must be inline; external stylesheet or preload links remain.");
    }
  }
  if (!hasScript) {
    throw new WidgetBundleError("Widget HTML needs an inline application script. Check src/ui/widget.tsx and run pnpm build.");
  }
  return bytes;
}

export async function readWidgetHtml(path = resolve(process.cwd(), "generated/widget.html")): Promise<string> {
  try {
    const file = await stat(path);
    if (!file.isFile()) throw new WidgetBundleError("Widget bundle is not a file. Run pnpm build.");
    if (file.size >= MAX_WIDGET_HTML_BYTES) {
      throw new WidgetBundleError(`Widget HTML must be smaller than 768 KiB; received ${file.size} bytes. Run pnpm build after reducing the bundle.`);
    }
    const html = await readFile(path, "utf8");
    validateWidgetHtml(html);
    return html;
  } catch (error) {
    if (error instanceof WidgetBundleError) throw error;
    throw new WidgetBundleError("Widget bundle is unavailable. Run pnpm build to generate generated/widget.html.");
  }
}
