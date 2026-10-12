"use client";

import { useEffect, useState } from "react";
import { Copy, Download, FileText, Plus, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { starterIdeas } from "@/lib/professional-intelligence/research";
import { deleteContent, deletePillar } from "@/lib/professional-intelligence/workspace-ops";
import type { ContentFormat, ContentIdea, ContentStatus, Workspace } from "@/types/professional-intelligence";
import { canEdit } from "@/lib/professional-intelligence/access";
import { CLAIM_FIELD_LABEL, CONTENT_STATUS_LABEL, CONTENT_STATUSES, FORMAT_LABEL, LEGAL_DISCLAIMER, SCORE_LABEL, SCORE_MAX } from "@/lib/professional-intelligence/constants";
import { complianceIssues, exportMarkdown, generateBrief, isExportable, reviseContent, TRANSITIONS, transitionBlockers, transitionContent } from "@/lib/professional-intelligence/content";
import { effectiveSourceStatus } from "@/lib/professional-intelligence/evidence";
import { SCORE_KEYS, scoreTotal, setScoreComponent, suggestEvidenceScore } from "@/lib/professional-intelligence/scoring";
import { Badge, button, card, Confirm, ContentStatusBadge, copyText, download, Empty, field, fmtDate, Labeled, Modal, MultiSelect, newId, nowIso, primary, SectionTitle } from "./ui";
import { attempt, type TabProps } from "./useWorkspace";

export function evidenceReadiness(item: ContentIdea, ws: Workspace): "ready" | "partial" | "none" {
  const links = item.sourceIds.length + item.claimIds.length + item.publicationIds.length + item.caseIds.length;
  if (!links) return "none";
  const sourcesOk = ws.sources.filter((s) => item.sourceIds.includes(s.id)).every((s) => effectiveSourceStatus(s) === "verified");
  const claimsOk = ws.claims.filter((c) => item.claimIds.includes(c.id)).every((c) => c.status === "verified");
  const pubsOk = ws.publications.filter((p) => item.publicationIds.includes(p.id)).every((p) => p.status === "verified");
  return sourcesOk && claimsOk && pubsOk ? "ready" : "partial";
}
const READINESS_LABEL = { ready: "Evidence verified", partial: "Evidence unverified", none: "No evidence linked" };

export default function ContentStrategyTab(props: TabProps) {
  const { ws, pid, actor, run, notify, focusId } = props;
  const pillars = ws.pillars.filter((p) => p.professionalId === pid);
  const items = ws.content.filter((c) => c.professionalId === pid);
  const [f, setF] = useState({ q: "", pillar: "all", format: "all", audience: "all", status: "all", readiness: "all" });
  const [openId, setOpenId] = useState<string | null>(focusId);
  useEffect(() => { if (focusId) setOpenId(focusId); }, [focusId]);
  const audiences = [...new Set(items.map((i) => i.audience))].sort();
  const allocation = pillars.reduce((s, p) => s + p.allocation, 0);
  const list = items.filter((i) => (f.pillar === "all" || i.pillarId === f.pillar) && (f.format === "all" || i.format === f.format) && (f.audience === "all" || i.audience === f.audience) && (f.status === "all" || i.status === f.status) && (f.readiness === "all" || evidenceReadiness(i, ws) === f.readiness) && `${i.title} ${i.hook} ${i.series ?? ""}`.toLowerCase().includes(f.q.toLowerCase()))
    .sort((a, b) => (a.plannedDate ?? "9").localeCompare(b.plannedDate ?? "9"));
  const open = items.find((i) => i.id === openId) ?? null;

  const [deletingPillar, setDeletingPillar] = useState<string | null>(null);
  function addPillar() {
    const p = { id: newId("pil"), professionalId: pid, name: "New pillar", allocation: 0, description: "Describe the theme.", series: [] };
    run("Added pillar", (w) => ({ ...w, pillars: [...w.pillars, p] }), { entity: "pillar", id: p.id });
  }
  function generateStarters() {
    const ideas = starterIdeas({ professionalId: pid, claims: ws.claims, publications: ws.publications, pillars, existingTitles: items.map((i) => i.title), authorId: actor.id });
    if (!ideas.length) return notify("Add practice-area claims or publications first (Professional DNA / Publications) — starter ideas are built from them.", "error");
    run("Generated starter ideas", (w) => ({ ...w, content: [...w.content, ...ideas] }));
    notify(`${ideas.length} starter idea(s) added as "research needed". Score them and attach verified evidence before drafting.`);
  }
  function addIdea() {
    const at = nowIso();
    const idea: ContentIdea = { id: newId("idea"), professionalId: pid, title: "New content idea", pillarId: pillars[0]?.id ?? "", series: null, audience: "General audience", format: "linkedin_post", platform: "LinkedIn", hook: "", cta: "", status: "idea", plannedDate: null, scheduledAt: null, publishedAt: null, publishedUrl: null, body: "", sourceIds: [], claimIds: [], caseIds: [], publicationIds: [], score: { evidence: { score: 0, rationale: "" }, relevance: { score: 0, rationale: "" }, expertise: { score: 0, rationale: "" }, interest: { score: 0, rationale: "" }, originality: { score: 0, rationale: "" }, readiness: { score: 0, rationale: "" } }, authorId: actor.id, revisions: [], approvals: [], createdAt: at, updatedAt: at };
    run("Added content idea", (w) => ({ ...w, content: [...w.content, idea] }), { entity: "content", id: idea.id });
    setOpenId(idea.id);
  }

  return <div className="space-y-6">
    <section className={card}>
      <SectionTitle title="Content pillars" action={<Badge tone={allocation === 100 ? undefined : "bg-amber-50 text-amber-800 ring-amber-200"}>Allocation total {allocation}%</Badge>}>Editable planning assumptions — not proven performance allocations.</SectionTitle>
      {!pillars.length && <p className="mb-3 text-sm text-slate-500">No pillars yet.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{pillars.map((p) => <div key={p.id} className="rounded-xl bg-slate-50 p-3">
        <input aria-label="Pillar name" className="w-full bg-transparent text-sm font-semibold focus:outline-none" value={p.name} disabled={!canEdit(actor)} onChange={(e) => run("Renamed pillar", (w) => ({ ...w, pillars: w.pillars.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) }))} />
        <p className="mt-1 text-xs text-slate-500">{p.description}</p>
        <label className="mt-3 flex items-center gap-2 text-xs">Allocation<input aria-label={`${p.name} allocation`} type="number" min={0} max={100} className={`${field} !w-20 !py-1`} value={p.allocation} disabled={!canEdit(actor)} onChange={(e) => run("Changed pillar allocation", (w) => ({ ...w, pillars: w.pillars.map((x) => (x.id === p.id ? { ...x, allocation: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : x)) }))} />%</label>
        <input aria-label={`${p.name} description`} className="mt-1 w-full bg-transparent text-xs text-slate-500 focus:outline-none" value={p.description} disabled={!canEdit(actor)} onChange={(e) => run("Edited pillar", (w) => ({ ...w, pillars: w.pillars.map((x) => (x.id === p.id ? { ...x, description: e.target.value } : x)) }))} />
        <input aria-label={`${p.name} series`} className="mt-1 w-full bg-transparent text-[11px] text-slate-400 focus:outline-none" placeholder="Series names, comma-separated" value={p.series.join(", ")} disabled={!canEdit(actor)} onChange={(e) => run("Edited pillar", (w) => ({ ...w, pillars: w.pillars.map((x) => (x.id === p.id ? { ...x, series: e.target.value.split(",").map((t) => t.trimStart()) } : x)) }))} />
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">{items.filter((i) => i.pillarId === p.id).length} idea(s)<button aria-label={`Delete pillar ${p.name}`} disabled={!canEdit(actor)} className="hover:text-red-700 disabled:opacity-30" onClick={() => setDeletingPillar(p.id)}><Trash2 size={13} /></button></div>
      </div>)}</div>
    </section>

    <div className="flex flex-wrap gap-2">
      <div className="relative min-w-60 flex-1"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input aria-label="Search ideas" placeholder="Search ideas…" className={`${field} pl-9`} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
      <button className={button} disabled={!canEdit(actor)} onClick={addPillar}><Plus size={15} />Pillar</button>
      <button className={button} disabled={!canEdit(actor)} onClick={generateStarters} title="Creates research-needed ideas from practice-area claims and publications"><Wand2 size={15} />Starter ideas</button>
      <button className={primary} disabled={!canEdit(actor)} onClick={addIdea}><Plus size={15} />New idea</button>
    </div>
    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
      <select aria-label="Pillar" className={field} value={f.pillar} onChange={(e) => setF({ ...f, pillar: e.target.value })}><option value="all">All pillars</option>{pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select aria-label="Format" className={field} value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}><option value="all">All formats</option>{Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select aria-label="Audience" className={field} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="all">All audiences</option>{audiences.map((a) => <option key={a}>{a}</option>)}</select>
      <select aria-label="Status" className={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="all">All statuses</option>{CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}</select>
      <select aria-label="Evidence readiness" className={field} value={f.readiness} onChange={(e) => setF({ ...f, readiness: e.target.value })}><option value="all">Any evidence readiness</option>{Object.entries(READINESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </div>
    <p className="text-xs text-slate-400">{list.length} of {items.length} idea(s) · Opportunity score is a transparent planning heuristic, not a prediction of engagement or leads.</p>

    {list.length ? <div className="grid gap-3 lg:grid-cols-2">{list.map((i) => { const r = evidenceReadiness(i, ws); return <button key={i.id} onClick={() => setOpenId(i.id)} className={`${card} text-left transition hover:border-[#a8c679]`}>
      <div className="flex flex-wrap items-center gap-2"><ContentStatusBadge status={i.status} /><Badge tone={r === "ready" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : r === "partial" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200"}>{READINESS_LABEL[r]}</Badge><Badge>{FORMAT_LABEL[i.format]}</Badge>{i.series && <Badge>{i.series}</Badge>}</div>
      <div className="mt-3 flex items-start justify-between gap-4"><div><h3 className="font-semibold">{i.title}</h3><p className="mt-1 text-sm text-slate-500">{i.hook || "No hook yet"}</p></div><div className="shrink-0 text-right"><p className="text-2xl font-semibold">{scoreTotal(i.score)}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">/ 100 heuristic</p></div></div>
      <p className="mt-3 text-xs text-slate-400">{pillars.find((p) => p.id === i.pillarId)?.name ?? "No pillar"} · {i.audience} · {i.scheduledAt ? `Scheduled ${fmtDate(i.scheduledAt)}` : `Planned ${fmtDate(i.plannedDate)}`}</p>
    </button>; })}</div> : <Empty title="No ideas match these filters" />}

    {open && <IdeaEditor item={open} onClose={() => setOpenId(null)} {...props} />}
    {deletingPillar && <Confirm title="Delete pillar?" message="Ideas in this pillar keep their content but will have no pillar." confirmLabel="Delete pillar" onCancel={() => setDeletingPillar(null)} onConfirm={() => { run("Deleted pillar", (w) => deletePillar(w, deletingPillar), { entity: "pillar", id: deletingPillar }); setDeletingPillar(null); notify("Pillar deleted."); }} />}
  </div>;
}

function IdeaEditor({ item, ws, pid, actor, run, notify, onClose }: TabProps & { item: ContentIdea; onClose: () => void }) {
  const [body, setBody] = useState(item.body);
  const [note, setNote] = useState("");
  const [scheduleDate, setScheduleDate] = useState(item.plannedDate ?? "");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [brief, setBrief] = useState("");
  useEffect(() => { setBody(item.body); }, [item.id, item.body]);
  const editable = canEdit(actor) && item.status !== "published";
  const [deleting, setDeleting] = useState(false);
  const pillars = ws.pillars.filter((p) => p.professionalId === pid);
  const patch = (p: Partial<ContentIdea>, action = "Edited content idea") => run(action, (w) => ({ ...w, content: w.content.map((c) => (c.id === item.id ? { ...c, ...p, updatedAt: nowIso() } : c)) }), { entity: "content", id: item.id });
  const gate = { actor, sources: ws.sources, claims: ws.claims, cases: ws.cases, orders: ws.orders, scheduledAt: scheduleDate || null, publishedUrl: publishedUrl || null, note };
  const issues = complianceIssues(body);
  const ctxBrief = { claims: ws.claims, sources: ws.sources, publications: ws.publications, cases: ws.cases, orders: ws.orders, professionalName: ws.professionals.find((p) => p.id === pid)?.displayName ?? "", pillarName: pillars.find((p) => p.id === item.pillarId)?.name ?? "" };
  const member = (id: string) => ws.members.find((m) => m.id === id)?.name ?? id;

  function move(to: ContentStatus) {
    const next = attempt(notify, () => transitionContent(item, to, gate));
    if (!next) return;
    patch(next, `Content → ${to}`);
    setNote("");
    notify(`Moved to ${CONTENT_STATUS_LABEL[to]}.`);
  }
  function saveDraft() {
    const next = attempt(notify, () => reviseContent(item, body, actor, note));
    if (!next || next === item) return;
    patch(next, "Saved draft revision");
    setNote("");
    notify(next.status !== item.status ? `Revision saved. Status is now ${CONTENT_STATUS_LABEL[next.status]} — re-review required.` : "Revision saved.");
  }

  return <Modal title={item.title} onClose={onClose} wide>
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap items-center gap-2"><ContentStatusBadge status={item.status} /><Badge>Author: {member(item.authorId)}</Badge>{item.scheduledAt && <Badge>Scheduled {fmtDate(item.scheduledAt)}</Badge>}{item.publishedUrl && <a className="text-xs underline" href={item.publishedUrl} target="_blank" rel="noopener noreferrer">Published link</a>}</div>

      <section className="grid gap-3 md:grid-cols-2">
        <Labeled text="Title" className="md:col-span-2"><input className={field} disabled={!editable} value={item.title} onChange={(e) => patch({ title: e.target.value })} /></Labeled>
        <Labeled text="Pillar"><select className={field} disabled={!editable} value={item.pillarId} onChange={(e) => patch({ pillarId: e.target.value })}><option value="">No pillar</option>{pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Labeled>
        <Labeled text="Series"><input className={field} disabled={!editable} value={item.series ?? ""} onChange={(e) => patch({ series: e.target.value || null })} /></Labeled>
        <Labeled text="Target audience"><input className={field} disabled={!editable} value={item.audience} onChange={(e) => patch({ audience: e.target.value })} /></Labeled>
        <div className="grid grid-cols-2 gap-2"><Labeled text="Format"><select className={field} disabled={!editable} value={item.format} onChange={(e) => patch({ format: e.target.value as ContentFormat })}>{Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Labeled><Labeled text="Platform"><input className={field} disabled={!editable} value={item.platform} onChange={(e) => patch({ platform: e.target.value })} /></Labeled></div>
        <Labeled text="Hook" className="md:col-span-2"><input className={field} disabled={!editable} value={item.hook} onChange={(e) => patch({ hook: e.target.value })} /></Labeled>
        <Labeled text="Intended CTA (informational only)"><input className={field} disabled={!editable} value={item.cta} onChange={(e) => patch({ cta: e.target.value })} /></Labeled>
        <Labeled text="Planned slot (planning only)"><input type="date" className={field} disabled={!editable} value={item.plannedDate ?? ""} onChange={(e) => patch({ plannedDate: e.target.value || null })} /></Labeled>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Source evidence</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div><p className="mb-1 text-xs text-slate-500">Sources</p><MultiSelect label="Sources" items={ws.sources} selected={item.sourceIds} onChange={(ids) => editable && patch({ sourceIds: ids })} render={(s) => <>Tier {s.tier} · {s.title} <i className="text-slate-400">({effectiveSourceStatus(s)})</i></>} /></div>
          <div><p className="mb-1 text-xs text-slate-500">Profile claims (contacts excluded)</p><MultiSelect label="Claims" items={ws.claims.filter((c) => c.professionalId === pid && c.field !== "contact" && c.status !== "rejected")} selected={item.claimIds} onChange={(ids) => editable && patch({ claimIds: ids })} render={(c) => <>{CLAIM_FIELD_LABEL[c.field]}: {c.value} <i className="text-slate-400">({c.status})</i></>} /></div>
          <div><p className="mb-1 text-xs text-slate-500">Publications</p><MultiSelect label="Publications" items={ws.publications.filter((p) => p.professionalId === pid)} selected={item.publicationIds} onChange={(ids) => editable && patch({ publicationIds: ids })} render={(p) => <>{p.title} <i className="text-slate-400">({p.status})</i></>} /></div>
          <div><p className="mb-1 text-xs text-slate-500">Court records</p><MultiSelect label="Cases" items={ws.cases.filter((c) => c.professionalId === pid)} selected={item.caseIds} onChange={(ids) => editable && patch({ caseIds: ids })} render={(c) => <>{c.title} <i className="text-slate-400">({c.status})</i></>} /></div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Opportunity score · {scoreTotal(item.score)} / 100</h3>
          <button className={button} disabled={!editable} onClick={() => { const s = suggestEvidenceScore(item.sourceIds, ws.sources); patch({ score: setScoreComponent(item.score, "evidence", s.score, s.rationale) }); }}>Suggest evidence score</button></div>
        <p className="mb-3 text-xs text-slate-500">Heuristic for prioritisation only — not a validated prediction of engagement or enquiries.</p>
        <div className="space-y-3">{SCORE_KEYS.map((k) => <div key={k} className="grid items-center gap-2 md:grid-cols-[200px_160px_1fr]">
          <span className="text-xs font-medium">{SCORE_LABEL[k]} <span className="text-slate-400">/ {SCORE_MAX[k]}</span></span>
          <div className="flex items-center gap-2"><input aria-label={`${SCORE_LABEL[k]} score`} type="range" min={0} max={SCORE_MAX[k]} value={item.score[k].score} disabled={!editable} onChange={(e) => patch({ score: setScoreComponent(item.score, k, Number(e.target.value)) })} /><b className="w-6 text-right">{item.score[k].score}</b></div>
          <input aria-label={`${SCORE_LABEL[k]} rationale`} className={`${field} !py-1.5 text-xs`} placeholder="Rationale" disabled={!editable} value={item.score[k].rationale} onChange={(e) => patch({ score: setScoreComponent(item.score, k, item.score[k].score, e.target.value) })} />
        </div>)}</div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Draft</h3>
          <div className="flex gap-2"><button className={button} disabled={!editable} onClick={() => setBrief(generateBrief(item, ctxBrief))}><Sparkles size={14} />Generate brief</button><button className={button} disabled={!editable || body.includes(LEGAL_DISCLAIMER)} onClick={() => setBody((b) => `${b.trimEnd()}\n\n${LEGAL_DISCLAIMER}`)}>Insert disclaimer</button></div></div>
        <textarea aria-label="Draft body" className={`${field} font-mono text-xs`} rows={9} disabled={!editable} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the draft from the brief. Use verified facts only." />
        {issues.length > 0 && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">Compliance flags (block approval): {issues.join(" · ")}</p>}
        <div className="mt-2 flex flex-wrap gap-2"><input aria-label="Revision note" className={`${field} !w-auto flex-1`} placeholder="Revision / review note" value={note} onChange={(e) => setNote(e.target.value)} /><button className={primary} disabled={!editable || body === item.body} onClick={saveDraft}>Save revision</button></div>
        {brief && <div className="mt-3 rounded-xl bg-[#172c26] p-4 text-white"><div className="mb-2 flex justify-between"><span className="text-xs font-semibold">Content brief (verified facts only)</span><button className="text-xs text-[#d9ef79]" onClick={async () => notify((await copyText(brief)) ? "Brief copied." : "Copy unavailable — select the text manually.")}>Copy</button></div><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/80">{brief}</pre></div>}
      </section>

      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="mb-1 font-semibold">Human review workflow</h3>
        <p className="mb-3 text-xs text-slate-500">Approval needs a legal reviewer who is not the author, verified evidence, the disclaimer and no compliance flags. Editing approved content sends it back to draft.</p>
        {(TRANSITIONS[item.status].includes("scheduled")) && <Labeled text="Publication date (for scheduling)" className="mb-3 max-w-xs"><input type="date" className={field} value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} /></Labeled>}
        {(TRANSITIONS[item.status].includes("published")) && <Labeled text="Published URL (optional)" className="mb-3"><input className={field} value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} /></Labeled>}
        <div className="space-y-2">{TRANSITIONS[item.status].map((to) => { const blockers = transitionBlockers(item, to, gate); return <div key={to} className="flex flex-wrap items-start gap-3">
          <button className={to === "approved" || to === "published" ? primary : button} disabled={blockers.length > 0} onClick={() => move(to)}>→ {CONTENT_STATUS_LABEL[to]}</button>
          {blockers.length > 0 && <ul className="flex-1 text-xs text-slate-500">{blockers.map((b) => <li key={b}>• {b}</li>)}</ul>}
        </div>; })}{!TRANSITIONS[item.status].length && <p className="text-xs text-slate-500">Published content is locked.</p>}</div>
      </section>

      <section className="flex flex-wrap gap-2">
        <button className={button} disabled={!isExportable(item)} title={isExportable(item) ? "" : "Available after approval"} onClick={async () => notify((await copyText(item.body)) ? "Approved copy copied." : "Copy unavailable.")}><Copy size={14} />Copy approved post</button>
        <button className={button} disabled={!isExportable(item)} onClick={() => { const md = attempt(notify, () => exportMarkdown(item, generateBrief(item, ctxBrief))); if (md) download(`${item.id}.md`, md, "text/markdown"); }}><Download size={14} />Export brief + post (.md)</button>
        <button className={`${button} ml-auto`} disabled={!editable} title={item.status === "published" ? "Published content is kept for the record" : ""} onClick={() => setDeleting(true)}><Trash2 size={14} />Delete idea</button>
        {deleting && <Confirm title="Delete this idea?" message={`"${item.title}" and its revision history will be removed. Linked metrics are kept but unlinked.`} confirmLabel="Delete idea" onCancel={() => setDeleting(false)} onConfirm={() => { run("Deleted content idea", (w) => deleteContent(w, item.id), { entity: "content", id: item.id }); setDeleting(false); onClose(); notify("Idea deleted."); }} />}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div><h3 className="mb-2 font-semibold">Approval trail</h3>{item.approvals.length ? <ul className="space-y-1 text-xs">{[...item.approvals].reverse().map((a) => <li key={a.id}>{fmtDate(a.at)} · {CONTENT_STATUS_LABEL[a.from]} → <b>{CONTENT_STATUS_LABEL[a.to]}</b> by {member(a.by)}{a.note && ` — ${a.note}`}</li>)}</ul> : <p className="text-xs text-slate-400">No status changes yet.</p>}</div>
        <div><h3 className="mb-2 font-semibold">Revision history</h3>{item.revisions.length ? <ul className="space-y-1 text-xs">{[...item.revisions].reverse().map((r) => <li key={r.id}><details><summary className="cursor-pointer">{fmtDate(r.at)} by {member(r.by)}{r.note && ` — ${r.note}`}</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{r.body}</pre></details></li>)}</ul> : <p className="flex items-center gap-1 text-xs text-slate-400"><FileText size={12} />No revisions saved.</p>}</div>
      </section>
    </div>
  </Modal>;
}
