import "./csp";
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { snapshotSchema, type Snapshot } from "../shared/data";

export const SNAPSHOT_TOOL = "get_workplace_snapshot";
export const REFRESH_INTERVALS = [15, 30, 60] as const;

export type WidgetRuntimeState = {
  snapshot: Snapshot | null;
  status: "connecting" | "waiting" | "ready" | "refreshing" | "error" | "closed";
  canRefresh: boolean;
  paused: boolean;
  hidden: boolean;
  error: string | null;
};

export type WidgetController = {
  ready: Promise<void>;
  refresh: () => Promise<void>;
  nextMoment: () => Promise<void>;
  togglePaused: () => void;
  dispose: () => void;
  getState: () => WidgetRuntimeState;
};

export const initialWidgetState: WidgetRuntimeState = {
  snapshot: null,
  status: "connecting",
  canRefresh: false,
  paused: false,
  hidden: false,
  error: null,
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSnapshotResult(result: unknown): Snapshot {
  if (!record(result) || result.isError === true) throw new Error("The tool could not provide a snapshot.");
  const structured = snapshotSchema.safeParse(result.structuredContent);
  if (structured.success) return structured.data;
  if (result.structuredContent !== undefined) throw new Error("The snapshot did not match the shared contract.");
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (!record(block) || block.type !== "text" || typeof block.text !== "string") continue;
      try {
        const parsed = snapshotSchema.safeParse(JSON.parse(block.text));
        if (parsed.success) return parsed.data;
      } catch {
        continue;
      }
    }
  }
  throw new Error("No valid workplace snapshot was returned.");
}

