import type { CaseCategory, CaseStatus, CourtCase, CourtOrder, Member, Outcome, OutcomeReview, SourceEvidence } from "@/types/professional-intelligence";
import { canReview } from "./access.ts";
import { WorkflowError } from "./evidence.ts";
import { parseCsv } from "./performance.ts";

const DAY = 86_400_000;

/** Plain-language category from the raw case type / acts. Unknown types stay "other" rather than being guessed. */
export function normalizeCategory(caseTypeRaw: string, actsRaw: string | null = null, court = ""): { category: CaseCategory; isInterim: boolean } {
  const t = `${caseTypeRaw} ${actsRaw ?? ""}`.toLowerCase();
  const c = court.toLowerCase();
  const isInterim = /interlocutory|\bi\.?a\.?\b|miscellaneous application|civil miscellaneous|company application|cross objection/.test(t);
  if (/negotiable instruments|\b138\b|ni act/.test(t)) return { category: "cheque_dishonour", isInterim: false };
  if (isInterim) return { category: "interim_misc", isInterim: true };
  if (/company appeal.*insolvency|insolvency.*appeal/.test(t) || (/nclat/.test(c) && /ibc|insolvency/.test(t))) return { category: "insolvency_appeal", isInterim: false };
  if (/\bibc\b|insolvency|bankruptcy/.test(t)) return { category: "ibc", isInterim: false };
  if (/arbitration/.test(t)) return { category: "arbitration", isInterim: false };
  if (/companies act|company appeal|company petition|transfer petition \(companies/.test(t)) return { category: "company_law", isInterim: false };
  if (/writ/.test(t)) return { category: "writ", isInterim: false };
  if (/execution/.test(t)) return { category: "execution", isInterim: false };
  if (/civil suit|commercial|recovery|summary suit|\bcs\b|second appeal|civil revision/.test(t)) return { category: "commercial_civil", isInterim: false };
  return { category: "other", isInterim: false };
}

export const normalizeCnr = (cnr: string | null) => (cnr ? cnr.replace(/[^a-z0-9]/gi, "").toUpperCase() : null);

const TITLE_NOISE = /\b(m\/s|ms|mr|mrs|sh|smt|shri|dr|ors|anr|others|another|and|the|pvt|private|ltd|limited|vs|versus|v)\b/g;
export function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[.,()&'"-]/g, " ").replace(TITLE_NOISE, " ").replace(/\s+/g, " ").trim();
}

export interface DuplicateGroup { kind: "duplicate" | "possibly_related"; reason: string; caseIds: string[] }

/**
 * Exact duplicates share a CNR (or case number + court). Records with the same parties in the same court but different
 * CNRs are only "possibly related" — they may be separate proceedings and must not be merged automatically.
 */
export function findDuplicateCases(cases: CourtCase[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const byKey = (key: (c: CourtCase) => string | null) => {
    const map = new Map<string, string[]>();
    for (const c of cases) { const k = key(c); if (k) map.set(k, [...(map.get(k) ?? []), c.id]); }
    return [...map.entries()].filter(([, ids]) => ids.length > 1);
  };
  const dupIds = new Set<string>();
  for (const [k, ids] of byKey((c) => normalizeCnr(c.cnr))) { groups.push({ kind: "duplicate", reason: `Same CNR ${k}`, caseIds: ids }); ids.forEach((i) => dupIds.add(i)); }
  for (const [, ids] of byKey((c) => (c.caseNumber ? `${c.caseNumber.toUpperCase().replace(/\s+/g, "")}|${c.court.toLowerCase()}` : null))) {
    if (ids.every((i) => dupIds.has(i))) continue;
    groups.push({ kind: "duplicate", reason: "Same case number in the same court", caseIds: ids });
  }
  for (const [, ids] of byKey((c) => `${normalizeTitle(c.title)}|${c.court.toLowerCase()}`)) {
    const cnrs = new Set(ids.map((i) => normalizeCnr(cases.find((c) => c.id === i)!.cnr)));
    if (cnrs.size > 1) groups.push({ kind: "possibly_related", reason: "Same parties and court, different CNRs — verify whether these are related proceedings", caseIds: ids });
  }
  return groups;
}

/** Elapsed calendar days of the case record. This is case duration, not a measure of the advocate's speed. */
export function elapsedCaseDays(c: Pick<CourtCase, "filingDate" | "disposalDate" | "status">, now = new Date()): number | null {
  if (!c.filingDate) return null;
  const end = c.disposalDate ? new Date(c.disposalDate) : c.status === "pending" ? now : null;
  if (!end) return null;
  return Math.max(0, Math.round((end.getTime() - new Date(c.filingDate).getTime()) / DAY));
}

export type CaseOutcomeView =
  | { state: "unverified"; reason: string }
  | { state: "verified"; outcome: Outcome; disposalNature: OutcomeReview["disposalNature"]; orderId: string };

/** A case only has an outcome once a reviewer has classified its final order text. Status "disposed" is never an outcome. */
export function caseOutcome(c: CourtCase, orders: CourtOrder[]): CaseOutcomeView {
  const mine = orders.filter((o) => o.caseId === c.id);
  if (c.status !== "disposed") return { state: "unverified", reason: c.status === "pending" ? "Case pending" : "Status unknown" };
  const final = mine.filter((o) => o.isFinal).sort((a, b) => (b.orderDate ?? "").localeCompare(a.orderDate ?? ""))[0];
  if (!final) return { state: "unverified", reason: "Final order not captured" };
  if (!hasOrderText(final)) return { state: "unverified", reason: "Order text not extracted" };
  if (!final.review) return { state: "unverified", reason: "Awaiting outcome review" };
  return { state: "verified", outcome: final.review.outcome, disposalNature: final.review.disposalNature, orderId: final.id };
}

export const hasOrderText = (o: Pick<CourtOrder, "orderText" | "extractionStatus">) =>
  (o.extractionStatus === "extracted" || o.extractionStatus === "manual") && o.orderText.trim().length > 0;

const PROCEDURAL_OUTCOMES: Outcome[] = ["withdrawn", "infructuous", "procedural_disposal", "adjourned", "interim_direction"];

export function reviewOrderOutcome(order: CourtOrder, review: Omit<OutcomeReview, "reviewerId" | "reviewedAt">, actor: Member, now = new Date()): CourtOrder {
  if (!canReview(actor)) throw new WorkflowError("Only a legal reviewer or admin can classify order outcomes.");
  if (!hasOrderText(order)) throw new WorkflowError("Order text is missing. The outcome stays unverified until the operative order is extracted or entered.");
  if (review.rationale.trim().length < 20) throw new WorkflowError("Explain the classification (at least 20 characters), citing the operative part of the order.");
  const excerpt = review.excerpt.trim();
  if (!excerpt) throw new WorkflowError("Quote the operative excerpt that supports the classification.");
  const squash = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  if (!squash(order.orderText).includes(squash(excerpt))) throw new WorkflowError("The excerpt must appear verbatim in the order text.");
  if (PROCEDURAL_OUTCOMES.includes(review.outcome) && review.disposalNature === "merits") {
    throw new WorkflowError(`"${review.outcome}" is a procedural result and cannot be marked as a merits disposal.`);
  }
  if (!review.method.trim()) throw new WorkflowError("Record the classification method.");
  const at = now.toISOString();
  return { ...order, review: { ...review, excerpt, reviewerId: actor.id, reviewedAt: at }, updatedAt: at };
}

export interface LitigationSummary {
  records: number;
  underlyingMatters: number; // excludes interim applications and exact duplicates
  interimRecords: number;
  byStatus: Record<CaseStatus, number>;
  byCategory: Partial<Record<CaseCategory, number>>;
  byCourt: Record<string, number>;
  outcomesVerified: number;
  disposedWithoutVerifiedOutcome: number;
  ordersAwaitingReview: number;
  ordersMissingText: number;
}

/** Every number here is derived from stored records; nothing is hard-coded. No win rate is computed. */
export function summarizeLitigation(cases: CourtCase[], orders: CourtOrder[]): LitigationSummary {
  const dupGroups = findDuplicateCases(cases).filter((g) => g.kind === "duplicate");
  const redundant = new Set(dupGroups.flatMap((g) => g.caseIds.slice(1)));
  const byStatus: Record<CaseStatus, number> = { pending: 0, disposed: 0, unknown: 0 };
  const byCategory: Partial<Record<CaseCategory, number>> = {};
  const byCourt: Record<string, number> = {};
  let outcomesVerified = 0;
  let disposedWithoutVerifiedOutcome = 0;
  for (const c of cases) {
    if (redundant.has(c.id)) continue;
    byStatus[c.status]++;
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    byCourt[c.court] = (byCourt[c.court] ?? 0) + 1;
    const o = caseOutcome(c, orders);
    if (o.state === "verified") outcomesVerified++;
    else if (c.status === "disposed") disposedWithoutVerifiedOutcome++;
  }
  const kept = cases.filter((c) => !redundant.has(c.id));
  return {
    records: kept.length,
    underlyingMatters: kept.filter((c) => !c.isInterim).length,
    interimRecords: kept.filter((c) => c.isInterim).length,
    byStatus, byCategory, byCourt, outcomesVerified, disposedWithoutVerifiedOutcome,
    ordersAwaitingReview: orders.filter((o) => hasOrderText(o) && !o.review).length,
    ordersMissingText: orders.filter((o) => !hasOrderText(o)).length,
  };
}

export const CASE_CSV_COLUMNS = ["cnr", "case_number", "title", "court", "bench", "case_type", "acts", "status", "filing_date", "disposal_date", "case_url", "represented_side", "appearance_evidence", "source_url"] as const;
const SIDES = ["petitioner", "respondent", "appellant", "complainant", "accused"];

/**
 * Bulk import of court records for any professional. Rows with errors are reported and nothing is imported.
 * Rows whose CNR already exists are skipped (not overwritten). Each distinct source_url becomes an unreviewed source.
 */
export function importCasesCsv(text: string, opts: { professionalId: string; existing: CourtCase[]; sources: SourceEvidence[]; now?: Date }) {
  const at = (opts.now ?? new Date()).toISOString();
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const errors: string[] = [];
  const skipped: string[] = [];
  const cases: CourtCase[] = [];
  const newSources: SourceEvidence[] = [];
  if (!rows.length) return { cases, sources: newSources, errors: ["The file is empty."], skipped };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = ["title", "court"].filter((c) => !header.includes(c));
  if (missing.length) return { cases, sources: newSources, errors: [`Missing required column(s): ${missing.join(", ")}.`], skipped };
  const col = (r: string[], name: string) => { const i = header.indexOf(name); return i < 0 ? "" : (r[i] ?? "").trim(); };
  const knownCnrs = new Set(opts.existing.filter((c) => c.professionalId === opts.professionalId).map((c) => normalizeCnr(c.cnr)).filter(Boolean));
  const isDate = (s: string) => !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));
  const sourceFor = (url: string) => {
    const found = [...opts.sources, ...newSources].find((s) => s.url === url);
    if (found) return found.id;
    const host = new URL(url).hostname.replace(/^www\./, "");
    const official = /(gov\.in|nic\.in)$/.test(host);
    const s: SourceEvidence = { id: `src-${crypto.randomUUID().slice(0, 8)}`, url, title: `Case record — ${host}`, publisher: host, sourceType: official ? "court_record" : "third_party_directory", tier: official ? "A" : "D", publishedAt: null, accessedAt: at, status: "unreviewed", excerpt: "", verificationMethod: null, reviewerId: null, reviewedAt: null, accessNotes: "Imported from CSV.", notes: "Verify against the official court record.", attachmentText: null, createdAt: at, updatedAt: at };
    newSources.push(s);
    return s.id;
  };
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const rowErrors: string[] = [];
    const title = col(r, "title"), court = col(r, "court");
    if (!title) rowErrors.push("title is required");
    if (!court) rowErrors.push("court is required");
    const status = (col(r, "status").toLowerCase() || "unknown") as CaseStatus;
    if (!["pending", "disposed", "unknown"].includes(status)) rowErrors.push("status must be pending, disposed or unknown");
    const filing = col(r, "filing_date"), disposal = col(r, "disposal_date");
    if (!isDate(filing) || !isDate(disposal)) rowErrors.push("dates must be YYYY-MM-DD");
    else if (filing && disposal && disposal < filing) rowErrors.push("disposal_date is before filing_date");
    const side = col(r, "represented_side").toLowerCase();
    if (side && !SIDES.includes(side)) rowErrors.push(`represented_side must be one of ${SIDES.join(", ")}`);
    if (side && !col(r, "appearance_evidence")) rowErrors.push("represented_side needs appearance_evidence quoting the source");
    for (const k of ["case_url", "source_url"]) { const u = col(r, k); if (u) { try { if (!/^https?:$/.test(new URL(u).protocol)) throw 0; } catch { rowErrors.push(`${k} is not a valid http(s) URL`); } } }
    if (rowErrors.length) { errors.push(`Row ${line}: ${rowErrors.join("; ")}.`); return; }
    const cnr = col(r, "cnr") || null;
    if (cnr && knownCnrs.has(normalizeCnr(cnr))) { skipped.push(`Row ${line}: CNR ${cnr} already exists — skipped, not overwritten.`); return; }
    if (cnr) knownCnrs.add(normalizeCnr(cnr));
    const { category, isInterim } = normalizeCategory(col(r, "case_type"), col(r, "acts") || null, court);
    const [a, b] = title.split(/\s+v(?:s\.?|ersus)\s+/i);
    const sourceUrl = col(r, "source_url") || col(r, "case_url");
    cases.push({
      id: `case-${crypto.randomUUID().slice(0, 8)}`, professionalId: opts.professionalId, cnr, caseNumber: col(r, "case_number") || null, title, court,
      bench: col(r, "bench") || null, caseTypeRaw: col(r, "case_type"), actsRaw: col(r, "acts") || null, category, categoryOverridden: false, isInterim,
      parentCaseId: null, filingDate: filing || null, disposalDate: disposal || null, status, lastCheckedAt: at,
      parties: [a, b].filter(Boolean).map((name) => ({ name: name.trim(), side: "unknown" as const })),
      representedSide: (side || null) as CourtCase["representedSide"], representedSideVerified: false, appearanceEvidence: col(r, "appearance_evidence") || null,
      caseUrl: col(r, "case_url") || null, orderListUrl: null, sourceIds: sourceUrl ? [sourceFor(sourceUrl)] : [], notes: "Imported from CSV.", createdAt: at, updatedAt: at,
    });
  });
  if (errors.length) return { cases: [], sources: [], errors, skipped };
  return { cases, sources: newSources, errors, skipped };
}
