"use client";

import { useState } from "react";
import { ExternalLink, Lock, Pencil, Plus, Search, ShieldCheck, Trash2, XCircle } from "lucide-react";
import type { Claim, ClaimField, Confidence, Visibility } from "@/types/professional-intelligence";
import { canEdit, canReview, isContactField, redactClaim } from "@/lib/professional-intelligence/access";
import { CLAIM_FIELD_LABEL, TIER_A_REQUIRED } from "@/lib/professional-intelligence/constants";
import { searchLinks } from "@/lib/professional-intelligence/research";
import { deleteClaim, deleteProfessional } from "@/lib/professional-intelligence/workspace-ops";
import { addClaim, bestVerifiedTier, dataQualityWarnings, findConflicts, maxConfidenceForTier, setClaimConfidence, verifyClaim } from "@/lib/professional-intelligence/evidence";
import { Badge, button, card, Confirm, Empty, field, fmtDate, Labeled, Modal, MultiSelect, newId, nowIso, primary, SectionTitle, SourceLinks, StatusBadge, TierBadge } from "./ui";
import { attempt, type TabProps } from "./useWorkspace";
import DiscoveryPanel from "./DiscoveryPanel";

const GROUPS: { title: string; fields: ClaimField[] }[] = [
  { title: "Identity", fields: ["canonical_name", "alias", "profession", "location", "bar_enrolment"] },
  { title: "Affiliations & roles", fields: ["affiliation", "role"] },
  { title: "Education & credentials", fields: ["education", "credential"] },
  { title: "Practice areas", fields: ["practice_area"] },
  { title: "Publications & speaking", fields: ["publication", "speaking"] },
  { title: "Profiles & contact channels", fields: ["profile_link", "contact"] },
];

