"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ContentIdea, ContentStatus } from "@/types/professional-intelligence";
import { canEdit } from "@/lib/professional-intelligence/access";
import { CONTENT_STATUS_LABEL, CONTENT_STATUSES, FORMAT_LABEL } from "@/lib/professional-intelligence/constants";
import { transitionBlockers, transitionContent } from "@/lib/professional-intelligence/content";
import { button, ContentStatusBadge, Empty, field, fmtDate } from "./ui";
import { attempt, type TabProps } from "./useWorkspace";

const dateOf = (i: ContentIdea) => (i.scheduledAt ?? i.plannedDate ?? "").slice(0, 10);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarTab({ ws, pid, actor, run, notify, goTo }: TabProps) {
  const items = ws.content.filter((c) => c.professionalId === pid);
  const pillars = ws.pillars.filter((p) => p.professionalId === pid);
  const firstDated = items.map(dateOf).filter(Boolean).sort()[0];
  const [view, setView] = useState<"month" | "list" | "kanban">("month");
  const [month, setMonth] = useState(() => (firstDated ? firstDated.slice(0, 7) : new Date().toISOString().slice(0, 7)));
  const [pillar, setPillar] = useState("all");
  const [status, setStatus] = useState("all");
  const filtered = items.filter((i) => (pillar === "all" || i.pillarId === pillar) && (status === "all" || i.status === status));

  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const shift = (d: number) => { const n = new Date(Date.UTC(y, m - 1 + d, 1)); setMonth(n.toISOString().slice(0, 7)); };
  const chip = (i: ContentIdea) => <button key={i.id} onClick={() => goTo("Content Strategy", i.id)} className={`mb-1 block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] ${i.scheduledAt ? "bg-[#172c26] text-white" : "border border-dashed border-slate-300 bg-white text-slate-700"}`} title={`${i.title} — ${CONTENT_STATUS_LABEL[i.status]}`}>{i.scheduledAt ? "● " : "○ "}{i.title}</button>;

  function moveTo(i: ContentIdea, to: ContentStatus) {
    // The board offers only transitions that need no extra input; approval and scheduling happen in the editor.
    const next = attempt(notify, () => transitionContent(i, to, { actor, sources: ws.sources, claims: ws.claims, cases: ws.cases, orders: ws.orders, note: "Moved on board" }));
    if (next) run(`Content → ${to}`, (w) => ({ ...w, content: w.content.map((c) => (c.id === i.id ? next : c)) }), { entity: "content", id: i.id });
  }
  const simpleTargets = (i: ContentIdea) => (["idea", "research_needed", "draft", "legal_review", "rejected"] as ContentStatus[]).filter((to) => to !== i.status && !transitionBlockers(i, to, { actor, sources: ws.sources, claims: ws.claims }).length);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-xl border border-slate-200 bg-white p-1">{(["month", "list", "kanban"] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-sm capitalize ${view === v ? "bg-[#edf3e5] font-semibold" : "text-slate-500"}`}>{v}</button>)}</div>
      <select aria-label="Pillar" className={`${field} !w-auto`} value={pillar} onChange={(e) => setPillar(e.target.value)}><option value="all">All pillars</option>{pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select aria-label="Status" className={`${field} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option>{CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}</select>
      <span className="ml-auto text-xs text-slate-500">● scheduled (approved) · ○ planned slot — not a publishing commitment</span>
    </div>

    {view === "month" && <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between"><button aria-label="Previous month" className={button} onClick={() => shift(-1)}><ChevronLeft size={16} /></button><h2 className="font-semibold">{first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</h2><button aria-label="Next month" className={button} onClick={() => shift(1)}><ChevronRight size={16} /></button></div>
      <div className="hidden grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-400 md:grid">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="mt-1 grid gap-1 md:grid-cols-7">{cells.map((d, idx) => d ? <div key={d} className="min-h-24 rounded-lg bg-slate-50 p-1.5"><p className="mb-1 text-[11px] text-slate-400"><span className="md:hidden">{WEEKDAYS[(lead + Number(d.slice(8)) - 1) % 7]} </span>{Number(d.slice(8))}</p>{filtered.filter((i) => dateOf(i) === d).map(chip)}</div> : <div key={`pad-${idx}`} className="hidden md:block" />)}</div>
      {!filtered.some((i) => dateOf(i).startsWith(month)) && <p className="mt-3 text-center text-sm text-slate-500">Nothing planned this month.</p>}
    </section>}

    {view === "list" && (filtered.length ? <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Title</th><th className="p-3">Pillar</th><th className="p-3">Format</th><th className="p-3">Status</th></tr></thead>
      <tbody className="divide-y">{[...filtered].sort((a, b) => (dateOf(a) || "9").localeCompare(dateOf(b) || "9")).map((i) => <tr key={i.id} className="hover:bg-slate-50"><td className="p-3 text-xs">{fmtDate(dateOf(i) || null)}{!i.scheduledAt && dateOf(i) && <span className="block text-slate-400">planned</span>}</td><td className="p-3"><button className="text-left underline decoration-slate-300" onClick={() => goTo("Content Strategy", i.id)}>{i.title}</button></td><td className="p-3 text-xs">{pillars.find((p) => p.id === i.pillarId)?.name}</td><td className="p-3 text-xs">{FORMAT_LABEL[i.format]}</td><td className="p-3"><ContentStatusBadge status={i.status} /></td></tr>)}</tbody></table></div> : <Empty title="No content matches" />)}

    {view === "kanban" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">{CONTENT_STATUSES.map((s) => <section key={s} className="min-h-40 rounded-2xl bg-slate-100 p-3">
      <h2 className="mb-3 flex justify-between text-xs font-semibold">{CONTENT_STATUS_LABEL[s]}<span className="text-slate-400">{filtered.filter((i) => i.status === s).length}</span></h2>
      {filtered.filter((i) => i.status === s).map((i) => <article key={i.id} className="mb-2 rounded-xl border bg-white p-3 shadow-sm">
        <button className="text-left text-sm font-medium leading-5 hover:underline" onClick={() => goTo("Content Strategy", i.id)}>{i.title}</button>
        <p className="mt-1 text-[11px] text-slate-400">{fmtDate(dateOf(i) || null)}</p>
        {canEdit(actor) && simpleTargets(i).length > 0 && <select aria-label={`Move ${i.title}`} className={`${field} mt-2 !px-2 !py-1 text-xs`} value="" onChange={(e) => e.target.value && moveTo(i, e.target.value as ContentStatus)}><option value="">Move to…</option>{simpleTargets(i).map((t) => <option key={t} value={t}>{CONTENT_STATUS_LABEL[t]}</option>)}</select>}
      </article>)}
    </section>)}</div>}
    {view === "kanban" && <p className="text-xs text-slate-500">Approval, scheduling and publishing are done in the content editor, where the review gate and its blockers are shown.</p>}
  </div>;
}
