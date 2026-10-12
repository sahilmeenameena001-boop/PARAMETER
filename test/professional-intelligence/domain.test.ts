import { test } from "node:test";
import assert from "node:assert/strict";
import type { Claim, ContentIdea, CourtCase, CourtOrder, Member, SourceEvidence } from "../../types/professional-intelligence.ts";
import { addClaim, effectiveSourceStatus, findConflicts, verifyClaim, verifySource } from "../../lib/professional-intelligence/evidence.ts";
import { caseOutcome, elapsedCaseDays, findDuplicateCases, normalizeCategory, reviewOrderOutcome, summarizeLitigation } from "../../lib/professional-intelligence/litigation.ts";
import { complianceIssues, exportMarkdown, generateBrief, reviseContent, transitionBlockers, transitionContent } from "../../lib/professional-intelligence/content.ts";
import { scoreTotal, setScoreComponent, suggestEvidenceScore } from "../../lib/professional-intelligence/scoring.ts";
import { aggregatePerformance, importPerformanceCsv } from "../../lib/professional-intelligence/performance.ts";
import { redactClaim } from "../../lib/professional-intelligence/access.ts";
import { LEGAL_DISCLAIMER } from "../../lib/professional-intelligence/constants.ts";
import { seedWorkspace } from "../../lib/professional-intelligence/seed.ts";

const NOW = new Date("2026-10-12T12:00:00Z");
const editor: Member = { id: "e", name: "Editor", role: "editor" };
const reviewer: Member = { id: "r", name: "Reviewer", role: "legal_reviewer" };
const viewer: Member = { id: "v", name: "Viewer", role: "viewer" };
const ws = () => seedWorkspace();
const source = (id: string, patch: Partial<SourceEvidence> = {}): SourceEvidence => ({ ...ws().sources[0], id, ...patch });
const claimOf = (patch: Partial<Claim>): Claim => ({ ...ws().claims[0], ...patch });

// ---------- sources & claims ----------
test("claims cannot be verified without a verified source", () => {
  const c = claimOf({ id: "c1", sourceIds: ["s1"] });
  assert.throws(() => verifyClaim(c, { claims: [c], sources: [source("s1")], actor: reviewer, confidence: "low", now: NOW }), /verified, current source/);
});

test("only reviewers verify; tier caps confidence; enrolment needs Tier A", () => {
  const sB = source("sB", { tier: "B", status: "verified", accessedAt: NOW.toISOString() });
  const c = claimOf({ id: "c1", field: "profession", sourceIds: ["sB"] });
  assert.throws(() => verifyClaim(c, { claims: [c], sources: [sB], actor: editor, confidence: "low", now: NOW }), /legal reviewer/);
  const ok = verifyClaim(c, { claims: [c], sources: [sB], actor: reviewer, confidence: "high", now: NOW });
  assert.equal(ok.claim.status, "verified");
  const sD = source("sD", { tier: "D", status: "verified", accessedAt: NOW.toISOString() });
  const c2 = claimOf({ id: "c2", field: "practice_area", sourceIds: ["sD"] });
  assert.throws(() => verifyClaim(c2, { claims: [c2], sources: [sD], actor: reviewer, confidence: "high", now: NOW }), /at most "low"/);
  const c3 = claimOf({ id: "c3", field: "bar_enrolment", sourceIds: ["sB"] });
  assert.throws(() => verifyClaim(c3, { claims: [c3], sources: [sB], actor: reviewer, confidence: "low", now: NOW }), /Tier A/);
});

test("a verified claim is never overwritten by a conflicting claim", () => {
  const verified = claimOf({ id: "v1", field: "bar_enrolment", value: "D/1106/2009", status: "verified", confidence: "high" });
  const incoming = claimOf({ id: "n1", field: "bar_enrolment", value: "D/9999/2010", confidence: "low" });
  const { claims, conflicts } = addClaim([verified], incoming);
  assert.equal(claims.find((c) => c.id === "v1")!.value, "D/1106/2009");
  assert.equal(claims.find((c) => c.id === "v1")!.status, "verified");
  assert.equal(claims.find((c) => c.id === "n1")!.status, "disputed");
  assert.equal(conflicts.length, 1);
  assert.equal(findConflicts(claims).length, 1);
  // Verifying the rival requires explicit supersede and cannot lower confidence.
  const sA = source("sA", { tier: "A", status: "verified", accessedAt: NOW.toISOString() });
  const rival = { ...claims.find((c) => c.id === "n1")!, sourceIds: ["sA"] };
  assert.throws(() => verifyClaim(rival, { claims, sources: [sA], actor: reviewer, confidence: "high", now: NOW }), /supersede/);
  assert.throws(() => verifyClaim(rival, { claims, sources: [sA], actor: reviewer, confidence: "medium", now: NOW, supersedeIds: ["v1"] }), /lower-confidence/);
});

