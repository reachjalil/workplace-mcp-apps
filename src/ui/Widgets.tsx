import { useId, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown,
  ChevronRight, CircleAlert, CircleCheck, Clock3, Coffee, FileCheck2,
  FileText, Focus, GraduationCap, LifeBuoy, Monitor,
  Palmtree, Plus, ReceiptText, ShieldCheck, Sparkles, Sun,
  Target, UsersRound, Video, X, type LucideIcon,
} from "lucide-react";
import type { WidgetId } from "../shared/config";
import type { AttentionItem, Snapshot } from "../shared/data";
import "./widgets.css";

export type WidgetProps = {
  snapshot: Snapshot;
  widget?: WidgetId;
  className?: string;
  theme?: "light" | "dark";
};

export type WidgetContentProps = {
  snapshot: Snapshot;
  headingId?: string;
};

const boundedPercent = (value: number) => Math.max(0, Math.min(100, value));
const duration = (minutes: number) => minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;

function CardHeading({ title, id, icon: Icon, tone = "blue", children }: {
  title: string;
  id?: string;
  icon: LucideIcon;
  tone?: string;
  children?: ReactNode;
}) {
  return (
    <header className="card-heading">
      <div className="card-heading-main">
        <span className={`heading-icon tone-${tone}`}><Icon size={17} aria-hidden="true" /></span>
        <h2 id={id}>{title}</h2>
      </div>
      {children ?? <span className="demo-mark">Demo</span>}
    </header>
  );
}

export function DemoNotice({ confirmed = false }: { confirmed?: boolean }) {
  return (
    <p className={`demo-notice${confirmed ? " is-confirmed" : ""}`} role={confirmed ? "status" : undefined}>
      <ShieldCheck size={14} aria-hidden="true" />
      <span>Demo only — nothing was submitted.</span>
    </p>
  );
}

