import "./csp";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { App } from "@modelcontextprotocol/ext-apps";
import { CircleAlert, LayoutDashboard, LoaderCircle, Pause, Play, RefreshCw, ShieldCheck, SkipForward } from "lucide-react";
import { Widget } from "./Widgets";
import { connectWidgetApp, initialWidgetState, type WidgetController } from "./embedded";
import "./widget.css";

export function EmbeddedWidget({ app }: { app?: App }) {
  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<WidgetController | null>(null);
  const [state, setState] = useState(initialWidgetState);
  useEffect(() => {
    if (!container.current) return;
    const current = connectWidgetApp({ root: container.current, onState: setState, app });
    controller.current = current;
    return () => { current.dispose(); if (controller.current === current) controller.current = null; };
  }, [app]);
  const busy = state.status === "refreshing" || state.status === "waiting" || state.status === "connecting";
  const paused = state.paused || !state.snapshot?.config.live || state.hidden;
  const status = state.status === "closed" ? "Disconnected" : state.status === "error" ? "Updates paused" : !state.canRefresh ? "Read-only host" : state.status === "waiting" ? "Waiting for host" : state.status === "refreshing" ? "Updating" : state.hidden ? "Hidden · paused" : paused ? "Paused" : `Live · ${state.snapshot?.config.refreshSeconds ?? 30}s`;
  return (
    <div className="workplace embedded-view" ref={container} data-current-widget={state.snapshot?.widget} data-accent={state.snapshot?.config.accent ?? "blue"}>
      {state.snapshot ? <Widget snapshot={state.snapshot} /> : <section className="widget-placeholder" aria-busy={busy}><span className="placeholder-icon">{state.error ? <CircleAlert size={21} aria-hidden="true" /> : <LayoutDashboard size={21} aria-hidden="true" />}</span><h1>{state.error ? "Snapshot unavailable" : "A clearer workday is on its way."}</h1><p>{state.error ?? "Waiting for a validated workplace snapshot from your host."}</p>{!state.error && <div className="placeholder-lines" aria-hidden="true"><span /><span /><span /></div>}<span className="placeholder-caption"><ShieldCheck size={11} aria-hidden="true" />Synthetic data only</span></section>}
      {state.snapshot && <div className="widget-runtime"><span className="widget-runtime-label"><span className={`runtime-dot${!paused && state.canRefresh && state.status === "ready" ? " is-live" : ""}`} />Demo · {status}</span>{state.canRefresh && state.status !== "closed" && <div className="widget-runtime-actions"><button type="button" aria-label={state.paused ? "Resume automatic refresh" : "Pause automatic refresh"} title={!state.snapshot.config.live ? "Live updates are disabled by the configuration" : state.paused ? "Resume automatic refresh" : "Pause automatic refresh"} disabled={!state.snapshot.config.live || state.status === "waiting" || state.status === "connecting"} onClick={() => controller.current?.togglePaused()}>{state.paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}</button><button type="button" aria-label="Refresh snapshot" title="Refresh snapshot" disabled={busy || state.hidden} onClick={() => void controller.current?.refresh()}>{state.status === "refreshing" ? <LoaderCircle className="runtime-spinner" size={12} aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}</button><button type="button" aria-label="Next demo moment" title="Next demo moment" disabled={busy || state.hidden} onClick={() => void controller.current?.nextMoment()}><SkipForward size={12} aria-hidden="true" /></button></div>}</div>}
      {state.snapshot && state.error && <div className="widget-error" role="alert"><CircleAlert size={14} aria-hidden="true" /><span>{state.error}</span>{state.canRefresh && state.status !== "closed" && <button type="button" className="text-button" disabled={busy || state.hidden} onClick={() => void controller.current?.refresh()}>Retry</button>}</div>}
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<EmbeddedWidget />);
