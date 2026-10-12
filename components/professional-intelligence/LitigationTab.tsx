"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileText, Pencil, Plus, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import type { CaseCategory, CaseStatus, Confidence, CourtCase, CourtOrder, DisposalNature, Outcome, SourceTier } from "@/types/professional-intelligence";
import { canEdit, canReview } from "@/lib/professional-intelligence/access";
import { CATEGORY_LABEL, OUTCOME_LABEL } from "@/lib/professional-intelligence/constants";
import { bestVerifiedTier } from "@/lib/professional-intelligence/evidence";
import { CASE_CSV_COLUMNS, caseOutcome, elapsedCaseDays, findDuplicateCases, hasOrderText, importCasesCsv, normalizeCategory, reviewOrderOutcome, summarizeLitigation } from "@/lib/professional-intelligence/litigation";
import { deleteCase } from "@/lib/professional-intelligence/workspace-ops";
import { Badge, button, card, Confirm, download, Empty, field, fmtDate, label, Labeled, Modal, MultiSelect, newId, nowIso, primary, SourceLinks, Stat, TierBadge } from "./ui";
import { attempt, type TabProps } from "./useWorkspace";

type Filters = { q: string; court: string; category: "all" | CaseCategory; status: "all" | CaseStatus; year: string; outcome: "all" | "verified" | "unverified"; quality: "all" | SourceTier | "none" };

