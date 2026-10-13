import { test } from "node:test";
import assert from "node:assert/strict";
import type { Claim } from "../../types/professional-intelligence.ts";
import { buildSummary } from "../../lib/professional-intelligence/summary.ts";
import { acceptCandidate, buildCandidates } from "../../lib/professional-intelligence/discovery.ts";
import { buildResearchProfile } from "../../lib/professional-intelligence/research.ts";
import { blankWorkspace, seedWorkspace } from "../../lib/professional-intelligence/seed.ts";

const NOW = new Date("2026-10-13T00:00:00Z");
const viewer = { role: "viewer" as const }, editor = { role: "editor" as const }, reviewer = { role: "legal_reviewer" as const };

function workspace() {
  const r = buildResearchProfile({ name: "Priya Sharma", profession: "Advocate", location: "Mumbai" }, NOW);
  const src = { ...seedWorkspace().sources[1], id: "s1", status: "verified" as const, accessedAt: NOW.toISOString() };
  const base: Claim = { ...r.claims[0], sourceIds: ["s1"] };
  const c = (id: string, field: Claim["field"], value: string, extra: Partial<Claim> = {}): Claim => ({ ...base, id, field, value, status: "verified", confidence: "high", label: null, ...extra });
  const claims = [
    ...r.claims.map((x) => ({ ...x, status: "verified" as const, sourceIds: ["s1"] })),
    c("photo", "photo", "https://firm.example/priya.jpg"),
    c("addr", "office_address", "Chamber 12, Bombay High Court, Mumbai", { label: "Office", visibility: "restricted" }),
    c("mail", "contact", "priya@firm.example", { label: "Email", visibility: "restricted" }),
    c("tel", "contact", "+91 98765 43210", { label: "Phone", visibility: "public" }),
    c("firm", "affiliation", "Acme Legal Associates", { label: "Acme Legal Associates" }),
    c("pa", "practice_area", "Arbitration"),
    c("lead", "practice_area", "Tax", { status: "unverified", confidence: "low" }),
  ];
  return { ...blankWorkspace(), professionals: [r.professional], sources: [src], claims, activeProfessionalId: r.professional.id };
}

test("summary includes photo, location, address and contacts for reviewers", () => {
  const ws = workspace();
  const s = buildSummary(ws, ws.activeProfessionalId, reviewer, { now: NOW });
  assert.equal(s.name, "Priya Sharma");
  assert.equal(s.photo?.value, "https://firm.example/priya.jpg");
  assert.equal(s.location?.value, "Mumbai");
  assert.deepEqual(s.officeAddresses.map((a) => a.value), ["Chamber 12, Bombay High Court, Mumbai"]);
  assert.deepEqual(s.emails.map((e) => e.value), ["priya@firm.example"]);
  assert.deepEqual(s.phones.map((e) => e.value), ["+91 98765 43210"]);
  assert.equal(s.contactsWithheld, 0);
  assert.equal(s.photo?.sources[0].url, ws.sources[0].url, "every item keeps its source");
  assert.match(s.narrative, /Priya Sharma is an Advocate based in Mumbai\. Affiliated with Acme Legal Associates\. Practice areas include Arbitration\./);
});

test("restricted contacts are withheld from editors and viewers; public ones are shown", () => {
  const ws = workspace();
  for (const role of [viewer, editor]) {
    const s = buildSummary(ws, ws.activeProfessionalId, role, { now: NOW });
    assert.equal(s.emails.length, 0);
    assert.equal(s.officeAddresses.length, 0);
    assert.deepEqual(s.phones.map((p) => p.value), ["+91 98765 43210"]);
    assert.equal(s.contactsWithheld, 2);
  }
  assert.equal(buildSummary(ws, ws.activeProfessionalId, null, { now: NOW }).contactsWithheld, 2, "anonymous callers see public contacts only");
});

test("unverified items are excluded by default and labelled when included", () => {
  const ws = workspace();
  assert.deepEqual(buildSummary(ws, ws.activeProfessionalId, reviewer, { now: NOW }).practiceAreas.map((p) => p.value), ["Arbitration"]);
  const all = buildSummary(ws, ws.activeProfessionalId, reviewer, { now: NOW, includeUnverified: true });
  assert.deepEqual(all.practiceAreas.map((p) => [p.value, p.status]), [["Arbitration", "verified"], ["Tax", "unverified"]]);
  assert.ok(all.includesUnverified);
});

test("example profile summary: nothing verified yet, litigation derived from records, no win rate", () => {
  const ws = seedWorkspace();
  const s = buildSummary(ws, ws.activeProfessionalId, reviewer, { now: NOW });
  assert.equal(s.profession, null);
  assert.equal(s.litigation.records, 10);
  assert.ok(!("winRate" in s.litigation));
  assert.match(s.narrative, /10 court record\(s\) on file \(5 pending, 5 disposed\); 0 outcome\(s\) reviewed\./);
  const lead = buildSummary(ws, ws.activeProfessionalId, reviewer, { now: NOW, includeUnverified: true });
  assert.match(lead.narrative, /Advocate \[unverified\]/);
  assert.equal(lead.emails.length, 0, "the seed never stored the listed phone/email values");
  assert.throws(() => buildSummary(ws, "nope", reviewer));
});

test("discovered contacts are accepted as restricted claims", () => {
  const r = buildResearchProfile({ name: "Priya Sharma", profession: "Advocate" }, NOW);
  const person = { name: "Priya Sharma", aliases: [], profession: "Advocate", location: "", context: "", professionalId: r.professional.id };
  const [cand] = buildCandidates(person, [{ url: "https://firm.example/priya", title: "Priya Sharma | Firm", description: "", text: "Priya Sharma, Advocate. Email: priya@firm.example. Office: Chamber 12, Fort, Mumbai 400032 | Mobile 9876543210", query: "q", scraped: true, note: "" }], [], NOW);
  assert.doesNotMatch(cand.pageText + cand.excerpt, /priya@|98765/, "stored page text stays redacted");
  const idx = cand.suggestions.map((s, i) => (["contact", "office_address"].includes(s.field) ? i : -1)).filter((i) => i >= 0);
  assert.equal(idx.length, 3);
  const ws = acceptCandidate({ ...blankWorkspace(), professionals: [r.professional], candidates: [cand] }, cand.id, { suggestionIdx: idx, cnrs: [] }, NOW);
  assert.ok(ws.claims.every((c) => c.visibility === "restricted" && c.status === "unverified"));
});
