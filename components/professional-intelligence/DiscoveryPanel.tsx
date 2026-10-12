"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Radar, X } from "lucide-react";
import type { DiscoveryCandidate } from "@/types/professional-intelligence";
import { canEdit } from "@/lib/professional-intelligence/access";
import { CLAIM_FIELD_LABEL } from "@/lib/professional-intelligence/constants";
import { acceptCandidate, DEPTH_QUERIES, rejectCandidate, type DiscoveryDepth } from "@/lib/professional-intelligence/discovery";
import { Badge, button, card, field, primary, SectionTitle, TierBadge } from "./ui";
import type { TabProps } from "./useWorkspace";

const scoreTone = (s: number) => (s >= 70 ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : s >= 45 ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200");

export default function DiscoveryPanel({ ws, pid, actor, run, notify }: TabProps) {
  const professional = ws.professionals.find((p) => p.id === pid)!;
  const mine = ws.claims.filter((c) => c.professionalId === pid && c.status !== "rejected");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [depth, setDepth] = useState<DiscoveryDepth>("standard");
  const [context, setContext] = useState("");
  const [readPages, setReadPages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [show, setShow] = useState<"pending" | "all">("pending");
  const [minScore, setMinScore] = useState(0);

  useEffect(() => { fetch("/api/professional-intelligence/discover").then((r) => r.json()).then((j) => setConfigured(!!j.configured)).catch(() => setConfigured(false)); }, []);

  const candidates = ws.candidates.filter((c) => c.professionalId === pid && (show === "all" || c.status === "pending") && c.matchScore >= minScore);
  const pendingCount = ws.candidates.filter((c) => c.professionalId === pid && c.status === "pending").length;
  const estimate = DEPTH_QUERIES[depth] * (readPages ? 7 : 2);

  async function discover() {
    setBusy(true);
    setProgress(`Running ${DEPTH_QUERIES[depth]} searches${readPages ? " and reading result pages" : ""}… this can take a minute.`);
    try {
      const response = await fetch("/api/professional-intelligence/discover", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          professionalId: pid, name: professional.displayName, profession: professional.profession, context, depth, readPages,
          aliases: mine.filter((c) => c.field === "alias").map((c) => c.value),
          location: mine.find((c) => c.field === "location")?.value ?? "",
          knownUrls: [...ws.sources.map((s) => s.url), ...ws.candidates.filter((c) => c.professionalId === pid).map((c) => c.url)],
        }),
      });
      const json = await response.json();
      if (!response.ok) { notify(json.error || "Discovery failed.", "error"); if (json.setup) setConfigured(false); return; }
      const found: DiscoveryCandidate[] = json.candidates;
      run("Ran automatic discovery", (w) => ({ ...w, candidates: [...found, ...w.candidates] }), { entity: "professional", id: pid });
      notify(`Discovery finished: ${json.stats.results} result(s), ${found.length} new candidate(s), ${json.stats.pagesRead} page(s) read.${json.warnings.length ? ` ${json.warnings.length} search(es) failed.` : ""} Review each candidate — nothing has been added to the profile yet.`, json.warnings.length ? "error" : "ok");
    } catch { notify("Network error during discovery.", "error"); }
    finally { setBusy(false); setProgress(""); }
  }

  return <section className={card}>
    <SectionTitle title="Auto-discover" action={pendingCount > 0 ? <Badge tone="bg-violet-50 text-violet-800 ring-violet-200">{pendingCount} candidate(s) to review</Badge> : undefined}>
      Searches the web for this person and proposes sources and facts with quoted evidence. Nothing is added until you accept it, and accepted items stay unverified. Same-name people are common — check the match score and reasons.
    </SectionTitle>

    {configured === false && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">Setup needed</p>
      <p className="mt-1">Add your Firecrawl API key to <code>.env.local</code> in the project folder, then restart the server:</p>
      <pre className="mt-2 rounded bg-white/70 p-2 text-xs">FIRECRAWL_API_KEY=fc-your-key</pre>
      <p className="mt-1 text-xs">Get a key at firecrawl.dev → API keys. It stays on the server and is never sent to the browser.</p>
    </div>}

    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-slate-500">Depth<select aria-label="Discovery depth" className={`${field} mt-1 !w-auto`} value={depth} onChange={(e) => setDepth(e.target.value as DiscoveryDepth)}>
        <option value="quick">Quick — {DEPTH_QUERIES.quick} searches</option><option value="standard">Standard — {DEPTH_QUERIES.standard} searches</option><option value="deep">Deep — {DEPTH_QUERIES.deep} searches</option>
      </select></label>
      <label className="min-w-56 flex-1 text-xs text-slate-500">Extra context (court, city, firm…)<input aria-label="Discovery context" className={`${field} mt-1`} value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g. Delhi High Court, NCLT" /></label>
      <label className="flex items-center gap-2 pb-2 text-xs text-slate-500"><input type="checkbox" checked={readPages} onChange={(e) => setReadPages(e.target.checked)} />Read result pages</label>
      <button className={primary} disabled={busy || !canEdit(actor) || configured === false} onClick={discover}><Radar size={15} />{busy ? "Discovering…" : "Auto-discover"}</button>
    </div>
    <p className="mt-2 text-[11px] text-slate-400">Approx. {estimate} Firecrawl credits per run. Login-walled sites (LinkedIn, Facebook, Instagram) contribute only their public search snippet; pages disallowed by robots.txt are not read. Phone numbers and emails are never captured.</p>
    {progress && <p role="status" className="mt-3 animate-pulse rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{progress}</p>}

    {ws.candidates.some((c) => c.professionalId === pid) && <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4 text-xs">
      <select aria-label="Show candidates" className={`${field} !w-auto !py-1.5`} value={show} onChange={(e) => setShow(e.target.value as typeof show)}><option value="pending">Pending only</option><option value="all">All (incl. accepted/rejected)</option></select>
      <label className="flex items-center gap-2 text-slate-500">Min. match<input aria-label="Minimum match score" type="range" min={0} max={90} step={10} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} /><b>{minScore}</b></label>
      {pendingCount > 0 && <button className={`${button} !py-1 text-xs`} disabled={!canEdit(actor)} onClick={() => run("Rejected low-match candidates", (w) => ({ ...w, candidates: w.candidates.map((c) => (c.professionalId === pid && c.status === "pending" && c.matchScore < 45 ? { ...c, status: "rejected" } : c)) }))}>Reject all below 45</button>}
    </div>}

    <div className="mt-4 space-y-3">{candidates.map((c) => <CandidateCard key={c.id} c={c} disabled={!canEdit(actor)} onAccept={(pick) => {
      run("Accepted discovery candidate", (w) => acceptCandidate(w, c.id, pick), { entity: "candidate", id: c.id });
      notify(`Added as an unreviewed source${pick.suggestionIdx.length ? ` with ${pick.suggestionIdx.length} unverified claim(s)` : ""}${pick.cnrs.length ? ` and ${pick.cnrs.length} court record(s)` : ""}. Verify in the Evidence Registry.`);
    }} onReject={() => run("Rejected discovery candidate", (w) => rejectCandidate(w, c.id), { entity: "candidate", id: c.id })} />)}
      {ws.candidates.some((c) => c.professionalId === pid) && !candidates.length && <p className="text-sm text-slate-500">No candidates match the current filter.</p>}
    </div>
  </section>;
}

