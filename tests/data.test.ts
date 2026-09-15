import { describe, expect, it } from "vitest";
import { configSchema, defaultConfig, resourceUri, widgetIds, widgets, widgetSchema } from "../src/shared/config";
import { createSnapshot, snapshotSchema, type Snapshot } from "../src/shared/data";

const now = Date.UTC(2026, 0, 6, 12);
const withoutTimestamp = ({ generatedAt: _generatedAt, ...snapshot }: Snapshot) => snapshot;

const invalidConfigs: Array<[string, unknown]> = [
  ["empty company", { company: "" }],
  ["whitespace company", { company: "   " }],
  ["long company", { company: "a".repeat(49) }],
  ["empty viewer", { viewer: " " }],
  ["long viewer", { viewer: "a".repeat(33) }],
  ["unknown team", { team: "Finance" }],
  ["unknown accent", { accent: "red" }],
  ["unknown density", { density: "tiny" }],
  ["unknown scenario", { scenario: "random" }],
  ["string live flag", { live: "true" }],
  ["unsupported refresh interval", { refreshSeconds: 1 }],
  ["nearby refresh interval", { refreshSeconds: 31 }],
  ["string refresh interval", { refreshSeconds: "30" }],
  ["negative seed", { seed: -1 }],
  ["large seed", { seed: 10000 }],
  ["fractional seed", { seed: 1.5 }],
  ["string seed", { seed: "7" }],
  ["non-finite seed", { seed: Infinity }],
  ["NaN seed", { seed: NaN }],
  ["unknown config field", { provider: "none" }],
  ["null config", null],
  ["array config", []],
];

describe("presentation configuration", () => {
  it("accepts an empty object and uses the shared defaults", () => {
    expect(configSchema.parse({})).toEqual(defaultConfig);
    expect(defaultConfig).toMatchObject({ live: true, seed: 7, refreshSeconds: 30 });
  });

  it("trims presentation labels and accepts both numeric boundaries", () => {
    expect(configSchema.parse({ company: " Example ", viewer: " Alex ", seed: 0 })).toMatchObject({ company: "Example", viewer: "Alex", seed: 0 });
    expect(configSchema.parse({ company: "a".repeat(48), viewer: "b".repeat(32), seed: 9999 }).seed).toBe(9999);
  });

  it.each([15, 30, 60])("accepts a %i-second interval", refreshSeconds => {
    expect(configSchema.parse({ refreshSeconds }).refreshSeconds).toBe(refreshSeconds);
  });

  it.each(invalidConfigs)("rejects %s rather than coercing it", (_name, input) => {
    expect(configSchema.safeParse(input).success).toBe(false);
  });

  it("defines eight unique widgets, tool names, and resource URIs", () => {
    expect(widgets).toHaveLength(8);
    expect(widgets.map(widget => widget.id)).toEqual([...widgetIds]);
    expect(new Set(widgets.map(widget => widget.tool)).size).toBe(8);
    expect(new Set(widgetIds.map(resourceUri)).size).toBe(8);
    expect(resourceUri("agenda")).toBe("ui://workplace/agenda.html");
    expect(widgetSchema.safeParse("unknown").success).toBe(false);
  });
});

