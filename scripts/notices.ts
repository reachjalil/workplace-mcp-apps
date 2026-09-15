import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/** Preserve license text for code actually distributed in each browser bundle. */
export function bundledNotices() {
  let text = "";
  const plugin: Plugin = {
    name: "bundled-third-party-notices",
    async generateBundle() {
      const roots = new Set<string>();
      for (const id of this.getModuleIds()) {
        const marker = "/node_modules/";
        const index = id.lastIndexOf(marker);
        if (index < 0 || id.startsWith("\0")) continue;
        const remainder = id.slice(index + marker.length).split("/");
        const name = remainder.slice(0, remainder[0].startsWith("@") ? 2 : 1).join("/");
        roots.add(id.slice(0, index + marker.length) + name);
      }
      const sections: string[] = [];
      for (const root of [...roots].sort()) {
        const metadata = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
        const files = (await readdir(root)).filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
        if (!files.length) throw new Error(`Missing bundled license notice for ${String(metadata.name)}`);
        const licenses = await Promise.all(files.sort().map(name => readFile(resolve(root, name), "utf8")));
        sections.push(`${String(metadata.name)} ${String(metadata.version)}\n${licenses.join("\n\n")}`);
      }
      text = `THIRD-PARTY NOTICES\nDependencies retain their original copyrights and licenses.\n\n${sections.join("\n\n----------------------------------------\n\n")}`;
    },
  };
  return { plugin, read: () => text };
}
