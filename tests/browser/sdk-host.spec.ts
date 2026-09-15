import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fixtureTime, hostOrigin, widgetCsp, widgetOrigin } from "../host-config";
import { expect, expectIframeFits, nextToolResponse, openHost, readToolResponse, test } from "../host-fixtures";

test("SDK v1 launches the actual agenda resource across origins under strict CSP", async ({ page, traffic }) => {
  const { frame, response } = await openHost(page, { tool: "show_agenda", width: 320 });
  const built = await readFile(new URL("../../generated/widget.html", import.meta.url));
  expect(await response.body()).toEqual(built);
  expect(response.headers()["content-security-policy"]).toBe(widgetCsp);
  expect(widgetCsp).not.toContain("unsafe-eval");
  expect(widgetCsp).toContain("connect-src 'none'");
  const proof = JSON.parse(await page.locator("#resource-proof").innerText());
  expect(proof).toMatchObject({ uri: "ui://workplace/agenda.html", mimeType: "text/html;profile=mcp-app", identical: true, bytes: built.byteLength, sha256: createHash("sha256").update(built).digest("hex"), meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } } });
  expect(built.byteLength).toBeLessThan(768 * 1024);
  const iframe = page.locator('iframe[title="Workplace MCP App"]');
  await expect(iframe).toHaveAttribute("src", `${widgetOrigin}/widget`);
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
  expect(new URL(response.url()).origin).not.toBe(hostOrigin);
  expect(await iframe.evaluate(node => (node as HTMLIFrameElement).contentDocument === null)).toBe(true);
  await expect(frame.getByRole("heading", { name: "Today at a glance" })).toBeVisible();
  await expect(frame.locator(".agenda-timeline > li")).toHaveCount(6);
  await expect(frame.getByText("Product check-in", { exact: true })).toBeVisible();
  await frame.getByRole("button", { name: /11:00, Design review/ }).click();
  await expect(frame.locator(".agenda-insight")).toContainText("Video call · Product & Design · 45m");
  await expectIframeFits(page, frame, 800);
  expect(traffic.requests.some(request => request.rpc?.method === "initialize")).toBe(true);
  expect(traffic.requests.some(request => request.rpc?.method === "tools/list")).toBe(true);
  expect(traffic.requests.some(request => request.rpc?.method === "resources/list")).toBe(true);
  expect(traffic.requests.filter(request => request.rpc?.method === "resources/read")).toHaveLength(1);
  expect(traffic.calls("show_agenda")).toHaveLength(1);
  expect(traffic.calls("show_agenda")[0]).toMatchObject({ mainFrame: true, rpc: { params: { arguments: { config: { live: false, seed: 0 } } } } });
  expect(traffic.calls("get_workplace_snapshot")).toHaveLength(0);
  await page.getByRole("button", { name: "Close widget", exact: true }).click();
  await expect(iframe).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Widget closed");
});

for (const width of [320, 360]) {
  test(`attention grows and shrinks through authentic SDK size callbacks at ${width}px`, async ({ page, traffic }) => {
    const { frame } = await openHost(page, { tool: "show_attention", width });
    const height = () => page.locator('iframe[title="Workplace MCP App"]').evaluate(node => node.getBoundingClientRect().height);
    await expect(frame.getByRole("heading", { name: "Needs your attention" })).toBeVisible();
    await expect(frame.locator(".attention-row")).toHaveCount(4);
    const initial = await expectIframeFits(page, frame, 800);
    await frame.getByRole("group", { name: "Filter attention items" }).getByRole("button", { name: /^Critical/ }).click();
    await expect(frame.locator(".attention-row")).toHaveCount(1);
    await expect.poll(height).toBeLessThan(initial);
    const filtered = await expectIframeFits(page, frame, 800);
    await frame.getByRole("button", { name: /Service incident assigned/ }).click();
    await expect(frame.getByText("Checkout response time is above the demo threshold.")).toBeVisible();
    await expect.poll(height).toBeGreaterThan(filtered);
    const expanded = await expectIframeFits(page, frame);
    await frame.getByRole("button", { name: "Collapse all" }).click();
    await expect.poll(height).toBeLessThan(expanded);
    expect(await expectIframeFits(page, frame, 800)).toBe(filtered);
    await frame.getByRole("group", { name: "Filter attention items" }).getByRole("button", { name: /^All/ }).click();
    await expect(frame.locator(".attention-row")).toHaveCount(4);
    expect(await expectIframeFits(page, frame, 800)).toBe(initial);
    const callbacks = page.locator('#sdk-events [data-event="sizechange"]');
    const count = await callbacks.count();
    await page.getByRole("button", { name: "Check sender isolation" }).click();
    await expect(page.locator("#probe-status")).toHaveText("Unrelated sender probe complete");
    await expect(page.locator('#sdk-events [data-event="unrelated-size-message"]')).toHaveCount(1);
    await expect(callbacks).toHaveCount(count);
    expect(await height()).toBe(initial);
    expect(traffic.calls("show_attention")).toHaveLength(1);
    expect(traffic.calls("get_workplace_snapshot")).toHaveLength(0);
    await expect(page.locator("#error")).toBeHidden();
  });
}

