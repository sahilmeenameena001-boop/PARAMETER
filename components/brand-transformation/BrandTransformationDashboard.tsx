"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Gauge, Plus, RefreshCw, Target } from "lucide-react";
import type { DashboardPayload } from "@/types/brand-transformation";
import PromptStudio from "./PromptStudio";

const priorityClass: Record<string, string> = {
  critical: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700", low: "bg-slate-100 text-slate-700",
};

function headers() {
  return {
    "content-type": "application/json",
    "x-user-id": process.env.NEXT_PUBLIC_DEMO_USER_ID || "",
    "x-organization-id": process.env.NEXT_PUBLIC_DEMO_ORGANIZATION_ID || "",
  };
}

export default function BrandTransformationDashboard({ clientId }: { clientId: string }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/brand-transformation/clients/${clientId}`, { headers: headers(), cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Unable to load dashboard");
    setData(json);
  }, [clientId]);

  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function createTasks(findingId: string) {
    setBusy(findingId);
    try {
      const response = await fetch(`/api/brand-transformation/findings/${findingId}/tasks`, { method: "POST", headers: headers(), body: "{}" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to create tasks");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create tasks"); }
    finally { setBusy(null); }
  }

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">{error}</div>;
  if (!data) return <div className="flex items-center gap-2 p-8 text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading brand workspace…</div>;
  const m = data.metrics;

  return <main className="mx-auto max-w-7xl space-y-6 p-6 text-slate-900">
    <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
      <div><p className="text-sm font-medium uppercase tracking-[.18em] text-amber-700">Brand transformation</p><h1 className="text-3xl font-semibold">{data.client.name}</h1><p className="mt-1 text-slate-500">{data.client.current_positioning} → {data.client.desired_positioning}</p></div>
      <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button>
    </header>

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {([
        ["Current score", `${m.currentScore}/10`, Gauge], ["Target", `${m.targetScore}/10`, Target],
        ["Gap", `${m.transformationGap}`, Gauge], ["Open findings", `${m.openFindings}`, ClipboardList],
        ["Tasks complete", `${m.completedTasks}/${m.totalTasks}`, CheckCircle2],
      ] as const).map(([label, value, Icon]) => <div key={String(label)} className="rounded-2xl border bg-white p-4 shadow-sm"><Icon className="mb-5 h-5 w-5 text-amber-700" /><p className="text-xs uppercase tracking-wide text-slate-500">{String(label)}</p><p className="mt-1 text-2xl font-semibold">{String(value)}</p></div>)}
    </section>

    <section className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b p-5"><h2 className="text-lg font-semibold">Audit findings</h2><p className="text-sm text-slate-500">Approve findings, then convert recommendations into execution tasks.</p></div>
      <div className="divide-y">
        {data.audit?.findings.map((finding) => <article key={finding.id} className="grid gap-5 p-5 lg:grid-cols-[180px_1fr_220px]">
          <div><p className="font-medium capitalize">{finding.element.replaceAll("_", " ")}</p><p className="text-sm capitalize text-slate-500">{finding.category.replaceAll("_", " ")}</p><span className={`mt-3 inline-block rounded-full px-2 py-1 text-xs font-medium ${priorityClass[finding.severity]}`}>{finding.severity}</span></div>
          <div><p>{finding.observation}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">{finding.recommendations.map((r) => <li key={r}>{r}</li>)}</ul></div>
          <div><div className="mb-3 flex justify-between text-sm"><span>Current <b>{finding.current_score}</b></span><span>Target <b>{finding.target_score}</b></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-600" style={{ width: `${finding.current_score * 10}%` }} /></div><button disabled={busy === finding.id} onClick={() => createTasks(finding.id)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-50"><Plus className="h-4 w-4" />{busy === finding.id ? "Creating…" : "Create tasks"}</button></div>
        </article>)}
      </div>
    </section>

    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Approved brand system</h2><div className="mt-4 space-y-3">{data.brandTokens.map((token) => <div key={token.id} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between"><span className="font-medium">{token.name}</span><span className="text-xs uppercase text-emerald-700">{token.status}</span></div><p className="mt-1 break-words text-xs text-slate-500">{JSON.stringify(token.value)}</p></div>)}</div></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Execution board</h2><div className="mt-4 space-y-3">{data.tasks.length ? data.tasks.map((task) => <div key={task.id} className="rounded-xl border p-3"><div className="flex gap-2"><span className={`h-fit rounded-full px-2 py-1 text-[11px] ${priorityClass[task.priority]}`}>{task.priority}</span><div><p className="text-sm font-medium">{task.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{task.status.replaceAll("_", " ")}</p></div></div></div>) : <p className="text-sm text-slate-500">No tasks yet. Create them from a finding.</p>}</div></div>
    </section>
    <PromptStudio clientId={clientId} requestHeaders={headers()} />
  </main>;
}