function CandidateCard({ c, disabled, onAccept, onReject }: { c: DiscoveryCandidate; disabled: boolean; onAccept: (pick: { suggestionIdx: number[]; cnrs: string[] }) => void; onReject: () => void }) {
  const [sel, setSel] = useState<number[]>(() => (c.matchScore >= 60 ? c.suggestions.map((_, i) => i) : []));
  const [cnrs, setCnrs] = useState<string[]>([]);
  const done = c.status !== "pending";
  return <article className={`rounded-xl border p-4 ${done ? "border-slate-100 bg-slate-50 opacity-70" : "border-slate-200"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={scoreTone(c.matchScore)} title={c.matchReasons.join("\n")}>Match {c.matchScore}/100</Badge><TierBadge tier={c.tier} />{c.loginWalled && <Badge>Login-walled · snippet only</Badge>}{!c.scraped && !c.loginWalled && <Badge>Snippet only</Badge>}{done && <Badge>{c.status}</Badge>}</div>
        <a href={c.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-all font-semibold underline decoration-slate-300 underline-offset-2">{c.title}<ExternalLink size={12} /></a>
        <p className="break-all text-xs text-slate-400">{c.url}</p>
      </div>
      {!done && <div className="flex gap-2">
        <button className={primary} disabled={disabled} onClick={() => onAccept({ suggestionIdx: sel, cnrs })}><Check size={15} />Accept{sel.length || cnrs.length ? ` (${sel.length + cnrs.length})` : " source"}</button>
        <button className={button} disabled={disabled} onClick={onReject}><X size={15} />Not this person / irrelevant</button>
      </div>}
    </div>
    {c.excerpt && <blockquote className="mt-3 border-l-2 border-[#a8c679] pl-3 text-sm text-slate-700">{c.excerpt}</blockquote>}
    <p className="mt-2 text-[11px] text-slate-500">Why: {c.matchReasons.join(" · ")}{c.note ? ` · ${c.note}` : ""}</p>
    {c.suggestions.length > 0 && <fieldset className="mt-3" disabled={done || disabled}>
      <legend className="mb-1 text-xs font-semibold">Suggested facts (become unverified claims)</legend>
      <ul className="space-y-1">{c.suggestions.map((s, i) => <li key={i}><label className="flex items-start gap-2 text-xs">
        <input type="checkbox" className="mt-0.5" checked={sel.includes(i)} onChange={(e) => setSel(e.target.checked ? [...sel, i] : sel.filter((x) => x !== i))} />
        <span><b>{CLAIM_FIELD_LABEL[s.field]}:</b> {s.value}<span className="block text-slate-400">“{s.excerpt.slice(0, 220)}{s.excerpt.length > 220 ? "…" : ""}”</span></span>
      </label></li>)}</ul>
    </fieldset>}
    {c.cnrs.length > 0 && <fieldset className="mt-3" disabled={done || disabled}>
      <legend className="mb-1 text-xs font-semibold">Court case numbers found ({c.cnrs.length}) — become unverified court records</legend>
      <div className="mb-1"><button type="button" className="text-[11px] underline" onClick={() => setCnrs(cnrs.length === c.cnrs.length ? [] : c.cnrs.map((x) => x.cnr))}>{cnrs.length === c.cnrs.length ? "Select none" : "Select all"}</button></div>
      <ul className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">{c.cnrs.map((x) => <li key={x.cnr}><label className="flex items-start gap-2 text-xs">
        <input type="checkbox" className="mt-0.5" checked={cnrs.includes(x.cnr)} onChange={(e) => setCnrs(e.target.checked ? [...cnrs, x.cnr] : cnrs.filter((y) => y !== x.cnr))} />
        <span><span className="font-mono">{x.cnr}</span>{x.title && <span className="block text-slate-500">{x.title}</span>}</span>
      </label></li>)}</ul>
    </fieldset>}
  </article>;
}