export default function LitigationTab({ ws, pid, actor, run, notify }: TabProps) {
  const cases = ws.cases.filter((c) => c.professionalId === pid);
  const orders = ws.orders.filter((o) => cases.some((c) => c.id === o.caseId));
  const [f, setF] = useState<Filters>({ q: "", court: "all", category: "all", status: "all", year: "all", outcome: "all", quality: "all" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const summary = summarizeLitigation(cases, orders);
  const groups = useMemo(() => findDuplicateCases(cases), [cases]);
  const courts = [...new Set(cases.map((c) => c.court))].sort();
  const years = [...new Set(cases.map((c) => c.filingDate?.slice(0, 4) ?? "unknown"))].sort();
  const quality = (c: CourtCase) => bestVerifiedTier(c.sourceIds, ws.sources) ?? "none";

  const list = cases.filter((c) => {
    const o = caseOutcome(c, orders);
    return (f.court === "all" || c.court === f.court) && (f.category === "all" || c.category === f.category) && (f.status === "all" || c.status === f.status)
      && (f.year === "all" || (c.filingDate?.slice(0, 4) ?? "unknown") === f.year) && (f.outcome === "all" || o.state === f.outcome)
      && (f.quality === "all" || quality(c) === f.quality)
      && `${c.title} ${c.cnr ?? ""} ${c.caseNumber ?? ""} ${c.court} ${c.bench ?? ""} ${c.caseTypeRaw}`.toLowerCase().includes(f.q.toLowerCase());
  });
  const open = cases.find((c) => c.id === openId) ?? null;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: v }));

  return <div className="space-y-6">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Stat title="Stored records" value={summary.records} note={`${summary.interimRecords} interim / misc. applications`} />
      <Stat title="Underlying matters" value={summary.underlyingMatters} note="Excludes interim applications & exact duplicates" />
      <Stat title="Pending · Disposed" value={`${summary.byStatus.pending} · ${summary.byStatus.disposed}`} note={`${summary.byStatus.unknown} status unknown`} />
      <Stat title="Outcomes verified" value={summary.outcomesVerified} note={`${summary.disposedWithoutVerifiedOutcome} disposed matter(s) without a reviewed outcome`} />
      <Stat title="Orders awaiting review" value={summary.ordersAwaitingReview} note={`${summary.ordersMissingText} without order text`} />
    </section>
    <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />Counts are derived from the records stored here, not from directory totals. Disposal is not success; an outcome exists only after a reviewer classifies the operative final order. Represented side and appearances are shown only where a source states them; hearing attendance is never inferred.</p>

    {groups.length > 0 && <section className={card}>
      <h2 className="font-semibold">Duplicates & possibly related proceedings</h2>
      <ul className="mt-3 space-y-2 text-sm">{groups.map((g, i) => <li key={i} className={`rounded-xl p-3 ${g.kind === "duplicate" ? "bg-red-50" : "bg-amber-50"}`}>
        <Badge tone={g.kind === "duplicate" ? "bg-red-100 text-red-800 ring-red-200" : "bg-amber-100 text-amber-900 ring-amber-200"}>{g.kind === "duplicate" ? "Duplicate" : "Possibly related"}</Badge> <span className="text-xs">{g.reason}</span>
        <div className="mt-2 flex flex-wrap gap-2">{g.caseIds.map((id) => { const c = cases.find((x) => x.id === id)!; return <button key={id} className="rounded-lg bg-white px-2 py-1 text-xs underline" onClick={() => setOpenId(id)}>{c.cnr ?? c.title}</button>; })}</div>
      </li>)}</ul>
    </section>}

    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input aria-label="Search cases" placeholder="Search parties, CNR, court, bench…" className={`${field} pl-9`} value={f.q} onChange={(e) => set("q", e.target.value)} /></div>
        <button className={button} disabled={!canEdit(actor)} onClick={() => setImporting(true)}><Upload size={15} />Import CSV</button>
        <button className={primary} disabled={!canEdit(actor)} onClick={() => setAdding(true)}><Plus size={15} />Add case</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <select aria-label="Court" className={field} value={f.court} onChange={(e) => set("court", e.target.value)}><option value="all">All courts</option>{courts.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select aria-label="Category" className={field} value={f.category} onChange={(e) => set("category", e.target.value as Filters["category"])}><option value="all">All categories</option>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="Status" className={field} value={f.status} onChange={(e) => set("status", e.target.value as Filters["status"])}><option value="all">All statuses</option><option value="pending">Pending</option><option value="disposed">Disposed</option><option value="unknown">Unknown</option></select>
        <select aria-label="Filing year" className={field} value={f.year} onChange={(e) => set("year", e.target.value)}><option value="all">All filing years</option>{years.map((y) => <option key={y} value={y}>{y === "unknown" ? "Filing date unknown" : y}</option>)}</select>
        <select aria-label="Outcome verification" className={field} value={f.outcome} onChange={(e) => set("outcome", e.target.value as Filters["outcome"])}><option value="all">Any outcome state</option><option value="verified">Outcome verified</option><option value="unverified">Outcome unverified</option></select>
        <select aria-label="Source quality" className={field} value={f.quality} onChange={(e) => set("quality", e.target.value as Filters["quality"])}><option value="all">Any source quality</option>{(["A", "B", "C", "D"] as const).map((t) => <option key={t} value={t}>Best verified: Tier {t}</option>)}<option value="none">No verified source</option></select>
      </div>
      <p className="text-xs text-slate-400">{list.length} of {cases.length} record(s)</p>
      {list.length ? <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Matter</th><th className="p-3">Court</th><th className="p-3">Category</th><th className="p-3">Status</th><th className="p-3">Outcome</th><th className="p-3">Evidence</th></tr></thead>
          <tbody className="divide-y">{list.map((c) => { const o = caseOutcome(c, orders); const q = quality(c); return <tr key={c.id} className="align-top hover:bg-slate-50">
            <td className="p-3"><button className="text-left font-medium underline decoration-slate-300 underline-offset-2 hover:decoration-[#172c26]" onClick={() => setOpenId(c.id)}>{c.title}</button><p className="mt-1 font-mono text-[11px] text-slate-400">{c.cnr ?? c.caseNumber ?? "No CNR / number"}</p></td>
            <td className="p-3 text-xs text-slate-600">{c.court}{c.bench && <span className="block text-slate-400">{c.bench}</span>}</td>
            <td className="p-3 text-xs">{CATEGORY_LABEL[c.category]}{c.isInterim && <span className="mt-1 block"><Badge>Interim / misc.</Badge></span>}</td>
            <td className="p-3 text-xs capitalize">{c.status}</td>
            <td className="p-3 text-xs">{o.state === "verified" ? <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">{OUTCOME_LABEL[o.outcome]} · {o.disposalNature}</Badge> : <span className="text-slate-500">Outcome unverified<span className="block text-[11px] text-slate-400">{o.reason}</span></span>}</td>
            <td className="p-3">{q === "none" ? <Badge tone="bg-amber-50 text-amber-800 ring-amber-200">Unverified</Badge> : <TierBadge tier={q} />}</td>
          </tr>; })}</tbody>
        </table>
      </div> : <Empty title="No records match these filters" />}
    </section>

    {open && <CaseDrawer c={open} onClose={() => setOpenId(null)} {...{ ws, actor, run, notify, orders }} />}
    {adding && <AddCase onClose={() => setAdding(false)} {...{ ws, pid, run, notify }} />}
    {importing && <ImportCases onClose={() => setImporting(false)} {...{ ws, pid, run, notify }} />}
  </div>;
}

function CaseDrawer({ c, ws, actor, run, notify, orders, onClose }: Pick<TabProps, "ws" | "actor" | "run" | "notify"> & { c: CourtCase; orders: CourtOrder[]; onClose: () => void }) {
  const mine = orders.filter((o) => o.caseId === c.id).sort((a, b) => (a.orderDate ?? "").localeCompare(b.orderDate ?? ""));
  const outcome = caseOutcome(c, orders);
  const days = elapsedCaseDays(c);
  const [addingOrder, setAddingOrder] = useState(false);
  const [editingOrder, setEditingOrder] = useState<CourtOrder | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<CourtOrder | null>(null);
  const [editingCase, setEditingCase] = useState(false);
  const [deletingCase, setDeletingCase] = useState(false);
  const [reviewing, setReviewing] = useState<CourtOrder | null>(null);
  const patch = (p: Partial<CourtCase>, action: string) => run(action, (w) => ({ ...w, cases: w.cases.map((x) => (x.id === c.id ? { ...x, ...p, updatedAt: nowIso() } : x)) }), { entity: "case", id: c.id });
  const timeline = [
    c.filingDate && { date: c.filingDate, text: "Filed" },
    ...mine.map((o) => ({ date: o.orderDate ?? "", text: `Order ${o.orderNumber ?? ""}${o.isFinal ? " (final)" : ""}` })),
    c.disposalDate && { date: c.disposalDate, text: "Disposed" },
  ].filter(Boolean) as { date: string; text: string }[];

  return <Modal title={c.title} onClose={onClose} wide>
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap gap-2"><Badge>{c.cnr ?? "No CNR"}</Badge><Badge>{CATEGORY_LABEL[c.category]}{c.categoryOverridden ? " (manual)" : ""}</Badge><Badge>Status: {c.status}</Badge>{c.isInterim && <Badge>Interim / misc.</Badge>}
        {outcome.state === "verified" ? <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">Outcome: {OUTCOME_LABEL[outcome.outcome]} ({outcome.disposalNature})</Badge> : <Badge tone="bg-amber-50 text-amber-800 ring-amber-200">Outcome unverified — {outcome.reason}</Badge>}</div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs text-slate-400">Court / bench</dt><dd>{c.court}<span className="block text-slate-500">{c.bench ?? "—"}</span></dd></div>
        <div><dt className="text-xs text-slate-400">Raw case type / acts</dt><dd>{c.caseTypeRaw}{c.actsRaw ? ` · ${c.actsRaw}` : ""}</dd></div>
        <div><dt className="text-xs text-slate-400">Filing · disposal · last checked</dt><dd>{fmtDate(c.filingDate)} · {fmtDate(c.disposalDate)} · {fmtDate(c.lastCheckedAt)}</dd></div>
        <div><dt className="text-xs text-slate-400">Elapsed case duration</dt><dd>{days === null ? "Unavailable — dates not recorded" : `${days} calendar days`}<span className="block text-[11px] text-slate-400">Duration of the court record, not a measure of the advocate's speed.</span></dd></div>
        <div><dt className="text-xs text-slate-400">Parties (from title)</dt><dd>{c.parties.map((p, i) => <span key={i} className="block">{p.name} <span className="text-xs text-slate-400">({p.side === "unknown" ? "side not established" : p.side})</span></span>)}</dd></div>
        <div><dt className="text-xs text-slate-400">Represented side</dt><dd>{c.representedSide ? <>{c.representedSide} {c.representedSideVerified ? <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">verified</Badge> : <Badge tone="bg-amber-50 text-amber-800 ring-amber-200">source-stated, unverified</Badge>}</> : "Not established"}
          {canReview(actor) && c.representedSide && <button className="ml-2 text-xs underline" onClick={() => patch({ representedSideVerified: !c.representedSideVerified }, "Toggled represented-side verification")}>{c.representedSideVerified ? "Unmark" : "Mark verified"}</button>}</dd></div>
      </dl>
      {c.appearanceEvidence && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b>Appearance evidence:</b> {c.appearanceEvidence}</p>}
      <div className="flex flex-wrap gap-3 text-xs">{c.caseUrl && <a className="inline-flex items-center gap-1 underline" href={c.caseUrl} target="_blank" rel="noopener noreferrer">Case details <ExternalLink size={11} /></a>}{c.orderListUrl && <a className="inline-flex items-center gap-1 underline" href={c.orderListUrl} target="_blank" rel="noopener noreferrer">Order list <ExternalLink size={11} /></a>}</div>
      <div><p className="mb-1.5 text-xs font-medium text-slate-500">Sources</p><SourceLinks ids={c.sourceIds} sources={ws.sources} /></div>
      {c.notes && <p className="text-xs text-slate-500">{c.notes}</p>}

      {canEdit(actor) && <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
        <Labeled text="Category"><select className={field} value={c.category} onChange={(e) => patch({ category: e.target.value as CaseCategory, categoryOverridden: true }, "Changed case category")}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Labeled>
        <Labeled text="Status"><select className={field} value={c.status} onChange={(e) => patch({ status: e.target.value as CaseStatus, lastCheckedAt: nowIso() }, "Changed case status")}><option value="pending">Pending</option><option value="disposed">Disposed</option><option value="unknown">Unknown</option></select></Labeled>
        <Labeled text="Interim / related to"><select className={field} value={c.parentCaseId ?? ""} onChange={(e) => patch({ parentCaseId: e.target.value || null, isInterim: !!e.target.value || c.isInterim }, "Linked related proceeding")}><option value="">No parent matter</option>{ws.cases.filter((x) => x.professionalId === c.professionalId && x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.cnr ?? x.title}</option>)}</select></Labeled>
      </div>}

      <div>
        <h3 className="mb-2 font-semibold">Timeline</h3>
        {timeline.length ? <ol className="border-l-2 border-slate-200 pl-4">{timeline.map((t, i) => <li key={i} className="mb-2"><span className="text-xs text-slate-400">{fmtDate(t.date)}</span> — {t.text}</li>)}</ol> : <p className="text-xs text-slate-500">No dated events recorded.</p>}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Orders</h3><span className="ml-auto mr-2 flex gap-2"><button className={button} disabled={!canEdit(actor)} onClick={() => setEditingCase(true)}><Pencil size={14} />Edit case</button><button className={button} disabled={!canEdit(actor)} onClick={() => setDeletingCase(true)}><Trash2 size={14} />Delete case</button></span><button className={button} disabled={!canEdit(actor)} onClick={() => setAddingOrder(true)}><Plus size={14} />Add order</button></div>
        {mine.length ? <ul className="space-y-3">{mine.map((o) => <li key={o.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2"><FileText size={14} /><b>{o.orderNumber ?? "Order"}</b><span className="text-xs text-slate-400">{fmtDate(o.orderDate)}</span>{o.isFinal && <Badge>Final</Badge>}<Badge tone={hasOrderText(o) ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"}>Text: {label(o.extractionStatus)}</Badge>
            {o.review ? <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">{OUTCOME_LABEL[o.review.outcome]} · {o.review.disposalNature}</Badge> : <Badge>Not classified</Badge>}</div>
          <div className="mt-1 flex gap-3 text-xs">{o.orderUrl && <a className="underline" href={o.orderUrl} target="_blank" rel="noopener noreferrer">Order page</a>}{o.pdfUrl && <a className="underline" href={o.pdfUrl} target="_blank" rel="noopener noreferrer">PDF</a>}</div>
          {o.orderText && <details className="mt-2 text-xs"><summary className="cursor-pointer text-slate-500">Order text</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2">{o.orderText}</pre></details>}
          {o.review && <div className="mt-2 rounded-lg bg-emerald-50/60 p-2 text-xs"><p><b>Rationale:</b> {o.review.rationale}</p><p className="mt-1"><b>Excerpt:</b> “{o.review.excerpt}”</p><p className="mt-1 text-slate-500">Relief sought: {o.review.reliefSought || "—"} · granted: {o.review.reliefGranted || "—"} · {o.review.method} · confidence {o.review.confidence} · {ws.members.find((m) => m.id === o.review!.reviewerId)?.name} {fmtDate(o.review.reviewedAt)}</p></div>}
          <button className={`${button} mt-2`} disabled={!canReview(actor)} title={canReview(actor) ? "" : "Legal reviewer role required"} onClick={() => setReviewing(o)}><ShieldCheck size={14} />{o.review ? "Re-classify" : "Review outcome"}</button>
          <button className={`${button} ml-2 mt-2`} disabled={!canEdit(actor)} onClick={() => setEditingOrder(o)}><Pencil size={14} />Edit</button>
          <button className={`${button} ml-2 mt-2`} aria-label="Delete order" disabled={!canEdit(actor)} onClick={() => setDeletingOrder(o)}><Trash2 size={14} /></button>
        </li>)}</ul> : <Empty title="No orders captured">Add order details and paste or extract the operative text. Without it, the outcome stays unverified.</Empty>}
      </div>
    </div>
    {addingOrder && <AddOrder caseId={c.id} onClose={() => setAddingOrder(false)} {...{ run, notify }} />}
    {editingOrder && <AddOrder caseId={c.id} initial={editingOrder} onClose={() => setEditingOrder(null)} {...{ run, notify }} />}
    {deletingOrder && <Confirm title="Delete this order?" message="The order, its text and any outcome classification will be removed." confirmLabel="Delete order" onCancel={() => setDeletingOrder(null)} onConfirm={() => { run("Deleted order", (w) => ({ ...w, orders: w.orders.filter((o) => o.id !== deletingOrder.id) }), { entity: "order", id: deletingOrder.id }); setDeletingOrder(null); notify("Order deleted."); }} />}
    {editingCase && <AddCase initial={c} onClose={() => setEditingCase(false)} {...{ ws, pid: c.professionalId, run, notify }} />}
    {deletingCase && <Confirm title="Delete this court record?" message={`"${c.title}" and its ${mine.length} order(s) will be removed and unlinked from content.`} confirmLabel="Delete record" onCancel={() => setDeletingCase(false)} onConfirm={() => { run("Deleted case", (w) => deleteCase(w, c.id), { entity: "case", id: c.id }); setDeletingCase(false); onClose(); notify("Court record deleted."); }} />}
    {reviewing && <ReviewOutcome order={reviewing} onClose={() => setReviewing(null)} {...{ actor, run, notify }} />}
  </Modal>;
}

function AddOrder({ caseId, run, notify, onClose, initial }: Pick<TabProps, "run" | "notify"> & { caseId: string; onClose: () => void; initial?: CourtOrder }) {
  const [f, setF] = useState({ orderNumber: initial?.orderNumber ?? "", orderDate: initial?.orderDate ?? "", orderUrl: initial?.orderUrl ?? "", pdfUrl: initial?.pdfUrl ?? "", isFinal: initial?.isFinal ?? false, orderText: initial?.orderText ?? "" });
  return <Modal title={initial ? "Edit order" : "Add order"} onClose={onClose}>
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      for (const u of [f.orderUrl, f.pdfUrl].filter(Boolean)) { try { new URL(u); } catch { return notify(`Invalid URL: ${u}`, "error"); } }
      const at = nowIso();
      if (initial) {
        const textChanged = initial.orderText !== f.orderText;
        const next: CourtOrder = { ...initial, orderNumber: f.orderNumber || null, orderDate: f.orderDate || null, orderUrl: f.orderUrl || null, pdfUrl: f.pdfUrl || null, isFinal: f.isFinal, orderText: f.orderText, extractionStatus: f.orderText.trim() ? (textChanged ? "manual" : initial.extractionStatus) : "not_started", extractedAt: textChanged ? (f.orderText.trim() ? at : null) : initial.extractedAt, review: textChanged ? null : initial.review, updatedAt: at };
        run("Edited order", (w) => ({ ...w, orders: w.orders.map((o) => (o.id === initial.id ? next : o)) }), { entity: "order", id: initial.id });
        notify(textChanged && initial.review ? "Order text changed — the outcome classification was cleared and must be reviewed again." : "Order updated."); onClose(); return;
      }
      const o: CourtOrder = { id: newId("ord"), caseId, orderNumber: f.orderNumber || null, orderDate: f.orderDate || null, orderUrl: f.orderUrl || null, pdfUrl: f.pdfUrl || null, isFinal: f.isFinal, extractionStatus: f.orderText.trim() ? "manual" : "not_started", extractedAt: f.orderText.trim() ? at : null, orderText: f.orderText, review: null, createdAt: at, updatedAt: at };
      run("Added order", (w) => ({ ...w, orders: [...w.orders, o] }), { entity: "order", id: o.id });
      notify(o.orderText ? "Order added with manually entered text — ready for outcome review." : "Order added. Outcome stays unverified until text is entered."); onClose();
    }}>
      <div className="grid grid-cols-2 gap-3"><Labeled text="Order number"><input className={field} value={f.orderNumber} onChange={(e) => setF({ ...f, orderNumber: e.target.value })} /></Labeled><Labeled text="Order date"><input type="date" className={field} value={f.orderDate} onChange={(e) => setF({ ...f, orderDate: e.target.value })} /></Labeled></div>
      <Labeled text="Order page URL"><input className={field} value={f.orderUrl} onChange={(e) => setF({ ...f, orderUrl: e.target.value })} /></Labeled>
      <Labeled text="PDF URL"><input className={field} value={f.pdfUrl} onChange={(e) => setF({ ...f, pdfUrl: e.target.value })} /></Labeled>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isFinal} onChange={(e) => setF({ ...f, isFinal: e.target.checked })} />This is the final / disposing order</label>
      <Labeled text="Order text (paste from the official order; leave blank if not yet available)"><textarea className={field} rows={6} value={f.orderText} onChange={(e) => setF({ ...f, orderText: e.target.value })} /></Labeled>
      <div className="flex justify-end gap-2"><button type="button" className={button} onClick={onClose}>Cancel</button><button className={primary}>{initial ? "Save order" : "Add order"}</button></div>
    </form>
  </Modal>;
}

function ReviewOutcome({ order, actor, run, notify, onClose }: Pick<TabProps, "actor" | "run" | "notify"> & { order: CourtOrder; onClose: () => void }) {
  const [f, setF] = useState({ outcome: "procedural_disposal" as Outcome, disposalNature: "undetermined" as DisposalNature, reliefSought: "", reliefGranted: "", rationale: "", excerpt: "", method: "Read the operative paragraph of the official order", confidence: "medium" as Confidence });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return <Modal title="Classify order outcome" onClose={onClose} wide>
    {!hasOrderText(order) ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Order text is missing. The outcome stays <b>unverified</b> until the operative order is entered — no result is guessed.</p> :
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        const next = attempt(notify, () => reviewOrderOutcome(order, f, actor));
        if (!next) return;
        run("Classified order outcome", (w) => ({ ...w, orders: w.orders.map((o) => (o.id === order.id ? next : o)) }), { entity: "order", id: order.id });
        notify("Outcome classification recorded."); onClose();
      }}>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs md:col-span-2">{order.orderText}</pre>
        <Labeled text="Operative outcome"><select className={field} value={f.outcome} onChange={(e) => set("outcome", e.target.value as Outcome)}>{Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Labeled>
        <Labeled text="Procedural vs merits"><select className={field} value={f.disposalNature} onChange={(e) => set("disposalNature", e.target.value as DisposalNature)}><option value="procedural">Procedural</option><option value="merits">Merits</option><option value="undetermined">Undetermined</option></select></Labeled>
        <Labeled text="Relief sought"><input className={field} value={f.reliefSought} onChange={(e) => set("reliefSought", e.target.value)} /></Labeled>
        <Labeled text="Relief granted"><input className={field} value={f.reliefGranted} onChange={(e) => set("reliefGranted", e.target.value)} /></Labeled>
        <Labeled text="Operative excerpt (must appear verbatim in the order)" className="md:col-span-2"><textarea className={field} rows={2} value={f.excerpt} onChange={(e) => set("excerpt", e.target.value)} /></Labeled>
        <Labeled text="Classification rationale" className="md:col-span-2"><textarea className={field} rows={3} value={f.rationale} onChange={(e) => set("rationale", e.target.value)} /></Labeled>
        <Labeled text="Method"><input className={field} value={f.method} onChange={(e) => set("method", e.target.value)} /></Labeled>
        <Labeled text="Confidence"><select className={field} value={f.confidence} onChange={(e) => set("confidence", e.target.value as Confidence)}>{["low", "medium", "high"].map((c) => <option key={c}>{c}</option>)}</select></Labeled>
        <div className="flex justify-end gap-2 md:col-span-2"><button type="button" className={button} onClick={onClose}>Cancel</button><button className={primary}><ShieldCheck size={15} />Record classification</button></div>
      </form>}
  </Modal>;
}

function AddCase({ ws, pid, run, notify, onClose, initial }: Pick<TabProps, "ws" | "pid" | "run" | "notify"> & { onClose: () => void; initial?: CourtCase }) {
  const [f, setF] = useState({ cnr: initial?.cnr ?? "", caseNumber: initial?.caseNumber ?? "", title: initial?.title ?? "", court: initial?.court ?? "", bench: initial?.bench ?? "", caseTypeRaw: initial?.caseTypeRaw ?? "", actsRaw: initial?.actsRaw ?? "", status: initial?.status ?? ("unknown" as CaseStatus), filingDate: initial?.filingDate ?? "", disposalDate: initial?.disposalDate ?? "", caseUrl: initial?.caseUrl ?? "", orderListUrl: initial?.orderListUrl ?? "", representedSide: initial?.representedSide ?? "", appearanceEvidence: initial?.appearanceEvidence ?? "", sourceIds: initial?.sourceIds ?? ([] as string[]) });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const auto = normalizeCategory(f.caseTypeRaw, f.actsRaw, f.court);
  return <Modal title={initial ? "Edit court record" : "Add court record"} onClose={onClose} wide>
    <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      if (!f.title.trim() || !f.court.trim()) return notify("Title and court are required.", "error");
      if (f.filingDate && f.disposalDate && f.disposalDate < f.filingDate) return notify("Disposal date is before filing date.", "error");
      const at = nowIso();
      const [a, b] = f.title.split(/\s+v(?:s\.?|ersus)\s+/i);
      const c: CourtCase = { id: newId("case"), professionalId: pid, cnr: f.cnr.trim() || null, caseNumber: f.caseNumber.trim() || null, title: f.title.trim(), court: f.court.trim(), bench: f.bench.trim() || null, caseTypeRaw: f.caseTypeRaw.trim(), actsRaw: f.actsRaw.trim() || null, ...auto, categoryOverridden: false, parentCaseId: null, filingDate: f.filingDate || null, disposalDate: f.disposalDate || null, status: f.status, lastCheckedAt: at, parties: [a, b].filter(Boolean).map((name) => ({ name: name.trim(), side: "unknown" as const })), representedSide: (f.representedSide || null) as CourtCase["representedSide"], representedSideVerified: false, appearanceEvidence: f.appearanceEvidence.trim() || null, caseUrl: f.caseUrl.trim() || null, orderListUrl: f.orderListUrl.trim() || null, sourceIds: f.sourceIds, notes: "", createdAt: at, updatedAt: at };
      if (initial) {
        const sideChanged = (initial.representedSide ?? "") !== f.representedSide;
        const next: CourtCase = { ...initial, cnr: c.cnr, caseNumber: c.caseNumber, title: c.title, court: c.court, bench: c.bench, caseTypeRaw: c.caseTypeRaw, actsRaw: c.actsRaw, ...(initial.categoryOverridden ? {} : auto), filingDate: c.filingDate, disposalDate: c.disposalDate, status: c.status, lastCheckedAt: at, parties: initial.title === c.title ? initial.parties : c.parties, representedSide: c.representedSide, representedSideVerified: sideChanged ? false : initial.representedSideVerified, appearanceEvidence: c.appearanceEvidence, caseUrl: c.caseUrl, orderListUrl: c.orderListUrl, sourceIds: c.sourceIds, updatedAt: at };
        run("Edited case", (w) => ({ ...w, cases: w.cases.map((x) => (x.id === initial.id ? next : x)) }), { entity: "case", id: initial.id });
        notify("Court record updated."); onClose(); return;
      }
      const dup = findDuplicateCases([...ws.cases.filter((x) => x.professionalId === pid), c]).find((g) => g.caseIds.includes(c.id));
      run("Added case", (w) => ({ ...w, cases: [...w.cases, c] }), { entity: "case", id: c.id });
      notify(dup ? `Case added — flagged: ${dup.reason}.` : "Case added."); onClose();
    }}>
      <Labeled text="CNR"><input className={field} value={f.cnr} onChange={(e) => set("cnr", e.target.value)} /></Labeled>
      <Labeled text="Case number"><input className={field} value={f.caseNumber} onChange={(e) => set("caseNumber", e.target.value)} /></Labeled>
      <Labeled text="Title (A vs. B)" className="md:col-span-2"><input required className={field} value={f.title} onChange={(e) => set("title", e.target.value)} /></Labeled>
      <Labeled text="Court"><input required className={field} value={f.court} onChange={(e) => set("court", e.target.value)} /></Labeled>
      <Labeled text="Bench"><input className={field} value={f.bench} onChange={(e) => set("bench", e.target.value)} /></Labeled>
      <Labeled text={`Raw case type → ${CATEGORY_LABEL[auto.category]}`}><input className={field} value={f.caseTypeRaw} onChange={(e) => set("caseTypeRaw", e.target.value)} /></Labeled>
      <Labeled text="Acts / sections"><input className={field} value={f.actsRaw} onChange={(e) => set("actsRaw", e.target.value)} /></Labeled>
      <Labeled text="Status"><select className={field} value={f.status} onChange={(e) => set("status", e.target.value as CaseStatus)}><option value="unknown">Unknown</option><option value="pending">Pending</option><option value="disposed">Disposed</option></select></Labeled>
      <div className="grid grid-cols-2 gap-2"><Labeled text="Filed"><input type="date" className={field} value={f.filingDate} onChange={(e) => set("filingDate", e.target.value)} /></Labeled><Labeled text="Disposed"><input type="date" className={field} value={f.disposalDate} onChange={(e) => set("disposalDate", e.target.value)} /></Labeled></div>
      <Labeled text="Case details URL"><input className={field} value={f.caseUrl} onChange={(e) => set("caseUrl", e.target.value)} /></Labeled>
      <Labeled text="Order list URL"><input className={field} value={f.orderListUrl} onChange={(e) => set("orderListUrl", e.target.value)} /></Labeled>
      <Labeled text="Represented side (only if a source states it)"><select className={field} value={f.representedSide} onChange={(e) => set("representedSide", e.target.value)}><option value="">Not stated</option>{["petitioner", "respondent", "appellant", "complainant", "accused"].map((s) => <option key={s}>{s}</option>)}</select></Labeled>
      <Labeled text="Appearance evidence (quote the source)"><input className={field} value={f.appearanceEvidence} onChange={(e) => set("appearanceEvidence", e.target.value)} /></Labeled>
      <div className="md:col-span-2"><p className="mb-1.5 text-xs font-medium text-slate-500">Sources</p><MultiSelect label="Sources" items={ws.sources} selected={f.sourceIds} onChange={(ids) => set("sourceIds", ids)} render={(s) => <><b>Tier {s.tier}</b> · {s.title}</>} /></div>
      <div className="flex justify-end gap-2 md:col-span-2"><button type="button" className={button} onClick={onClose}>Cancel</button><button className={primary}>{initial ? "Save changes" : "Add record"}</button></div>
    </form>
  </Modal>;
}

