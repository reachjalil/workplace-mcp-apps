# Workplace MCP Apps

Eight thoughtful workplace widgets, one standard MCP server. A small, open-source example of how to build a company's own MCP Apps without coupling its UI or data adapter to a particular host.

**[Live demo](https://workplace-mcp-apps.vercel.app/) · [MCP endpoint](https://workplace-mcp-apps.vercel.app/mcp) · MIT licensed**

All people, meetings, incidents, balances, and progress are **synthetic**. No account, API key, database, or paid data provider is needed. The public site previews the same React components used by the MCP Apps; inside an MCP host, snapshots come from actual MCP tool calls.

## Try it in OpenWork

1. Add `https://workplace-mcp-apps.vercel.app/mcp` as a remote Streamable HTTP connector. Choose **no authentication** for this public demo.
2. Test tools. You should see eight launch tools. The ninth tool, `get_workplace_snapshot`, is an app-only refresh helper—not another dashboard card.
3. Create a dashboard and add each App in the order below. Paste this **Launch input (JSON)** for each:

   ```json
   { "config": {} }
   ```

4. Enable **Run automatically** for these read-only demo widgets, or run each once as the host permits. Share the dashboard using your normal organization controls.
5. Open Dashboard. In builds with the compact masonry layout, the tall agenda sits beside shorter stacked cards. Change the saved order with Den's up/down arrows. A merge into `dev` alone does not mean an installed release includes that layout.

The hosted `/mcp` URL is an API, **not a webpage to embed as an iframe**. A normal browser GET returns a helpful 405. Compatible hosts discover tools and `ui://` resources over MCP.

### Recommended three-column order

| Order | App / tool | Shape | Demo interaction |
|---|---|---|---|
| 1 | Today at a glance / `show_agenda` | Tall, about 700px | Select a schedule block |
| 2 | Your daily brief / `show_brief` | Short, about 230px | Changing metrics and activity trend |
| 3 | Needs your attention / `show_attention` | Medium, about 500px | Filter and expand items |
| 4 | My goals / `show_goals` | Short, about 230px | Expand goal checkpoints |
| 5 | Time off / `show_leave` | Short, about 190px | Preview a fictional leave request |
| 6 | Keep learning / `show_learning` | Short, about 250px | Try a sample lesson |
| 7 | Around the company / `show_updates` | Medium, about 330px | Choose a department and read a story |
| 8 | Quick actions / `show_actions` | Short, about 270px | Local previews; no real submissions |

These are approximate **collapsed** heights at typical dashboard widths, not forced heights. Cards use one column each—no cross-column spans. Expanded content renegotiates height. A host may clamp height (OpenWork currently caps inline frames at 800px), so particularly long expanded states may scroll within that limit. Fewer available columns naturally change packing.

## Configure without editing code

Use **Configure** on the live demo to choose a persona, accent, density, scenario, and refresh pace, then **Copy JSON**. Paste the complete object into each tile's launch input:

```json
{
  "config": {
    "company": "Example Company",
    "viewer": "Alex",
    "team": "Product",
    "accent": "blue",
    "density": "comfortable",
    "scenario": "balanced",
    "live": true,
    "refreshSeconds": 30,
    "seed": 7
  }
}
```

Only `config` itself is required; every setting inside it is optional. Use the same configuration across tiles for a cohesive demo. Different input can give the same tool another persona on hosts that permit duplicate tools with distinct launch arguments.

| Setting | Accepted values |
|---|---|
| `company`, `viewer` | Fictional labels, max 48 / 32 characters |
| `team` | `Product`, `Engineering`, `Operations`, `Design` |
| `accent` | `blue`, `violet`, `teal` |
| `density` | `comfortable`, `compact` |
| `scenario` | `balanced`, `busy`, `focus` |
| `live` | `true` or `false` |
| `refreshSeconds` | `15`, `30`, `60` |
| `seed` | Integer `0`–`9999`; repeatable demo variations |

The website does not save or send its configuration. Copying settings into an MCP host sends those launch arguments to this public server, so **do not use sensitive labels or credentials**. Company/viewer/team are not an authentication or authorization mechanism.

### How the changing data works

`createSnapshot()` combines a time bucket, seed, and optional preview step into six deterministic demo moments. Counts, incident states, goals, and learning progress change; the sample schedule remains a readable fictional workday rather than pretending to be your actual calendar.

- In an MCP host, the App uses `callServerTool("get_workplace_snapshot")` through its existing host connection. There is no direct browser fetch to a third party.
- **Pause**, **Refresh**, and **Next demo moment** control the sample. No concurrent refresh requests are sent.
- Hidden views pause. Teardown cancels requests and removes timers/observers. A failed refresh keeps the last valid data and pauses automatic updates until retry.
- Read-only hosts can show the initial result but do not advertise or receive refresh calls.
- `live: false` removes wall-clock changes. **Next demo moment** still works as an explicit read; reopening starts from the configured seed. Nothing persists server-side.

## Run locally

Requires Node **24.x** and pnpm **10.28.0** (declared in `package.json`).

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:3000/`. The MCP endpoint is `http://127.0.0.1:3000/mcp`. Set `PORT=3001` if needed. `pnpm dev` builds then starts the server; restart it after edits. Some remote hosts require a public HTTPS URL instead of a loopback address.

## Deploy your own copy to Vercel

Fork or clone this repository into your own GitHub account, then import it into Vercel.

- Framework: **Hono**
- Root directory: repository root
- Node: **24.x**
- Build command: **`pnpm build`**
- No environment variables, database, or paid integration required

Or, from your clone with Vercel CLI already signed in:

```sh
vercel link
vercel --prod
```

Your new endpoint is `https://<your-project>.vercel.app/mcp`. The **Copy MCP URL** button derives this from the page's own origin, so it automatically works on your deployment.

`vercel.json` includes `generated/widget.html` in the function. Keep that setting: the static showcase alone is not an MCP App deployment. `public/` and `generated/` are dedicated generated outputs; the build replaces them. Do not put hand-maintained files there.

For a public demo, ensure Vercel deployment protection is not blocking the **production** endpoint. Preview deployments can remain protected. Choose your own plan/budgets; public anonymous requests still consume hosting resources. No firewall bypass token belongs in this repository or a connector URL.

## Where to make changes

| File | Responsibility |
|---|---|
| `src/shared/config.ts` | Widget catalog, tool names, recommended order, launch defaults and validation |
| `src/shared/data.ts` | Typed snapshot contract and stateless synthetic-data adapter |
| `src/ui/Widgets.tsx`, `widgets.css` | The actual card components shared by website and MCP views |
| `src/ui/embedded.ts` | Standard MCP Apps lifecycle, tool refresh, cancellation and height reporting |
| `src/server/mcp.ts` | Eight tool/resource bindings and the app-only helper |
| `src/server/http.ts` | Origin, request-size, method, and cache boundaries |
| `src/ui/showcase.tsx` | Public demo and developer configurator |
| `scripts/build.ts` | Inline the App resource, check its size, build the public site |

### Add your own widget

1. Add its ID, title and tool name to `config.ts`.
2. Extend `snapshotSchema` and the data adapter with its typed result.
3. Add a React card and register it in `widgetComponents` in `Widgets.tsx`.
4. Add it to `recommendedOrder` if it belongs in the default board. The server loops over the catalog to register launch tools and resources.
5. Extend the protocol and browser tests, then deploy. Test at 320px width and after expanding/collapsing content.

Each launch tool advertises `_meta.ui.resourceUri`, such as `ui://workplace/agenda.html`. `resources/read` returns exactly one self-contained HTML document with MIME `text/html;profile=mcp-app`. All eight resource URIs share one bundled React renderer; the **validated tool result** selects the widget. Text fallback and explicit structured output remain available to clients without an App renderer.

Height is measured from content with `ResizeObserver` and reported via the official SDK's `sendSizeChanged({ height })`. No viewport-sized cards, `100vh`, or fixed dashboard row heights; the host owns the width and placement. CSS and JavaScript are bundled inline, with no CDN/font/image dependencies or sandbox network permissions. The build enforces a resource smaller than **768 KiB**.

### Replace mock data with company data

Replace the adapter, not the protocol or the card layout. Add real authentication and **server-side** tenant/member authorization before reading private systems. Derive identity from a verified session/token, never `config.viewer` or `config.company`. Validate inputs and output, minimize returned data, and keep credentials server-side. Design write tools with explicit approval, audit, and idempotency instead of attaching them to a timer.

This example is intentionally **not** a production employee portal or OAuth implementation.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium   # first time, if no Chrome/cached Chromium
pnpm test:browser
pnpm audit --prod --audit-level high
```

Tests cover validation, deterministic demo moments, real HTTP MCP negotiation/tool calls/resources, three-/one-column layout, light/dark rendering, config export, local-only interactions, and a separate-origin MCP Apps SDK host with real tool refresh and height notifications. They are **not a claim of full OpenWork or every third-party host certification**.

The local SDK fixture is test-only, never deployed. `/healthz` checks that the resource is present and valid; `/catalog.json` lists Apps, defaults, and readiness. The MCP endpoint accepts bounded POST requests and OPTIONS, not long-lived GET streams. Browser access is same-origin; server-side MCP clients may omit Origin. No wildcard CORS, cookies, analytics, external providers, or business writes.

## License

Original project code is MIT, copyright 2026 Jalil. Bundled dependencies keep their own licenses; see `THIRD_PARTY_NOTICES.md`. This is an independent example using the MCP and MCP Apps standards, not an official service of those projects.
