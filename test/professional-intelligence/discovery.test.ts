import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptCandidate, buildCandidates, buildQueries, decodeClip, extractSuggestions, matchScore, redactContacts, rejectCandidate, type PersonContext } from "../../lib/professional-intelligence/discovery.ts";
import { parseFirecrawlSearch } from "../../lib/professional-intelligence/firecrawl.ts";
import { blankWorkspace } from "../../lib/professional-intelligence/seed.ts";
import { buildResearchProfile } from "../../lib/professional-intelligence/research.ts";

const person: PersonContext = { name: "Priya Sharma", aliases: ["P. Sharma"], profession: "Advocate", location: "Mumbai", context: "Bombay High Court" };
const PAGE = {
  url: "https://acme-legal.com/team/priya-sharma",
  title: "Priya Sharma — Partner | Acme Legal",
  text: `Priya Sharma is an Advocate practising in Mumbai before the Bombay High Court.
Priya Sharma is a Partner at Acme Legal Associates and focuses on arbitration and insolvency matters before the NCLT.
She completed her LL.B from Government Law College, Mumbai University.
Priya Sharma is enrolled with the Bar Council of Maharashtra & Goa, enrolment no. MAH/1234/2010.
Contact Priya Sharma at priya@acme-legal.com or +91 98765 43210.
Priya Sharma spoke at a webinar on arbitration clauses in 2024.
Cases: [Alpha Ltd Vs. Beta Ltd](https://ecourtsindia.com/cnr/MHHC010000012024) and MHHC010000022024 Gamma Vs. Delta Petitioner`,
};

test("queries are focused, deduplicated and limited by depth", () => {
  assert.equal(buildQueries(person, "quick").length, 3);
  assert.equal(buildQueries(person, "deep").length, 10);
  assert.ok(buildQueries(person, "deep").every((q) => q.includes('"Priya Sharma"') || q.includes('"P. Sharma"')));
  assert.ok(buildQueries(person, "standard").some((q) => q.includes("ecourtsindia.com")));
});

test("match score rewards name + profession + location and explains itself", () => {
  const high = matchScore(person, PAGE);
  assert.ok(high.score >= 80, String(high.score));
  assert.ok(high.reasons.includes("Full name appears on the page"));
  const other = matchScore(person, { url: "https://x.org", title: "Cooking with Anita", text: "Recipes from Pune by Anita Sharma." });
  assert.ok(other.score < 30, String(other.score));
  assert.ok(other.reasons.includes("Full name not found on the page"));
});

test("contacts are redacted and never become suggestions", () => {
  const r = redactContacts("Mail a@b.co or call +91 98765 43210 or 9876543210.");
  assert.equal(r.removed, 3);
  assert.doesNotMatch(r.text, /@|98765/);
  const { suggestions } = extractSuggestions(person, PAGE);
  assert.ok(suggestions.every((s) => !/@|98765/.test(s.value + s.excerpt)));
  assert.ok(!suggestions.some((s) => s.field === "contact"));
});

test("suggestions are extracted with their evidence sentence", () => {
  const { suggestions, cnrs } = extractSuggestions(person, PAGE);
  const get = (f: string) => suggestions.filter((s) => s.field === f).map((s) => s.value);
  assert.deepEqual(get("bar_enrolment"), ["MAH/1234/2010"]);
  assert.ok(get("affiliation")[0]?.startsWith("Acme Legal Associates"), JSON.stringify(get("affiliation")));
  assert.ok(get("education")[0]?.includes("LL.B"), JSON.stringify(get("education")));
  assert.ok(get("practice_area").includes("Arbitration") && get("practice_area").includes("Corporate insolvency (IBC)"));
  assert.ok(get("speaking").length === 1);
  assert.deepEqual(get("profession"), ["Advocate"]);
  assert.ok(suggestions.every((s) => s.excerpt.length > 10));
  assert.deepEqual(cnrs.map((c) => c.cnr).sort(), ["MHHC010000012024", "MHHC010000022024"]);
  assert.equal(cnrs.find((c) => c.cnr === "MHHC010000022024")!.title, "Gamma Vs. Delta");
});