export function connectWidgetApp({ root, onState, app = new App({ name: "Workplace", version: "1.0.0" }, {}, { autoResize: false, strict: true }) }: {
  root: HTMLElement;
  onState: (state: WidgetRuntimeState) => void;
  app?: App;
}): WidgetController {
  let active = true;
  let connected = false;
  let awaitingHost = false;
  let closed = false;
  let state: WidgetRuntimeState = { ...initialWidgetState, hidden: document.hidden };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: ResizeObserver | undefined;
  let sizeFrame = 0;
  let lastHeight = 0;
  let epoch = 0;
  let step = 0;
  let pendingStep = 0;
  let inFlight: AbortController | null = null;
  const initialization = new AbortController();
  const previousTheme = document.documentElement.dataset.theme;
  let appliedTheme: string | undefined;

  const publish = (patch: Partial<WidgetRuntimeState>) => {
    if (!active) return;
    state = { ...state, ...patch };
    onState(state);
  };

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const invalidateRequest = () => {
    epoch += 1;
    inFlight?.abort();
  };

  const applyContext = (context: McpUiHostContext | undefined) => {
    if (!active) return;
    if (context?.theme === "light" || context?.theme === "dark") {
      appliedTheme = context.theme;
      document.documentElement.dataset.theme = context.theme;
    }
  };

  const reportHeight = () => {
    sizeFrame = 0;
    if (!active || !connected) return;
    const height = Math.ceil(root.getBoundingClientRect().height);
    if (!Number.isFinite(height) || height <= 0 || height === lastHeight) return;
    lastHeight = height;
    void app.sendSizeChanged({ height }).catch(() => undefined);
  };

  const queueHeight = () => {
    if (!active || !connected || sizeFrame) return;
    sizeFrame = requestAnimationFrame(reportHeight);
  };

  const schedule = () => {
    clearTimer();
    const snapshot = state.snapshot;
    if (!active || !connected || !state.canRefresh || !snapshot || !snapshot.config.live || state.paused || document.hidden || awaitingHost || inFlight || state.status === "error") return;
    const seconds = REFRESH_INTERVALS.find(value => value === snapshot.config.refreshSeconds) ?? 30;
    timer = setTimeout(() => {
      timer = undefined;
      void requestSnapshot(false);
    }, seconds * 1000);
  };

  const requestSnapshot = async (advance: boolean) => {
    const previous = state.snapshot;
    if (!active || !connected || !app.getHostCapabilities()?.serverTools || !state.canRefresh || !previous || document.hidden || awaitingHost || inFlight) return;
    clearTimer();
    const request = new AbortController();
    inFlight = request;
    const requestEpoch = ++epoch;
    const nextStep = advance ? (step + 1) % 6 : step;
    publish({ status: "refreshing", error: null });
    try {
      const result = await app.callServerTool({
        name: SNAPSHOT_TOOL,
        arguments: { widget: previous.widget, config: { ...previous.config }, step: nextStep },
      }, { signal: request.signal, timeout: 12000 });
      if (!active || request.signal.aborted || requestEpoch !== epoch) return;
      const next = readSnapshotResult(result);
      if (next.widget !== previous.widget || JSON.stringify(next.config) !== JSON.stringify(previous.config)) throw new Error("Unexpected snapshot configuration.");
      step = nextStep;
      publish({ snapshot: next, status: "ready", error: null });
    } catch {
      if (!active || request.signal.aborted || requestEpoch !== epoch) return;
      publish({ status: "error", error: "Could not refresh. Showing the last valid snapshot. Automatic updates are paused; retry when ready." });
    } finally {
      if (inFlight === request) inFlight = null;
      if (active) {
        queueHeight();
        schedule();
      }
    }
  };

  const visibility = () => {
    if (!active) return;
    clearTimer();
    if (document.hidden) invalidateRequest();
    publish({ hidden: document.hidden, ...(state.status === "refreshing" ? { status: "ready" as const } : {}) });
    if (!document.hidden) { queueHeight(); schedule(); }
  };

  const stop = (closeTransport: boolean, notify: boolean) => {
    if (active) {
      if (notify) publish({ status: "closed", canRefresh: false, paused: true, error: "This view is disconnected. Reopen the widget to receive new snapshots." });
      active = false;
      connected = false;
      clearTimer();
      invalidateRequest();
      if (closeTransport) initialization.abort();
      observer?.disconnect();
      cancelAnimationFrame(sizeFrame);
      sizeFrame = 0;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", queueHeight);
      window.removeEventListener("pagehide", pageHide);
      if (appliedTheme && document.documentElement.dataset.theme === appliedTheme) {
        if (previousTheme === undefined) delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = previousTheme;
      }
    }
    if (closeTransport && !closed) {
      closed = true;
      void app.close().catch(() => undefined);
    }
  };

  const pageHide = () => stop(true, false);

  app.ontoolinput = params => {
    if (!active) return;
    clearTimer();
    invalidateRequest();
    awaitingHost = true;
    const incomingStep = params.arguments?.step;
    pendingStep = typeof incomingStep === "number" && Number.isInteger(incomingStep) && incomingStep >= 0 && incomingStep <= 9999 ? incomingStep : 0;
    publish({ status: "waiting", error: null });
  };

  app.ontoolresult = result => {
    if (!active) return;
    clearTimer();
    invalidateRequest();
    awaitingHost = false;
    try {
      const snapshot = readSnapshotResult(result);
      step = pendingStep;
      publish({ snapshot, status: connected ? "ready" : "connecting", error: null });
    } catch {
      publish({ status: "error", error: state.snapshot ? "The host returned an invalid snapshot. Your last valid data is still here; automatic updates are paused." : "The host did not return a valid workplace snapshot. Run the widget tool again." });
    }
    queueHeight();
    schedule();
  };

  app.ontoolcancelled = () => {
    if (!active) return;
    clearTimer();
    invalidateRequest();
    awaitingHost = false;
    publish({ status: "error", error: state.snapshot ? "The update was cancelled. Your last valid snapshot is still here." : "The tool was cancelled before a snapshot arrived. Run the widget tool again." });
    queueHeight();
  };

  app.onhostcontextchanged = context => {
    if (!active) return;
    applyContext(context);
    queueHeight();
  };

  app.onteardown = () => {
    stop(false, true);
    return {};
  };

  app.onerror = () => {
    if (!active) return;
    clearTimer();
    invalidateRequest();
    publish({ status: "error", error: state.snapshot ? "The host connection had a problem. Showing the last valid snapshot; updates are paused." : "Could not read the host connection. Reopen this widget in an MCP Apps-compatible host." });
  };

  app.onclose = () => {
    closed = true;
    if (active && connected) stop(false, true);
  };

  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", pageHide);
  onState(state);

  const ready = app.connect(undefined, { signal: initialization.signal, timeout: 12000 }).then(() => {
    if (!active) { stop(true, false); return; }
    connected = true;
    applyContext(app.getHostContext());
    publish({
      canRefresh: Boolean(app.getHostCapabilities()?.serverTools),
      status: state.status === "error" ? "error" : state.snapshot ? "ready" : "waiting",
    });
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(queueHeight);
      observer.observe(root);
    }
    window.addEventListener("resize", queueHeight);
    queueHeight();
    schedule();
  }).catch(() => {
    if (!active) return;
    connected = false;
    clearTimer();
    publish({ status: "error", canRefresh: false, error: state.snapshot ? "The connection is unavailable. Showing the last valid snapshot." : "Open this widget in an MCP Apps-compatible host to receive a workplace snapshot." });
  });

  return {
    ready,
    refresh: () => requestSnapshot(false),
    nextMoment: () => requestSnapshot(true),
    togglePaused: () => {
      if (!active || !connected || !state.canRefresh || !state.snapshot?.config.live) return;
      const paused = !state.paused;
      clearTimer();
      if (paused) invalidateRequest();
      publish({ paused, ...(state.status === "refreshing" ? { status: "ready" as const } : {}) });
      schedule();
    },
    dispose: () => stop(true, false),
    getState: () => state,
  };
}
