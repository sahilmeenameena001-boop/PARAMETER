import type { ContentIdea, PerformanceRecord } from "@/types/professional-intelligence";

export const CSV_COLUMNS = [
  "content_id", "platform", "published_at", "period_start", "period_end", "impressions", "clicks", "reactions",
  "comments", "saves", "shares", "qualified_enquiries", "consultations", "attribution_evidence",
] as const;

const METRICS = ["impressions", "clicks", "reactions", "comments", "saves", "shares", "qualifiedEnquiries", "consultations"] as const;
type Metric = typeof METRICS[number];

/** Minimal RFC-4180 parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s));

/** Validates every row; rows with errors are reported and not imported. Blank metric cells stay null (unknown), never 0. */
export function importPerformanceCsv(text: string, opts: { professionalId: string; contentIds: string[]; now?: Date }) {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const errors: string[] = [];
  const records: PerformanceRecord[] = [];
  if (!rows.length) return { records, errors: ["The file is empty."] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = ["platform", "period_start", "period_end"].filter((c) => !header.includes(c));
  if (missing.length) return { records, errors: [`Missing required column(s): ${missing.join(", ")}.`] };
  const col = (r: string[], name: string) => { const i = header.indexOf(name); return i < 0 ? "" : (r[i] ?? "").trim(); };
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const rowErrors: string[] = [];
    const contentId = col(r, "content_id") || null;
    if (contentId && !opts.contentIds.includes(contentId)) rowErrors.push(`unknown content_id "${contentId}"`);
    const platform = col(r, "platform");
    if (!platform) rowErrors.push("platform is required");
    const periodStart = col(r, "period_start"), periodEnd = col(r, "period_end");
    if (!isDate(periodStart) || !isDate(periodEnd)) rowErrors.push("period_start and period_end must be YYYY-MM-DD dates");
    else if (periodEnd < periodStart) rowErrors.push("period_end is before period_start");
    const publishedAt = col(r, "published_at");
    if (publishedAt && !isDate(publishedAt)) rowErrors.push("published_at must be a date");
    const values = {} as Record<Metric, number | null>;
    for (const m of METRICS) {
      const raw = col(r, m.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`));
      if (raw === "") { values[m] = null; continue; }
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isInteger(n) || n < 0) { rowErrors.push(`${m} must be a whole number ≥ 0`); values[m] = null; }
      else values[m] = n;
    }
    const attribution = col(r, "attribution_evidence");
    if ((values.qualifiedEnquiries ?? 0) > 0 || (values.consultations ?? 0) > 0) {
      if (!attribution) rowErrors.push("enquiries/consultations require attribution_evidence");
    }
    if (rowErrors.length) { errors.push(`Row ${line}: ${rowErrors.join("; ")}.`); return; }
    records.push({
      id: crypto.randomUUID(), professionalId: opts.professionalId, contentId, platform, publishedAt: publishedAt || null,
      periodStart, periodEnd, ...values, attributionEvidence: attribution, origin: "csv", createdAt: (opts.now ?? new Date()).toISOString(),
    });
  });
  return { records, errors };
}

export interface PerformanceGroup { key: string; posts: number; impressions: number; engagements: number; clicks: number; enquiries: number; hasData: boolean }

/** Aggregates only recorded values. Returns an empty list when nothing has been recorded — never zeros as if measured. */
export function aggregatePerformance(records: PerformanceRecord[], content: ContentIdea[], by: "pillar" | "format" | "audience" | "platform", pillarName: (id: string) => string) {
  const groups = new Map<string, PerformanceGroup>();
  for (const r of records) {
    const item = content.find((c) => c.id === r.contentId);
    const key = by === "platform" ? r.platform : !item ? "Unlinked" : by === "pillar" ? pillarName(item.pillarId) : by === "format" ? item.format : item.audience;
    const g = groups.get(key) ?? { key, posts: 0, impressions: 0, engagements: 0, clicks: 0, enquiries: 0, hasData: false };
    g.posts++;
    g.impressions += r.impressions ?? 0;
    g.clicks += r.clicks ?? 0;
    g.engagements += (r.reactions ?? 0) + (r.comments ?? 0) + (r.saves ?? 0) + (r.shares ?? 0);
    g.enquiries += r.qualifiedEnquiries ?? 0;
    g.hasData = true;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.impressions - a.impressions);
}