test("sentences about other people are not used when the page is not about the person", () => {
  const { suggestions } = extractSuggestions(person, { url: "https://x.org", title: "Firm directory", text: "Rahul Mehta is a Partner at Zeta Law Associates and handles arbitration. Priya Sharma joined the firm in 2020." });
  assert.ok(!suggestions.some((s) => s.field === "affiliation"));
  assert.ok(!suggestions.some((s) => s.value === "Arbitration"));
});

test("candidates are deduplicated against known URLs and sorted by match", () => {
  const results = [
    { ...PAGE, description: "", query: "q1", scraped: true, note: "" },
    { url: "https://x.org/anita", title: "Anita Sharma recipes", description: "Cooking", text: "", query: "q1", scraped: false, note: "" },
    { ...PAGE, description: "", query: "q2", scraped: true, note: "" },
    { url: "https://known.org/a/", title: "Known", description: "", text: "", query: "q3", scraped: false, note: "" },
  ];
  const c = buildCandidates({ ...person, professionalId: "p1" }, results, ["https://known.org/a"]);
  assert.equal(c.length, 2);
  assert.equal(c[0].url, PAGE.url);
  assert.ok(c[0].matchScore > c[1].matchScore);
  assert.match(c[0].note, /contact detail/);
  assert.doesNotMatch(c[0].pageText, /@|98765/);
  assert.equal(c[0].status, "pending");
});

test("accepting adds an unreviewed source, unverified claims and court records; rejecting adds nothing", () => {
  const r = buildResearchProfile({ name: "Priya Sharma", profession: "Advocate" });
  let ws = { ...blankWorkspace(), professionals: [r.professional], claims: r.claims, sources: r.sources, activeProfessionalId: r.professional.id };
  const [cand] = buildCandidates({ ...person, professionalId: r.professional.id }, [{ ...PAGE, description: "", query: "q", scraped: true, note: "" }], []);
  ws = { ...ws, candidates: [cand] };
  const before = { s: ws.sources.length, c: ws.claims.length, k: ws.cases.length };
  const rejected = rejectCandidate(ws, cand.id);
  assert.deepEqual({ s: rejected.sources.length, c: rejected.claims.length, k: rejected.cases.length }, before);
  const enrolIdx = cand.suggestions.findIndex((s) => s.field === "bar_enrolment");
  const after = acceptCandidate(ws, cand.id, { suggestionIdx: [enrolIdx], cnrs: ["MHHC010000012024"] });
  assert.equal(after.sources.length, before.s + 1);
  assert.equal(after.sources[0].status, "unreviewed");
  const claim = after.claims.at(-1)!;
  assert.equal(claim.status, "unverified");
  assert.equal(claim.value, "MAH/1234/2010");
  assert.deepEqual(claim.sourceIds, [after.sources[0].id]);
  assert.equal(after.cases.length, 1);
  assert.equal(after.cases[0].status, "unknown");
  assert.equal(after.cases[0].representedSide, null, "side is never inferred from a listing");
  assert.equal(after.candidates[0].status, "accepted");
  assert.equal(acceptCandidate(after, cand.id, { suggestionIdx: [0], cnrs: [] }), after, "cannot accept twice");
  const again = acceptCandidate({ ...after, candidates: [{ ...cand, id: "c2", status: "pending" }] }, "c2", { suggestionIdx: [], cnrs: ["MHHC010000012024"] });
  assert.equal(again.cases.length, 1, "existing CNR not duplicated");
  assert.equal(again.sources.length, after.sources.length, "existing source URL reused");
});