test("Next demo moment uses the actual helper and changes current goal progress, not a static ring", async ({ page, traffic }) => {
  await page.clock.install({ time: new Date(fixtureTime) });
  const { frame } = await openHost(page, { tool: "show_goals", live: false });
  await expect(frame.getByRole("img", { name: "72% goal progress", exact: true })).toBeVisible();
  await expect(frame.getByRole("button", { name: "Pause automatic refresh" })).toBeDisabled();
  await expect(frame.locator(".widget-runtime-label")).toHaveText("Demo · Paused");
  await page.clock.fastForward(45000);
  expect(traffic.calls("get_workplace_snapshot")).toHaveLength(0);
  const started = performance.now();
  const next = nextToolResponse(page, "get_workplace_snapshot");
  await frame.getByRole("button", { name: "Next demo moment", exact: true }).click();
  const result = await readToolResponse(await next);
  expect(result.structuredContent).toMatchObject({ widget: "goals", demo: true, revision: 1, moment: 1, config: { live: false, seed: 0 }, goals: { percent: 73 } });
  await expect(frame.getByRole("img", { name: "73% goal progress", exact: true })).toBeVisible();
  await expect(frame.locator(".goal-ring strong")).toHaveText("73%");
  expect(performance.now() - started).toBeLessThan(12000);
  expect(traffic.calls("get_workplace_snapshot")).toHaveLength(1);
  expect(traffic.calls("get_workplace_snapshot")[0]).toMatchObject({ mainFrame: true, frameUrl: `${hostOrigin}/test-host/`, rpc: { method: "tools/call", params: { name: "get_workplace_snapshot", arguments: { widget: "goals", step: 1, config: { live: false, seed: 0, refreshSeconds: 15 } } } } });
  const refresh = nextToolResponse(page, "get_workplace_snapshot");
  await frame.getByRole("button", { name: "Refresh snapshot", exact: true }).click();
  expect((await readToolResponse(await refresh)).structuredContent).toMatchObject({ moment: 1, goals: { percent: 73 } });
  await expect(frame.getByRole("img", { name: "73% goal progress", exact: true })).toBeVisible();
  await page.clock.fastForward(45000);
  expect(traffic.calls("get_workplace_snapshot")).toHaveLength(2);
  await page.getByRole("combobox", { name: "Host theme", exact: true }).selectOption("dark");
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectIframeFits(page, frame, 800);
});

test("read-only host hides refresh controls and never calls the helper even with live config", async ({ page, traffic }) => {
  await page.clock.install({ time: new Date(fixtureTime) });
  const { frame } = await openHost(page, { tool: "show_goals", live: true, readOnly: true });
  await expect(frame.getByRole("heading", { name: "My goals" })).toBeVisible();
  await expect(frame.locator(".widget-runtime-label")).toHaveText("Demo · Read-only host");
  for (const name of ["Pause automatic refresh", "Refresh snapshot", "Next demo moment"]) {
    await expect(frame.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  const before = traffic.requests.filter(request => request.rpc).length;
  await page.clock.fastForward(45000);
  await page.getByRole("button", { name: "Check sender isolation" }).click();
  await expect(page.locator("#probe-status")).toHaveText("Unrelated sender probe complete");
  expect(traffic.requests.filter(request => request.rpc)).toHaveLength(before);
  expect(traffic.calls("show_goals")).toHaveLength(1);
  expect(traffic.calls("get_workplace_snapshot")).toHaveLength(0);
  await expectIframeFits(page, frame, 800);
  await page.getByRole("button", { name: "Close widget", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Widget closed");
  await page.clock.fastForward(45000);
  expect(traffic.calls("get_workplace_snapshot")).toHaveLength(0);
});
