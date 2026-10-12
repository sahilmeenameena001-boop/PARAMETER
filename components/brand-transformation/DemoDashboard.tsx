"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, CheckCircle2, ClipboardList, Download, LayoutDashboard, Palette, Plus, RotateCcw, Search, Sparkles, Target } from "lucide-react";
import { calculateMetrics } from "@/lib/brand-transformation/scoring";
import { buildCreativePrompt } from "@/lib/brand-transformation/prompts";
import type { AuditFinding, BrandToken, TransformationTask, TaskStatus } from "@/types/brand-transformation";

const storageKey = "scl-interactive-demo-v1";
const tabs = ["Overview", "Audit findings", "Execution board", "Brand system", "Prompt studio"] as const;
type Tab = typeof tabs[number];
type Workspace = { findings: AuditFinding[]; tasks: TransformationTask[]; tokens: BrandToken[] };
function seed(): Workspace {
  const entries = [
    ["Visual identity", "Logo consistency", 5, 9, "high", "Logo proportions and spacing vary across social and print.", "Create a master logo kit with clear-space rules"],
    ["Digital experience", "Website hierarchy", 4, 9, "critical", "The homepage does not make the editorial proposition clear.", "Redesign the homepage with a clear editorial hierarchy"],
    ["Brand voice", "Editorial tone", 7, 9, "medium", "Strong stories need a more consistent voice across channels.", "Write a tone-of-voice guide with headline examples"],
    ["Visual identity", "Colour palette", 6, 8, "medium", "Campaigns use too many competing accent colours.", "Standardise the approved colour palette across templates"],
    ["Content", "Social templates", 4, 8, "high", "Social posts lack a recognisable and repeatable layout.", "Design three reusable social post templates"],
  ] as const;
  return {
    findings: entries.map((e, i) => ({ id: `finding-${i}`, audit_id: "demo-audit", category: e[0], element: e[1], current_score: e[2], target_score: e[3], weight: 1, severity: e[4], observation: e[5], issues: [e[5]], recommendations: [e[6]], status: "open" })),
    tasks: [{ id: "task-seed", client_id: "demo", finding_id: null, title: "Collect existing brand assets", description: "Gather logos, fonts and recent campaign artwork.", priority: "medium", status: "done", output_required: null, due_date: null }],
    tokens: [
      { id: "colour", client_id: "demo", token_type: "colour", name: "Editorial palette", value: { ink: "#172c26", paper: "#f7f8f2", accent: "#d9ef79" }, status: "approved" },
      { id: "type", client_id: "demo", token_type: "typography", name: "Typography", value: { heading: "Georgia", body: "Arial" }, status: "approved" },
      { id: "photo", client_id: "demo", token_type: "photography", name: "Photography direction", value: { style: "Natural light, documentary portraits, authentic editorial moments" }, status: "draft" },
    ],
  };
}
const statuses: TaskStatus[] = ["backlog", "todo", "in_progress", "review", "done"];
const label = (s: string) => s.replaceAll("_", " ");
const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-40";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#172c26] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#294b3e] disabled:opacity-40";
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm";