export default function ProfileTab(props: TabProps) {
  const { ws, pid, actor, run, notify } = props;
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<Claim | null>(null);
  const [rejecting, setRejecting] = useState<Claim | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [editingClaim, setEditingClaim] = useState<Claim | null>(null);
  const [deletingClaim, setDeletingClaim] = useState<Claim | null>(null);
  const [editingPro, setEditingPro] = useState(false);
  const [deletingPro, setDeletingPro] = useState(false);
  const [searchContext, setSearchContext] = useState("");
  const professional = ws.professionals.find((p) => p.id === pid)!;
  const claims = ws.claims.filter((c) => c.professionalId === pid && (showRejected || c.status !== "rejected")).map((c) => redactClaim(c, actor));
  const conflicts = findConflicts(ws.claims.filter((c) => c.professionalId === pid));
  const warnings = dataQualityWarnings({ claims: ws.claims, sources: ws.sources, professionalId: pid });

  return <div className="space-y-6">
    <section className={`${card} flex flex-wrap items-start justify-between gap-4`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.15em] text-slate-400">Professional DNA</p>
        <h2 className="mt-1 text-2xl font-semibold">{professional.displayName}</h2>
        <p className="mt-1 text-sm text-slate-500">{professional.profession || "Profession not set"} · Last checked {fmtDate(professional.lastCheckedAt)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {professional.isExample && <Badge tone="bg-amber-50 text-amber-800 ring-amber-200">Example profile · all facts start unverified</Badge>}
          <Badge>{claims.filter((c) => c.status === "verified").length} verified</Badge>
          <Badge tone="bg-amber-50 text-amber-800 ring-amber-200">{claims.filter((c) => c.status !== "verified" && c.status !== "rejected").length} unverified / disputed</Badge>
          {conflicts.length > 0 && <Badge tone="bg-red-50 text-red-700 ring-red-200">{conflicts.length} conflict(s)</Badge>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} />Show rejected</label>
        <button className={primary} disabled={!canEdit(actor)} onClick={() => setAdding(true)} title={canEdit(actor) ? "" : "Editor role required"}><Plus size={15} />Add claim</button>
        <button className={button} disabled={!canEdit(actor)} onClick={() => setEditingPro(true)}><Pencil size={15} />Edit details</button>
        <button className={button} disabled={!canEdit(actor)} onClick={() => setDeletingPro(true)}><Trash2 size={15} />Delete profile</button>
        <button className={button} disabled={!canEdit(actor)} onClick={() => run("Marked profile checked", (w) => ({ ...w, professionals: w.professionals.map((p) => (p.id === pid ? { ...p, lastCheckedAt: nowIso() } : p)) }))}>Mark checked now</button>
      </div>
    </section>

    <DiscoveryPanel {...props} />

    <section className={card}>
      <SectionTitle title="Research links" action={<input aria-label="Extra search context" className={`${field} !w-64 !py-1.5 text-xs`} placeholder="Add context, e.g. Delhi High Court" value={searchContext} onChange={(e) => setSearchContext(e.target.value)} />}>Open these public searches yourself, then add what you find as a source (Evidence Registry → Add source → Fetch details) and link claims to it.</SectionTitle>
      <div className="flex flex-wrap gap-2">{searchLinks(professional.displayName, searchContext, professional.profession).map((l) => <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className={`${button} !py-1.5 text-xs`}><Search size={13} />{l.label}<ExternalLink size={11} /></a>)}</div>
    </section>

    {warnings.some((w) => w.level === "warning") && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Data-quality warnings</p><ul className="mt-2 list-disc space-y-1 pl-5">{warnings.filter((w) => w.level === "warning").map((w, i) => <li key={i}>{w.message}</li>)}</ul></section>}

    {GROUPS.map((g) => {
      const items = claims.filter((c) => g.fields.includes(c.field));
      return <section key={g.title} className={card}>
        <SectionTitle title={g.title} />
        {items.length ? <div className="divide-y">{items.map((c) => {
          const tier = bestVerifiedTier(c.sourceIds, ws.sources);
          const inConflict = conflicts.some((x) => x.claims.some((y) => y.id === c.id));
          return <article key={c.id} className="grid gap-4 py-4 md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{CLAIM_FIELD_LABEL[c.field]}{c.label ? ` · ${c.label}` : ""}</span>
                <StatusBadge status={c.status} />
                <Badge tone={c.basis === "inferred" ? "bg-violet-50 text-violet-800 ring-violet-200" : undefined}>{c.basis === "inferred" ? "Inferred" : "Stated in source"}</Badge>
                {canReview(actor) && c.status !== "rejected" && !c.redacted
                  ? <select aria-label={`Confidence of ${c.value}`} title="Your confidence score" className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px]" value={c.confidence} onChange={(e) => { const next = attempt(notify, () => setClaimConfidence(ws.claims.find((x) => x.id === c.id)!, actor, e.target.value as Confidence)); if (next) run("Scored claim confidence", (w) => ({ ...w, claims: w.claims.map((x) => (x.id === c.id ? next : x)) }), { entity: "claim", id: c.id }); }}>
                      {["low", "medium", "high"].map((v) => <option key={v} value={v}>Confidence: {v}</option>)}
                    </select>
                  : <Badge>Confidence: {c.confidence}</Badge>}
                {isContactField(c.field) && (canReview(actor) && !c.redacted
                  ? <select aria-label={`Visibility of ${c.value}`} className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px]" value={c.visibility} onChange={(e) => run("Changed contact visibility", (w) => ({ ...w, claims: w.claims.map((x) => (x.id === c.id ? { ...x, visibility: e.target.value as Visibility, updatedAt: nowIso() } : x)) }), { entity: "claim", id: c.id })}>
                      <option value="restricted">restricted</option><option value="internal">internal</option><option value="public" disabled={c.status !== "verified"}>public{c.status !== "verified" ? " (verify first)" : ""}</option>
                    </select>
                  : <Badge tone="bg-slate-100 text-slate-600 ring-slate-300"><Lock size={10} />{c.visibility}</Badge>)}
                {inConflict && <Badge tone="bg-red-50 text-red-700 ring-red-200">Conflict</Badge>}
                {tier && <TierBadge tier={tier} />}
              </div>
              <p className={`mt-2 break-words ${c.redacted ? "italic text-slate-400" : "font-medium"}`}>{c.field === "photo" && !c.redacted && /^https?:\/\//.test(c.value) ? <span className="flex items-center gap-3"><img src={c.value} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200" /><a className="break-all text-xs underline" href={c.value} target="_blank" rel="noopener noreferrer">{c.value}</a></span> : c.field === "profile_link" && !c.redacted ? <a className="underline" href={c.value} target="_blank" rel="noopener noreferrer">{c.value}</a> : c.value}</p>
              {(c.effectiveFrom || c.effectiveTo) && <p className="mt-1 text-xs text-slate-500">Effective {fmtDate(c.effectiveFrom)} – {c.effectiveTo ? fmtDate(c.effectiveTo) : "present / unknown"}</p>}
              {c.notes && <p className="mt-1 text-xs text-slate-500">{c.notes}</p>}
              <div className="mt-3"><SourceLinks ids={c.sourceIds} sources={ws.sources} /></div>
              {c.status === "verified" && <p className="mt-2 text-[11px] text-emerald-700">Verified {fmtDate(c.verifiedAt)} by {ws.members.find((m) => m.id === c.reviewerId)?.name ?? c.reviewerId}</p>}
            </div>
            <div className="flex gap-2 md:flex-col">
              <button className={button} disabled={!canReview(actor) || c.status === "verified" || c.status === "rejected"} title={canReview(actor) ? "" : "Legal reviewer role required"} onClick={() => setVerifying(ws.claims.find((x) => x.id === c.id)!)}><ShieldCheck size={15} />Verify</button>
              <button className={button} disabled={!canReview(actor) || c.status === "rejected"} onClick={() => setRejecting(ws.claims.find((x) => x.id === c.id)!)}><XCircle size={15} />Reject</button>
              <button className={button} disabled={!canEdit(actor) || c.status === "verified" || c.redacted} title={c.status === "verified" ? "Verified values are locked — add a new claim to supersede" : ""} onClick={() => setEditingClaim(ws.claims.find((x) => x.id === c.id)!)}><Pencil size={15} />Edit</button>
              <button className={button} aria-label={`Delete claim ${c.value}`} disabled={!canEdit(actor) || c.status === "verified"} onClick={() => setDeletingClaim(ws.claims.find((x) => x.id === c.id)!)}><Trash2 size={15} /></button>
            </div>
          </article>;
        })}</div> : <Empty title="No claims recorded">Add a claim with its source, or leave empty if unknown.</Empty>}
      </section>;
    })}

    {adding && <AddClaim onClose={() => setAdding(false)} {...{ ws, pid, run, notify }} />}
    {editingClaim && <AddClaim initial={editingClaim} onClose={() => setEditingClaim(null)} {...{ ws, pid, run, notify }} />}
    {deletingClaim && <Confirm title="Delete this claim?" message={`"${deletingClaim.value}" will be removed and unlinked from any content. Use Reject instead if you want to keep it for audit.`} confirmLabel="Delete claim" onCancel={() => setDeletingClaim(null)} onConfirm={() => { run("Deleted claim", (w) => deleteClaim(w, deletingClaim.id), { entity: "claim", id: deletingClaim.id }); setDeletingClaim(null); notify("Claim deleted."); }} />}
    {editingPro && <EditProfessional name={professional.displayName} profession={professional.profession} onClose={() => setEditingPro(false)} onSave={(displayName, profession) => { run("Edited professional", (w) => ({ ...w, professionals: w.professionals.map((p) => (p.id === pid ? { ...p, displayName, profession, updatedAt: nowIso() } : p)) }), { entity: "professional", id: pid }); notify("Details saved. Name/profession claims are unchanged — update or add claims with sources."); }} />}
    {deletingPro && <DeleteProfessional name={professional.displayName} onClose={() => setDeletingPro(false)} onConfirm={() => { run("Deleted professional", (w) => deleteProfessional(w, pid), { entity: "professional", id: pid }); setDeletingPro(false); notify(`${professional.displayName} and all related records were deleted.`); }} />}
    {verifying && <VerifyClaim claim={verifying} onClose={() => setVerifying(null)} {...{ ws, actor, run, notify }} />}
    {rejecting && <Confirm title="Reject this claim?" message={`"${rejecting.value}" will be kept for audit but excluded from the profile and content briefs.`} confirmLabel="Reject claim" onCancel={() => setRejecting(null)} onConfirm={() => {
      const at = nowIso();
      run("Rejected claim", (w) => ({ ...w, claims: w.claims.map((c) => (c.id === rejecting.id ? { ...c, status: "rejected", reviewerId: actor.id, updatedAt: at } : c)) }), { entity: "claim", id: rejecting.id });
      setRejecting(null); notify("Claim rejected.");
    }} />}
  </div>;
}

