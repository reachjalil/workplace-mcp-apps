import { useCallback, useEffect, useMemo, useReducer } from "react";
import { configSchema, defaultConfig, recommendedOrder, type DemoConfig, type WidgetId } from "../shared/config";
import { createSnapshot, type Snapshot } from "../shared/data";

export type DemoState = { config: DemoConfig; now: number; step: number };
export type DemoEvent =
  | { type: "tick"; now: number }
  | { type: "next"; now: number }
  | { type: "configure"; config: DemoConfig; now: number }
  | { type: "toggle-live"; now: number };

export function demoReducer(state: DemoState, event: DemoEvent): DemoState {
  if (event.type === "tick") return state.config.live ? { ...state, now: event.now } : state;
  const config = event.type === "configure" ? configSchema.parse(event.config) : event.type === "toggle-live" ? { ...state.config, live: !state.config.live } : state.config;
  const current = createSnapshot("brief", state.config, state.now, state.step);
  const baseline = createSnapshot("brief", config, event.now, 0);
  const targetMoment = current.moment + (event.type === "next" ? 1 : 0);
  return { config, now: event.now, step: ((targetMoment - baseline.moment) % 6 + 6) % 6 };
}

export function useDemoBoard(initialConfig: DemoConfig = defaultConfig) {
  const [state, dispatch] = useReducer(demoReducer, initialConfig, config => ({ config: configSchema.parse(config), now: Date.now(), step: 0 }));
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const clear = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
    const schedule = () => {
      clear();
      if (!state.config.live || document.hidden) return;
      timer = setInterval(() => { if (!document.hidden) dispatch({ type: "tick", now: Date.now() }); }, state.config.refreshSeconds * 1000);
    };
    const visibility = () => {
      if (!document.hidden && state.config.live) dispatch({ type: "tick", now: Date.now() });
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", visibility);
    return () => { clear(); document.removeEventListener("visibilitychange", visibility); };
  }, [state.config.live, state.config.refreshSeconds]);
  const snapshots = useMemo(() => Object.fromEntries(recommendedOrder.map(widget => [widget, createSnapshot(widget, state.config, state.now, state.step)])) as Record<WidgetId, Snapshot>, [state]);
  const updateConfig = useCallback((config: DemoConfig) => dispatch({ type: "configure", config, now: Date.now() }), []);
  const toggleLive = useCallback(() => dispatch({ type: "toggle-live", now: Date.now() }), []);
  const nextMoment = useCallback(() => dispatch({ type: "next", now: Date.now() }), []);
  return { config: state.config, snapshots, updateConfig, toggleLive, nextMoment };
}
