"use client";

import { useMemo, useState } from "react";
import { DownloadCloud, ExternalLink, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import type { SourceEvidence, SourceStatus, SourceTier, SourceType } from "@/types/professional-intelligence";
import { canEdit, canReview } from "@/lib/professional-intelligence/access";
import { SOURCE_STATUSES, SOURCE_TYPE_TIER, STALE_AFTER_DAYS, TIER_LABEL } from "@/lib/professional-intelligence/constants";
import { effectiveSourceStatus, verifySource } from "@/lib/professional-intelligence/evidence";
import { classifyUrl } from "@/lib/professional-intelligence/research";
import { Badge, button, card, Confirm, Empty, field, fmtDate, label, Labeled, Modal, newId, nowIso, primary, StatusBadge, TierBadge } from "./ui";
import { attempt, type TabProps } from "./useWorkspace";

export default function EvidenceTab({ ws, pid, actor, run, notify }: TabProps) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<"all" | SourceTier>("all");
  const [status, setStatus] = useState<"all" | SourceStatus>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SourceEvidence | null>(null);
  const [verifying, setVerifying] = useState<SourceEvidence | null>(null);
  const [deleting, setDeleting] = useState<SourceEvidence | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, string[]>();
    const add = (id: string, what: string) => m.set(id, [...(m.get(id) ?? []), what]);
    ws.claims.filter((c) => c.professionalId === pid).forEach((c) => c.sourceIds.forEach((s) => add(s, "claim")));
    ws.cases.filter((c) => c.professionalId === pid).forEach((c) => c.sourceIds.forEach((s) => add(s, "case")));
    ws.publications.filter((p) => p.professionalId === pid).forEach((p) => p.sourceIds.forEach((s) => add(s, "publication")));
    ws.content.filter((c) => c.professionalId === pid).forEach((c) => c.sourceIds.forEach((s) => add(s, "content")));
    return m;
  }, [ws, pid]);
  const usedAnywhere = (id: string) => ws.claims.some((c) => c.sourceIds.includes(id)) || ws.cases.some((c) => c.sourceIds.includes(id)) || ws.publications.some((p) => p.sourceIds.includes(id)) || ws.content.some((c) => c.sourceIds.includes(id));

  const list = ws.sources.filter((s) => (tier === "all" || s.tier === tier) && (status === "all" || effectiveSourceStatus(s) === status) && `${s.title} ${s.url} ${s.publisher} ${s.excerpt}`.toLowerCase().includes(q.toLowerCase()));
  const setSourceStatus = (s: SourceEvidence, next: SourceStatus) => run(`Source marked ${next}`, (w) => ({ ...w, sources: w.sources.map((x) => (x.id === s.id ? { ...x, status: next, reviewerId: actor.id, reviewedAt: nowIso(), updatedAt: nowIso() } : x)) }), { entity: "source", id: s.id });

  return <div className="space-y-5">
    <section className={`${card} text-sm text-slate-600`}>
      <p><b>Tiers:</b> A = official court orders/directories/institutional records · B = publisher, professional body or firm pages · C = LinkedIn and other self-published profiles · D = third-party directories and secondary reporting.</p>
      <p className="mt-1">Exact URLs are preserved. Verified sources not re-accessed for {STALE_AFTER_DAYS} days are shown as <i>stale</i>. An official-looking URL is not treated as authentic until a reviewer checks it.</p>
    </section>
    <div className="flex flex-wrap gap-3">
      <div className="relative min-w-60 flex-1"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input aria-label="Search sources" placeholder="Search title, URL, excerpt…" className={`${field} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <select aria-label="Filter by tier" className={`${field} !w-auto`} value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}><option value="all">All tiers</option>{(["A", "B", "C", "D"] as const).map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}</select>
      <select aria-label="Filter by status" className={`${field} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="all">All statuses</option>{SOURCE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
      <button className={primary} disabled={!canEdit(actor)} onClick={() => setAdding(true)}><Plus size={15} />Add source</button>
    </div>
    <p className="text-xs text-slate-400">{list.length} of {ws.sources.length} source(s)</p>
    {list.length ? <div className="space-y-3">{list.map((s) => {
      const eff = effectiveSourceStatus(s);
      const uses = usage.get(s.id) ?? [];
      return <article key={s.id} className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><TierBadge tier={s.tier} /><StatusBadge status={eff} /><Badge>{label(s.sourceType)}</Badge>{uses.length > 0 && <Badge>{uses.length} link(s) to this profile</Badge>}</div>
            <h3 className="mt-2 font-semibold">{s.title}</h3>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-xs text-slate-500 underline">{s.url}<ExternalLink size={11} /></a>
            <p className="mt-1 text-xs text-slate-400">{s.publisher} · accessed {fmtDate(s.accessedAt)}{s.publishedAt ? ` · published/effective ${fmtDate(s.publishedAt)}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={button} disabled={!canReview(actor) || s.status === "verified"} onClick={() => setVerifying(s)}><ShieldCheck size={15} />Verify</button>
            <select aria-label={`Change status of ${s.title}`} className={`${field} !w-auto !py-1.5 text-xs`} disabled={!canReview(actor)} value="" onChange={(e) => e.target.value && setSourceStatus(s, e.target.value as SourceStatus)}><option value="">Mark as…</option>{(["unreviewed", "contradicted", "inaccessible", "stale"] as const).map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
            <button className={button} disabled={!canEdit(actor)} onClick={() => setEditing(s)}><Pencil size={15} />Edit</button>
            <button className={button} aria-label={`Delete ${s.title}`} disabled={!canEdit(actor)} onClick={() => (usedAnywhere(s.id) ? notify("This source is linked to claims, cases, publications or content. Unlink it first.", "error") : setDeleting(s))}><Trash2 size={15} /></button>
          </div>
        </div>
        {s.excerpt && <blockquote className="mt-3 border-l-2 border-[#a8c679] pl-3 text-sm text-slate-700">{s.excerpt}</blockquote>}
        {s.accessNotes && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600"><b>Access limitations:</b> {s.accessNotes}</p>}
        {s.notes && <p className="mt-2 text-xs text-slate-500"><b>Notes:</b> {s.notes}</p>}
        {s.attachmentText && <details className="mt-2 text-xs"><summary className="cursor-pointer text-slate-500">Attached extracted text</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2">{s.attachmentText}</pre></details>}
        {s.status === "verified" && <p className="mt-2 text-[11px] text-emerald-700">Verified {fmtDate(s.reviewedAt)} by {ws.members.find((m) => m.id === s.reviewerId)?.name ?? s.reviewerId} — method: {s.verificationMethod}</p>}
      </article>;
    })}</div> : <Empty title="No sources match">Clear the filters or add a source.</Empty>}

    {adding && <AddSource onClose={() => setAdding(false)} {...{ run, notify }} />}
    {editing && <AddSource initial={editing} onClose={() => setEditing(null)} {...{ run, notify }} />}
    {verifying && <VerifySourceDialog source={verifying} onClose={() => setVerifying(null)} {...{ actor, run, notify }} />}
    {deleting && <Confirm title="Delete source?" message={`"${deleting.title}" is not linked to anything and will be removed.`} confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={() => { run("Deleted source", (w) => ({ ...w, sources: w.sources.filter((s) => s.id !== deleting.id) }), { entity: "source", id: deleting.id }); setDeleting(null); notify("Source deleted."); }} />}
  </div>;
}

function AddSource({ run, notify, onClose, initial }: Pick<TabProps, "run" | "notify"> & { onClose: () => void; initial?: SourceEvidence }) {
  const [f, setF] = useState({ url: initial?.url ?? "", title: initial?.title ?? "", publisher: initial?.publisher ?? "", sourceType: initial?.sourceType ?? ("third_party_directory" as SourceType), publishedAt: initial?.publishedAt ?? "", accessedAt: (initial?.accessedAt ?? new Date().toISOString()).slice(0, 10), excerpt: initial?.excerpt ?? "", accessNotes: initial?.accessNotes ?? "", notes: initial?.notes ?? "", attachmentText: initial?.attachmentText ?? "" });
  const [fetching, setFetching] = useState(false);
  const [fetchInfo, setFetchInfo] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((x) => ({ ...x, [k]: v }));
  function suggestType(url: string) {
    try { const c = classifyUrl(url); setF((x) => ({ ...x, sourceType: c.sourceType, publisher: x.publisher || c.publisher })); } catch { /* invalid URL — the user is still typing */ }
  }
  async function fetchDetails() {
    setFetching(true); setFetchInfo("");
    try {
      const response = await fetch("/api/professional-intelligence/fetch-source", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: f.url.trim() }) });
      const json = await response.json();
      if (!response.ok) {
        setFetchInfo(json.error || "Could not fetch the page.");
        if (json.refused) setF((x) => ({ ...x, accessNotes: x.accessNotes || json.error }));
        return;
      }
      setF((x) => ({
        ...x,
        title: x.title || json.title || "",
        publisher: json.siteName || x.publisher,
        publishedAt: x.publishedAt || json.publishedAt || "",
        accessedAt: String(json.fetchedAt).slice(0, 10),
        excerpt: x.excerpt || json.description || "",
        attachmentText: json.text || x.attachmentText,
        accessNotes: json.note ? `${json.note} ${x.accessNotes}`.trim() : x.accessNotes,
      }));
      setFetchInfo(`Fetched ${json.kind === "pdf" ? "PDF details" : "page"}. Review the excerpt — automated text is not verification.${json.note ? ` ${json.note}` : ""}`);
    } catch { setFetchInfo("Network error while fetching."); }
    finally { setFetching(false); }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    let parsed: URL;
    try { parsed = new URL(f.url.trim()); } catch { return notify("Enter a full URL including https://", "error"); }
    if (!/^https?:$/.test(parsed.protocol)) return notify("Only http(s) URLs are accepted.", "error");
    const at = nowIso();
    const fields = { url: f.url.trim(), title: f.title.trim() || parsed.hostname, publisher: f.publisher.trim() || parsed.hostname, sourceType: f.sourceType, tier: SOURCE_TYPE_TIER[f.sourceType], publishedAt: f.publishedAt || null, accessedAt: f.accessedAt ? new Date(f.accessedAt).toISOString() : null, excerpt: f.excerpt.trim(), accessNotes: f.accessNotes.trim(), notes: f.notes.trim(), attachmentText: f.attachmentText.trim() || null, updatedAt: at };
    if (initial) {
      // Changing what the source says or where it points invalidates a previous verification.
      const material = initial.url !== fields.url || initial.excerpt !== fields.excerpt || initial.sourceType !== fields.sourceType;
      const next: SourceEvidence = { ...initial, ...fields, ...(material && initial.status === "verified" ? { status: "unreviewed" as const, verificationMethod: null, reviewerId: null, reviewedAt: null } : {}) };
      run("Edited source", (w) => ({ ...w, sources: w.sources.map((x) => (x.id === initial.id ? next : x)) }), { entity: "source", id: initial.id });
      notify(material && initial.status === "verified" ? "Source changed — verification reset to unreviewed." : "Source updated."); onClose(); return;
    }
    const src: SourceEvidence = { id: newId("src"), ...fields, status: "unreviewed", verificationMethod: null, reviewerId: null, reviewedAt: null, createdAt: at };
    run("Added source", (w) => ({ ...w, sources: [src, ...w.sources] }), { entity: "source", id: src.id });
    notify(`Source added as Tier ${src.tier}, unreviewed.`); onClose();
  }
  return <Modal title={initial ? "Edit source" : "Add source evidence"} onClose={onClose} wide>
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <Labeled text="Exact URL" className="md:col-span-2"><div className="flex gap-2"><input required className={field} value={f.url} onChange={(e) => set("url", e.target.value)} onBlur={(e) => !initial && suggestType(e.target.value)} placeholder="https://" />
        <button type="button" className={`${button} shrink-0`} disabled={fetching || !/^https?:\/\/\S+/.test(f.url.trim())} onClick={fetchDetails}><DownloadCloud size={15} />{fetching ? "Fetching…" : "Fetch details"}</button></div></Labeled>
      {fetchInfo && <p role="status" className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600 md:col-span-2">{fetchInfo}</p>}
      <Labeled text="Title"><input className={field} value={f.title} onChange={(e) => set("title", e.target.value)} /></Labeled>
      <Labeled text="Publisher / domain"><input className={field} value={f.publisher} onChange={(e) => set("publisher", e.target.value)} /></Labeled>
      <Labeled text={`Source type → ${TIER_LABEL[SOURCE_TYPE_TIER[f.sourceType]]}`}><select className={field} value={f.sourceType} onChange={(e) => set("sourceType", e.target.value)}>{Object.keys(SOURCE_TYPE_TIER).map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Labeled>
      <div className="grid grid-cols-2 gap-3"><Labeled text="Accessed on"><input type="date" className={field} value={f.accessedAt} onChange={(e) => set("accessedAt", e.target.value)} /></Labeled><Labeled text="Published / effective"><input type="date" className={field} value={f.publishedAt} onChange={(e) => set("publishedAt", e.target.value)} /></Labeled></div>
      <Labeled text="Relevant excerpt (verbatim — the part that supports a claim)" className="md:col-span-2"><textarea className={field} rows={3} value={f.excerpt} onChange={(e) => set("excerpt", e.target.value)} /></Labeled>
      <Labeled text="Access limitations (login wall, robots, partial PDF…)" className="md:col-span-2"><input className={field} value={f.accessNotes} onChange={(e) => set("accessNotes", e.target.value)} /></Labeled>
      <Labeled text="Extracted page text / manual attachment (only if permitted)" className="md:col-span-2"><textarea className={`${field} text-xs`} rows={5} value={f.attachmentText} onChange={(e) => set("attachmentText", e.target.value)} /></Labeled>
      <Labeled text="Notes" className="md:col-span-2"><input className={field} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Labeled>
      <div className="flex justify-end gap-2 md:col-span-2"><button type="button" className={button} onClick={onClose}>Cancel</button><button className={primary}>{initial ? "Save changes" : "Add as unreviewed"}</button></div>
    </form>
  </Modal>;
}
function VerifySourceDialog({ source, actor, run, notify, onClose }: Pick<TabProps, "actor" | "run" | "notify"> & { source: SourceEvidence; onClose: () => void }) {
  const [method, setMethod] = useState("");
  const [authentic, setAuthentic] = useState(false);
  return <Modal title="Verify source" onClose={onClose}>
    <p className="font-medium">{source.title}</p>
    <a className="mt-1 block break-all text-xs underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a>
    <Labeled text="Verification method" className="mt-4"><textarea className={field} rows={3} value={method} onChange={(e) => setMethod(e.target.value)} placeholder="e.g. Opened the PDF from the official Delhi HC site navigation, matched row 273 and the column heading 'Enrolment No.'" /></Labeled>
    <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={authentic} onChange={(e) => setAuthentic(e.target.checked)} />I opened the source myself, confirmed it is authentic and current, and the excerpt matches.</label>
    <div className="mt-6 flex justify-end gap-2"><button className={button} onClick={onClose}>Cancel</button><button className={primary} disabled={!authentic} onClick={() => {
      const next = attempt(notify, () => verifySource(source, actor, method));
      if (!next) return;
      run("Verified source", (w) => ({ ...w, sources: w.sources.map((s) => (s.id === source.id ? { ...next, accessedAt: nowIso() } : s)) }), { entity: "source", id: source.id });
      notify("Source verified."); onClose();
    }}><ShieldCheck size={15} />Verify source</button></div>
  </Modal>;
}
