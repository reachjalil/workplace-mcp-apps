import { z } from "zod";
import { configSchema, widgetSchema, type DemoConfigInput, type WidgetId } from "./config.js";

const meetingSchema = z.object({ id: z.string(), time: z.string(), title: z.string(), detail: z.string(), kind: z.enum(["meeting", "focus", "break"]), minutes: z.number() });
const attentionSchema = z.object({ id: z.string(), title: z.string(), detail: z.string(), category: z.enum(["critical", "due", "review"]), area: z.string(), age: z.string() });
export const snapshotSchema = z.object({
  demo: z.literal(true), widget: widgetSchema, config: configSchema,
  generatedAt: z.string(), revision: z.number(), moment: z.number(),
  brief: z.object({ meetings: z.number(), replies: z.number(), tasks: z.number(), focusMinutes: z.number(), headline: z.string(), sparkline: z.array(z.number()) }),
  agenda: z.object({ dateLabel: z.string(), meetings: z.array(meetingSchema), focusLabel: z.string(), note: z.string() }),
  attention: z.array(attentionSchema),
  goals: z.object({ percent: z.number(), completed: z.number(), total: z.number(), items: z.array(z.object({ title: z.string(), percent: z.number(), status: z.string() })) }),
  leave: z.object({ available: z.number(), used: z.number(), next: z.string(), policy: z.string() }),
  learning: z.object({ completed: z.number(), total: z.number(), percent: z.number(), title: z.string(), duration: z.string(), deadline: z.string() }),
  updates: z.array(z.object({ id: z.string(), category: z.enum(["People", "Workplace", "Finance"]), title: z.string(), excerpt: z.string(), body: z.string(), time: z.string() })),
  actions: z.array(z.object({ id: z.string(), title: z.string(), icon: z.enum(["calendar", "receipt", "learning", "shield", "help", "document"]), description: z.string() })),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type AttentionItem = Snapshot["attention"][number];

/**
 * Deterministic, stateless stand-in for a company's data adapter.
 * A time bucket changes the snapshot; a seed makes personas repeatable.
 * Paused mode ignores wall time. No users, requests or preferences are stored.
 */
export function createSnapshot(widget: WidgetId, input: DemoConfigInput = {}, now = Date.now(), step = 0): Snapshot {
  const config = configSchema.parse(input);
  const revision = (config.live ? Math.floor(now / (config.refreshSeconds * 1000)) : 0) + config.seed + step;
  const moment = ((revision % 6) + 6) % 6;
  const busy = config.scenario === "busy";
  const focus = config.scenario === "focus";
  const messages = ["A little clarity for the day ahead.", "Your next good idea needs a little space.", "The essentials, all in one place.", "A focused day starts here.", "A few small steps. Meaningful progress.", "You have room for your best work."];
  const items: Snapshot["attention"] = [
    { id: "service", title: moment % 2 === 0 ? "Service incident assigned" : "Service recovery needs review", detail: moment % 2 === 0 ? "Checkout response time is above the demo threshold." : "The demo service has recovered. Review the incident summary.", category: moment % 2 === 0 ? "critical" : "review", area: "IT & Workplace", age: "Just now" },
    { id: "expense", title: "Expense report ready", detail: "Your sample travel report is ready for a quick review.", category: "review", area: "Finance", age: "12 min" },
    { id: "training", title: "Security refresher due", detail: "One short lesson left. Finish it before Friday.", category: "due", area: "Learning", age: "35 min" },
    { id: "goal", title: "Share a goal update", detail: "Add a short checkpoint to your quarterly goals.", category: "review", area: "Performance", age: "1 hr" },
  ];
  if (busy) items.push({ id: "policy", title: "Policy acknowledgement", detail: "The updated workplace guide is ready to read.", category: "due", area: "People", age: "2 hr" });
  const percent = 72 + moment;
  const meetings: Snapshot["agenda"]["meetings"] = [
    { id: "standup", time: "09:30", title: `${config.team} check-in`, detail: "Team room · 4 people", kind: "meeting", minutes: 30 },
    { id: "design", time: "11:00", title: "Design review", detail: moment % 2 === 0 ? "Video call · Product & Design" : "Updated agenda · Prototype walkthrough", kind: "meeting", minutes: 45 },
    { id: "break", time: "12:15", title: busy ? "Planning checkpoint" : "A little breathing room", detail: busy ? "Video call · A quick team alignment" : "Take a walk, step away, reset.", kind: busy ? "meeting" : "break", minutes: 45 },
    { id: "partner", time: "13:30", title: "Project sync", detail: "Video call · 3 people", kind: "meeting", minutes: 30 },
    { id: "focus", time: "14:00", title: "Protected focus time", detail: "Notifications quiet. Ideas welcome.", kind: "focus", minutes: focus ? 180 : 90 },
    { id: "wrap", time: "16:00", title: "Weekly wrap-up", detail: "Team room · 25 minutes", kind: "meeting", minutes: 25 },
  ];
  const schedule = meetings.filter(item => !focus || (item.id !== "partner" && item.id !== "wrap"));
  return {
    demo: true, widget, config, generatedAt: new Date(now).toISOString(), revision, moment,
    brief: { meetings: schedule.filter(item => item.kind === "meeting").length, replies: 3 + moment % 3, tasks: (busy ? 8 : 5) + moment % 2, focusMinutes: focus ? 180 : 90, headline: messages[moment], sparkline: [25, 38, 31, 49, 43, 57, 54, 66, 60 + moment, 74 + moment] },
    agenda: {
      dateLabel: "Today · a sample workday",
      meetings: schedule,
      focusLabel: focus ? "14:00 – 17:00" : "14:00 – 15:30",
      note: moment % 2 === 0 ? "Your afternoon has space for deep work." : "Design review has a fresh agenda. You are all set.",
    },
    attention: items,
    goals: { percent, completed: 3, total: 5, items: [
      { title: "Ship a better onboarding", percent: 80 + moment, status: "On track" },
      { title: "Make support more helpful", percent: 62 + moment, status: "In progress" },
    ] },
    leave: { available: 14, used: 6, next: "A long weekend · next month", policy: "20 days annual allowance" },
    learning: { completed: 2, total: 5, percent: 42 + moment * 2, title: "Communicate with clarity", duration: "12 min lesson", deadline: "This Friday" },
    updates: [
      { id: "people", category: "People", title: "Small moments, stronger teams", excerpt: "A new round of team coffee chats starts this week.", body: "Meet someone outside your usual circle. This sample programme pairs colleagues for a relaxed, 20-minute conversation. No real matching or calendar invitations are sent.", time: moment % 2 === 0 ? "Today" : "Updated just now" },
      { id: "workplace", category: "Workplace", title: "A quieter place to focus", excerpt: "New focus rooms are ready for your next big idea.", body: "The sample workplace guide now includes focus rooms, quiet hours, and tips for a distraction-free afternoon. These locations and facilities are entirely fictional.", time: "2 hours ago" },
      { id: "finance", category: "Finance", title: "Expenses, without the guesswork", excerpt: "A simpler guide to your next expense report.", body: "See the fictional travel allowance, receipt checklist, and sample reimbursement timeline. No financial records are connected and no claim can be submitted.", time: "Yesterday" },
    ],
    actions: [
      { id: "leave", title: "Request leave", icon: "calendar", description: "Preview a time-off request. This demonstration does not notify anyone or change a balance." },
      { id: "expense", title: "Submit expense", icon: "receipt", description: "Explore a sample expense form. Nothing is uploaded, stored, or submitted." },
      { id: "payslip", title: "View payslip", icon: "document", description: "A fictional payslip preview, not a financial or employment record." },
      { id: "learning", title: "Keep learning", icon: "learning", description: "Try a sample lesson preview. Completion is not recorded." },
      { id: "approvals", title: "Approvals", icon: "shield", description: "Preview a fictional approval request. No decision is sent to a business system." },
      { id: "help", title: "Help desk", icon: "help", description: "Explore a sample support request. No ticket is created and no message is sent." },
    ],
  };
}