test("same-value claims merge evidence without changing status", () => {
  const existing = claimOf({ id: "a", field: "canonical_name", value: "Amish Tandon", sourceIds: ["s1"] });
  const { claims, merged } = addClaim([existing], claimOf({ id: "b", field: "canonical_name", value: " amish  tandon ", sourceIds: ["s2"] }));
  assert.ok(merged);
  assert.deepEqual(claims[0].sourceIds, ["s1", "s2"]);
  assert.equal(claims.length, 1);
});

test("old verified sources are shown as stale; source verification records method", () => {
  assert.equal(effectiveSourceStatus(source("s", { status: "verified", accessedAt: "2025-01-01T00:00:00Z" }), NOW), "stale");
  assert.throws(() => verifySource(source("s"), reviewer, " "), /how the source was verified/);
  assert.throws(() => verifySource(source("s"), editor, "checked"), /legal reviewer/);
  assert.equal(verifySource(source("s"), reviewer, "Opened official PDF", NOW).status, "verified");
});

test("restricted contacts are redacted for non-reviewers", () => {
  const c = ws().claims.find((c) => c.field === "contact")!;
  assert.ok(redactClaim(c, viewer).redacted);
  assert.ok(redactClaim(c, editor).redacted);
  assert.ok(!redactClaim(c, reviewer).redacted);
});

// ---------- litigation ----------
test("category normalisation", () => {
  assert.equal(normalizeCategory("Criminal Complaint Case", "Negotiable Instruments Act - 138").category, "cheque_dishonour");
  assert.deepEqual(normalizeCategory("Interlocutory Application (IBC)"), { category: "interim_misc", isInterim: true });
  assert.equal(normalizeCategory("Company Appeal (AT) (Insolvency)").category, "insolvency_appeal");
  assert.equal(normalizeCategory("Writ Petition (Civil)").category, "writ");
  assert.equal(normalizeCategory("Unrecognized case type").category, "other");
});

test("deduplication: same CNR is duplicate; same parties with different CNRs is only 'possibly related'", () => {
  const cases = ws().cases;
  const groups = findDuplicateCases(cases);
  const related = groups.find((g) => g.kind === "possibly_related");
  assert.ok(related, "Smiths Detection writs should be flagged");
  assert.deepEqual(related!.caseIds.sort(), ["case-DLHC010421942024", "case-DLHC010422562024"]);
  const dup = [...cases, { ...cases[0], id: "copy", cnr: cases[0].cnr!.toLowerCase() }];
  assert.ok(findDuplicateCases(dup).some((g) => g.kind === "duplicate" && g.caseIds.includes("copy")));
  assert.equal(summarizeLitigation(dup, []).records, cases.length, "exact duplicate not double counted");
});

test("disposed ≠ outcome; missing order text keeps outcome unverified", () => {
  const c = ws().cases.find((c) => c.status === "disposed")!;
  assert.equal(caseOutcome(c, []).state, "unverified");
  const order: CourtOrder = { id: "o1", caseId: c.id, orderNumber: null, orderDate: "2025-01-01", orderUrl: null, pdfUrl: null, isFinal: true, extractionStatus: "not_started", extractedAt: null, orderText: "", review: null, createdAt: "", updatedAt: "" };
  const v = caseOutcome(c, [order]);
  assert.equal(v.state, "unverified");
  assert.equal(v.state === "unverified" && v.reason, "Order text not extracted");
  assert.throws(() => reviewOrderOutcome(order, { outcome: "allowed", reliefSought: "", reliefGranted: "", disposalNature: "merits", rationale: "x".repeat(30), excerpt: "x", method: "read", confidence: "high" }, reviewer), /Order text is missing/);
});

