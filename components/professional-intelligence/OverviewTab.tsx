"use client";

import { AlertTriangle, ArrowUpRight, Info } from "lucide-react";
import { CATEGORY_LABEL, CONTENT_STATUSES } from "@/lib/professional-intelligence/constants";
import { dataQualityWarnings, effectiveSourceStatus, findConflicts, profileCompleteness } from "@/lib/professional-intelligence/evidence";
import { summarizeLitigation } from "@/lib/professional-intelligence/litigation";
import type { CaseCategory } from "@/types/professional-intelligence";
import { Badge, card, ContentStatusBadge, Empty, fmtDate, SectionTitle, Stat } from "./ui";
import type { TabProps } from "./useWorkspace";

export default function OverviewTab({ ws, pid, goTo }: TabProps) {
  const claims = ws.claims.filter((c) => c.professionalId === pid);
  const cases = ws.cases.filter((c) => c.professionalId === pid);
  const orders = ws.orders.filter((o) => cases.some((c) => c.id === o.caseId));
  const content = ws.content.filter((c) => c.professionalId === pid);
  const perf = ws.performance.filter((p) => p.professionalId === pid);
  const completeness = profileCompleteness(ws.claims, pid);
  const awaiting = claims.filter((c) => c.status === "unverified" || c.status === "disputed").length;
  const conflicts = findConflicts(claims);
  const usedSources = new Set([...claims.flatMap((c) => c.sourceIds), ...cases.flatMap((c) => c.sourceIds)]);
  const problemSources = ws.sources.filter((s) => usedSources.has(s.id) && ["stale", "inaccessible", "contradicted"].includes(effectiveSourceStatus(s)));
  const lit = summarizeLitigation(cases, orders);
  const warnings = dataQualityWarnings({ claims: ws.claims, sources: ws.sources, professionalId: pid });
  const upcoming = content.filter((c) => (c.status === "approved" || c.status === "scheduled")).sort((a, b) => (a.scheduledAt ?? a.plannedDate ?? "").localeCompare(b.scheduledAt ?? b.plannedDate ?? ""));
  const maxCat = Math.max(1, ...Object.values(lit.byCategory).map(Number));

  return <div className="space-y-6">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat title="Profile completeness" value={<>{completeness.verifiedPercent}%<span className="ml-2 text-base font-normal text-slate-400">verified</span></>} note={`${completeness.presentPercent}% of key fields have at least a lead`} />
      <Stat title="Claims awaiting verification" value={awaiting} note={`${claims.filter((c) => c.status === "verified").length} verified of ${claims.length}`} />
      <Stat title="Conflicts & source issues" value={conflicts.length + problemSources.length} note={`${conflicts.length} conflicting field(s) · ${problemSources.length} stale/inaccessible/contradicted source(s)`} />
      <Stat title="Orders awaiting outcome review" value={lit.ordersAwaitingReview} note={`${lit.ordersMissingText} order(s) without extracted text`} />
    </section>

    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <section className={card}>
        <SectionTitle title="Court records by category" action={<button className="text-xs font-semibold" onClick={() => goTo("Litigation Intelligence")}>Open litigation →</button>}>
          Derived from {lit.records} stored record(s) — {lit.underlyingMatters} underlying matter(s), {lit.interimRecords} interim/misc. Pending {lit.byStatus.pending} · Disposed {lit.byStatus.disposed} · Unknown {lit.byStatus.unknown}.
        </SectionTitle>
        {lit.records ? <div className="space-y-3">{(Object.entries(lit.byCategory) as [CaseCategory, number][]).sort((a, b) => b[1] - a[1]).map(([cat, n]) => <div key={cat}>
          <div className="mb-1 flex justify-between text-xs"><span>{CATEGORY_LABEL[cat]}</span><span className="font-semibold">{n}</span></div>
          <div className="h-2 rounded-full bg-slate-100" role="presentation"><div className="h-2 rounded-full bg-[#a8c679]" style={{ width: `${(n / maxCat) * 100}%` }} /></div>
        </div>)}</div> : <Empty title="No court records yet">Add cases manually or import from verified sources.</Empty>}
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500"><Info size={14} className="mt-0.5 shrink-0" />Outcomes verified: {lit.outcomesVerified}. Disposed without a reviewed outcome: {lit.disposedWithoutVerifiedOutcome}. “Disposed” is a status, not a result — no win rate is calculated.</p>
      </section>

      <section className={card}>
        <SectionTitle title="Content pipeline" action={<button className="text-xs font-semibold" onClick={() => goTo("Content Strategy")}>Open strategy →</button>} />
        <div className="flex flex-wrap gap-2">{CONTENT_STATUSES.map((s) => <span key={s} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs"><ContentStatusBadge status={s} /><b>{content.filter((c) => c.status === s).length}</b></span>)}</div>
        <h3 className="mb-2 mt-6 text-sm font-semibold">Upcoming approved posts</h3>
        {upcoming.length ? <ul className="divide-y text-sm">{upcoming.slice(0, 5).map((c) => <li key={c.id} className="flex items-center justify-between gap-3 py-2"><button className="text-left hover:underline" onClick={() => goTo("Content Strategy", c.id)}>{c.title}</button><span className="shrink-0 text-xs text-slate-400">{fmtDate(c.scheduledAt ?? c.plannedDate)}</span></li>)}</ul> : <p className="text-sm text-slate-500">Nothing approved yet. Every post must pass legal review first.</p>}
      </section>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <section className={card}>
        <SectionTitle title="Data-quality warnings">Facts are shown as confirmed only after a reviewer verifies them against a source.</SectionTitle>
        {warnings.length ? <ul className="space-y-2">{warnings.map((w, i) => <li key={i} className={`flex items-start gap-2 rounded-xl p-3 text-sm ${w.level === "warning" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>{w.level === "warning" ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <Info size={15} className="mt-0.5 shrink-0" />}{w.message}</li>)}</ul> : <p className="text-sm text-slate-500">No warnings.</p>}
      </section>
      <section className={card}>
        <SectionTitle title="Brand performance" action={<button className="text-xs font-semibold" onClick={() => goTo("Performance")}>Open performance →</button>} />
        {perf.length ? <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Records</p><p className="text-xl font-semibold">{perf.length}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Recorded impressions</p><p className="text-xl font-semibold">{perf.reduce((s, p) => s + (p.impressions ?? 0), 0).toLocaleString("en-IN")}</p></div>
        </div> : <Empty title="No performance data recorded">Metrics appear here only after manual entry or CSV import. Nothing is estimated.</Empty>}
        <div className="mt-4 flex flex-wrap gap-2"><Badge>{ws.professionals.find((p) => p.id === pid)?.isExample ? "Example profile — research leads only" : "Profile"}</Badge><Badge>Last checked {fmtDate(ws.professionals.find((p) => p.id === pid)?.lastCheckedAt)}</Badge></div>
        <button className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#d9ef79] px-4 py-2.5 text-sm font-semibold text-[#172c26]" onClick={() => goTo("Professional DNA")}>Review profile claims <ArrowUpRight size={16} /></button>
      </section>
    </div>
  </div>;
}
