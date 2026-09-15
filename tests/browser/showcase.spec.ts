import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fixtureTime, hostOrigin } from "../host-config";
import { expect, expectBoardLayout, expectNoOverflow, test } from "../host-fixtures";

const imageDirectory = fileURLToPath(new URL("../../.test-host/images/", import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(fixtureTime));
  await page.goto("/");
  await page.getByRole("button", { name: "Pause live demo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume live demo", exact: true })).toBeVisible();
  await expect(page.locator(".live-indicator")).toHaveText("Paused");
});

test("desktop showcase keeps eight natural-height widgets within three columns in light and dark", async ({ page, traffic }) => {
  await expect(page.getByRole("heading", { name: "Your workday, a little more in sync." })).toBeVisible();
  await expect(page.getByText("Synthetic demo", { exact: true })).toBeVisible();
  await expect(page.getByText("Entirely fictional. Interactions stay in this browser.")).toBeVisible();
  await expectBoardLayout(page, 3);
  await mkdir(imageDirectory, { recursive: true });
  await page.screenshot({ path: `${imageDirectory}desktop.png`, animations: "disabled" });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectBoardLayout(page, 3);
  await page.screenshot({ path: `${imageDirectory}dark.png`, animations: "disabled" });
  expect(traffic.requests.filter(request => request.method !== "GET")).toEqual([]);
});

test("390px showcase is single-column without overflow or overlap when a card expands", async ({ page, traffic }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await expectBoardLayout(page, 1);
  await mkdir(imageDirectory, { recursive: true });
  await page.screenshot({ path: `${imageDirectory}mobile.png`, animations: "disabled" });
  const attention = page.getByRole("article", { name: "Needs your attention", exact: true });
  const before = (await attention.boundingBox())!.height;
  await attention.locator(".attention-trigger").first().click();
  await expect.poll(async () => (await attention.boundingBox())!.height).toBeGreaterThan(before);
  await expectBoardLayout(page, 1);
  await attention.getByRole("button", { name: "Collapse all" }).click();
  await expectBoardLayout(page, 1);
  expect(traffic.requests.filter(request => request.method !== "GET")).toEqual([]);
});

test("configuration copies real JSON, applies settings, advances while paused, and keeps quick actions local", async ({ page, context, traffic }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: hostOrigin });
  await page.getByRole("button", { name: "Configure", exact: true }).click();
  const config = page.getByRole("region", { name: "Make a little room for you." });
  await config.getByLabel("Company", { exact: true }).fill("Sample Studio");
  await config.getByLabel("Viewer", { exact: true }).fill("Casey");
  await config.getByRole("combobox", { name: "Team", exact: true }).selectOption("Engineering");
  await config.getByRole("combobox", { name: "Day scenario", exact: true }).selectOption("focus");
  await config.getByRole("combobox", { name: "Density", exact: true }).selectOption("compact");
  await config.getByRole("combobox", { name: "Refresh interval", exact: true }).selectOption("15");
  await config.getByLabel("Teal", { exact: true }).check();
  await expect(config.getByRole("switch")).not.toBeChecked();
  await config.getByRole("combobox", { name: "Choose a widget", exact: true }).selectOption("goals");
  await expect(config.locator(".selected-tool")).toContainText("show_goals");
  const expected = { config: { company: "Sample Studio", viewer: "Casey", team: "Engineering", accent: "teal", density: "compact", scenario: "focus", live: false, refreshSeconds: 15, seed: 7 } };
  expect(JSON.parse(await config.locator(".json-preview").innerText())).toEqual(expected);
  await config.getByRole("button", { name: "Copy JSON", exact: true }).click();
  await expect(config.getByText("Copy JSON copied to clipboard.", { exact: true })).toHaveText("Copy JSON copied to clipboard.");
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(expected);
  await config.getByRole("button", { name: "Apply to demo" }).click();
  await expect(config.getByText("Applied. Still entirely synthetic.")).toBeVisible();
  await page.getByRole("button", { name: "Close configuration" }).click();
  await expect(config).toBeHidden();
  await expect(page.locator(".workspace-breadcrumb")).toHaveText("Sample StudioEngineering");
  await expect(page.getByText("Morning, Casey.", { exact: true })).toBeVisible();
  await expect(page.getByText("Engineering check-in", { exact: true })).toBeVisible();
  for (const card of await page.locator("article[data-widget]").all()) {
    await expect(card).toHaveAttribute("data-accent", "teal");
    await expect(card).toHaveAttribute("data-density", "compact");
  }
  const progress = page.getByRole("article", { name: "My goals", exact: true }).locator(".goal-ring strong");
  const beforePercent = Number((await progress.innerText()).replace("%", ""));
  const beforeMoment = await page.locator(".board-footnote").innerText();
  await page.getByRole("button", { name: "Next moment", exact: true }).click();
  await expect(progress).toHaveText(`${72 + (beforePercent - 72 + 1) % 6}%`);
  await expect(page.locator(".board-footnote")).not.toHaveText(beforeMoment);
  await expect(page.locator(".live-indicator")).toHaveText("Paused");
  await page.getByRole("button", { name: "Resume live demo", exact: true }).click();
  await expect(page.locator(".live-indicator")).toHaveText("Live · 15s");
  await page.getByRole("button", { name: "Pause live demo", exact: true }).click();
  const actions = page.getByRole("article", { name: "Quick actions", exact: true });
  await actions.getByRole("button", { name: "Help desk", exact: true }).click();
  await actions.getByLabel("A fictional note").fill("The sample screen needs a fictional reset.");
  await actions.getByRole("button", { name: "Preview request", exact: true }).click();
  await expect(actions.getByText("Preview ready. No ticket or message was created.")).toBeVisible();
  await expect(actions.getByText("Demo only — nothing was submitted.")).toBeVisible();
  await expectBoardLayout(page, 3);
  await actions.getByRole("button", { name: "Close action preview" }).click();
  await expect(actions.getByRole("button", { name: "Help desk", exact: true })).toBeFocused();
  await expectNoOverflow(page);
  expect(traffic.requests.filter(request => request.method !== "GET")).toEqual([]);
  expect(traffic.calls("get_workplace_snapshot")).toHaveLength(0);
});