test("Firecrawl v1 and v2 response shapes are both parsed", () => {
  assert.equal(parseFirecrawlSearch({ success: true, data: { web: [{ url: "a" }, { url: "b" }] } }).length, 2);
  assert.equal(parseFirecrawlSearch({ success: true, data: [{ url: "a" }] }).length, 1);
  assert.equal(parseFirecrawlSearch({ error: "x" }).length, 0);
});

test("clip payload from the extension decodes (URL-safe base64, unicode) and rejects bad input", () => {
  const clip = { url: "https://www.linkedin.com/in/priya", title: "Priya Sharma – LinkedIn", selection: "Partner — Acme ✓", clippedAt: "2026-10-12T10:00:00.000Z" };
  const b64 = Buffer.from(JSON.stringify(clip), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.deepEqual(decodeClip(`#clip=${b64}`), clip);
  assert.equal(decodeClip("#clip=not-base64!!"), null);
  const js = Buffer.from(JSON.stringify({ ...clip, url: "javascript:alert(1)" })).toString("base64");
  assert.equal(decodeClip(`#clip=${js}`), null);
  assert.equal(decodeClip("#other"), null);
});

test("eCourtsIndia listing blocks yield court, type, status and the listed appearance (only if it names the person)", () => {
  // Format as returned for an eCourtsIndia lawyer page (markdown).
  const md = String.raw`[**Ms. Reet Singla Vs. Government Of Nct Of Delhi**\
\
Petitioner Adv:AMISH TANDON\
\
Judge:Hon'ble Purushaindra Kumar Kaurav\
\
Court:High Court of Delhi, Delhi\
\
Case Type:Writ Petition (Civil)\
\
Case Status:Disposed\
\
Case Category:-](https://ecourtsindia.com/cnr/DLHC010248372023)

[**Oxyzo Financial Services Limited Vs. Rkn Project Pvt Ltd**\
\
Petitioner Adv:SOMEONE ELSE\
\
Court:Chief Metropolitan Magistrate, South, Saket Court, Delhi\
\
Case Type:Criminal Complaint Case\
\
Case Status:Pending\
\
Case Category:Negotiable Instruments Act - 138](https://ecourtsindia.com/cnr/DLST020463582024)`;
  const p = { name: "Amish Tandon", aliases: [], profession: "Advocate", location: "Delhi", context: "" };
  const { cnrs } = extractSuggestions(p, { url: "https://ecourtsindia.com/lawyer/amish-tandon", title: "Advocate Amish Tandon - Lawyer Profile", text: md });
  const a = cnrs.find((c) => c.cnr === "DLHC010248372023")!;
  assert.equal(a.title, "Ms. Reet Singla Vs. Government Of Nct Of Delhi");
  assert.equal(a.court, "High Court of Delhi, Delhi");
  assert.equal(a.caseType, "Writ Petition (Civil)");
  assert.equal(a.status, "disposed");
  assert.deepEqual(a.appearance, { side: "petitioner", text: "Petitioner Adv: AMISH TANDON" });

  const r = buildResearchProfile({ name: "Amish Tandon", profession: "Advocate" });
  const [cand] = buildCandidates({ ...p, professionalId: r.professional.id }, [{ url: "https://ecourtsindia.com/lawyer/amish-tandon", title: "Advocate Amish Tandon", description: "", text: md, query: "q", scraped: true, note: "" }], []);
  const ws = acceptCandidate({ ...blankWorkspace(), professionals: [r.professional], candidates: [cand] }, cand.id, { suggestionIdx: [], cnrs: ["DLHC010248372023", "DLST020463582024"] });
  const writ = ws.cases.find((c) => c.cnr === "DLHC010248372023")!;
  assert.equal(writ.category, "writ");
  assert.equal(writ.status, "disposed");
  assert.equal(writ.representedSide, "petitioner");
  assert.equal(writ.representedSideVerified, false);
  const ni = ws.cases.find((c) => c.cnr === "DLST020463582024")!;
  assert.equal(ni.category, "cheque_dishonour");
  assert.equal(ni.representedSide, null, "listing names a different advocate → no side recorded");
});
