# Third-party notices

The original source in this repository is MIT-licensed. Dependencies are installed from the versions in `pnpm-lock.yaml` and remain under their own licenses. No source, brand assets, or screenshots from another dashboard or gallery have been copied into this project.

The build collects the actual browser bundle's package license and notice files:

- The self-contained MCP App HTML includes the notices in an HTML comment, so they travel with `resources/read`.
- The public website distributes its bundled notices at `/licenses.txt`.
- Build fails if a bundled package has no license/notice file or if the complete MCP App resource exceeds the host's size limit.

Notable dependencies include React and React DOM (MIT), Lucide (ISC, including its upstream notices), Zod (MIT), the MCP SDK / MCP Apps SDK (their packaged licenses), Hono (MIT), and Vercel's `mcp-handler` (Apache-2.0). Development-only tooling, including Playwright and TypeScript, keeps its own license and is not deployed as the test host.

Run `pnpm licenses list` for the complete installed dependency inventory. Distributed server packages retain the license files shipped with their npm packages. Do not replace the dependency notices with this project's MIT license when adapting or redistributing the demo.
