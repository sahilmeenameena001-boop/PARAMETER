"use client";

import { useState } from "react";
import { BookOpen, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { deletePublication } from "@/lib/professional-intelligence/workspace-ops";
import type { Publication } from "@/types/professional-intelligence";
import { canEdit, canReview } from "@/lib/professional-intelligence/access";
import { bestVerifiedTier } from "@/lib/professional-intelligence/evidence";
import { Badge, button, card, Confirm, Empty, field, fmtDate, Labeled, Modal, MultiSelect, newId, nowIso, primary, SourceLinks, StatusBadge } from "./ui";
import type { TabProps } from "./useWorkspace";

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function PublicationsTab({ ws, pid, actor, run, notify, goTo }: TabProps) {
  const pubs = ws.publications.filter((p) => p.professionalId === pid);
  const [editing, setEditing] = useState<Publication | "new" | null>(null);
  const [deleting, setDeleting] = useState<Publication | null>(null);
  function verify(p: Publication) {
    const tier = bestVerifiedTier(p.sourceIds, ws.sources);
    if (!tier || !["A", "B"].includes(tier)) return notify("Verify a publisher, library-catalogue or ISBN-registry source (Tier A/B) first.", "error");
    if (!p.edition || !p.publicationDate) return notify("Record the edition and publication date from the source before verifying.", "error");
    run("Verified publication", (w) => ({ ...w, publications: w.publications.map((x) => (x.id === p.id ? { ...x, status: "verified", reviewerId: actor.id, verifiedAt: nowIso(), updatedAt: nowIso() } : x)) }), { entity: "publication", id: p.id });
    notify("Publication verified.");
  }
  return <div className="space-y-5">
    <div className="flex justify-end"><button className={primary} disabled={!canEdit(actor)} onClick={() => setEditing("new")}><Plus size={15} />Add publication</button></div>
    {pubs.length ? pubs.map((p) => <article key={p.id} className={card}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#edf3e5]"><BookOpen size={20} /></span><div>
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={p.status} />{p.identifier && <Badge>{p.identifier}</Badge>}</div>
          <h2 className="mt-2 text-lg font-semibold">{p.title}</h2>
          <p className="text-sm text-slate-500">{p.authors} · {p.publisher}</p>
        </div></div>
        <div className="flex gap-2"><button className={button} disabled={!canEdit(actor)} onClick={() => setEditing(p)}><Pencil size={15} />Edit</button><button className={button} aria-label={`Delete ${p.title}`} disabled={!canEdit(actor)} onClick={() => setDeleting(p)}><Trash2 size={15} /></button><button className={button} disabled={!canReview(actor) || p.status === "verified"} onClick={() => verify(p)}><ShieldCheck size={15} />Verify</button></div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-slate-400">Edition</dt><dd>{p.edition ?? <span className="text-amber-700">Unverified / not on source</span>}</dd></div>
        <div><dt className="text-xs text-slate-400">Publication date</dt><dd>{p.publicationDate ? fmtDate(p.publicationDate) : <span className="text-amber-700">Unverified / not on source</span>}</dd></div>
        <div><dt className="text-xs text-slate-400">Practice areas</dt><dd>{p.practiceAreas.join(", ") || "—"}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">{p.topics.map((t) => <Badge key={t}>{t}</Badge>)}</div>
      <div className="mt-4"><SourceLinks ids={p.sourceIds} sources={ws.sources} /></div>
      {p.notes && <p className="mt-3 text-xs text-slate-500">{p.notes}</p>}
      {p.contentIdeas.length > 0 && <div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold">Content ideas</p><ul className="mt-1 list-disc pl-5 text-sm">{p.contentIdeas.map((c) => <li key={c}>{c}</li>)}</ul>
        <button className="mt-2 text-xs font-semibold" onClick={() => goTo("Content Strategy")}>Plan in Content Strategy →</button></div>}
    </article>) : <Empty title="No publications recorded">Add a publication with a publisher or catalogue source.</Empty>}
    {deleting && <Confirm title="Delete publication?" message={`"${deleting.title}" will be removed and unlinked from content ideas.`} confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={() => { run("Deleted publication", (w) => deletePublication(w, deleting.id), { entity: "publication", id: deleting.id }); setDeleting(null); notify("Publication deleted."); }} />}
    {editing && <EditPublication pub={editing === "new" ? null : editing} onClose={() => setEditing(null)} {...{ ws, pid, run, notify }} />}
  </div>;
}

function EditPublication({ pub, ws, pid, run, notify, onClose }: Pick<TabProps, "ws" | "pid" | "run" | "notify"> & { pub: Publication | null; onClose: () => void }) {
  const [f, setF] = useState({ title: pub?.title ?? "", authors: pub?.authors ?? "", publisher: pub?.publisher ?? "", identifier: pub?.identifier ?? "", edition: pub?.edition ?? "", publicationDate: pub?.publicationDate ?? "", topics: pub?.topics.join(", ") ?? "", practiceAreas: pub?.practiceAreas.join(", ") ?? "", contentIdeas: pub?.contentIdeas.join(", ") ?? "", notes: pub?.notes ?? "", sourceIds: pub?.sourceIds ?? [] });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return <Modal title={pub ? "Edit publication" : "Add publication"} onClose={onClose} wide>
    <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      if (!f.title.trim() || !f.authors.trim()) return notify("Title and author are required.", "error");
      const at = nowIso();
      const changedFacts = pub && (pub.title !== f.title || pub.edition !== (f.edition || null) || pub.publicationDate !== (f.publicationDate || null) || pub.identifier !== (f.identifier || null) || pub.authors !== f.authors);
      const next: Publication = { id: pub?.id ?? newId("pub"), professionalId: pid, title: f.title.trim(), authors: f.authors.trim(), publisher: f.publisher.trim(), identifier: f.identifier.trim() || null, edition: f.edition.trim() || null, publicationDate: f.publicationDate || null, topics: splitList(f.topics), practiceAreas: splitList(f.practiceAreas), contentIdeas: splitList(f.contentIdeas), sourceIds: f.sourceIds, status: changedFacts || !pub ? "unverified" : pub.status, reviewerId: changedFacts ? null : pub?.reviewerId ?? null, verifiedAt: changedFacts ? null : pub?.verifiedAt ?? null, notes: f.notes, createdAt: pub?.createdAt ?? at, updatedAt: at };
      run(pub ? "Edited publication" : "Added publication", (w) => ({ ...w, publications: pub ? w.publications.map((p) => (p.id === pub.id ? next : p)) : [...w.publications, next] }), { entity: "publication", id: next.id });
      notify(changedFacts ? "Publication facts changed — status reset to unverified." : "Publication saved."); onClose();
    }}>
      <Labeled text="Title" className="md:col-span-2"><input required className={field} value={f.title} onChange={(e) => set("title", e.target.value)} /></Labeled>
      <Labeled text="Author(s)"><input required className={field} value={f.authors} onChange={(e) => set("authors", e.target.value)} /></Labeled>
      <Labeled text="Publisher"><input className={field} value={f.publisher} onChange={(e) => set("publisher", e.target.value)} /></Labeled>
      <Labeled text="ISBN / identifier"><input className={field} value={f.identifier} onChange={(e) => set("identifier", e.target.value)} /></Labeled>
      <Labeled text="Edition"><input className={field} value={f.edition} onChange={(e) => set("edition", e.target.value)} /></Labeled>
      <Labeled text="Publication date"><input type="date" className={field} value={f.publicationDate} onChange={(e) => set("publicationDate", e.target.value)} /></Labeled>
      <Labeled text="Topics (comma-separated)"><input className={field} value={f.topics} onChange={(e) => set("topics", e.target.value)} /></Labeled>
      <Labeled text="Related practice areas (comma-separated)"><input className={field} value={f.practiceAreas} onChange={(e) => set("practiceAreas", e.target.value)} /></Labeled>
      <Labeled text="Content ideas (comma-separated)"><input className={field} value={f.contentIdeas} onChange={(e) => set("contentIdeas", e.target.value)} /></Labeled>
      <div className="md:col-span-2"><p className="mb-1.5 text-xs font-medium text-slate-500">Sources</p><MultiSelect label="Sources" items={ws.sources} selected={f.sourceIds} onChange={(ids) => set("sourceIds", ids)} render={(s) => <><b>Tier {s.tier}</b> · {s.title}</>} /></div>
      <Labeled text="Notes" className="md:col-span-2"><textarea className={field} rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Labeled>
      <div className="flex justify-end gap-2 md:col-span-2"><button type="button" className={button} onClick={onClose}>Cancel</button><button className={primary}>Save</button></div>
    </form>
  </Modal>;
}