function AddClaim({ ws, pid, run, notify, onClose, initial }: Pick<TabProps, "ws" | "pid" | "run" | "notify"> & { onClose: () => void; initial?: Claim }) {
  const [f, setF] = useState({ field: initial?.field ?? ("practice_area" as ClaimField), value: initial?.value ?? "", label: initial?.label ?? "", basis: initial?.basis ?? ("stated" as Claim["basis"]), confidence: initial?.confidence ?? ("low" as Confidence), visibility: initial?.visibility ?? ("internal" as Visibility), effectiveFrom: initial?.effectiveFrom ?? "", effectiveTo: initial?.effectiveTo ?? "", notes: initial?.notes ?? "", sourceIds: initial?.sourceIds ?? ([] as string[]) });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.value.trim()) return notify("Enter a value.", "error");
    if ((f.field === "photo" || f.field === "profile_link") && !/^https?:\/\/\S+$/.test(f.value.trim())) return notify("Enter the full image/page URL starting with https://", "error");
    if (f.effectiveFrom && f.effectiveTo && f.effectiveTo < f.effectiveFrom) return notify("Effective end date is before the start date.", "error");
    const at = nowIso();
    if (initial) {
      const edited: Claim = { ...initial, field: f.field, value: f.value.trim(), label: f.label.trim() || null, effectiveFrom: f.effectiveFrom || null, effectiveTo: f.effectiveTo || null, basis: f.basis, confidence: f.confidence, visibility: isContactField(f.field) && f.visibility === "public" ? "restricted" : f.visibility, sourceIds: f.sourceIds, notes: f.notes, status: initial.status === "rejected" ? "rejected" : "unverified", updatedAt: at };
      run("Edited claim", (w) => ({ ...w, claims: w.claims.map((c) => (c.id === initial.id ? edited : c)) }), { entity: "claim", id: initial.id });
      notify("Claim updated (unverified until reviewed)."); onClose(); return;
    }
    const incoming: Claim = { id: newId("cl"), professionalId: pid, field: f.field, value: f.value.trim(), label: f.label.trim() || null, effectiveFrom: f.effectiveFrom || null, effectiveTo: f.effectiveTo || null, basis: f.basis, confidence: f.confidence, status: "unverified", visibility: isContactField(f.field) ? (f.visibility === "public" ? "restricted" : f.visibility) : f.visibility, sourceIds: f.sourceIds, reviewerId: null, verifiedAt: null, supersedesId: null, notes: f.notes, createdAt: at, updatedAt: at };
    const result = addClaim(ws.claims, incoming);
    run("Added claim", (w) => ({ ...w, claims: result.claims }), { entity: "claim", id: incoming.id });
    notify(result.merged ? "Same value already recorded — the new evidence was merged into it." : result.conflicts.length ? "Saved as disputed: it conflicts with an existing value. Existing verified values were not changed." : f.sourceIds.length ? "Claim added as unverified." : "Claim added as an unsourced research lead.");
    onClose();
  }
  return <Modal title={initial ? "Edit claim" : "Add claim"} onClose={onClose} wide>
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <Labeled text="Field"><select className={field} value={f.field} onChange={(e) => { const v = e.target.value as ClaimField; set("field", v); if (isContactField(v)) set("visibility", "restricted"); }}>{Object.entries(CLAIM_FIELD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Labeled>
      <Labeled text="Label (organisation, channel type…)"><input className={field} value={f.label} onChange={(e) => set("label", e.target.value)} maxLength={200} /></Labeled>
      <Labeled text="Value" className="md:col-span-2"><input required className={field} value={f.value} onChange={(e) => set("value", e.target.value)} maxLength={500} /></Labeled>
      <Labeled text="Basis"><select className={field} value={f.basis} onChange={(e) => set("basis", e.target.value as Claim["basis"])}><option value="stated">Stated in source</option><option value="inferred">Inferred</option></select></Labeled>
      <Labeled text="Proposed confidence"><select className={field} value={f.confidence} onChange={(e) => set("confidence", e.target.value as Confidence)}>{["low", "medium", "high"].map((c) => <option key={c}>{c}</option>)}</select></Labeled>
      <Labeled text="Effective from"><input type="date" className={field} value={f.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} /></Labeled>
      <Labeled text="Effective to"><input type="date" className={field} value={f.effectiveTo} onChange={(e) => set("effectiveTo", e.target.value)} /></Labeled>
      {isContactField(f.field) && <Labeled text="Visibility (contacts start restricted; a reviewer can make a verified contact public)" className="md:col-span-2"><select className={field} value={f.visibility} onChange={(e) => set("visibility", e.target.value as Visibility)}><option value="restricted">Restricted — reviewers/admins</option><option value="internal">Internal — all workspace members</option></select></Labeled>}
      <div className="md:col-span-2"><p className="mb-1.5 text-xs font-medium text-slate-500">Sources</p><MultiSelect label="Sources" items={ws.sources} selected={f.sourceIds} onChange={(ids) => set("sourceIds", ids)} render={(s) => <><b>Tier {s.tier}</b> · {s.title} <span className="text-slate-400">({s.status})</span></>} /></div>
      <Labeled text="Notes" className="md:col-span-2"><textarea className={field} rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Labeled>
      <div className="flex justify-end gap-2 md:col-span-2"><button type="button" className={button} onClick={onClose}>Cancel</button><button className={primary}>{initial ? "Save changes" : "Save as unverified"}</button></div>
    </form>
  </Modal>;
}

function VerifyClaim({ claim, ws, actor, run, notify, onClose }: Pick<TabProps, "ws" | "actor" | "run" | "notify"> & { claim: Claim; onClose: () => void }) {
  const tier = bestVerifiedTier(claim.sourceIds, ws.sources);
  const suggested = tier ? maxConfidenceForTier(tier) : "low";
  const [confidence, setConfidence] = useState<Confidence>(claim.confidence);
  const rivals = ws.claims.filter((c) => c.id !== claim.id && c.professionalId === claim.professionalId && c.field === claim.field && c.status === "verified" && c.value !== claim.value);
  const [supersede, setSupersede] = useState<string[]>([]);
  function submit() {
    const result = attempt(notify, () => verifyClaim(claim, { claims: ws.claims, sources: ws.sources, actor, confidence, supersedeIds: supersede }));
    if (!result) return;
    run("Verified claim", (w) => ({ ...w, claims: w.claims.map((c) => (c.id === claim.id ? result.claim : result.superseded.includes(c.id) ? { ...c, status: "rejected", notes: `${c.notes} Superseded by ${claim.id}.`.trim() } : c)) }), { entity: "claim", id: claim.id });
    notify("Claim verified."); onClose();
  }
  return <Modal title="Verify claim" onClose={onClose}>
    <p className="font-medium">{claim.value}</p>
    <p className="mt-1 text-xs text-slate-500">{CLAIM_FIELD_LABEL[claim.field]}{TIER_A_REQUIRED.includes(claim.field) ? " · an official Tier A record is recommended" : ""}</p>
    <div className="my-4"><SourceLinks ids={claim.sourceIds} sources={ws.sources} /></div>
    {!tier && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No linked source is verified yet. You can still verify this claim on your own check.</p>}
    <Labeled text={`Confidence — your score (Tier ${tier ?? "–"} evidence typically supports up to "${suggested}")`}><select className={field} value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence)}>{["low", "medium", "high"].map((c) => <option key={c}>{c}</option>)}</select></Labeled>
    {rivals.length > 0 && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm"><p className="font-medium text-red-800">A different verified value exists. Supersede it explicitly:</p>{rivals.map((r) => <label key={r.id} className="mt-2 flex gap-2"><input type="checkbox" checked={supersede.includes(r.id)} onChange={(e) => setSupersede(e.target.checked ? [...supersede, r.id] : supersede.filter((x) => x !== r.id))} />“{r.value}” ({r.confidence})</label>)}</div>}
    <div className="mt-6 flex justify-end gap-2"><button className={button} onClick={onClose}>Cancel</button><button className={primary} onClick={submit}><ShieldCheck size={15} />Verify</button></div>
  </Modal>;
}

