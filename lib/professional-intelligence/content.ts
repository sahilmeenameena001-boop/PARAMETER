import type { Claim, ContentIdea, ContentStatus, Member, Publication, SourceEvidence, CourtCase, CourtOrder } from "@/types/professional-intelligence";
import { canEdit, canReview } from "./access.ts";
import { CLAIM_FIELD_LABEL, LEGAL_DISCLAIMER } from "./constants.ts";
import { effectiveSourceStatus, WorkflowError } from "./evidence.ts";
import { caseOutcome } from "./litigation.ts";

export const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  idea: ["research_needed", "draft", "rejected"],
  research_needed: ["idea", "draft", "rejected"],
  draft: ["research_needed", "legal_review", "rejected"],
  legal_review: ["draft", "approved", "rejected"],
  approved: ["draft", "scheduled"],
  scheduled: ["approved", "published"],
  published: [],
  rejected: ["idea"],
};

// Phrases that commonly conflict with Bar Council of India advertising/solicitation restrictions or mislead readers.
const COMPLIANCE_RULES: { pattern: RegExp; message: string }[] = [
  { pattern: /\bguarantee[sd]?\b|\bassured (result|outcome|success)\b|\b100\s?%/i, message: "Promises or guarantees of outcome" },
  { pattern: /\bwin(ning)?[- ]rate\b|\bsuccess[- ]rate\b|\bnever lost\b|\bundefeated\b/i, message: "Win/success-rate claims" },
  { pattern: /\b(best|top|no\.?\s?1|number one|leading)\s+(lawyer|advocate|counsel|law firm)\b/i, message: "Superlative self-promotion" },
  { pattern: /\b(call|whatsapp|dm|contact) (me|us) (now|today)\b|\bbook (a|your) (free )?consultation\b|\bhire (me|us)\b/i, message: "Direct solicitation of work" },
  { pattern: /\bour client\b.*\b(name|identity)\b|\bclient testimonial\b/i, message: "Client identity or testimonial" },
  { pattern: /\byou (should|must) (file|sue|claim)\b/i, message: "Individualised legal advice" },
];

export function complianceIssues(text: string): string[] {
  return COMPLIANCE_RULES.filter((r) => r.pattern.test(text)).map((r) => r.message);
}

export interface GateContext {
  actor: Member;
  sources: SourceEvidence[];
  claims: Claim[];
  cases?: CourtCase[];
  orders?: CourtOrder[];
  now?: Date;
  note?: string;
  scheduledAt?: string | null;
  publishedUrl?: string | null;
}

/** Reasons the item cannot move to `to`. Empty array = allowed. */
export function transitionBlockers(item: ContentIdea, to: ContentStatus, ctx: GateContext): string[] {
  const reasons: string[] = [];
  if (!TRANSITIONS[item.status].includes(to)) reasons.push(`Cannot move from "${item.status}" to "${to}".`);
  if (!canEdit(ctx.actor)) reasons.push("Viewers cannot change content status.");
  if (to === "legal_review") {
    if (!item.body.trim()) reasons.push("Write a draft before requesting legal review.");
    if (!item.sourceIds.length && !item.claimIds.length && !item.caseIds.length && !item.publicationIds.length) reasons.push("Link at least one source, claim, case or publication.");
    if (!item.body.includes(LEGAL_DISCLAIMER)) reasons.push("Include the standard informational disclaimer.");
  }
  if (to === "approved") {
    if (!canReview(ctx.actor)) reasons.push("Only a legal reviewer or admin can approve content.");
    if (ctx.actor.id === item.authorId) reasons.push("The author cannot approve their own draft (four-eyes rule).");
    if (!item.body.includes(LEGAL_DISCLAIMER)) reasons.push("Include the standard informational disclaimer.");
    const now = ctx.now ?? new Date();
    const unverifiedSources = ctx.sources.filter((s) => item.sourceIds.includes(s.id) && effectiveSourceStatus(s, now) !== "verified");
    if (unverifiedSources.length) reasons.push(`${unverifiedSources.length} linked source(s) are not verified or are stale.`);
    const unverifiedClaims = ctx.claims.filter((c) => item.claimIds.includes(c.id) && c.status !== "verified");
    if (unverifiedClaims.length) reasons.push(`${unverifiedClaims.length} linked claim(s) are not verified.`);
    for (const c of (ctx.cases ?? []).filter((c) => item.caseIds.includes(c.id))) {
      if (c.status === "disposed" && caseOutcome(c, ctx.orders ?? []).state !== "verified") reasons.push(`Case "${c.title}" has no reviewed outcome — do not describe its result.`);
    }
    const issues = complianceIssues(item.body);
    if (issues.length) reasons.push(`Compliance flags: ${issues.join("; ")}.`);
  }
  if (to === "scheduled") {
    if (!item.approvals.some((a) => a.to === "approved")) reasons.push("Content must be approved before scheduling.");
    if (!ctx.scheduledAt) reasons.push("Choose a publication date.");
  }
  if (to === "published" && item.status !== "scheduled") reasons.push("Only scheduled content can be marked published.");
  return reasons;
}

