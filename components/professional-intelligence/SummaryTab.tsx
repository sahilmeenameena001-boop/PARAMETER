"use client";

import { useMemo, useState } from "react";
import { BookOpen, Briefcase, Copy, Download, ExternalLink, Gavel, GraduationCap, Lock, Mail, MapPin, Phone, Printer, ShieldCheck } from "lucide-react";
import { buildSummary, type AdvocateSummary, type SummaryItem } from "@/lib/professional-intelligence/summary";
import { canReview } from "@/lib/professional-intelligence/access";
import { Badge, button, card, copyText, download, primary, SectionTitle } from "./ui";
import type { TabProps } from "./useWorkspace";

const statusTone = (s: string) => (s === "verified" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200");

function Item({ i, icon, href }: { i: SummaryItem; icon?: React.ReactNode; href?: string }) {
  return <li className="flex items-start gap-2 py-1.5 text-sm">
    {icon && <span className="mt-0.5 text-slate-400">{icon}</span>}
    <span className="min-w-0 flex-1">
      {href ? <a className="break-words font-medium underline decoration-slate-300 underline-offset-2" href={href}>{i.value}</a> : <span className="break-words font-medium">{i.value}</span>}
      {i.label && i.label !== i.value && <span className="ml-1 text-xs text-slate-400">({i.label})</span>}
      <span className="ml-2 inline-flex flex-wrap gap-1 align-middle"><Badge tone={statusTone(i.status)}>{i.status}</Badge>{i.basis === "inferred" && <Badge tone="bg-violet-50 text-violet-800 ring-violet-200">inferred</Badge>}</span>
      {i.sources.length > 0 && <span className="block text-[11px] text-slate-400">Source: {i.sources.map((s, n) => <a key={n} href={s.url} target="_blank" rel="noopener noreferrer" className="mr-2 underline">Tier {s.tier} · {s.title.slice(0, 50)}</a>)}</span>}
    </span>
  </li>;
}

function Block({ title, icon, items, empty = "Not recorded", hrefFor, itemIcon }: { title: string; icon: React.ReactNode; items: SummaryItem[]; empty?: string; hrefFor?: (i: SummaryItem) => string; itemIcon?: React.ReactNode }) {
  return <div>
    <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{icon}{title}</h3>
    {items.length ? <ul>{items.map((i, n) => <Item key={n} i={i} href={hrefFor?.(i)} icon={itemIcon} />)}</ul> : <p className="py-1.5 text-sm text-slate-400">{empty}</p>}
  </div>;
}

export function summaryAsText(s: AdvocateSummary) {
  const line = (label: string, items: SummaryItem[]) => (items.length ? `${label}: ${items.map((i) => `${i.value}${i.status !== "verified" ? " [unverified]" : ""}`).join("; ")}` : "");
  return [
    s.name,
    s.profession ? `${s.profession.value}${s.location ? ` · ${s.location.value}` : ""}` : s.location?.value ?? "",
    "", s.narrative, "",
    line("Office", s.officeAddresses), line("Email", s.emails), line("Phone", s.phones),
    line("Firm / affiliation", s.affiliations), line("Roles", s.roles), line("Education", s.education),
    s.enrolment ? `Bar enrolment: ${s.enrolment.value}${s.enrolment.status !== "verified" ? " [unverified]" : ""}` : "",
    line("Practice areas", s.practiceAreas),
    s.publications.length ? `Publications: ${s.publications.map((p) => `${p.title}${p.identifier ? ` (${p.identifier})` : ""}`).join("; ")}` : "",
    `Court records: ${s.litigation.records} (${s.litigation.pending} pending, ${s.litigation.disposed} disposed, ${s.litigation.outcomesVerified} outcomes reviewed)`,
    line("Profiles", s.profileLinks),
    "", s.disclaimer,
  ].filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n");
}

export default function SummaryTab({ ws, pid, actor, notify, goTo }: TabProps) {
  const [includeUnverified, setIncludeUnverified] = useState(true);
  const [photoFailed, setPhotoFailed] = useState(false);
  const s = useMemo(() => buildSummary(ws, pid, actor, { includeUnverified }), [ws, pid, actor, includeUnverified]);
  const initials = s.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const photoOk = s.photo && /^https?:\/\//.test(s.photo.value) && !photoFailed;
  const apiExample = `POST /api/professional-intelligence/summary\n{ "professionalId": "${pid}", "includeUnverified": ${includeUnverified}, "workspace": <Export JSON> }`;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={includeUnverified} onChange={(e) => setIncludeUnverified(e.target.checked)} />Include unverified leads (labelled)</label>
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={async () => notify((await copyText(summaryAsText(s))) ? "Summary copied." : "Copy unavailable.")}><Copy size={15} />Copy text</button>
        <button className={button} onClick={() => download(`${s.name.replace(/\s+/g, "-").toLowerCase()}-summary.json`, JSON.stringify(s, null, 2), "application/json")}><Download size={15} />JSON</button>
        <button className={primary} onClick={() => window.print()}><Printer size={15} />Print / PDF</button>
      </div>
    </div>

    <article className={`${card} print:border-0 print:p-0`}>
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="shrink-0">
          {photoOk
            ? <img src={s.photo!.value} alt={`Photo of ${s.name}`} referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} className="h-36 w-36 rounded-2xl object-cover ring-1 ring-slate-200" />
            : <div className="grid h-36 w-36 place-items-center rounded-2xl bg-[#172c26] text-3xl font-semibold text-[#d9ef79]" aria-label="No photo">{initials}</div>}
          {s.photo ? <p className="mt-2 max-w-36 text-[11px] text-slate-400"><Badge tone={statusTone(s.photo.status)}>photo {s.photo.status}</Badge>{photoFailed && <span className="block">Image could not load.</span>}</p>
            : <button className="mt-2 text-[11px] underline print:hidden" onClick={() => goTo("Professional DNA")}>Add photo (Add claim → Photo)</button>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-3xl font-semibold tracking-tight">{s.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
            {s.profession && <span>{s.profession.value} <Badge tone={statusTone(s.profession.status)}>{s.profession.status}</Badge></span>}
            {s.location && <span className="inline-flex items-center gap-1"><MapPin size={14} />{s.location.value} <Badge tone={statusTone(s.location.status)}>{s.location.status}</Badge></span>}
            {s.enrolment && <span className="text-sm">Enrolment {s.enrolment.value} <Badge tone={statusTone(s.enrolment.status)}>{s.enrolment.status}</Badge></span>}
          </p>
          <p className="mt-4 leading-7 text-slate-700">{s.narrative || "No facts recorded yet."}</p>
          <div className="mt-3 flex flex-wrap gap-2"><Badge>{s.completeness.verified} of {s.completeness.total} facts verified</Badge>{s.includesUnverified && <Badge tone="bg-amber-50 text-amber-800 ring-amber-200">Includes unverified leads</Badge>}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 border-t pt-6 md:grid-cols-2">
        <section className="space-y-4">
          <Block title="Office address" icon={<MapPin size={13} />} items={s.officeAddresses} />
          <Block title="Email" icon={<Mail size={13} />} items={s.emails} hrefFor={(i) => `mailto:${i.value}`} />
          <Block title="Phone" icon={<Phone size={13} />} items={s.phones} hrefFor={(i) => `tel:${i.value.replace(/[^\d+]/g, "")}`} />
          {s.otherContacts.length > 0 && <Block title="Other contact notes" icon={<Phone size={13} />} items={s.otherContacts} />}
          {s.contactsWithheld > 0 && <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><Lock size={14} className="mt-0.5 shrink-0" />{s.contactsWithheld} restricted contact item(s) hidden for your role ({actor.role.replace("_", " ")}).{!canReview(actor) && " Switch “Acting as” to Legal reviewer or Admin to see them."}</p>}
          <Block title="Profiles" icon={<ExternalLink size={13} />} items={s.profileLinks} hrefFor={(i) => i.value} />
        </section>
        <section className="space-y-4">
          <Block title="Firm / affiliations" icon={<Briefcase size={13} />} items={s.affiliations} />
          {s.roles.length > 0 && <Block title="Roles & appointments" icon={<ShieldCheck size={13} />} items={s.roles} />}
          <Block title="Education" icon={<GraduationCap size={13} />} items={[...s.education, ...s.credentials]} />
          <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Practice areas</h3>
            {s.practiceAreas.length ? <div className="flex flex-wrap gap-1.5">{s.practiceAreas.map((p, n) => <Badge key={n} tone={statusTone(p.status)}>{p.value}{p.basis === "inferred" ? " · inferred" : ""}</Badge>)}</div> : <p className="text-sm text-slate-400">Not recorded</p>}</div>
          <div><h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><BookOpen size={13} />Publications</h3>
            {s.publications.length ? <ul className="text-sm">{s.publications.map((p, n) => <li key={n} className="py-1"><span className="font-medium">{p.title}</span> <span className="text-slate-500">— {p.publisher}{p.identifier ? `, ${p.identifier}` : ""}</span> <Badge tone={statusTone(p.status)}>{p.status}</Badge></li>)}</ul> : <p className="text-sm text-slate-400">Not recorded</p>}</div>
          <div><h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Gavel size={13} />Court records</h3>
            <p className="text-sm">{s.litigation.records} record(s) · {s.litigation.underlyingMatters} matter(s) · {s.litigation.pending} pending · {s.litigation.disposed} disposed · {s.litigation.outcomesVerified} outcome(s) reviewed</p>
            {s.litigation.byCategory.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">{s.litigation.byCategory.slice(0, 6).map((c) => <Badge key={c.category}>{c.category}: {c.count}</Badge>)}</div>}
            <p className="mt-1 text-[11px] text-slate-400">{s.litigation.note}</p></div>
        </section>
      </div>
      <p className="mt-6 border-t pt-3 text-[11px] text-slate-400">{s.disclaimer} Generated {new Date(s.generatedAt).toLocaleString("en-IN")}.</p>
    </article>

    <section className={`${card} print:hidden`}>
      <SectionTitle title="Summary API">Other systems can request this summary as JSON. Contacts are filtered by role; unverified items are excluded unless requested.</SectionTitle>
      <pre className="overflow-x-auto rounded-xl bg-slate-50 p-3 text-xs">{apiExample}</pre>
      <p className="mt-2 text-xs text-slate-500">Live (Supabase) version: <code>GET /api/professional-intelligence/professionals/&lt;id&gt;/summary?includeUnverified=1</code></p>
    </section>
  </div>;
}