function EditProfessional({ name, profession, onClose, onSave }: { name: string; profession: string; onClose: () => void; onSave: (name: string, profession: string) => void }) {
  const [n, setN] = useState(name);
  const [p, setP] = useState(profession);
  return <Modal title="Edit professional" onClose={onClose}>
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!n.trim()) return; onSave(n.trim(), p.trim()); onClose(); }}>
      <Labeled text="Display name"><input required className={field} value={n} onChange={(e) => setN(e.target.value)} maxLength={120} /></Labeled>
      <Labeled text="Profession"><input className={field} value={p} onChange={(e) => setP(e.target.value)} maxLength={120} /></Labeled>
      <div className="flex justify-end gap-2"><button type="button" className={button} onClick={onClose}>Cancel</button><button className={primary}>Save</button></div>
    </form>
  </Modal>;
}

function DeleteProfessional({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState("");
  return <Modal title={`Delete ${name}?`} onClose={onClose}>
    <p className="text-sm text-slate-600">This permanently removes the profile and all its claims, court records, orders, publications, pillars, content and metrics from this browser. Sources used only by this profile are removed too. Export first if you need a backup.</p>
    <Labeled text={`Type the name to confirm: ${name}`} className="mt-4"><input className={field} value={typed} onChange={(e) => setTyped(e.target.value)} /></Labeled>
    <div className="mt-6 flex justify-end gap-2"><button className={button} onClick={onClose}>Cancel</button><button className={`${primary} !bg-red-700 hover:!bg-red-800`} disabled={typed.trim() !== name} onClick={onConfirm}>Delete profile</button></div>
  </Modal>;
}
