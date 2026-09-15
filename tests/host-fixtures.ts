import { test as base, expect, type FrameLocator, type Page, type Response } from "@playwright/test";
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { hostOrigin, widgetOrigin } from "./host-config";

export type HttpWitness = {
  url: string;
  method: string;
  frameUrl: string;
  mainFrame: boolean;
  rpc?: { method: string; params?: { name?: string; arguments?: Record<string, unknown>; uri?: string } };
};
export type Traffic = { requests: HttpWitness[]; calls: (name: string) => HttpWitness[] };
const optionalSse = {
  url: `${hostOrigin}/mcp`,
  method: "GET",
  status: 405,
  reason: "SDK v1 probes an optional GET SSE stream. The actual stateless /mcp endpoint deliberately returns 405; POST RPC must still succeed.",
};

export const test = base.extend<{ traffic: Traffic }>({
  traffic: [async ({ context, page }, use, testInfo) => {
    const requests: HttpWitness[] = [];
    const errors: Array<{ text: string; url: string }> = [];
    const pageErrors: string[] = [];
    const external: string[] = [];
    const failures: Array<Promise<{ url: string; method: string; status?: number; contentType?: string; rpcMethod?: string; rpcId?: string | number; error: string | null }>> = [];
    const httpErrors: Array<{ url: string; method: string; status: number }> = [];
    const allowed = new Set([hostOrigin, widgetOrigin]);
    const observePage = (current: Page) => {
      current.on("pageerror", error => pageErrors.push(error.message));
      current.on("console", message => {
        if (message.type() === "error") errors.push({ text: message.text(), url: message.location().url });
      });
    };
    observePage(page);
    context.on("page", observePage);
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (allowed.has(url.origin) || url.protocol === "data:") return route.continue();
      external.push(url.href);
      await route.abort("blockedbyclient");
    });
    await context.routeWebSocket("**/*", socket => {
      external.push(socket.url());
      socket.close();
    });
    context.on("request", request => {
      const witness: HttpWitness = { url: request.url(), method: request.method(), frameUrl: request.frame().url(), mainFrame: request.frame().parentFrame() === null };
      if (request.method() === "POST" && new URL(request.url()).pathname === "/mcp") witness.rpc = request.postDataJSON();
      requests.push(witness);
    });
    context.on("requestfailed", request => failures.push((async () => {
      const response = await request.response();
      const rpc = request.method() === "POST" && request.url() === optionalSse.url ? request.postDataJSON() : undefined;
      return { url: request.url(), method: request.method(), status: response?.status(), contentType: response?.headers()["content-type"], rpcMethod: rpc?.method, rpcId: rpc?.id, error: request.failure()?.errorText ?? null };
    })()));
    context.on("response", response => {
      if (response.status() >= 400) httpErrors.push({ url: response.url(), method: response.request().method(), status: response.status() });
    });
    const traffic: Traffic = { requests, calls: name => requests.filter(request => request.rpc?.method === "tools/call" && request.rpc.params?.name === name) };
    await use(traffic);
    const sseResponses = httpErrors.filter(response => response.url === optionalSse.url && response.method === optionalSse.method && response.status === optionalSse.status);
    const expectedConsole = errors.filter(error => error.url === optionalSse.url && /^Failed to load resource: the server responded with a status of 405 \(Method Not Allowed\)$/.test(error.text));
    if (sseResponses.length) testInfo.annotations.push({ type: "expected-sdk-probe", description: optionalSse.reason });
    expect.soft(pageErrors, "Uncaught page errors, including iframe errors").toEqual([]);
    expect.soft(errors.filter(error => !expectedConsole.includes(error)), "Unexpected console errors").toEqual([]);
    expect.soft(expectedConsole.length, "Every allowed console 405 must have a real GET /mcp response").toBeLessThanOrEqual(sseResponses.length);
    expect.soft(httpErrors.filter(response => !sseResponses.includes(response)), "Unexpected HTTP failures").toEqual([]);
    const observedFailures = await Promise.all(failures);
    const rpcReceipts = (await page.locator('#sdk-events [data-event="mcp-response"]').allTextContents()).map(text => JSON.parse(text));
    const completedIds = new Set(rpcReceipts.filter(receipt => receipt.received && !receipt.isError).map(receipt => receipt.id));
    const releasedBodies = observedFailures.filter(failure => failure.url === optionalSse.url && failure.error === "net::ERR_ABORTED" && (
      failure.method === "GET" && failure.status === 405 ||
      failure.method === "POST" && failure.status === 202 && failure.rpcMethod === "notifications/initialized"
    ));
    const completedStreams = observedFailures.filter(failure => failure.url === optionalSse.url && failure.method === "POST" && failure.status === 200 && failure.contentType?.startsWith("text/event-stream") && failure.error === "net::ERR_ABORTED" && completedIds.has(failure.rpcId));
    if (releasedBodies.length) testInfo.annotations.push({ type: "expected-sdk-body-release", description: "SDK v1 explicitly cancels the unused body of its accepted 202 initialization notification and optional 405 GET probe. Only those exact HTTP receipts permit an unused-body ERR_ABORTED." });
    if (completedStreams.length) testInfo.annotations.push({ type: "completed-sdk-stream", description: "Chromium can report an aborted SSE reader after delivery. Accept only HTTP 200 text/event-stream with a successful, matching JSON-RPC id independently witnessed by the actual SDK transport; missing results and all console/page errors still fail." });
    expect.soft(observedFailures.filter(failure => !releasedBodies.includes(failure) && !completedStreams.includes(failure)), "Failed browser requests without a completed SDK receipt").toEqual([]);
    expect.soft(external, "No external HTTP or WebSocket access").toEqual([]);
    expect.soft(requests.filter(request => !["GET", "HEAD", "OPTIONS"].includes(request.method) && !(request.method === "POST" && request.url === `${hostOrigin}/mcp`)), "No HTTP writes outside read-only MCP").toEqual([]);
    const readOnlyMethods = ["initialize", "notifications/initialized", "tools/list", "resources/list", "resources/read", "tools/call", "ping"];
    expect.soft(requests.filter(request => request.rpc && !readOnlyMethods.includes(request.rpc.method)), "Only expected read-only RPC methods").toEqual([]);
    const readOnlyTools = ["show_agenda", "show_brief", "show_attention", "show_goals", "show_leave", "show_learning", "show_updates", "show_actions", "get_workplace_snapshot"];
    expect.soft(requests.filter(request => request.rpc?.method === "tools/call" && !readOnlyTools.includes(request.rpc.params?.name ?? "")), "No real business tool calls").toEqual([]);
    expect.soft(requests.filter(request => new URL(request.frameUrl || hostOrigin).origin === widgetOrigin && !["GET", "HEAD"].includes(request.method)), "The iframe cannot make HTTP tool calls").toEqual([]);
    await testInfo.attach("local-http-witness", { body: JSON.stringify({ requests, rpcReceipts, httpErrors, failures: observedFailures, consoleErrors: errors, external, pageErrors }, null, 2), contentType: "application/json" });
  }, { auto: true }],
});
export { expect };

