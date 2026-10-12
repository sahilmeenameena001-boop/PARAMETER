import type { OpportunityScore, SourceEvidence } from "@/types/professional-intelligence";
import { SCORE_MAX } from "./constants.ts";
import { bestVerifiedTier } from "./evidence.ts";

export type ScoreKey = keyof typeof SCORE_MAX;
export const SCORE_KEYS = Object.keys(SCORE_MAX) as ScoreKey[];

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));

/** Heuristic planning score out of 100. Not a prediction of engagement or leads. */
export function scoreTotal(score: OpportunityScore) {
  return SCORE_KEYS.reduce((sum, key) => sum + clamp(score[key].score, SCORE_MAX[key]), 0);
}

export function setScoreComponent(score: OpportunityScore, key: ScoreKey, value: number, rationale?: string): OpportunityScore {
  return { ...score, [key]: { score: clamp(value, SCORE_MAX[key]), rationale: rationale ?? score[key].rationale } };
}

/** Suggested evidence component, derived from the best *verified* source linked to the idea. */
export function suggestEvidenceScore(sourceIds: string[], sources: SourceEvidence[], now = new Date()) {
  const tier = bestVerifiedTier(sourceIds, sources, now);
  const linked = sources.filter((s) => sourceIds.includes(s.id)).length;
  if (!linked) return { score: 0, rationale: "No sources linked." };
  if (!tier) return { score: 5, rationale: `${linked} source(s) linked, none verified yet.` };
  const score = { A: 25, B: 20, C: 12, D: 8 }[tier];
  return { score, rationale: `Best verified source is Tier ${tier}.` };
}

export function emptyScore(): OpportunityScore {
  const blank = { score: 0, rationale: "" };
  return { evidence: blank, relevance: blank, expertise: blank, interest: blank, originality: blank, readiness: blank };
}