test("outcome review requires verbatim excerpt, rationale, reviewer and consistent disposal nature", () => {
  const c = ws().cases.find((c) => c.status === "disposed")!;
  const order: CourtOrder = { id: "o1", caseId: c.id, orderNumber: "1", orderDate: "2025-01-01", orderUrl: null, pdfUrl: null, isFinal: true, extractionStatus: "manual", extractedAt: null, orderText: "The petition is dismissed as withdrawn with liberty to file afresh.", review: null, createdAt: "", updatedAt: "" };
  const base = { reliefSought: "", reliefGranted: "None", rationale: "Operative para records withdrawal with liberty.", excerpt: "dismissed as withdrawn", method: "Read operative paragraph", confidence: "high" as const };
  assert.throws(() => reviewOrderOutcome(order, { ...base, outcome: "withdrawn", disposalNature: "procedural" }, editor), /legal reviewer/);
  assert.throws(() => reviewOrderOutcome(order, { ...base, outcome: "withdrawn", disposalNature: "procedural", excerpt: "petition allowed" }, reviewer), /verbatim/);
  assert.throws(() => reviewOrderOutcome(order, { ...base, outcome: "withdrawn", disposalNature: "merits" }, reviewer), /procedural result/);
  const reviewed = reviewOrderOutcome(order, { ...base, outcome: "withdrawn", disposalNature: "procedural" }, reviewer, NOW);
  const v = caseOutcome(c, [reviewed]);
  assert.equal(v.state === "verified" && v.outcome, "withdrawn");
});

test("litigation totals are derived from records, not hard-coded", () => {
  const w = ws();
  const s = summarizeLitigation(w.cases, w.orders);
  assert.equal(s.records, w.cases.length);
  assert.equal(s.byStatus.pending + s.byStatus.disposed + s.byStatus.unknown, w.cases.length);
  assert.equal(s.byStatus.disposed, w.cases.filter((c) => c.status === "disposed").length);
  assert.equal(s.outcomesVerified, 0);
  assert.equal(s.disposedWithoutVerifiedOutcome, s.byStatus.disposed);
  const fewer = summarizeLitigation(w.cases.slice(0, 3), []);
  assert.equal(fewer.records, 3);
  assert.ok(!("winRate" in s));
});

test("elapsed duration only when dates exist", () => {
  assert.equal(elapsedCaseDays({ filingDate: null, disposalDate: null, status: "pending" }, NOW), null);
  assert.equal(elapsedCaseDays({ filingDate: "2026-10-01", disposalDate: "2026-10-11", status: "disposed" }), 10);
});

// ---------- content gate ----------
const draftOf = (patch: Partial<ContentIdea> = {}): ContentIdea => ({ ...ws().content[0], status: "draft", body: `Explainer text.\n\n${LEGAL_DISCLAIMER}`, authorId: "e", ...patch });

test("approval requires reviewer, four-eyes and verified sources", () => {
  const w = ws();
  const item = draftOf({ status: "legal_review" });
  const ctx = { sources: w.sources, claims: w.claims, cases: w.cases, orders: w.orders, now: NOW };
  assert.ok(transitionBlockers(item, "approved", { ...ctx, actor: editor }).some((r) => /legal reviewer/.test(r)));
  assert.ok(transitionBlockers(item, "approved", { ...ctx, actor: { ...reviewer, id: "e" } }).some((r) => /four-eyes/.test(r)));
  assert.ok(transitionBlockers(item, "approved", { ...ctx, actor: reviewer }).some((r) => /not verified/.test(r)), "seed source is unreviewed");
  const sources = w.sources.map((s) => (s.id === "src-niyogi-posh-book" ? { ...s, status: "verified" as const } : s));
  const approved = transitionContent(item, "approved", { ...ctx, sources, actor: reviewer });
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvals.at(-1)!.by, "r");
});

test("no bypass: cannot jump idea→approved/published, cannot schedule unapproved, cannot publish unscheduled", () => {
  const w = ws();
  const ctx = { sources: w.sources, claims: w.claims, actor: { id: "admin", name: "A", role: "admin" as const }, now: NOW };
  const idea = { ...w.content[0], status: "idea" as const };
  assert.throws(() => transitionContent(idea, "approved", ctx));
  assert.throws(() => transitionContent(idea, "published", ctx));
  assert.throws(() => transitionContent(draftOf(), "scheduled", { ...ctx, scheduledAt: "2026-11-03" }));
  assert.throws(() => transitionContent(draftOf({ status: "approved" }), "published", ctx));
  assert.throws(() => transitionContent(draftOf({ status: "approved", approvals: [] }), "scheduled", { ...ctx, scheduledAt: "2026-11-03" }), /must be approved/);
});

