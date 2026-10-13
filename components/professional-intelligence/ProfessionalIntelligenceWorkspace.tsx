"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, BookOpen, CalendarDays, Database, Download, Fingerprint, Gavel, IdCard, LayoutDashboard, Lightbulb, RotateCcw, Search, Settings, Upload } from "lucide-react";
import SettingsModal from "./SettingsModal";
import SummaryTab from "./SummaryTab";
import { blankWorkspace, seedWorkspace } from "@/lib/professional-intelligence/seed";
import { buildResearchProfile, classifyUrl } from "@/lib/professional-intelligence/research";
import { TIER_LABEL } from "@/lib/professional-intelligence/constants";
import CalendarTab from "./CalendarTab";
import ClipReceiver from "./ClipReceiver";
import ContentStrategyTab from "./ContentStrategyTab";
import EvidenceTab from "./EvidenceTab";
import LitigationTab from "./LitigationTab";
import OverviewTab from "./OverviewTab";
import PerformanceTab from "./PerformanceTab";
import ProfileTab from "./ProfileTab";
import PublicationsTab from "./PublicationsTab";
import { button, download, field, label, Labeled, Modal, primary } from "./ui";
import { parseWorkspace, TABS, type Tab, useWorkspace } from "./useWorkspace";

const ICONS = [LayoutDashboard, IdCard, Fingerprint, Database, Gavel, BookOpen, Lightbulb, CalendarDays, BarChart3];
const INTRO: Record<Tab, string> = {
  "Overview": "Evidence-backed authority, at a glance.",
  "Summary": "Profile card: photo, contacts, firm, practice and records — each with its source and status.",
  "Professional DNA": "Every fact linked to a source and a verification state.",
  "Evidence Registry": "Sources, tiers and verification history.",
  "Litigation Intelligence": "Court records — volume, status and reviewed outcomes kept separate.",
  "Publications": "Books, articles and authority assets.",
  "Content Strategy": "Pillars, ideas, scoring and the human review gate.",
  "Editorial Calendar": "Planned slots and approved schedule.",
  "Performance": "Recorded metrics only.",
};

