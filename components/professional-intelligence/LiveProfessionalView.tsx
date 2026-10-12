"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Claim, ContentIdea, Member, SourceEvidence } from "@/types/professional-intelligence";
import type { LitigationSummary } from "@/lib/professional-intelligence/litigation";
import { CATEGORY_LABEL, CLAIM_FIELD_LABEL, CONTENT_STATUSES } from "@/lib/professional-intelligence/constants";
import { Badge, card, ContentStatusBadge, Empty, SourceLinks, Stat, StatusBadge } from "./ui";

interface Payload { member: Member; professional: { display_name: string; profession: string }; sources: SourceEvidence[]; claims: (Claim & { redacted: boolean })[]; content: ContentIdea[]; litigationSummary: LitigationSummary }

// Same integration headers as the brand-transformation dashboard; replace with the real session in production.
function headers() {
  return { "x-user-id": process.env.NEXT_PUBLIC_DEMO_USER_ID || "", "x-organization-id": process.env.NEXT_PUBLIC_DEMO_ORGANIZATION_ID || "" };
}

/** Read view of a professional stored in Supabase. Gated writes go through the API routes. */
export default function LiveProfessionalView({ professionalId }: { professionalId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/professional-intelligence/professionals/${professionalId}`, { headers: headers(), cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Unable to load professional");
    setData(json);
  }, [professionalId]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  if (error) return <main className="mx-auto max-w-3xl p-6"><div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700"><p className="font-semibold">Live workspace unavailable</p><p className="mt-1 text-sm">{error}</p><p className="mt-3 text-sm text-red-900/70">Requires `.env.local` with Supabase credentials and the `20261012_professional_intelligence.sql` migration. The local workspace at <a className="underline" href="/dashboard/professional-intelligence">/dashboard/professional-intelligence</a> works without them.</p></div></main>;
  if (!data) return <div className="flex items-center gap-2 p-8 text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>;
  const s = data.litigationSummary;
  return <main className="mx-auto max-w-6xl space-y-6 bg-[#f6f7f9] p-6 text-[#172c26]">
    <header><p className="text-xs font-semibold uppercase tracking-[.15em] text-slate-400">Live · role {data.member.role}</p><h1 className="text-3xl font-semibold">{data.professional.display_name}</h1><p className="text-slate-500">{data.professional.profession}</p></header>
    <section className="grid gap-4 sm:grid-cols-4"><Stat title="Records" value={s.records} note={`${s.underlyingMatters} underlying matters`} /><Stat title="Pending · Disposed" value={`${s.byStatus.pending} · ${s.byStatus.disposed}`} /><Stat title="Outcomes verified" value={s.outcomesVerified} note="No win rate is calculated" /><Stat title="Orders awaiting review" value={s.ordersAwaitingReview} /></section>
    <section className={card}><h2 className="mb-3 font-semibold">Claims</h2>{data.claims.length ? <ul className="divide-y">{data.claims.map((c) => <li key={c.id} className="py-3"><div className="flex flex-wrap gap-2"><span className="text-xs uppercase text-slate-400">{CLAIM_FIELD_LABEL[c.field]}</span><StatusBadge status={c.status} />{c.basis === "inferred" && <Badge>Inferred</Badge>}</div><p className={c.redacted ? "italic text-slate-400" : "font-medium"}>{c.value}</p><SourceLinks ids={c.sourceIds} sources={data.sources} /></li>)}</ul> : <Empty title="No claims" />}</section>
    <section className={card}><h2 className="mb-3 font-semibold">Categories</h2><div className="flex flex-wrap gap-2">{Object.entries(s.byCategory).map(([k, v]) => <Badge key={k}>{CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]}: {v}</Badge>)}</div></section>
    <section className={card}><h2 className="mb-3 font-semibold">Content pipeline</h2><div className="flex flex-wrap gap-2">{CONTENT_STATUSES.map((st) => <span key={st} className="inline-flex items-center gap-1 text-xs"><ContentStatusBadge status={st} />{data.content.filter((c) => c.status === st).length}</span>)}</div></section>
  </main>;
}
