"use client";

import { useState } from "react";
import { Download, Plug, Plus, Trash2, Upload } from "lucide-react";
import type { PerformanceRecord } from "@/types/professional-intelligence";
import { canEdit } from "@/lib/professional-intelligence/access";
import { FORMAT_LABEL } from "@/lib/professional-intelligence/constants";
import { aggregatePerformance, CSV_COLUMNS, importPerformanceCsv } from "@/lib/professional-intelligence/performance";
import { button, card, Confirm, download, Empty, field, fmtDate, Labeled, Modal, primary, SectionTitle } from "./ui";
import type { TabProps } from "./useWorkspace";

const n = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-IN"));

export default function PerformanceTab({ ws, pid, actor, run, notify }: TabProps) {
  const records = ws.performance.filter((p) => p.professionalId === pid);
  const content = ws.content.filter((c) => c.professionalId === pid);
  const [by, setBy] = useState<"pillar" | "format" | "audience" | "platform">("pillar");
  const [csv, setCsv] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [deleting, setDeleting] = useState<PerformanceRecord | null>(null);
  const groups = aggregatePerformance(records, content, by, (id) => ws.pillars.find((p) => p.id === id)?.name ?? "No pillar");

  function importCsv(text: string) {
    const result = importPerformanceCsv(text, { professionalId: pid, contentIds: content.map((c) => c.id) });
    setErrors(result.errors);
    if (result.errors.length) return notify(`${result.errors.length} row(s) have errors — nothing imported. Fix and retry.`, "error");
    if (!result.records.length) return notify("No data rows found.", "error");
    run("Imported performance CSV", (w) => ({ ...w, performance: [...w.performance, ...result.records] }));
    setCsv(""); notify(`${result.records.length} record(s) imported.`);
  }

  return <div className="space-y-6">
    <section className={`${card} flex items-start gap-3 text-sm`}><Plug size={18} className="mt-0.5 shrink-0 text-slate-400" /><div><p className="font-medium">No analytics or publishing integration is configured in this project.</p><p className="mt-1 text-slate-500">Metrics come only from manual entry or CSV import. Views and engagement are not business results; enquiries and consultations require recorded attribution evidence.</p></div></section>

    <section className={card}>
      <SectionTitle title="Performance by group" action={<select aria-label="Group by" className={`${field} !w-auto`} value={by} onChange={(e) => setBy(e.target.value as typeof by)}><option value="pillar">By pillar</option><option value="format">By format</option><option value="audience">By audience</option><option value="platform">By platform</option></select>} />
      {groups.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Group</th><th>Records</th><th>Impressions</th><th>Engagements</th><th>Clicks</th><th>Attributed enquiries</th></tr></thead>
        <tbody className="divide-y">{groups.map((g) => <tr key={g.key}><td className="py-2 font-medium">{by === "format" ? FORMAT_LABEL[g.key as keyof typeof FORMAT_LABEL] ?? g.key : g.key}</td><td>{g.posts}</td><td>{g.impressions.toLocaleString("en-IN")}</td><td>{g.engagements.toLocaleString("en-IN")}</td><td>{g.clicks.toLocaleString("en-IN")}</td><td>{g.enquiries}</td></tr>)}</tbody></table>
        <p className="mt-2 text-[11px] text-slate-400">Totals include recorded values only; blank metrics are treated as unknown, not zero, in the records table.</p></div>
        : <Empty title="No performance data recorded">Import a CSV or add a record. Nothing is estimated or simulated.</Empty>}
    </section>

    <section className={card}>
      <SectionTitle title="Import CSV" action={<button className={button} onClick={() => download("performance-template.csv", `${CSV_COLUMNS.join(",")}\n${content[0]?.id ?? ""},LinkedIn,2026-11-03,2026-11-03,2026-11-10,,,,,,,,,\n`, "text/csv")}><Download size={14} />Template</button>}>Required: platform, period_start, period_end (YYYY-MM-DD). content_id must match an idea ID.</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <label className={`${button} cursor-pointer`}><Upload size={14} />Choose file<input type="file" accept=".csv,text/csv" className="sr-only" disabled={!canEdit(actor)} onChange={async (e) => { const file = e.target.files?.[0]; if (file) importCsv(await file.text()); e.target.value = ""; }} /></label>
        <button className={primary} disabled={!canEdit(actor)} onClick={() => setManual(true)}><Plus size={15} />Add record manually</button>
      </div>
      <textarea aria-label="Paste CSV" className={`${field} mt-3 font-mono text-xs`} rows={4} placeholder="…or paste CSV here" value={csv} onChange={(e) => setCsv(e.target.value)} />
      <button className={`${button} mt-2`} disabled={!canEdit(actor) || !csv.trim()} onClick={() => importCsv(csv)}>Import pasted CSV</button>
      {errors.length > 0 && <ul className="mt-3 space-y-1 rounded-xl bg-red-50 p-3 text-xs text-red-800">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
    </section>

    <section className={card}>
      <SectionTitle title="Records">{records.length} record(s)</SectionTitle>
      {records.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="uppercase text-slate-500"><tr><th className="py-2">Content</th><th>Platform</th><th>Period</th><th>Impr.</th><th>Clicks</th><th>React.</th><th>Comm.</th><th>Saves</th><th>Shares</th><th>Enquiries</th><th>Consults</th><th>Attribution</th><th>Origin</th><th /></tr></thead>
        <tbody className="divide-y">{records.map((r) => <tr key={r.id}><td className="py-2">{content.find((c) => c.id === r.contentId)?.title ?? "Unlinked"}</td><td>{r.platform}</td><td>{fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</td><td>{n(r.impressions)}</td><td>{n(r.clicks)}</td><td>{n(r.reactions)}</td><td>{n(r.comments)}</td><td>{n(r.saves)}</td><td>{n(r.shares)}</td><td>{n(r.qualifiedEnquiries)}</td><td>{n(r.consultations)}</td><td className="max-w-40 truncate" title={r.attributionEvidence}>{r.attributionEvidence || "—"}</td><td>{r.origin}</td><td><button aria-label="Delete record" disabled={!canEdit(actor)} className="text-slate-400 hover:text-red-700 disabled:opacity-30" onClick={() => setDeleting(r)}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">None yet.</p>}
    </section>

    {manual && <ManualRecord onClose={() => setManual(false)} {...{ ws, pid, run, notify }} />}
    {deleting && <Confirm title="Delete this record?" message="The metric record will be removed from this workspace." confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={() => { run("Deleted performance record", (w) => ({ ...w, performance: w.performance.filter((p) => p.id !== deleting.id) })); setDeleting(null); notify("Record deleted."); }} />}
  </div>;
}

function ManualRecord({ ws, pid, run, notify, onClose }: Pick<TabProps, "ws" | "pid" | "run" | "notify"> & { onClose: () => void }) {
  const content = ws.content.filter((c) => c.professionalId === pid);
  const [f, setF] = useState<Record<string, string>>({ content_id: content.find((c) => c.status === "published")?.id ?? "", platform: "LinkedIn", published_at: "", period_start: "", period_end: "", impressions: "", clicks: "", reactions: "", comments: "", saves: "", shares: "", qualified_enquiries: "", consultations: "", attribution_evidence: "" });
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return <Modal title="Add performance record" onClose={onClose} wide>
    <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => {
      e.preventDefault();
      const result = importPerformanceCsv(`${CSV_COLUMNS.join(",")}\n${CSV_COLUMNS.map((c) => esc(f[c] ?? "")).join(",")}`, { professionalId: pid, contentIds: content.map((c) => c.id) });
      if (result.errors.length) return notify(result.errors.join(" ").replace(/^Row 2: /, ""), "error");
      run("Added performance record", (w) => ({ ...w, performance: [...w.performance, ...result.records.map((r) => ({ ...r, origin: "manual" as const }))] }));
      notify("Record added."); onClose();
    }}>
      <Labeled text="Content" className="md:col-span-3"><select className={field} value={f.content_id} onChange={(e) => setF({ ...f, content_id: e.target.value })}><option value="">Unlinked</option>{content.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.status})</option>)}</select></Labeled>
      {(["platform", "published_at", "period_start", "period_end", "impressions", "clicks", "reactions", "comments", "saves", "shares", "qualified_enquiries", "consultations"] as const).map((k) => <Labeled key={k} text={k.replaceAll("_", " ")}><input className={field} type={k.includes("_at") || k.startsWith("period") ? "date" : k === "platform" ? "text" : "number"} min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Labeled>)}
      <Labeled text="Attribution evidence (required for enquiries/consultations)" className="md:col-span-3"><input className={field} value={f.attribution_evidence} onChange={(e) => setF({ ...f, attribution_evidence: e.target.value })} /></Labeled>
      <div className="flex justify-end gap-2 md:col-span-3"><button type="button" className={button} onClick={onClose}>Cancel</button><button className={primary}>Save record</button></div>
    </form>
  </Modal>;
}