export default function ProfessionalIntelligenceWorkspace() {
  const { ws, setWs, ready, notice, setNotice, notify, run } = useWorkspace();
  const [tab, setTab] = useState<Tab>("Overview");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [researching, setResearching] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Other components (e.g. the Auto-discover setup box) open Settings via this event.
  useEffect(() => { const open = () => setSettingsOpen(true); window.addEventListener("pi-open-settings", open); return () => window.removeEventListener("pi-open-settings", open); }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const actor = ws.members.find((m) => m.id === ws.currentUserId) ?? ws.members[0];
  const pid = ws.professionals.some((p) => p.id === ws.activeProfessionalId) ? ws.activeProfessionalId : ws.professionals[0]?.id ?? "";
  const professional = ws.professionals.find((p) => p.id === pid);
  const goTo = useCallback((t: Tab, id?: string) => { setTab(t); setFocusId(id ?? null); window.scrollTo({ top: 0 }); }, []);
  const props = { ws, pid, actor, run, notify, goTo, focusId };

  return <div className="min-h-screen bg-[#f6f7f9] text-[#172c26]">
    <a href="#pi-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">Skip to content</a>
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-white p-6 lg:flex">
      <a href="/" className="flex items-center gap-3 text-lg font-bold"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#172c26] text-sm text-[#d9ef79]">scl.</span>Authority Intelligence</a>
      <button className={`${primary} mt-8 w-full`} onClick={() => setResearching(true)}><Search size={15} />New research</button>
      <p className="mb-3 mt-8 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">Workspace</p>
      <nav aria-label="Professional intelligence sections" className="space-y-1">{TABS.map((t, i) => { const Icon = ICONS[i]; return <button key={t} disabled={!pid} aria-current={tab === t ? "page" : undefined} onClick={() => goTo(t)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm disabled:opacity-40 ${tab === t ? "bg-[#edf3e5] font-semibold" : "text-slate-500 hover:bg-slate-50"}`}><Icon size={17} />{t}</button>; })}</nav>
      <div className="mt-auto rounded-2xl bg-[#f6f7f2] p-4"><span className="text-xs font-semibold">Local workspace</span><p className="mt-2 text-xs leading-5 text-slate-500">Saved in this browser. Export regularly to keep a backup.</p><a href="/" className="mt-3 block text-xs font-semibold underline">← Brand transformation demo</a></div>
    </aside>

    <div className="lg:ml-64">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3 md:px-8">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {ws.professionals.length > 0 && <><label className="sr-only" htmlFor="pi-professional">Professional</label>
            <select id="pi-professional" className={`${field} !w-auto !py-1.5`} value={pid} onChange={(e) => setWs((w) => ({ ...w, activeProfessionalId: e.target.value }))}>{ws.professionals.map((p) => <option key={p.id} value={p.id}>{p.displayName}{p.isExample ? " (example)" : ""}</option>)}</select></>}
          <button className={`${button} !py-1.5 lg:hidden`} onClick={() => setResearching(true)}><Search size={14} />New research</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-500">Acting as<select aria-label="Demo role" className={`${field} !w-auto !py-1.5`} value={ws.currentUserId} onChange={(e) => setWs((w) => ({ ...w, currentUserId: e.target.value }))}>{ws.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <span className="rounded-full bg-lime-100 px-2.5 py-1 text-[11px] font-medium" title="Role switching simulates permissions locally. In production, roles come from the server session.">Demo roles</span>
        </div>
      </header>

      <main id="pi-main" className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-1 text-xs font-semibold uppercase tracking-[.15em] text-slate-400">{professional ? `${professional.displayName}${professional.isExample ? " · example profile" : ""}` : "No profile selected"} · Professional authority intelligence</p><h1 className="text-3xl font-semibold tracking-tight">{pid ? tab : "Start your research"}</h1><p className="mt-1 text-sm text-slate-500">{pid ? INTRO[tab] : "Create a research profile for any professional."}</p></div>
          <div className="flex flex-wrap gap-2">
            <button className={button} onClick={() => setSettingsOpen(true)}><Settings size={15} />Settings</button>
            <button className={button} onClick={() => setResetOpen(true)}><RotateCcw size={15} />Reset</button>
            <button className={button} onClick={() => fileRef.current?.click()}><Upload size={15} />Import</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import workspace JSON" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { setWs(parseWorkspace(await file.text())); notify("Workspace imported."); } catch (err) { notify(err instanceof Error ? err.message : "Import failed.", "error"); } }} />
            <button className={primary} onClick={() => { download(`professional-intelligence-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(ws, null, 2), "application/json"); notify("Workspace exported."); }}><Download size={15} />Export</button>
          </div>
        </div>
        {pid && <nav aria-label="Sections" className="flex gap-2 overflow-x-auto pb-1 lg:hidden">{TABS.map((t) => <button key={t} onClick={() => goTo(t)} className={`${button} shrink-0 ${tab === t ? "!bg-[#d9ef79]" : ""}`}>{t}</button>)}</nav>}
        {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-green-200 bg-green-50"}`}><span>{notice.text}</span><button aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div>}

        {!ready ? <p className="text-slate-500">Loading workspace…</p> : !pid ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Search className="mx-auto text-slate-400" size={28} />
          <h2 className="mt-4 text-xl font-semibold">No professional yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">Enter a name and any links you already have (LinkedIn, court directory, firm page, publisher page). Everything starts unverified; you then review sources and claims.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2"><button className={primary} onClick={() => setResearching(true)}><Search size={15} />Start new research</button><button className={button} onClick={() => { setWs(seedWorkspace()); notify("Example profile loaded."); }}>Load the example profile</button></div>
        </section> : <>
          {tab === "Overview" && <OverviewTab {...props} />}
          {tab === "Summary" && <SummaryTab {...props} />}
          {tab === "Professional DNA" && <ProfileTab {...props} />}
          {tab === "Evidence Registry" && <EvidenceTab {...props} />}
          {tab === "Litigation Intelligence" && <LitigationTab {...props} />}
          {tab === "Publications" && <PublicationsTab {...props} />}
          {tab === "Content Strategy" && <ContentStrategyTab {...props} />}
          {tab === "Editorial Calendar" && <CalendarTab {...props} />}
          {tab === "Performance" && <PerformanceTab {...props} />}
        </>}
        <p className="pt-4 text-center text-[11px] text-slate-400">SCL · Professional authority intelligence · Informational content only, subject to human legal review · Research leads are not verified facts</p>
      </main>
    </div>

    <ClipReceiver ready={ready} {...{ ws, run, notify, goTo }} />
    {resetOpen && <Modal title="Reset workspace?" onClose={() => setResetOpen(false)}>
      <p className="text-sm text-slate-600">All local data in this browser (profiles, sources, reviews, drafts, metrics) will be replaced. Export first if you need a backup.</p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button className={button} onClick={() => setResetOpen(false)}>Cancel</button>
        <button className={button} onClick={() => { setWs(seedWorkspace()); setResetOpen(false); goTo("Overview"); notify("Workspace reset to the example profile."); }}>Reset to example</button>
        <button className={`${primary} !bg-red-700 hover:!bg-red-800`} onClick={() => { setWs(blankWorkspace()); setResetOpen(false); goTo("Overview"); notify("Workspace cleared. Start new research."); }}>Clear everything</button>
      </div>
    </Modal>}
    {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} notify={notify} />}
    {researching && <ResearchWizard onClose={() => setResearching(false)} onCreate={(input) => {
      try {
        const r = buildResearchProfile(input);
        run("Started research profile", (w) => ({ ...w, professionals: [...w.professionals, r.professional], sources: [...r.sources, ...w.sources], claims: [...w.claims, ...r.claims], pillars: [...w.pillars, ...r.pillars], activeProfessionalId: r.professional.id }), { entity: "professional", id: r.professional.id });
        goTo("Professional DNA");
        notify(`${r.professional.displayName}: profile created with ${r.sources.length} source(s) and ${r.claims.length} unverified claim(s).${r.errors.length ? ` Skipped: ${r.errors.join("; ")}` : ""} Next: open each source, record the excerpt and verify.`, r.errors.length ? "error" : "ok");
        return true;
      } catch (e) { notify(e instanceof Error ? e.message : "Could not create profile.", "error"); return false; }
    }} />}
  </div>;
}

function ResearchWizard({ onClose, onCreate }: { onClose: () => void; onCreate: (input: { name: string; profession: string; location: string; aliases: string[]; urls: string[] }) => boolean }) {
  const [f, setF] = useState({ name: "", profession: "Advocate", location: "", aliases: "", urls: "" });
  const urls = f.urls.split(/\s+/).map((u) => u.trim()).filter(Boolean);
  const preview = urls.map((u) => { try { return { url: u, c: classifyUrl(u) }; } catch { return { url: u, c: null }; } });
  return <Modal title="New research profile" onClose={onClose} wide>
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return; if (onCreate({ name: f.name, profession: f.profession, location: f.location, aliases: f.aliases.split(",").map((a) => a.trim()).filter(Boolean), urls })) onClose(); }}>
      <Labeled text="Full name *"><input required className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} placeholder="e.g. Priya Sharma" /></Labeled>
      <Labeled text="Profession"><input className={field} value={f.profession} onChange={(e) => setF({ ...f, profession: e.target.value })} maxLength={120} /></Labeled>
      <Labeled text="Professional location"><input className={field} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={120} placeholder="e.g. New Delhi" /></Labeled>
      <Labeled text="Other names / spellings (comma-separated)"><input className={field} value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} /></Labeled>
      <Labeled text="Known links — one per line (LinkedIn, eCourtsIndia, court PDF, firm page, publisher page…)" className="md:col-span-2"><textarea className={`${field} font-mono text-xs`} rows={5} value={f.urls} onChange={(e) => setF({ ...f, urls: e.target.value })} placeholder={"https://www.linkedin.com/in/...\nhttps://ecourtsindia.com/lawyer/...\nhttps://example-firm.com/team/..."} /></Labeled>
      {preview.length > 0 && <ul className="space-y-1 rounded-xl bg-slate-50 p-3 text-xs md:col-span-2">{preview.map((p) => <li key={p.url} className="break-all">{p.c ? <><b>{TIER_LABEL[p.c.tier]}</b> · {label(p.c.sourceType)}{p.c.loginWalled ? " · login-walled (manual review)" : ""} — {p.url}</> : <span className="text-red-700">Invalid URL — {p.url}</span>}</li>)}</ul>}
      <p className="text-xs text-slate-500 md:col-span-2">Everything is created as <b>unverified</b>. The tier is suggested from the domain and must be confirmed. No page is fetched until you click “Fetch details” on a source; login-walled sites are never fetched.</p>
      <div className="flex justify-end gap-2 md:col-span-2"><button type="button" className={button} onClick={onClose}>Cancel</button><button className={primary}><Search size={15} />Create research profile</button></div>
    </form>
  </Modal>;
}