function ProgressBar({ value, label, tone = "accent" }: { value: number; label: string; tone?: string }) {
  return (
    <div className={`progress-track progress-${tone}`} role="progressbar" aria-label={label} aria-valuenow={boundedPercent(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${boundedPercent(value)}%` }} />
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const id = useId();
  const low = Math.min(...values, 0);
  const high = Math.max(...values, 1);
  const points = values.map((value, index) => `${2 + index / Math.max(1, values.length - 1) * 88},${27 - (value - low) / Math.max(1, high - low) * 24}`).join(" ");
  return (
    <svg className="sparkline" width="92" height="31" viewBox="0 0 92 31" role="img" aria-label="Illustrative activity trend">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".18" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      <polygon points={`2,31 ${points} 90,31`} fill={`url(#${id})`} />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AgendaWidget({ snapshot, headingId }: WidgetContentProps) {
  const { agenda, brief } = snapshot;
  const [selected, setSelected] = useState<string | null>(null);
  const insightId = useId();
  const selectedMeeting = agenda.meetings.find(meeting => meeting.id === selected);
  return (
    <>
      <CardHeading title="Today at a glance" id={headingId} icon={CalendarDays}><span className="soft-tag">Today</span></CardHeading>
      <p className="card-subtitle agenda-date">{agenda.dateLabel}</p>
      <div className="agenda-summary">
        <div><Video size={15} aria-hidden="true" /><strong>{brief.meetings}</strong><span>meetings</span></div>
        <span className="summary-divider" />
        <div><Focus size={15} aria-hidden="true" /><strong>{duration(brief.focusMinutes)}</strong><span>to focus</span></div>
      </div>
      <div className="timeline-label"><span>YOUR SCHEDULE</span><span>{agenda.meetings.length} blocks</span></div>
      <ol className="agenda-timeline">
        {agenda.meetings.map((meeting, index) => {
          const Icon = meeting.kind === "focus" ? Focus : meeting.kind === "break" ? Coffee : index % 2 ? Video : UsersRound;
          const active = selected === meeting.id;
          return (
            <li key={meeting.id} className={`timeline-item timeline-${meeting.kind}${index === 1 ? " is-next" : ""}${active ? " is-selected" : ""}`}>
              <div className="timeline-time"><time dateTime={meeting.time}>{meeting.time}</time><span>{duration(meeting.minutes)}</span></div>
              <span className="timeline-rail" aria-hidden="true"><span /></span>
              <button type="button" className="timeline-event" aria-pressed={active} aria-controls={insightId} aria-label={`${meeting.time}, ${meeting.title}, ${meeting.minutes} minutes. Show day note.`} onClick={() => setSelected(active ? null : meeting.id)}>
                <div className="event-title"><strong>{meeting.title}</strong>{index === 1 && <span className="next-label">Up next</span>}</div>
                <span className="event-detail"><Icon size={12} aria-hidden="true" /><span>{meeting.detail}</span></span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="agenda-insight" id={insightId}>
        <span className="insight-icon"><Sparkles size={17} aria-hidden="true" /></span>
        <div><strong>{selectedMeeting ? selectedMeeting.title : "A little space goes a long way"}</strong><p>{selectedMeeting ? `${selectedMeeting.detail} · ${duration(selectedMeeting.minutes)}` : agenda.note}</p></div>
      </div>
      <div className="agenda-footer"><span className="status-dot" /><span>Focus time protected</span><strong>{agenda.focusLabel}</strong></div>
    </>
  );
}

export function BriefWidget({ snapshot, headingId }: WidgetContentProps) {
  return (
    <>
      <div className="brief-intro">
        <div><h2 className="eyebrow" id={headingId}>Your daily brief</h2><p className="brief-greeting">Morning, {snapshot.config.viewer}.</p></div>
        <span className="morning-sun"><Sun size={28} strokeWidth={1.5} aria-hidden="true" /></span>
      </div>
      <p className="brief-headline">{snapshot.brief.headline}</p>
      <dl className="brief-metrics">
        <div><dt>Meetings</dt><dd>{snapshot.brief.meetings}<span className="metric-dot blue-dot" /></dd></div>
        <div><dt>To review</dt><dd>{snapshot.brief.replies}<span className="metric-dot violet-dot" /></dd></div>
        <div><dt>In progress</dt><dd>{snapshot.brief.tasks}<span className="metric-dot teal-dot" /></dd></div>
      </dl>
      <div className="brief-footer"><span><span className="status-dot" /> Room for good work</span><Sparkline values={snapshot.brief.sparkline} /></div>
    </>
  );
}

const attentionFilters = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "due", label: "Due" },
  { value: "review", label: "Review" },
] as const;

function AttentionRow({ item, expanded, onToggle }: { item: AttentionItem; expanded: boolean; onToggle: () => void }) {
  const detailId = useId();
  const Icon = item.category === "critical" ? CircleAlert : item.category === "due" ? Clock3 : FileCheck2;
  return (
    <li className={`attention-row attention-${item.category}${expanded ? " is-expanded" : ""}`}>
      <button type="button" className="attention-trigger" onClick={onToggle} aria-expanded={expanded} aria-controls={detailId}>
        <span className="attention-icon"><Icon size={17} aria-hidden="true" /></span>
        <span className="attention-copy"><span className="attention-meta"><span>{item.area}</span><span>{item.age}</span></span><strong>{item.title}</strong><span className={`priority-label priority-${item.category}`}>{item.category === "critical" ? "Needs a look" : item.category === "due" ? "Coming up" : "For your review"}</span></span>
        <ChevronDown size={14} className="disclosure-chevron" aria-hidden="true" />
      </button>
      <div className="attention-detail" id={detailId} hidden={!expanded}><p>{item.detail}</p><DemoNotice /></div>
    </li>
  );
}

export function AttentionWidget({ snapshot, headingId }: WidgetContentProps) {
  const [filter, setFilter] = useState<typeof attentionFilters[number]["value"]>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const visible = snapshot.attention.filter(item => filter === "all" || item.category === filter);
  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <>
      <CardHeading title="Needs your attention" id={headingId} icon={CircleAlert} tone="violet"><span className="count-badge">{snapshot.attention.length}</span></CardHeading>
      <p className="card-subtitle attention-subtitle">A clear view of what needs you next.</p>
      <div className="filter-tabs attention-tabs" role="group" aria-label="Filter attention items">
        {attentionFilters.map(option => {
          const count = option.value === "all" ? snapshot.attention.length : snapshot.attention.filter(item => item.category === option.value).length;
          return <button type="button" key={option.value} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}<span>{count}</span></button>;
        })}
      </div>
      <ul className="attention-list">
        {visible.map(item => <AttentionRow key={item.id} item={item} expanded={expanded.has(item.id)} onToggle={() => toggle(item.id)} />)}
      </ul>
      {visible.length === 0 && <div className="empty-state"><CircleCheck size={24} aria-hidden="true" /><strong>A little breathing room.</strong><p>No {filter} items in this demo moment.</p></div>}
      <div className="card-footer attention-footer"><span>{visible.length} {visible.length === 1 ? "item" : "items"} · synthetic data</span><button type="button" className="text-button" disabled={expanded.size === 0} onClick={() => setExpanded(new Set())}>Collapse all<ChevronDown size={12} aria-hidden="true" /></button></div>
    </>
  );
}

export function GoalsWidget({ snapshot, headingId }: WidgetContentProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const percent = boundedPercent(snapshot.goals.percent);
  const circumference = 2 * Math.PI * 43;
  return (
    <>
      <CardHeading title="My goals" id={headingId} icon={Target} tone="violet"><span className="card-meta">This quarter</span></CardHeading>
      <div className="goals-overview">
        <div className="goal-ring">
          <svg viewBox="0 0 104 104" width="104" height="104" role="img" aria-label={`${percent}% goal progress`}><circle className="ring-track" cx="52" cy="52" r="43" fill="none" strokeWidth="7" /><circle className="ring-value" cx="52" cy="52" r="43" fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} transform="rotate(-90 52 52)" /></svg>
          <div aria-hidden="true"><strong>{percent}<small>%</small></strong><span>complete</span></div>
        </div>
        <div className="goal-summary"><span className="positive-tag"><span className="status-dot" /> On track</span><p><strong>{snapshot.goals.completed}</strong><span> / {snapshot.goals.total}</span></p><span>milestones complete</span></div>
      </div>
      <div className="card-footer goals-footer"><span>Small steps. Real momentum.</span><button type="button" className="text-button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(!expanded)}>{expanded ? "Less" : "See goals"}<ChevronDown size={13} className={expanded ? "rotated" : ""} aria-hidden="true" /></button></div>
      <div className="goal-details" id={detailsId} hidden={!expanded}>
        {snapshot.goals.items.map(item => <div className="goal-detail" key={item.title}><div><strong>{item.title}</strong><span>{item.percent}%</span></div><ProgressBar value={item.percent} label={item.title} tone="violet" /><span>{item.status}</span></div>)}
        <p className="micro-copy">Illustrative goals, not a performance record.</p>
      </div>
    </>
  );
}

export function TimeOffForm() {
  const id = useId();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!start || !end || end < start) { setError("Choose an end date on or after the start date."); setConfirmed(false); return; }
    setError("");
    setConfirmed(true);
  };
  return (
    <form className="local-form" onSubmit={submit} onChange={() => setConfirmed(false)}>
      <p className="local-description">Try a time-off preview with fictional dates. Your balance will not change.</p>
      <div className="form-pair"><label htmlFor={`${id}-start`}>From<input id={`${id}-start`} type="date" required value={start} onChange={event => { setStart(event.target.value); setError(""); }} /></label><label htmlFor={`${id}-end`}>Until<input id={`${id}-end`} type="date" required min={start || undefined} value={end} onChange={event => { setEnd(event.target.value); setError(""); }} /></label></div>
      <label htmlFor={`${id}-type`}>Leave type<select id={`${id}-type`} defaultValue="annual"><option value="annual">Annual leave</option><option value="personal">Personal day</option></select></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="button button-primary button-small">Preview request<ArrowRight size={14} aria-hidden="true" /></button>
      {confirmed && <p className="local-confirmation" role="status"><Check size={14} aria-hidden="true" /> Preview ready. Your balance is unchanged.</p>}
      <DemoNotice confirmed={confirmed} />
    </form>
  );
}

export function LeaveWidget({ snapshot, headingId }: WidgetContentProps) {
  const [open, setOpen] = useState(false);
  const formId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const total = Math.max(1, snapshot.leave.available + snapshot.leave.used);
  return (
    <>
      <CardHeading title="Time off" id={headingId} icon={Palmtree} tone="teal"><button type="button" className="text-button" ref={trigger} aria-expanded={open} aria-controls={formId} onClick={() => setOpen(!open)}>{open ? "Close" : "Request"}{open ? <X size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}</button></CardHeading>
      <div className="leave-overview"><div className="leave-balance"><strong>{snapshot.leave.available}</strong><div><span>days available</span><small>{snapshot.leave.used} used · {snapshot.leave.policy}</small></div></div><span className="leave-art" aria-hidden="true"><span /><Palmtree size={37} strokeWidth={1.4} /></span></div>
      <div className="leave-segments" role="img" aria-label={`${snapshot.leave.available} days available, ${snapshot.leave.used} used`}>
        {Array.from({ length: 20 }, (_, index) => <span key={index} className={index / 20 < snapshot.leave.available / total ? "is-available" : "is-used"} />)}
      </div>
      <div className="leave-next"><CalendarDays size={13} aria-hidden="true" /><span>{snapshot.leave.next}</span></div>
      <div className="local-panel" id={formId} hidden={!open}><div className="local-panel-heading"><strong>Time-off preview</strong><button type="button" className="icon-button" aria-label="Close time-off preview" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={15} aria-hidden="true" /></button></div><TimeOffForm /></div>
    </>
  );
}

export function LearningWidget({ snapshot, headingId }: WidgetContentProps) {
  const [expanded, setExpanded] = useState(false);
  const [answer, setAnswer] = useState<"clear" | "vague" | null>(null);
  const lessonId = useId();
  return (
    <>
      <CardHeading title="Keep learning" id={headingId} icon={GraduationCap} tone="violet"><span className="card-meta">For you</span></CardHeading>
      <div className="lesson-feature"><div><span className="eyebrow">YOUR NEXT SMALL STEP</span><h3>{snapshot.learning.title}</h3><span className="lesson-duration"><Clock3 size={12} aria-hidden="true" />{snapshot.learning.duration}</span></div><span className="lesson-art" aria-hidden="true"><span className="book-back" /><span className="book-front"><BookOpen size={28} strokeWidth={1.4} /></span><span className="art-spark" /></span></div>
      <div className="learning-progress-label"><span>{snapshot.learning.completed} of {snapshot.learning.total} courses complete</span><strong>{snapshot.learning.percent}%</strong></div>
      <ProgressBar value={snapshot.learning.percent} label="Learning progress" tone="violet" />
      <div className="learning-footer"><button type="button" className="text-button" aria-expanded={expanded} aria-controls={lessonId} onClick={() => setExpanded(!expanded)}>{expanded ? "Close lesson" : "Continue learning"}{expanded ? <ChevronDown className="rotated" size={13} aria-hidden="true" /> : <ArrowRight size={13} aria-hidden="true" />}</button><span>Due {snapshot.learning.deadline.toLowerCase()}</span></div>
      <div className="local-panel lesson-preview" id={lessonId} hidden={!expanded}><span className="eyebrow">ONE-MINUTE PREVIEW</span><h3>Start with the next step.</h3><p>Make a request easy to act on: give it a clear action, a little context, and a timeframe.</p><fieldset><legend>Which opening is clearer?</legend><button type="button" className="quiz-option" aria-pressed={answer === "clear"} onClick={() => setAnswer("clear")}>Please review the outline by Friday.</button><button type="button" className="quiz-option" aria-pressed={answer === "vague"} onClick={() => setAnswer("vague")}>A few thoughts on that thing.</button></fieldset>{answer && <p className="quiz-feedback" role="status">{answer === "clear" ? "Exactly. An action and a timeframe make the next step clear." : "Try the other opening. Look for a specific action and timeframe."}</p>}<DemoNotice /></div>
    </>
  );
}

const updateCategories = ["All", "People", "Workplace", "Finance"] as const;
const updateIcons: Record<Snapshot["updates"][number]["category"], LucideIcon> = { People: UsersRound, Workplace: Monitor, Finance: ReceiptText };

function UpdateStory({ story }: { story: Snapshot["updates"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const Icon = updateIcons[story.category];
  return (
    <li className={`update-story update-${story.category.toLowerCase()}${expanded ? " is-expanded" : ""}`}>
      <button type="button" className="update-trigger" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={detailId}><span className="update-art"><Icon size={20} strokeWidth={1.5} aria-hidden="true" /></span><span className="update-copy"><span className="update-meta"><span>{story.category}</span><span>{story.time}</span></span><strong>{story.title}</strong></span><ChevronRight size={14} className="disclosure-chevron" aria-hidden="true" /></button>
      <div className="update-body" id={detailId} hidden={!expanded}><p className="story-excerpt">{story.excerpt}</p><p>{story.body}</p><span className="micro-copy">A fictional workplace story.</span></div>
    </li>
  );
}

export function UpdatesWidget({ snapshot, headingId }: WidgetContentProps) {
  const [category, setCategory] = useState<typeof updateCategories[number]>("All");
  const stories = snapshot.updates.filter(story => category === "All" || story.category === category);
  return (
    <>
      <CardHeading title="Around the company" id={headingId} icon={UsersRound} tone="teal" />
      <div className="filter-tabs update-tabs" role="group" aria-label="Filter company updates">{updateCategories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <ul className="update-list">{stories.map(story => <UpdateStory key={story.id} story={story} />)}</ul>
      {stories.length === 0 && <div className="empty-state"><BookOpen size={22} aria-hidden="true" /><p>No stories in this category yet.</p></div>}
      <div className="updates-footer"><span className="status-dot" /><span>A little closer, wherever you work.</span></div>
    </>
  );
}

const actionIcons: Record<Snapshot["actions"][number]["icon"], LucideIcon> = {
  calendar: CalendarDays, receipt: ReceiptText, learning: BookOpen,
  shield: ShieldCheck, help: LifeBuoy, document: FileText,
};

function HelpPreview() {
  const id = useId();
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form className="local-form" onChange={() => setConfirmed(false)} onSubmit={event => { event.preventDefault(); setConfirmed(true); }}>
      <label htmlFor={`${id}-topic`}>Sample topic<select id={`${id}-topic`} defaultValue="access"><option value="access">Access to a demo tool</option><option value="workspace">A fictional workspace question</option><option value="equipment">Sample equipment setup</option></select></label>
      <label htmlFor={`${id}-note`}>A fictional note<textarea id={`${id}-note`} rows={2} maxLength={240} required placeholder="For example: the demo screen will not load." /></label>
      <button type="submit" className="button button-primary button-small">Preview request<ArrowRight size={14} aria-hidden="true" /></button>
      {confirmed && <p className="local-confirmation" role="status"><Check size={14} aria-hidden="true" /> Preview ready. No ticket or message was created.</p>}
      <DemoNotice confirmed={confirmed} />
    </form>
  );
}

function ActionPreview({ action }: { action: Snapshot["actions"][number] }) {
  const [checked, setChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  if (action.id === "leave") return <TimeOffForm />;
  if (action.id === "help") return <><p className="local-description">{action.description} Use fictional details only.</p><HelpPreview /></>;
  return (
    <div className="action-preview-content">
      <p className="local-description">{action.description}</p>
      {action.id === "expense" && <><div className="reference-note"><ReceiptText size={18} aria-hidden="true" /><div><strong>A sample checklist, not a claim</strong><p>Keep a receipt. Include a date. Add a purpose. No amounts or documents are collected here.</p></div></div><label className="local-checkbox"><input type="checkbox" checked={checked} onChange={event => { setChecked(event.target.checked); setConfirmed(false); }} />I have explored the sample checklist</label><button type="button" className="button button-secondary button-small" disabled={!checked} onClick={() => setConfirmed(true)}>Finish preview<Check size={13} aria-hidden="true" /></button></>}
      {action.id === "payslip" && <dl className="sample-document"><div><dt>Document</dt><dd>Illustrative preview</dd></div><div><dt>Personal information</dt><dd>Not connected</dd></div><div><dt>Financial information</dt><dd>Not connected</dd></div></dl>}
      {action.id === "learning" && <div className="reference-note"><BookOpen size={20} aria-hidden="true" /><div><strong>Make the next step clear.</strong><p>Start with one action, add context, then give it a timeframe. Try the lesson in Keep learning.</p></div></div>}
      {action.id === "approvals" && <div className="reference-note"><ShieldCheck size={20} aria-hidden="true" /><div><strong>Sample policy acknowledgement</strong><p>A read-only example of an item awaiting review. No approval or rejection can be sent.</p></div></div>}
      {confirmed && <p className="local-confirmation" role="status">Preview complete. No financial request was created.</p>}
      <DemoNotice confirmed={confirmed} />
    </div>
  );
}

export function ActionsWidget({ snapshot, headingId }: WidgetContentProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const panelId = useId();
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = snapshot.actions.find(action => action.id === selected);
  return (
    <>
      <CardHeading title="Quick actions" id={headingId} icon={Sparkles} />
      <div className="quick-actions">{snapshot.actions.map((action, index) => {
        const Icon = actionIcons[action.icon];
        return <button type="button" key={action.id} ref={node => { buttons.current[action.id] = node; }} className={`quick-action action-tone-${index % 3}`} aria-expanded={selected === action.id} aria-controls={panelId} onClick={() => setSelected(selected === action.id ? null : action.id)}><span><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span><strong>{action.title}</strong><ArrowUpRight size={10} className="action-arrow" aria-hidden="true" /></button>;
      })}</div>
      <div className="actions-caption"><ShieldCheck size={12} aria-hidden="true" /><span>Local previews. No real requests.</span></div>
      <div className="local-panel" id={panelId} hidden={!active}>{active && <><div className="local-panel-heading"><strong>{active.title} · preview</strong><button type="button" className="icon-button" aria-label="Close action preview" onClick={() => { setSelected(null); buttons.current[active.id]?.focus(); }}><X size={15} aria-hidden="true" /></button></div><ActionPreview key={active.id} action={active} /></>}</div>
    </>
  );
}

const widgetComponents: Record<WidgetId, ComponentType<WidgetContentProps>> = {
  agenda: AgendaWidget, brief: BriefWidget, attention: AttentionWidget,
  goals: GoalsWidget, leave: LeaveWidget, learning: LearningWidget,
  updates: UpdatesWidget, actions: ActionsWidget,
};

export function Widget({ snapshot, widget = snapshot.widget, className = "", theme }: WidgetProps) {
  const headingId = useId();
  const Content = widgetComponents[widget];
  return (
    <article className={`workplace-widget widget-${widget} ${className}`} data-widget={widget} data-accent={snapshot.config.accent} data-density={snapshot.config.density} data-theme={theme} aria-labelledby={headingId}>
      <Content snapshot={snapshot} headingId={headingId} />
    </article>
  );
}
