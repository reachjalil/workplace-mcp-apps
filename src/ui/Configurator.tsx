import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, Code2, SlidersHorizontal, X } from "lucide-react";
import { configSchema, recommendedOrder, widgets, type DemoConfig, type WidgetId } from "../shared/config";
import { CopyButton } from "./CopyButton";

export type ConfiguratorProps = {
  config: DemoConfig;
  open: boolean;
  endpoint: string;
  onApply: (config: DemoConfig) => void;
  onClose: () => void;
};

export function Configurator({ config, open, endpoint, onApply, onClose }: ConfiguratorProps) {
  const [draft, setDraft] = useState(config);
  const [selected, setSelected] = useState<WidgetId>("agenda");
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const id = useId();
  useEffect(() => { setDraft(config); }, [config]);
  const patch = <K extends keyof DemoConfig>(key: K, value: DemoConfig[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
    setApplied(false);
    setError("");
  };
  const parsed = configSchema.safeParse(draft);
  const json = JSON.stringify({ config: parsed.success ? parsed.data : draft }, null, 2);
  const definition = widgets.find(widget => widget.id === selected)!;
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parsed.success) { setError("Use a company of 1–48 characters and a name of 1–32 characters, then check the remaining settings."); return; }
    onApply(parsed.data);
    setApplied(true);
  };
  return (
    <section className="configurator" id="configure" hidden={!open} aria-labelledby={`${id}-title`}>
      <header className="configurator-header"><div><span className="config-heading-icon"><SlidersHorizontal size={18} aria-hidden="true" /></span><div><h2 id={`${id}-title`}>Make a little room for you.</h2><p>Tune the demo. Take the same configuration into your host.</p></div></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close configuration"><X size={18} aria-hidden="true" /></button></header>
      <div className="configurator-columns">
        <form className="config-form" onSubmit={apply}>
          <span className="eyebrow">01 / YOUR WORKPLACE</span>
          <div className="config-fields">
            <label htmlFor={`${id}-company`}>Company<input id={`${id}-company`} name="company" value={draft.company} maxLength={48} required autoComplete="off" onChange={event => patch("company", event.target.value)} placeholder="Example Company" /></label>
            <label htmlFor={`${id}-viewer`}>Viewer<input id={`${id}-viewer`} name="viewer" value={draft.viewer} maxLength={32} required autoComplete="off" onChange={event => patch("viewer", event.target.value)} placeholder="Alex" /></label>
            <label htmlFor={`${id}-team`}>Team<select id={`${id}-team`} name="team" value={draft.team} onChange={event => patch("team", event.target.value as DemoConfig["team"])}>{["Product", "Engineering", "Operations", "Design"].map(team => <option key={team} value={team}>{team}</option>)}</select></label>
            <label htmlFor={`${id}-scenario`}>Day scenario<select id={`${id}-scenario`} name="scenario" value={draft.scenario} onChange={event => patch("scenario", event.target.value as DemoConfig["scenario"])}><option value="balanced">A balanced day</option><option value="busy">A busier day</option><option value="focus">More room to focus</option></select></label>
            <label htmlFor={`${id}-density`}>Density<select id={`${id}-density`} name="density" value={draft.density} onChange={event => patch("density", event.target.value as DemoConfig["density"])}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
            <label htmlFor={`${id}-refresh`}>Refresh interval<select id={`${id}-refresh`} name="refreshSeconds" value={draft.refreshSeconds} onChange={event => patch("refreshSeconds", Number(event.target.value) as DemoConfig["refreshSeconds"])}><option value={15}>Every 15 seconds</option><option value={30}>Every 30 seconds</option><option value={60}>Every 60 seconds</option></select></label>
          </div>
          <fieldset className="accent-field"><legend>Accent</legend><div className="accent-picker">{(["blue", "violet", "teal"] as const).map(accent => <label key={accent} className={draft.accent === accent ? "is-selected" : ""}><input type="radio" name={`${id}-accent`} value={accent} checked={draft.accent === accent} onChange={() => patch("accent", accent)} /><span className={`accent-swatch swatch-${accent}`} aria-hidden="true">{draft.accent === accent && <Check size={11} />}</span><span>{accent[0].toUpperCase() + accent.slice(1)}</span></label>)}</div></fieldset>
          <label className="live-setting" htmlFor={`${id}-live`}><span><strong>Live demo moments</strong><small>Refresh synthetic data. Never connect real accounts.</small></span><input id={`${id}-live`} name="live" type="checkbox" role="switch" checked={draft.live} onChange={event => patch("live", event.target.checked)} /></label>
          <p className="config-privacy">Use fictional names only. Settings are not saved or sent by this page.</p>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="config-apply"><button type="submit" className="button button-primary button-small">Apply to demo<ArrowRight size={14} aria-hidden="true" /></button><span role="status">{applied ? "Applied. Still entirely synthetic." : "Preview changes when you are ready."}</span></div>
        </form>
        <div className="config-export">
          <span className="eyebrow">02 / TAKE IT WITH YOU</span>
          <div className="endpoint-box"><span>MCP server URL</span><div><code>{endpoint}</code><CopyButton value={endpoint} label="Copy URL" className="button button-ghost button-small" /></div></div>
          <label className="widget-selector" htmlFor={`${id}-widget`}>Choose a widget<select id={`${id}-widget`} value={selected} onChange={event => setSelected(event.target.value as WidgetId)}>{recommendedOrder.map(widget => <option key={widget} value={widget}>{widgets.find(item => item.id === widget)!.title}</option>)}</select></label>
          <div className="selected-tool"><Code2 size={14} aria-hidden="true" /><code>{definition.tool}</code><CopyButton value={definition.tool} label="Copy tool" className="button button-ghost button-small" /></div>
          <p className="tool-description">{definition.description}</p>
          <div className="json-heading"><span>Tool arguments</span><CopyButton value={json} label="Copy JSON" className="button button-ghost button-small" disabled={!parsed.success} /></div>
          <pre className="json-preview"><code>{json}</code></pre>
          <p className="config-hint">Pass this complete <code>{"{ config: { … } }"}</code> object to <code>{definition.tool}</code>. Each widget is its own MCP App.</p>
        </div>
      </div>
      <details className="setup-order-details"><summary><span>Recommended dashboard setup order</span><ChevronDown size={15} aria-hidden="true" /></summary><p>Add each tool separately in this order for the three-column layout above.</p><ol className="setup-order">{recommendedOrder.map((widget, index) => {
        const entry = widgets.find(item => item.id === widget)!;
        return <li key={widget}><button type="button" onClick={() => setSelected(widget)} aria-pressed={selected === widget}><span className="order-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{entry.title}</strong><code>{entry.tool}</code></span><ArrowRight size={13} aria-hidden="true" /></button></li>;
      })}</ol></details>
    </section>
  );
}