describe("stateless synthetic snapshots", () => {
  it.each(widgetIds)("produces a schema-valid, repeatable %s snapshot", widget => {
    const input = { live: false, seed: 9 };
    const first = createSnapshot(widget, input, now);
    expect(snapshotSchema.parse(first)).toEqual(first);
    expect(first).toEqual(createSnapshot(widget, input, now));
    expect(first).toMatchObject({ demo: true, widget, revision: 9, moment: 3, generatedAt: new Date(now).toISOString() });
  });

  it("keeps paused data stable across wall time while recording observation time", () => {
    const first = createSnapshot("brief", { live: false, seed: 7 }, now);
    const later = createSnapshot("brief", { live: false, seed: 7 }, now + 86_400_000);
    expect(withoutTimestamp(later)).toEqual(withoutTimestamp(first));
    expect(later.generatedAt).not.toBe(first.generatedAt);
  });

  it.each([15, 30, 60] as const)("changes live data only at a %i-second bucket boundary", refreshSeconds => {
    const input = { live: true, seed: 7, refreshSeconds };
    const first = createSnapshot("attention", input, now);
    const sameBucket = createSnapshot("attention", input, now + refreshSeconds * 1000 - 1);
    const nextBucket = createSnapshot("attention", input, now + refreshSeconds * 1000);
    expect(withoutTimestamp(sameBucket)).toEqual(withoutTimestamp(first));
    expect(nextBucket.revision).toBe(first.revision + 1);
    expect(nextBucket.moment).toBe((first.moment + 1) % 6);
    expect(nextBucket.attention[0]).not.toEqual(first.attention[0]);
  });

  it("changes the repeatable persona with seed, independently of wall time in paused mode", () => {
    const first = createSnapshot("goals", { seed: 0, live: false }, now);
    const other = createSnapshot("goals", { seed: 1, live: false }, now);
    expect(other.goals.percent).toBe(first.goals.percent + 1);
    expect(first).toEqual(createSnapshot("goals", { seed: 0, live: false }, now));
  });

  it("advances a preview step without persisting it", () => {
    const first = createSnapshot("brief", { live: false, seed: 7 }, now);
    const advanced = createSnapshot("brief", { live: false, seed: 7 }, now, 2);
    expect(advanced.revision).toBe(first.revision + 2);
    expect(advanced.brief).not.toEqual(first.brief);
    expect(createSnapshot("brief", { live: false, seed: 7 }, now)).toEqual(first);
  });

  it("applies busy and focus scenarios without changing business records", () => {
    const balanced = createSnapshot("agenda", { scenario: "balanced" }, now);
    const busy = createSnapshot("agenda", { scenario: "busy" }, now);
    const focus = createSnapshot("agenda", { scenario: "focus" }, now);
    expect(busy.brief.meetings).toBeGreaterThan(balanced.brief.meetings);
    expect(busy.attention).toHaveLength(balanced.attention.length + 1);
    expect(focus.brief.focusMinutes).toBe(180);
    expect(focus.agenda.meetings.find(item => item.kind === "focus")?.minutes).toBe(180);
    expect(busy.leave).toEqual(balanced.leave);
    expect(focus.leave).toEqual(balanced.leave);
    for (const snapshot of [balanced, busy, focus]) {
      expect(snapshot.brief.meetings).toBe(snapshot.agenda.meetings.filter(item => item.kind === "meeting").length);
      expect(snapshot.brief.focusMinutes).toBe(snapshot.agenda.meetings.filter(item => item.kind === "focus").reduce((sum, item) => sum + item.minutes, 0));
      const startMinute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      snapshot.agenda.meetings.slice(1).forEach((item, index) => {
        const previous = snapshot.agenda.meetings[index];
        expect(startMinute(item.time)).toBeGreaterThanOrEqual(startMinute(previous.time) + previous.minutes);
      });
    }
  });

  it.each([0, 1, 2, 3, 4, 5, 9999])("keeps display quantities bounded with seed %i", seed => {
    const snapshot = createSnapshot("goals", { live: false, seed }, now);
    expect(snapshot.moment).toBeGreaterThanOrEqual(0);
    expect(snapshot.moment).toBeLessThan(6);
    for (const percent of [snapshot.goals.percent, snapshot.learning.percent, ...snapshot.goals.items.map(item => item.percent)]) {
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
    expect(snapshot.leave.available + snapshot.leave.used).toBe(20);
    expect(snapshot.actions).toHaveLength(6);
  });

  it("does not retain mutations to an input, result, or another viewer's presentation", () => {
    const input = { company: "Sample", viewer: "Alex", live: false, seed: 7 };
    const first = createSnapshot("brief", input, now);
    first.config.company = "Changed";
    first.brief.sparkline.push(1000);
    first.actions.pop();
    const again = createSnapshot("brief", input, now);
    const other = createSnapshot("brief", { ...input, viewer: "Taylor" }, now);
    expect(input.company).toBe("Sample");
    expect(again.config.company).toBe("Sample");
    expect(again.brief.sparkline).not.toContain(1000);
    expect(again.actions).toHaveLength(6);
    expect(other.config.viewer).toBe("Taylor");
    expect(other.brief).toEqual(again.brief);
    expect(defaultConfig.company).toBe("Example Company");
  });
});