test("legal review needs body, links and disclaimer; compliance flags block approval", () => {
  const w = ws();
  const ctx = { sources: w.sources, claims: w.claims, actor: editor, now: NOW };
  const r = transitionBlockers(draftOf({ body: "", sourceIds: [], publicationIds: [] }), "legal_review", ctx);
  assert.ok(r.some((x) => /Write a draft/.test(x)) && r.some((x) => /Link at least one/.test(x)) && r.some((x) => /disclaimer/.test(x)));
  assert.deepEqual(complianceIssues("We guarantee results. Best lawyer in Delhi. Our win rate is 95%."), ["Promises or guarantees of outcome", "Win/success-rate claims", "Superlative self-promotion"]);
  const flagged = draftOf({ status: "legal_review", sourceIds: [], publicationIds: [], body: `Book a free consultation today. ${LEGAL_DISCLAIMER}` });
  assert.ok(transitionBlockers(flagged, "approved", { ...ctx, actor: reviewer }).some((x) => /Compliance flags/.test(x)));
});

test("editing approved content sends it back to draft with revision history", () => {
  const item = draftOf({ status: "approved", approvals: [{ id: "a", at: "", by: "r", from: "legal_review", to: "approved", note: "" }] });
  const revised = reviseContent(item, item.body + " more", editor, "tweak", NOW);
  assert.equal(revised.status, "draft");
  assert.equal(revised.revisions.length, 1);
  assert.throws(() => reviseContent(item, "x", viewer), /Viewers/);
  assert.throws(() => reviseContent({ ...item, status: "published" }, "x", editor), /locked/);
});

test("brief excludes unverified facts from the 'may state' list; export only after approval", () => {
  const w = ws();
  const item = { ...w.content[2] };
  const brief = generateBrief(item, { ...w, professionalName: "Amish Tandon", pillarName: "Authority", now: NOW });
  assert.match(brief, /None yet\. Do not state any professional facts until verified/);
  assert.match(brief, /Do NOT state as fact[\s\S]*Publication/);
  assert.doesNotMatch(brief, /D\/1106\/2009/);
  assert.throws(() => exportMarkdown(item, brief), /Only approved/);
});

// ---------- scoring ----------
test("score is the clamped sum of components out of 100", () => {
  const s = ws().content[0].score;
  const total = scoreTotal(s);
  assert.equal(total, s.evidence.score + s.relevance.score + s.expertise.score + s.interest.score + s.originality.score + s.readiness.score);
  const maxed = (["evidence", "relevance", "expertise", "interest", "originality", "readiness"] as const).reduce((acc, k) => setScoreComponent(acc, k, 999), s);
  assert.equal(scoreTotal(maxed), 100);
  assert.equal(setScoreComponent(s, "evidence", -5).evidence.score, 0);
  assert.equal(suggestEvidenceScore([], [], NOW).score, 0);
  assert.equal(suggestEvidenceScore(["sA"], [source("sA", { tier: "A", status: "verified", accessedAt: NOW.toISOString() })], NOW).score, 25);
});

// ---------- performance ----------
test("CSV import validates rows, keeps blanks unknown and requires attribution for enquiries", () => {
  const csv = [
    "content_id,platform,published_at,period_start,period_end,impressions,clicks,reactions,comments,saves,shares,qualified_enquiries,consultations,attribution_evidence",
    'idea-01,LinkedIn,2026-11-03,2026-11-03,2026-11-10,"1,200",30,40,5,,2,,,',
    "idea-01,LinkedIn,,2026-11-03,2026-11-10,10,,,,,,2,,",
    "nope,LinkedIn,,2026-11-03,2026-11-01,,,,,,,,,",
  ].join("\r\n");
  const { records, errors } = importPerformanceCsv(csv, { professionalId: "p", contentIds: ["idea-01"], now: NOW });
  assert.equal(records.length, 1);
  assert.equal(records[0].impressions, 1200);
  assert.equal(records[0].saves, null);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /attribution_evidence/);
  assert.match(errors[1], /unknown content_id/);
  assert.equal(aggregatePerformance([], ws().content, "pillar", (x) => x).length, 0, "no data → no groups");
});