export function transitionContent(item: ContentIdea, to: ContentStatus, ctx: GateContext): ContentIdea {
  const blockers = transitionBlockers(item, to, ctx);
  if (blockers.length) throw new WorkflowError(blockers.join(" "));
  const at = (ctx.now ?? new Date()).toISOString();
  return {
    ...item,
    status: to,
    scheduledAt: to === "scheduled" ? ctx.scheduledAt ?? null : to === "approved" || to === "draft" ? null : item.scheduledAt,
    publishedAt: to === "published" ? at : item.publishedAt,
    publishedUrl: to === "published" ? ctx.publishedUrl ?? null : item.publishedUrl,
    approvals: [...item.approvals, { id: crypto.randomUUID(), at, by: ctx.actor.id, from: item.status, to, note: ctx.note ?? "" }],
    updatedAt: at,
  };
}

/** Saving a new body keeps history. Editing approved/scheduled content sends it back to draft so it is re-reviewed. */
export function reviseContent(item: ContentIdea, body: string, actor: Member, note = "", now = new Date()): ContentIdea {
  if (!canEdit(actor)) throw new WorkflowError("Viewers cannot edit drafts.");
  if (item.status === "published") throw new WorkflowError("Published content is locked. Create a new item for corrections.");
  if (body === item.body) return item;
  const at = now.toISOString();
  const reopen = item.status === "approved" || item.status === "scheduled" || item.status === "legal_review";
  return {
    ...item,
    body,
    status: reopen ? "draft" : item.status === "idea" || item.status === "research_needed" ? "draft" : item.status,
    scheduledAt: reopen ? null : item.scheduledAt,
    revisions: [...item.revisions, { id: crypto.randomUUID(), at, by: actor.id, body, note }],
    approvals: reopen ? [...item.approvals, { id: crypto.randomUUID(), at, by: actor.id, from: item.status, to: "draft", note: "Edited after review — re-review required" }] : item.approvals,
    updatedAt: at,
  };
}

export const isExportable = (item: Pick<ContentIdea, "status">) => item.status === "approved" || item.status === "scheduled" || item.status === "published";

/**
 * Brief built only from verified facts. Unverified claims are listed separately as "do not state as fact".
 */
export function generateBrief(item: ContentIdea, ctx: { claims: Claim[]; sources: SourceEvidence[]; publications: Publication[]; cases: CourtCase[]; orders: CourtOrder[]; professionalName: string; pillarName: string; now?: Date }) {
  const now = ctx.now ?? new Date();
  const linkedClaims = ctx.claims.filter((c) => item.claimIds.includes(c.id) && c.field !== "contact");
  const verified = linkedClaims.filter((c) => c.status === "verified");
  const unverified = linkedClaims.filter((c) => c.status !== "verified");
  const sources = ctx.sources.filter((s) => item.sourceIds.includes(s.id) || linkedClaims.some((c) => c.sourceIds.includes(s.id)));
  const pubs = ctx.publications.filter((p) => item.publicationIds.includes(p.id));
  const cases = ctx.cases.filter((c) => item.caseIds.includes(c.id));
  const line = (s: SourceEvidence) => `- [${effectiveSourceStatus(s, now)}] Tier ${s.tier} · ${s.title} — ${s.url}${s.accessedAt ? ` (accessed ${s.accessedAt.slice(0, 10)})` : ""}`;
  return [
    `# Content brief: ${item.title}`,
    `Professional: ${ctx.professionalName} · Pillar: ${ctx.pillarName}${item.series ? ` · Series: ${item.series}` : ""}`,
    `Audience: ${item.audience} · Format: ${item.format} · Platform: ${item.platform}`,
    `Status: ${item.status}`,
    "",
    `## Hook\n${item.hook || "—"}`,
    `## Intended CTA\n${item.cta || "—"} (informational CTA only; no solicitation)`,
    "## Verified facts you may state",
    verified.length ? verified.map((c) => `- ${CLAIM_FIELD_LABEL[c.field]}: ${c.value}`).join("\n") : "- None yet. Do not state any professional facts until verified.",
    ...pubs.map((p) => `- Publication (${p.status}): ${p.title} — ${p.publisher}${p.identifier ? `, ${p.identifier}` : ""}${p.status !== "verified" ? " ⚠ do not cite until verified" : ""}`),
    "## Do NOT state as fact (unverified)",
    unverified.length ? unverified.map((c) => `- ${CLAIM_FIELD_LABEL[c.field]}: ${c.value} [${c.status}]`).join("\n") : "- —",
    ...(cases.length ? ["## Court records", ...cases.map((c) => {
      const o = caseOutcome(c, ctx.orders);
      return `- ${c.title} (${c.cnr ?? c.caseNumber ?? "no number"}, ${c.court}) — status ${c.status}; outcome ${o.state === "verified" ? o.outcome : `UNVERIFIED (${o.reason})`}. Do not imply client relationship or result beyond the reviewed order.`;
    })] : []),
    "## Sources",
    sources.length ? sources.map(line).join("\n") : "- None linked.",
    "## Guardrails",
    "- General information only; no individualised advice, guarantees, win rates, client identities or testimonials.",
    "- Check the current statute and latest judgments before drafting; a qualified reviewer must approve.",
    `- Mandatory disclaimer: "${LEGAL_DISCLAIMER}"`,
  ].join("\n");
}

export function exportMarkdown(item: ContentIdea, brief: string) {
  if (!isExportable(item)) throw new WorkflowError("Only approved, scheduled or published content can be exported.");
  return `${brief}\n\n---\n\n## Approved copy\n\n${item.body}\n\n---\nApproval trail:\n${item.approvals.map((a) => `- ${a.at} ${a.from} → ${a.to} by ${a.by}${a.note ? ` (${a.note})` : ""}`).join("\n")}\n`;
}
