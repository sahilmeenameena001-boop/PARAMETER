import type { Claim, ClaimField, Confidence, Member, SourceEvidence, SourceStatus, SourceTier } from "@/types/professional-intelligence";
import { canReview } from "./access.ts";
import { CLAIM_FIELD_LABEL, SINGLE_VALUE_FIELDS, STALE_AFTER_DAYS } from "./constants.ts";

const DAY = 86_400_000;
const TIER_RANK: Record<SourceTier, number> = { A: 3, B: 2, C: 1, D: 0 };

export class WorkflowError extends Error {
  constructor(message: string) { super(message); this.name = "WorkflowError"; }
}

export function isSourceStale(source: Pick<SourceEvidence, "accessedAt">, now = new Date()) {
  if (!source.accessedAt) return true;
  return now.getTime() - new Date(source.accessedAt).getTime() > STALE_AFTER_DAYS * DAY;
}

/** Status shown to users: a verified source that has not been re-checked recently is presented as stale. */
export function effectiveSourceStatus(source: SourceEvidence, now = new Date()): SourceStatus {
  if (source.status === "verified" && isSourceStale(source, now)) return "stale";
  return source.status;
}

export function maxConfidenceForTier(tier: SourceTier): Confidence {
  return tier === "A" || tier === "B" ? "high" : tier === "C" ? "medium" : "low";
}

export function bestVerifiedTier(sourceIds: string[], sources: SourceEvidence[], now = new Date()): SourceTier | null {
  const tiers = sources
    .filter((s) => sourceIds.includes(s.id) && effectiveSourceStatus(s, now) === "verified")
    .map((s) => s.tier)
    .sort((a, b) => TIER_RANK[b] - TIER_RANK[a]);
  return tiers[0] ?? null;
}

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const live = (c: Claim) => c.status !== "rejected";

/**
 * Adds a claim without ever overwriting a verified value.
 * Same value → evidence is merged into the existing claim (status untouched).
 * Different value on a single-value field → the new claim is stored as disputed next to the existing one.
 */
export function addClaim(claims: Claim[], incoming: Claim): { claims: Claim[]; conflicts: Claim[]; merged: boolean } {
  const peers = claims.filter((c) => live(c) && c.professionalId === incoming.professionalId && c.field === incoming.field && (c.label ?? "") === (incoming.label ?? ""));
  const same = peers.find((c) => norm(c.value) === norm(incoming.value));
  if (same) {
    const sourceIds = Array.from(new Set([...same.sourceIds, ...incoming.sourceIds]));
    return { claims: claims.map((c) => (c.id === same.id ? { ...c, sourceIds, updatedAt: incoming.updatedAt } : c)), conflicts: [], merged: true };
  }
  if (!SINGLE_VALUE_FIELDS.includes(incoming.field) || !peers.length) {
    return { claims: [...claims, { ...incoming, status: incoming.status === "verified" ? "unverified" : incoming.status }], conflicts: [], merged: false };
  }
  // Conflict: verified peers keep their status; unverified peers become disputed; the newcomer is disputed.
  const next = claims.map((c) => (peers.some((p) => p.id === c.id) && c.status === "unverified" ? { ...c, status: "disputed" as const } : c));
  return { claims: [...next, { ...incoming, status: "disputed" }], conflicts: peers, merged: false };
}