function ImportCases({ ws, pid, run, notify, onClose }: Pick<TabProps, "ws" | "pid" | "run" | "notify"> & { onClose: () => void }) {
  const [csv, setCsv] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  function importText(text: string) {
    const r = importCasesCsv(text, { professionalId: pid, existing: ws.cases, sources: ws.sources });
    setErrors([...r.errors, ...r.skipped]);
    if (r.errors.length) return notify(`${r.errors.length} row(s) have errors — nothing imported.`, "error");
    if (!r.cases.length) return notify(r.skipped.length ? "All rows already exist — nothing new imported." : "No data rows found.", "error");
    run("Imported court records", (w) => ({ ...w, cases: [...w.cases, ...r.cases], sources: [...r.sources, ...w.sources] }));
    notify(`${r.cases.length} court record(s) imported as unverified${r.skipped.length ? `, ${r.skipped.length} skipped (already present)` : ""}.`);
    if (!r.skipped.length) onClose();
  }
  return <Modal title="Import court records (CSV)" onClose={onClose} wide>
    <p className="text-sm text-slate-600">Required columns: <code>title</code>, <code>court</code>. Optional: {CASE_CSV_COLUMNS.filter((c) => c !== "title" && c !== "court").map((c) => <code key={c} className="mr-1">{c}</code>)}. Status must be pending, disposed or unknown; dates YYYY-MM-DD. Existing CNRs are skipped, never overwritten. Represented side needs appearance evidence quoting the source.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button className={button} onClick={() => download("court-records-template.csv", `${CASE_CSV_COLUMNS.join(",")}\nDLHC010000002024,,Example Pvt Ltd vs. Union of India,"High Court of Delhi, Delhi",,Writ Petition (Civil),,pending,2024-03-01,,https://example.org/case,petitioner,"Listing shows 'Petitioner Adv: NAME'",https://example.org/case\n`, "text/csv")}><Download size={14} />Template</button>
      <label className={`${button} cursor-pointer`}><Upload size={14} />Choose file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) importText(await file.text()); }} /></label>
    </div>
    <textarea aria-label="Paste court records CSV" className={`${field} mt-3 font-mono text-xs`} rows={6} placeholder="…or paste CSV here" value={csv} onChange={(e) => setCsv(e.target.value)} />
    {errors.length > 0 && <ul className="mt-3 max-h-40 space-y-1 overflow-auto rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
    <div className="mt-4 flex justify-end gap-2"><button className={button} onClick={onClose}>Close</button><button className={primary} disabled={!csv.trim()} onClick={() => importText(csv)}>Import pasted CSV</button></div>
  </Modal>;
}
