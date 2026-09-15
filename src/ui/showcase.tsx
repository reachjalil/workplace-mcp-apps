import "./csp";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight, ArrowUpRight, Check, ChevronRight, Code2, Github,
  LayoutDashboard, Link2, Moon, Pause, Play, ShieldCheck,
  SkipForward, SlidersHorizontal, Sun,
} from "lucide-react";
import { Configurator } from "./Configurator";
import { CopyButton } from "./CopyButton";
import { WorkplaceBoard } from "./Masonry";
import { useDemoBoard } from "./demo-state";
import "./showcase.css";

export const SOURCE_URL = "https://github.com/reachjalil/workplace-mcp-apps";

function BrandMark() {
  return <svg viewBox="0 0 28 28" width="27" height="27" fill="none" aria-hidden="true"><rect x="2" y="2" width="10" height="24" rx="3" fill="currentColor" /><rect x="16" y="2" width="10" height="10" rx="3" fill="currentColor" opacity=".68" /><rect x="16" y="16" width="10" height="10" rx="3" fill="currentColor" opacity=".35" /></svg>;
}

function useTheme() {
  const [preferred, setPreferred] = useState<"light" | "dark" | null>(null);
  const [system, setSystem] = useState<"light" | "dark">(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const theme = preferred ?? system;
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const previous = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = theme;
    return () => {
      if (previous === undefined) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = previous;
    };
  }, [theme]);
  return { theme, toggle: () => setPreferred(theme === "dark" ? "light" : "dark") };
}

export function Showcase() {
  const { config, snapshots, updateConfig, toggleLive, nextMoment } = useDemoBoard();
  const { theme, toggle } = useTheme();
  const [configOpen, setConfigOpen] = useState(false);
  const configureButton = useRef<HTMLButtonElement>(null);
  const endpoint = `${window.location.origin}/mcp`;
  const revealConfig = () => setConfigOpen(true);
  const closeConfig = () => { setConfigOpen(false); configureButton.current?.focus(); };
  return (
    <div className="workplace showcase" data-accent={config.accent} id="top">
      <a className="skip-link" href="#live-demo">Skip to live demo</a>
      <div className="site-header-wrap"><header className="site-header page-width">
        <a className="brand" href="#top" aria-label="Workplace home"><span className="brand-mark"><BrandMark /></span><span>Workplace<span className="brand-period">.</span></span><span className="brand-label">MCP APPS</span></a>
        <nav className="site-nav" aria-label="Main navigation"><a className="nav-active" href="#live-demo">Live demo</a><a href="#configure" onClick={revealConfig}>Build your own</a><a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">GitHub<ArrowUpRight size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a><span className="nav-divider" /><button type="button" className="icon-button theme-toggle" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}</button></nav>
      </header></div>
      <main className="page-width">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy"><span className="hero-kicker"><span className="mini-grid" aria-hidden="true"><i /><i /><i /><i /></span>A LITTLE LESS NOISE. A LITTLE MORE FOCUS.</span><h1 id="hero-title">Your workday, <span>a little more in sync.</span></h1><p>Eight thoughtful widgets. One calmer place to land.</p></div>
          <div className="hero-actions"><div className="hero-buttons"><CopyButton value={endpoint} label="Copy MCP URL" className="button button-primary" /><button type="button" className="button button-secondary" ref={configureButton} onClick={() => setConfigOpen(!configOpen)} aria-expanded={configOpen} aria-controls="configure"><SlidersHorizontal size={14} aria-hidden="true" />Configure</button></div><div className="hero-source"><span><Check size={12} aria-hidden="true" />Open source. Yours to adapt.</span><a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">View source<ArrowUpRight size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></div></div>
        </section>
        <Configurator config={config} open={configOpen} endpoint={endpoint} onApply={updateConfig} onClose={closeConfig} />
        <section className="demo-section" id="live-demo" aria-labelledby="demo-title">
          <div className="board-toolbar"><div className="board-heading"><div className="workspace-breadcrumb"><span>{config.company}</span><ChevronRight size={11} aria-hidden="true" /><span>{config.team}</span></div><div><h2 id="demo-title">A good day starts here.</h2><span className="synthetic-badge"><ShieldCheck size={10} aria-hidden="true" />Synthetic demo</span></div></div><div className="board-controls"><span className={`live-indicator${config.live ? " is-live" : ""}`}><span className="status-dot" />{config.live ? `Live · ${config.refreshSeconds}s` : "Paused"}</span><div className="playback-controls"><button type="button" className="playback-button" onClick={toggleLive} aria-label={config.live ? "Pause live demo" : "Resume live demo"}>{config.live ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}<span>{config.live ? "Pause" : "Resume"}</span></button><span /><button type="button" className="playback-button" onClick={nextMoment}><SkipForward size={13} aria-hidden="true" /><span>Next moment</span></button></div></div></div>
          <WorkplaceBoard snapshots={snapshots} />
          <div className="board-footnote"><span><ShieldCheck size={12} aria-hidden="true" />Entirely fictional. Interactions stay in this browser.</span><span>Moment {String(snapshots.brief.moment + 1).padStart(2, "0")} <span className="footnote-separator">/</span> 06</span></div>
        </section>
        <section className="quickstart" id="build-your-own" aria-labelledby="quickstart-title"><header><div><span className="eyebrow">FROM DEMO TO YOUR DASHBOARD</span><h2 id="quickstart-title">One endpoint. Make it your workplace.</h2></div><a className="quickstart-source" href={SOURCE_URL} target="_blank" rel="noopener noreferrer"><Github size={15} aria-hidden="true" />Explore the source<ArrowUpRight size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></header>
          <ol className="quickstart-steps"><li><span className="step-icon"><Link2 size={19} aria-hidden="true" /></span><span className="step-number">01</span><h3>Copy one MCP URL</h3><p>All eight widgets come from the same standard MCP server. No separate endpoint for each card.</p><CopyButton value={endpoint} label="Copy MCP URL" className="button button-secondary button-small" /></li><li><span className="step-icon"><LayoutDashboard size={19} aria-hidden="true" /></span><span className="step-number">02</span><h3>Add it to your host</h3><p>Use an MCP Apps-compatible host. Add the server URL, then choose a widget’s <code>show_*</code> tool.</p><span className="step-note"><ShieldCheck size={12} aria-hidden="true" />No credentials in configuration</span></li><li><span className="step-icon"><Code2 size={19} aria-hidden="true" /></span><span className="step-number">03</span><h3>Give it your own rhythm</h3><p>Choose a persona, color, and pace. Copy the complete config JSON and pass it as tool arguments.</p><a className="button button-secondary button-small" href="#configure" onClick={revealConfig}>Build your own<ArrowRight size={13} aria-hidden="true" /></a></li></ol>
        </section>
      </main>
      <footer className="site-footer page-width"><span className="footer-brand"><span className="brand-mark"><BrandMark /></span>Workplace</span><span>Original code · MIT license · Synthetic data only</span><a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Made to be made yours<ArrowUpRight size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></footer>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Showcase />);