export default function DemoDashboard() {
  const [workspace, setWorkspace] = useState<Workspace>(seed);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("Overview");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [taskTitle, setTaskTitle] = useState("");
  const [headline, setHeadline] = useState("A new chapter for The Page");
  const [standfirst, setStandfirst] = useState("Independent stories. A distinct perspective.");
  const [footer, setFooter] = useState("Explore the latest issue");
  const [prompt, setPrompt] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.findings) && Array.isArray(parsed.tasks) && Array.isArray(parsed.tokens)) setWorkspace(parsed);
      }
    } catch { setNotice("Saved demo could not be loaded. Starting with sample data."); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) try { localStorage.setItem(storageKey, JSON.stringify(workspace)); } catch { setNotice("Browser storage is unavailable. Changes will last for this session only."); }
  }, [workspace, ready]);
  const metrics = calculateMetrics(workspace.findings, workspace.tasks);
  const completion = workspace.tasks.length ? Math.round(metrics.completedTasks / metrics.totalTasks * 100) : 0;
  const filtered = workspace.findings.filter(f => (filter === "all" || f.status === filter) && `${f.element} ${f.observation}`.toLowerCase().includes(query.toLowerCase()));
  function createTask(finding: AuditFinding) {
    setWorkspace(w => {
      if (w.tasks.some(t => t.finding_id === finding.id)) return w;
      return { ...w, findings: w.findings.map(f => f.id === finding.id ? { ...f, status: "accepted" } : f), tasks: [...w.tasks, ...finding.recommendations.map(title => ({ id: crypto.randomUUID(), client_id: "demo", finding_id: finding.id, title, description: finding.observation, priority: finding.severity, status: "todo" as const, output_required: null, due_date: null }))] };
    });
    setNotice("Recommendation added to the execution board.");
  }
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "the-page-demo.json"; a.click(); URL.revokeObjectURL(url);
    setNotice("Workspace exported.");
  }
  return <div className="min-h-screen bg-[#f6f7f9] text-[#172c26]">
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-white p-6 lg:flex">
      <a href="/" className="flex items-center gap-3 text-xl font-bold"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#172c26] text-sm text-[#d9ef79]">scl.</span>Studio workspace</a>
      <p className="mb-3 mt-12 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">Workspace</p>
      <nav className="space-y-2">{tabs.map((t,i) => { const Icon = [LayoutDashboard, ClipboardList, CheckCircle2, Palette, Sparkles][i]; return <button key={t} onClick={() => setTab(t)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${tab === t ? "bg-[#edf3e5] font-semibold" : "text-slate-500 hover:bg-slate-50"}`}><Icon size={18}/>{t}</button>; })}</nav>
      <p className="mb-3 mt-8 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">Modules</p>
      <a href="/dashboard/professional-intelligence" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500 hover:bg-slate-50"><ArrowUpRight size={18}/>Authority intelligence</a>
      <div className="mt-auto rounded-2xl bg-[#f6f7f2] p-4"><span className="text-xs font-semibold">Your testing workspace</span><p className="mt-2 text-xs leading-5 text-slate-500">Try the full workflow. Changes are saved in this browser.</p><span className="mt-4 inline-block rounded-full bg-[#d9ef79] px-2 py-1 text-[10px] font-bold uppercase">Demo mode</span></div>
    </aside>
    <div className="lg:ml-60">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-4 md:px-9"><div className="text-sm text-slate-400">Workspaces <span className="mx-2">/</span> <span className="font-medium text-[#172c26]">The Page</span></div><div className="flex items-center gap-3"><span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-medium">Sample workspace</span><span className="grid h-9 w-9 place-items-center rounded-full bg-[#172c26] text-xs text-white">TP</span></div></header>
      <main className="mx-auto max-w-[1500px] space-y-7 p-5 md:p-9">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.15em] text-slate-400">Brand transformation</p><h1 className="text-3xl font-semibold tracking-tight">{tab === "Overview" ? "A stronger brand starts here." : tab}</h1><p className="mt-2 text-sm text-slate-500">The Page · From local publication to a distinctive editorial brand</p></div><div className="flex gap-2"><button className={button} onClick={() => setResetOpen(true)}><RotateCcw size={15}/>Reset demo</button><button className={primary} onClick={exportData}><Download size={15}/>Export</button></div></div>
        <nav aria-label="Dashboard sections" className="flex gap-2 overflow-x-auto lg:hidden">{tabs.map(t => <button key={t} onClick={() => setTab(t)} className={`${button} shrink-0 ${tab === t ? "!bg-[#d9ef79]" : ""}`}>{t}</button>)}</nav>
        {notice && <div role="status" className="flex items-center justify-between gap-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
        {!ready ? <p>Loading your demo workspace…</p> : <>
        {tab === "Overview" && <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Brand health", `${metrics.currentScore}`, "/ 10", "Current weighted audit score"], ["Target score", `${metrics.targetScore}`, "/ 10", `${metrics.transformationGap} points to close`], ["Open findings", `${metrics.openFindings}`, "", "Opportunities to improve"], ["Tasks completed", `${metrics.completedTasks}`, `/ ${metrics.totalTasks}`, `${completion}% of the execution plan`]].map(([title,value,unit,note]) => <div key={title} className="rounded-2xl border border-slate-200/70 bg-white p-5"><p className="text-sm text-slate-500">{title}</p><p className="my-4 text-4xl font-semibold tracking-tight">{value}<span className="ml-2 text-lg font-normal text-slate-400">{unit}</span></p><p className="text-xs text-slate-400">{note}</p></div>)}</section>
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]"><section className="rounded-2xl bg-[#172c26] p-7 text-white"><span className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-widest text-[#d9ef79]">Your transformation plan</span><h2 className="mt-7 max-w-md text-3xl font-medium leading-tight">Turn brand insights<br/>into meaningful action.</h2><p className="mt-3 max-w-md text-sm leading-6 text-white/60">Review the audit, approve recommendations and move work forward. Everything here is ready to try.</p><button className="mt-7 inline-flex items-center gap-3 rounded-xl bg-[#d9ef79] px-4 py-3 text-sm font-semibold text-[#172c26]" onClick={() => setTab("Audit findings")}>Review audit findings <ArrowUpRight size={17}/></button></section><section className="rounded-2xl border bg-white p-6"><div className="flex justify-between"><h2 className="font-semibold">Brand scorecard</h2><Target size={18} className="text-slate-400"/></div><div className="mt-6 space-y-5">{workspace.findings.map(f => <div key={f.id}><div className="mb-2 flex justify-between text-xs"><span>{f.element}</span><span className="font-semibold">{f.current_score}<span className="text-slate-400"> / {f.target_score}</span></span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#a8c679]" style={{width: `${f.current_score * 10}%`}}/></div></div>)}</div></section></div>
          <section className="rounded-2xl border bg-white p-6"><div className="flex items-center justify-between"><h2 className="font-semibold">Next up</h2><button onClick={() => setTab("Execution board")} className="text-xs font-semibold">View execution board →</button></div>{workspace.findings.filter(f => !workspace.tasks.some(t => t.finding_id === f.id)).slice(0,3).map(f => <div key={f.id} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><p className="text-sm font-medium">{f.recommendations[0]}</p><p className="mt-1 text-xs text-slate-400">{f.category} · {f.severity} priority</p></div><button className={button} onClick={() => createTask(f)}><Plus size={14}/>Create task</button></div>)}{workspace.findings.every(f => workspace.tasks.some(t => t.finding_id === f.id)) && <p className="mt-4 text-sm text-slate-500">All recommendations are on your execution board.</p>}</section>
        </>}
        {tab === "Audit findings" && <section className="rounded-2xl border bg-white p-5"><div className="mb-6 flex flex-wrap gap-3"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input aria-label="Search findings" placeholder="Search findings…" className={`${field} pl-9`} value={query} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="Filter finding status" className={`${field} !w-auto`} value={filter} onChange={e=>setFilter(e.target.value)}>{["all","open","accepted","rejected","resolved"].map(s=><option key={s} value={s}>{label(s)}</option>)}</select></div>{filtered.map(f => <article key={f.id} className="grid gap-5 border-t py-6 md:grid-cols-[1fr_220px]"><div><div className="flex items-center gap-3"><h2 className="font-semibold">{f.element}</h2><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${f.severity === "critical" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{f.severity}</span></div><p className="mt-2 text-sm text-slate-500">{f.observation}</p><p className="mt-3 text-sm">↗ {f.recommendations[0]}</p><label className="mt-4 flex items-center gap-3 text-xs text-slate-500">Current score: {f.current_score}/10<input aria-label={`${f.element} score`} type="range" min="0" max="10" value={f.current_score} onChange={e=>setWorkspace(w=>({...w,findings:w.findings.map(item=>item.id === f.id ? {...item,current_score:Number(e.target.value)} : item)}))}/><span>Target {f.target_score}</span></label></div><div className="space-y-3"><select aria-label={`${f.element} status`} className={field} value={f.status} onChange={e=>setWorkspace(w=>({...w,findings:w.findings.map(item=>item.id === f.id ? {...item,status:e.target.value as AuditFinding["status"]} : item)}))}>{["open","accepted","rejected","resolved"].map(s=><option key={s}>{s}</option>)}</select><button className={`${primary} w-full`} disabled={workspace.tasks.some(t=>t.finding_id===f.id) || f.status === "rejected" || f.status === "resolved"} onClick={()=>createTask(f)}>{workspace.tasks.some(t=>t.finding_id===f.id) ? <><Check size={15}/>Task created</> : <><Plus size={15}/>Accept & create task</>}</button></div></article>)}{!filtered.length && <p className="py-8 text-center text-slate-400">No findings match your search.</p>}</section>}
        {tab === "Execution board" && <><form className="flex gap-3" onSubmit={e=>{e.preventDefault();if(!taskTitle.trim())return;setWorkspace(w=>({...w,tasks:[...w.tasks,{id:crypto.randomUUID(),client_id:"demo",finding_id:null,title:taskTitle.trim(),description:null,priority:"medium",status:"todo",output_required:null,due_date:null}]}));setTaskTitle("");setNotice("Task added.");}}><input aria-label="New task title" className={field} placeholder="Add a task to your plan…" value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} maxLength={200}/><button className={`${primary} shrink-0`} disabled={!taskTitle.trim()}><Plus size={15}/>Add task</button></form><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{statuses.map(status=><section key={status} className="min-h-52 rounded-2xl bg-slate-100 p-3"><h2 className="mb-4 flex justify-between px-1 text-xs font-semibold capitalize">{label(status)}<span className="text-slate-400">{workspace.tasks.filter(t=>t.status===status).length}</span></h2>{workspace.tasks.filter(t=>t.status===status).map(t=><article key={t.id} className="mb-3 rounded-xl border bg-white p-4 shadow-sm"><span className="text-[10px] uppercase text-amber-700">{t.priority}</span><p className="mb-4 mt-2 text-sm font-medium leading-6">{t.title}</p><select aria-label={`Status for ${t.title}`} className={`${field} !px-2 !text-xs`} value={t.status} onChange={e=>setWorkspace(w=>({...w,tasks:w.tasks.map(item=>item.id===t.id?{...item,status:e.target.value as TaskStatus}:item)}))}>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></article>)}{!workspace.tasks.some(t=>t.status===status)&&<p className="p-3 text-xs text-slate-400">No tasks here yet.</p>}</section>)}</div></>}
        {tab === "Brand system" && <><p className="text-sm text-slate-500">Edit the brand rules and approve them to include them in generated prompts.</p><div className="grid gap-5 lg:grid-cols-3">{workspace.tokens.map(token=><section key={token.id} className="rounded-2xl border bg-white p-6"><Palette className="mb-5 text-slate-400" size={22}/><h2 className="font-semibold">{token.name}</h2><p className="mb-5 mt-1 text-xs capitalize text-slate-400">{token.token_type}</p><div className="space-y-4">{Object.entries(token.value).map(([key,value])=><label key={key} className="block text-xs capitalize text-slate-500">{key}<div className="mt-2 flex gap-2">{token.token_type === "colour" && <input aria-label={`${key} colour picker`} type="color" value={String(value)} className="h-10 w-12" onChange={e=>{setPrompt("");setWorkspace(w=>({...w,tokens:w.tokens.map(t=>t.id===token.id?{...t,value:{...t.value,[key]:e.target.value}}:t)}));}}/>}<input aria-label={`${token.name} ${key}`} className={field} value={String(value)} onChange={e=>{setPrompt("");setWorkspace(w=>({...w,tokens:w.tokens.map(t=>t.id===token.id?{...t,value:{...t.value,[key]:e.target.value}}:t)}));}}/></div></label>)}</div><label className="mt-5 block text-xs text-slate-500">Approval status<select aria-label={`${token.name} approval status`} className={`${field} mt-2`} value={token.status} onChange={e=>{setPrompt("");setWorkspace(w=>({...w,tokens:w.tokens.map(t=>t.id===token.id?{...t,status:e.target.value as BrandToken["status"]}:t)}));}}>{["draft","approved","retired"].map(s=><option key={s}>{s}</option>)}</select></label></section>)}</div></>}
        {tab === "Prompt studio" && <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border bg-white p-6"><Sparkles className="mb-4"/><h2 className="text-xl font-semibold">Create your next brand creative</h2><p className="mb-6 mt-2 text-sm leading-6 text-slate-500">Build a prompt from your approved rules. This demo uses a local template and does not call an AI service.</p><form className="space-y-4" onSubmit={e=>{e.preventDefault();setPrompt(buildCreativePrompt({clientName:"The Page",positioning:"A distinctive independent editorial brand",content:{headline,standfirst,footer},tokens:workspace.tokens}));setNotice("Prompt generated from your approved brand rules.");}}>{[["Headline",headline,setHeadline],["Standfirst",standfirst,setStandfirst],["Footer / CTA",footer,setFooter]].map(([name,value,setter])=><label key={String(name)} className="block text-xs text-slate-500">{String(name)}<input className={`${field} mt-2`} value={String(value)} onChange={e=>{(setter as (value:string)=>void)(e.target.value);setPrompt("");}}/></label>)}<button className={primary} disabled={!headline.trim()||!workspace.tokens.some(t=>t.status==="approved")}><Sparkles size={15}/>Generate prompt</button>{!workspace.tokens.some(t=>t.status==="approved")&&<p className="text-xs text-amber-700">Approve at least one brand rule first.</p>}</form></section><section className="min-h-80 rounded-2xl bg-[#172c26] p-6 text-white"><div className="flex justify-between"><h2 className="text-sm font-semibold">Your creative prompt</h2>{prompt&&<button className="text-xs text-[#d9ef79]" onClick={async()=>{try{await navigator.clipboard.writeText(prompt);setNotice("Prompt copied.");}catch{setNotice("Copy unavailable. Select and copy the prompt manually.");}}}>Copy prompt</button>}</div>{prompt?<pre className="mt-6 whitespace-pre-wrap text-xs leading-6 text-white/80">{prompt}</pre>:<p className="mt-16 text-center text-sm text-white/40">Your generated prompt will appear here.</p>}</section></div>}
        </>}
        <p className="text-center text-[11px] text-slate-400">SCL Studio · Interactive demo · Sample data saved in this browser</p>
      </main>
    </div>
    {resetOpen&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5"><section role="dialog" aria-modal="true" aria-labelledby="reset-title" className="max-w-sm rounded-2xl bg-white p-6"><h2 id="reset-title" className="text-lg font-semibold">Reset this demo?</h2><p className="my-4 text-sm text-slate-500">Your demo changes will be replaced with the original sample data.</p><div className="flex justify-end gap-2"><button autoFocus className={button} onClick={()=>setResetOpen(false)}>Cancel</button><button className={primary} onClick={()=>{setWorkspace(seed());setPrompt("");setQuery("");setFilter("all");setTaskTitle("");setHeadline("A new chapter for The Page");setStandfirst("Independent stories. A distinct perspective.");setFooter("Explore the latest issue");setResetOpen(false);setNotice("Demo reset to sample data.");}}>Reset demo</button></div></section></div>}
  </div>;
}