export async function openHost(page: Page, { tool, width = 360, live = false, readOnly = false }: { tool: string; width?: number; live?: boolean; readOnly?: boolean }) {
  await page.goto("/test-host/");
  const initialization = page.waitForResponse(response => response.url() === `${hostOrigin}/mcp` && response.request().method() === "POST" && response.request().postDataJSON().method === "initialize", { timeout: 10000 });
  await page.getByRole("button", { name: "Connect and discover" }).click();
  const initializeResponse = await initialization;
  expect(initializeResponse.status()).toBe(200);
  const initializeId = initializeResponse.request().postDataJSON().id;
  expect(initializeId).toBe(0);
  await expect(page.locator("#status")).toHaveText("Connected: 9 tools / 8 resources");
  const readInitializationReceipts = async () => (await page.locator('#sdk-events [data-event="mcp-response"]').allTextContents()).map(text => JSON.parse(text)).filter(receipt => receipt.id === initializeId);
  const expectedInitializationReceipt = { event: "mcp-response", id: initializeId, received: true, isError: false };
  await expect.poll(readInitializationReceipts, { timeout: 2000, message: "Connect must capture the actual initialize response receipt 0" }).toEqual([expectedInitializationReceipt]);
  await page.getByRole("combobox", { name: "Widget", exact: true }).selectOption(tool);
  await page.getByRole("combobox", { name: "Iframe width", exact: true }).selectOption(String(width));
  await page.getByLabel("Live updates", { exact: true }).setChecked(live);
  await page.getByLabel("Allow widget server tools").setChecked(!readOnly);
  const documentResponse = page.waitForResponse(response => response.url() === `${widgetOrigin}/widget` && response.request().resourceType() === "document");
  await page.getByRole("button", { name: "Launch widget", exact: true }).click();
  const response = await documentResponse;
  await expect(page.locator("#status")).toHaveText(`Rendered ${tool}`);
  await expect.poll(readInitializationReceipts, { timeout: 2000, message: "Launch must retain initialize receipt 0 for the final request-failure check" }).toEqual([expectedInitializationReceipt]);
  await expect(page.locator("#error")).toBeHidden();
  await expect(page.locator("#resource-status")).toContainText("Verified resources/read matches isolated /widget");
  const frame = page.frameLocator('iframe[title="Workplace MCP App"]');
  await expect(frame.locator("article[data-widget]")).toBeVisible();
  return { frame, response };
}