export function findConflicts(claims: Claim[]): { professionalId: string; field: ClaimField; claims: Claim[] }[] {
  const groups = new Map<string, Claim[]>();
  for (const c of claims.filter((c) => live(c) && SINGLE_VALUE_FIELDS.includes(c.field))) {
    const key = `${c.professionalId}|${c.field}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.values()]
    .filter((g) => new Set(g.map((c) => norm(c.value))).size > 1)
    .map((g) => ({ professionalId: g[0].professionalId, field: g[0].field, claims: g }));
}

/** Verified claims that verifying `claim` would replace (single-value fields only). */
export function supersededBy(claim: Claim, claims: Claim[]): Claim[] {
  if (!SINGLE_VALUE_FIELDS.includes(claim.field)) return [];
  return claims.filter((c) => c.id !== claim.id && c.status === "verified" && c.professionalId === claim.professionalId && c.field === claim.field && norm(c.value) !== norm(claim.value));
}

export function verifyClaim(
  claim: Claim,
  ctx: { claims: Claim[]; sources: SourceEvidence[]; actor: Member; confidence: Confidence; now?: Date },
): { claim: Claim; superseded: string[] } {
  const now = ctx.now ?? new Date();
  if (!canReview(ctx.actor)) throw new WorkflowError("Only a legal reviewer or admin can verify claims.");
  if (claim.status === "rejected") throw new WorkflowError("Rejected claims cannot be verified. Add a new claim instead.");
  // The reviewer's own check is enough: no verified source, Tier A record or tier-based confidence cap is required.
  // On a single-value field, verifying a different value automatically supersedes the existing verified one(s).
  const supersede = SINGLE_VALUE_FIELDS.includes(claim.field)
    ? supersededBy(claim, ctx.claims).map((c) => c.id)
    : [];
  const at = now.toISOString();
  return {
    claim: { ...claim, status: "verified", confidence: ctx.confidence, reviewerId: ctx.actor.id, verifiedAt: at, supersedesId: supersede[0] ?? claim.supersedesId, updatedAt: at },
    superseded: supersede,
  };
}

export const SELF_CHECKED_METHOD = "Reviewer opened the source personally and confirmed it is authentic, current and matches the excerpt.";

/** `selfChecked` = the reviewer ticked the personal-check confirmation; the written method is then optional. */
export function verifySource(source: SourceEvidence, actor: Member, method: string, now = new Date(), selfChecked = false): SourceEvidence {
  if (!canReview(actor)) throw new WorkflowError("Only a legal reviewer or admin can verify sources.");
  if (!method.trim() && !selfChecked) throw new WorkflowError("Record how the source was verified (e.g. 'Opened official PDF, matched row 273').");
  if (source.status === "inaccessible") throw new WorkflowError("This source is marked inaccessible. Attach the evidence or re-open it before verifying.");
  const at = now.toISOString();
  return { ...source, status: "verified", verificationMethod: method.trim() || SELF_CHECKED_METHOD, reviewerId: actor.id, reviewedAt: at, accessedAt: source.accessedAt ?? at, updatedAt: at };
}

/** Manual confidence score set by a reviewer, on unverified or verified claims. */
export function setClaimConfidence(claim: Claim, actor: Member, confidence: Confidence, now = new Date()): Claim {
  if (!canReview(actor)) throw new WorkflowError("Only a legal reviewer or admin can score claim confidence.");
  if (claim.status === "rejected") throw new WorkflowError("Rejected claims cannot be re-scored.");
  return { ...claim, confidence, updatedAt: now.toISOString() };
}

const COMPLETENESS_FIELDS: ClaimField[] = ["canonical_name", "profession", "location", "bar_enrolment", "affiliation", "education", "practice_area", "publication", "profile_link", "contact"];

export function profileCompleteness(claims: Claim[], professionalId: string) {
  const mine = claims.filter((c) => c.professionalId === professionalId && live(c));
  const items = COMPLETENESS_FIELDS.map((field) => {
    const fc = mine.filter((c) => c.field === field);
    return { field, present: fc.length > 0, verified: fc.some((c) => c.status === "verified") };
  });
  const present = items.filter((i) => i.present).length;
  const verified = items.filter((i) => i.verified).length;
  return { items, presentPercent: Math.round((present / items.length) * 100), verifiedPercent: Math.round((verified / items.length) * 100) };
}

export interface QualityWarning { level: "info" | "warning"; message: string; entityId?: string }

export function dataQualityWarnings(input: { claims: Claim[]; sources: SourceEvidence[]; professionalId: string; now?: Date }): QualityWarning[] {
  const now = input.now ?? new Date();
  const mine = input.claims.filter((c) => c.professionalId === input.professionalId && live(c));
  const warnings: QualityWarning[] = [];
  for (const c of mine.filter((c) => !c.sourceIds.length)) warnings.push({ level: "warning", message: `"${c.value}" (${CLAIM_FIELD_LABEL[c.field]}) has no source attached — research lead only.`, entityId: c.id });
  for (const g of findConflicts(mine)) warnings.push({ level: "warning", message: `Conflicting values for ${CLAIM_FIELD_LABEL[g.field]}: ${g.claims.map((c) => `"${c.value}"`).join(" vs ")}.` });
  const used = new Set(mine.flatMap((c) => c.sourceIds));
  for (const s of input.sources.filter((s) => used.has(s.id))) {
    if (s.status === "inaccessible") warnings.push({ level: "info", message: `Source "${s.title}" could not be accessed automatically — manual review needed.`, entityId: s.id });
    else if (s.status === "contradicted") warnings.push({ level: "warning", message: `Source "${s.title}" is contradicted by other evidence.`, entityId: s.id });
    else if (isSourceStale(s, now)) warnings.push({ level: "info", message: `Source "${s.title}" was last accessed over ${STALE_AFTER_DAYS} days ago.`, entityId: s.id });
  }
  const unverified = mine.filter((c) => c.status !== "verified").length;
  if (unverified) warnings.push({ level: "info", message: `${unverified} claim(s) await verification and must not be published as fact.` });
  return warnings;
}
