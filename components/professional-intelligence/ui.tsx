"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import type { ClaimStatus, ContentStatus, SourceEvidence, SourceStatus, SourceTier } from "@/types/professional-intelligence";
import { effectiveSourceStatus } from "@/lib/professional-intelligence/evidence";
import { CONTENT_STATUS_LABEL } from "@/lib/professional-intelligence/constants";

// Shared with the SCL brand-transformation demo so both modules look the same.
export const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#172c26] disabled:cursor-not-allowed disabled:opacity-40";
export const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#172c26] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[#294b3e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#172c26] disabled:cursor-not-allowed disabled:opacity-40";
export const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#172c26] focus:outline-none";
export const card = "rounded-2xl border border-slate-200/70 bg-white p-5";
export const label = (s: string) => s.replaceAll("_", " ");
export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

const STATUS_TONE: Record<string, string> = {
  verified: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  unverified: "bg-amber-50 text-amber-800 ring-amber-200",
  unreviewed: "bg-amber-50 text-amber-800 ring-amber-200",
  disputed: "bg-red-50 text-red-700 ring-red-200",
  contradicted: "bg-red-50 text-red-700 ring-red-200",
  rejected: "bg-slate-100 text-slate-500 ring-slate-200",
  inaccessible: "bg-slate-100 text-slate-600 ring-slate-300",
  stale: "bg-orange-50 text-orange-800 ring-orange-200",
};

export function Badge({ children, tone = "bg-slate-100 text-slate-700 ring-slate-200", title }: { children: ReactNode; tone?: string; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: ClaimStatus | SourceStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{label(status)}</Badge>;
}

export function TierBadge({ tier }: { tier: SourceTier }) {
  const tone = { A: "bg-[#172c26] text-[#d9ef79] ring-[#172c26]", B: "bg-[#edf3e5] text-[#172c26] ring-[#cfe0b8]", C: "bg-sky-50 text-sky-800 ring-sky-200", D: "bg-slate-100 text-slate-600 ring-slate-200" }[tier];
  return <Badge tone={tone} title={`Evidence tier ${tier}`}>Tier {tier}</Badge>;
}

const CONTENT_TONE: Record<ContentStatus, string> = {
  idea: "bg-slate-100 text-slate-700 ring-slate-200", research_needed: "bg-amber-50 text-amber-800 ring-amber-200",
  draft: "bg-sky-50 text-sky-800 ring-sky-200", legal_review: "bg-violet-50 text-violet-800 ring-violet-200",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200", scheduled: "bg-[#edf3e5] text-[#172c26] ring-[#cfe0b8]",
  published: "bg-[#172c26] text-[#d9ef79] ring-[#172c26]", rejected: "bg-red-50 text-red-700 ring-red-200",
};
export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  return <Badge tone={CONTENT_TONE[status]}>{CONTENT_STATUS_LABEL[status]}</Badge>;
}

/** Source list shown next to every claim: tier, effective status and access date, with the exact URL. */
export function SourceLinks({ ids, sources, empty = "No source attached — research lead only" }: { ids: string[]; sources: SourceEvidence[]; empty?: string }) {
  const linked = sources.filter((s) => ids.includes(s.id));
  if (!linked.length) return <p className="text-xs font-medium text-red-700">{empty}</p>;
  return <ul className="space-y-1.5">{linked.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-1.5 text-xs">
    <TierBadge tier={s.tier} /><StatusBadge status={effectiveSourceStatus(s)} />
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all font-medium text-[#172c26] underline decoration-slate-300 underline-offset-2 hover:decoration-[#172c26]">{s.title}<ExternalLink size={11} aria-hidden /></a>
    <span className="text-slate-400">· accessed {fmtDate(s.accessedAt)}</span>
  </li>)}</ul>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center"><p className="font-medium">{title}</p>{children && <div className="mt-2 text-sm text-slate-500">{children}</div>}</div>;
}

export function Stat({ title, value, note }: { title: string; value: ReactNode; note?: ReactNode }) {
  return <div className={card}><p className="text-sm text-slate-500">{title}</p><p className="my-3 text-3xl font-semibold tracking-tight">{value}</p>{note && <p className="text-xs text-slate-400">{note}</p>}</div>;
}

export function Labeled({ text, children, className = "" }: { text: string; children: ReactNode; className?: string }) {
  return <label className={`block text-xs font-medium text-slate-500 ${className}`}>{text}<div className="mt-1.5">{children}</div></label>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    // Only the top-most dialog reacts to Escape when dialogs are stacked.
    const onKey = (e: KeyboardEvent) => { const all = document.querySelectorAll('[role="dialog"]'); if (e.key === "Escape" && all[all.length - 1] === ref.current) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`my-8 w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white p-6 shadow-xl`}>
      <div className="mb-4 flex items-start justify-between gap-4"><h2 className="text-lg font-semibold">{title}</h2><button aria-label="Close dialog" className="rounded-lg px-2 text-xl leading-none text-slate-400 hover:text-slate-700" onClick={onClose}>×</button></div>
      {children}
    </section>
  </div>;
}

export function Confirm({ title, message, confirmLabel, onConfirm, onCancel }: { title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return <Modal title={title} onClose={onCancel}><p className="text-sm text-slate-600">{message}</p><div className="mt-6 flex justify-end gap-2"><button className={button} onClick={onCancel}>Cancel</button><button className={`${primary} !bg-red-700 hover:!bg-red-800`} onClick={onConfirm}>{confirmLabel}</button></div></Modal>;
}

export function SectionTitle({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{title}</h2>{children && <p className="mt-1 text-sm text-slate-500">{children}</p>}</div>{action}</div>;
}

export function MultiSelect<T extends { id: string }>({ items, selected, onChange, render, label: name }: { items: T[]; selected: string[]; onChange: (ids: string[]) => void; render: (item: T) => ReactNode; label: string }) {
  return <fieldset className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2" aria-label={name}>
    {items.length ? items.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 text-xs hover:bg-slate-50">
      <input type="checkbox" className="mt-0.5" checked={selected.includes(item.id)} onChange={(e) => onChange(e.target.checked ? [...selected, item.id] : selected.filter((x) => x !== item.id))} />
      <span className="min-w-0 break-words">{render(item)}</span>
    </label>) : <p className="p-2 text-xs text-slate-400">Nothing to link yet.</p>}
  </fieldset>;
}

export function download(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
export const nowIso = () => new Date().toISOString();