export async function expectIframeFits(page: Page, frame: FrameLocator, maximumHeight?: number) {
  const iframe = page.locator('iframe[title="Workplace MCP App"]');
  await expect.poll(async () => {
    const rootHeight = await frame.locator(".embedded-view").evaluate(node => Math.ceil(node.getBoundingClientRect().height));
    const outer = await iframe.boundingBox();
    return Math.abs((outer?.height ?? 0) - rootHeight);
  }, { message: "Parent height follows the SDK notification, including shrink" }).toBeLessThanOrEqual(1);
  const box = await iframe.boundingBox();
  expect(box!.height).toBeGreaterThan(100);
  if (maximumHeight !== undefined) expect(box!.height).toBeLessThanOrEqual(maximumHeight);
  await expectNoOverflow(frame);
  const sizes = await page.locator('#sdk-events [data-event="sizechange"]').allTextContents();
  expect(sizes.length).toBeGreaterThan(0);
  for (const text of sizes) {
    const event = JSON.parse(text);
    expect(event).toMatchObject({ callback: "AppBridge.sizechange", method: "ui/notifications/size-changed", origin: widgetOrigin, sourceMatches: true });
    expect(event.params.height).toBeGreaterThan(0);
  }
  expect(JSON.parse(sizes.at(-1)!).params.height).toBe(box!.height);
  await expect(page.locator("#error")).toBeHidden();
  return box!.height;
}

export async function expectNoOverflow(target: Page | FrameLocator) {
  await expect.poll(() => target.locator("html").evaluate(html => {
    const body = document.body;
    return Math.max(html.scrollWidth, body.scrollWidth) - html.clientWidth;
  }), { message: "No document or iframe horizontal overflow" }).toBeLessThanOrEqual(1);
}

export async function readToolResponse(page: Page, response: Response): Promise<CallToolResult> {
  expect(response.status()).toBe(200);
  expect(response.url()).toBe(`${hostOrigin}/mcp`);
  const request = response.request().postDataJSON();
  expect(request.method).toBe("tools/call");
  expect(request.id).toBeDefined();
  let receipts: Array<{ received: boolean; isError: boolean; result?: unknown }> = [];
  await expect.poll(async () => {
    receipts = (await page.locator('#sdk-events [data-event="mcp-response"]').allTextContents()).map(text => JSON.parse(text)).filter(receipt => receipt.id === request.id);
    return receipts.length;
  }, { timeout: 2000, message: "The actual SDK must retain exactly one result matching the HTTP tool request ID" }).toBe(1);
  expect(receipts[0].received).toBe(true);
  expect(receipts[0].isError).toBe(false);
  const result = CallToolResultSchema.parse(receipts[0].result);
  expect(result.isError).not.toBe(true);
  return result;
}

export function nextToolResponse(page: Page, name: string) {
  return page.waitForResponse(response => {
    if (response.url() !== `${hostOrigin}/mcp` || response.request().method() !== "POST") return false;
    const rpc = response.request().postDataJSON();
    return rpc.method === "tools/call" && rpc.params?.name === name;
  }, { timeout: 10000 });
}

export async function expectBoardLayout(page: Page, columns: number) {
  const board = page.getByRole("list", { name: "Workplace widgets", exact: true });
  const cards = board.locator("article[data-widget]");
  await expect(cards).toHaveCount(8);
  expect((await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-widget")))).sort()).toEqual(["actions", "agenda", "attention", "brief", "goals", "learning", "leave", "updates"]);
  await expect.poll(() => board.evaluate(node => {
    const items = Array.from(node.querySelectorAll<HTMLElement>(".masonry-item"));
    return items.every(item => item.style.gridRowEnd === `span ${Math.ceil((item.querySelector("article")!.getBoundingClientRect().height + 20) / 8)}`);
  }), { message: "Masonry row spans settle to the actual card heights" }).toBe(true);
  const geometry = await cards.evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { id: node.getAttribute("data-widget"), x: box.x, y: box.y, width: box.width, height: box.height, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
  }));
  expect(new Set(geometry.map(box => Math.round(box.x))).size).toBe(columns);
  expect(columns).toBeLessThanOrEqual(3);
  expect(new Set(geometry.map(box => Math.round(box.height))).size).toBeGreaterThanOrEqual(4);
  for (const box of geometry) {
    expect(box.height, `${box.id} has real content height`).toBeGreaterThan(100);
    expect(box.scrollHeight - box.clientHeight, `${box.id} does not clip its content`).toBeLessThanOrEqual(1);
    for (const other of geometry.filter(other => other.id !== box.id)) {
      const overlaps = box.x < other.x + other.width - 1 && box.x + box.width > other.x + 1 && box.y < other.y + other.height - 1 && box.y + box.height > other.y + 1;
      expect(overlaps, `${box.id} overlaps ${other.id}`).toBe(false);
    }
  }
  await expectNoOverflow(page);
}
