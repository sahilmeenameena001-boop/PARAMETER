import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResearchProfile, classifyUrl, searchLinks, starterIdeas } from "../../lib/professional-intelligence/research.ts";
import { importCasesCsv } from "../../lib/professional-intelligence/litigation.ts";
import { deleteCase, deleteClaim, deleteContent, deletePillar, deleteProfessional, deletePublication } from "../../lib/professional-intelligence/workspace-ops.ts";
import { extractPage, robotsAllows } from "../../lib/professional-intelligence/fetch-source.ts";
import { blankWorkspace, seedWorkspace } from "../../lib/professional-intelligence/seed.ts";

test("URL classification suggests tiers but marks login walls", () => {
  assert.deepEqual([classifyUrl("https://www.linkedin.com/in/x").tier, classifyUrl("https://www.linkedin.com/in/x").loginWalled], ["C", true]);
  assert.equal(classifyUrl("https://ecourtsindia.com/lawyer/x").tier, "D");
  assert.equal(classifyUrl("https://delhihighcourt.nic.in/files/list.pdf").tier, "A");
  assert.equal(classifyUrl("https://niyogibooksindia.com/books/x").sourceType, "publisher_page");
  assert.equal(classifyUrl("https://acme-legal.com/team/x").sourceType, "firm_page");
  assert.equal(classifyUrl("https://example.org/x").tier, "D");
});

test("research profile for any person: everything unverified, sources linked, bad URLs reported", () => {
  const r = buildResearchProfile({ name: "Priya Sharma", profession: "Advocate", location: "Mumbai", aliases: ["P. Sharma"], urls: ["https://www.linkedin.com/in/priya", "https://ecourtsindia.com/lawyer/priya-sharma", "not a url", "https://www.linkedin.com/in/priya"] });
  assert.equal(r.professional.displayName, "Priya Sharma");
  assert.equal(r.professional.isExample, false);
  assert.equal(r.sources.length, 2, "duplicate URL ignored");
  assert.equal(r.sources.find((s) => s.url.includes("linkedin"))!.status, "inaccessible");
  assert.equal(r.errors.length, 1);
  assert.ok(r.claims.every((c) => c.status === "unverified" && c.professionalId === r.professional.id));
  assert.deepEqual(r.claims.map((c) => c.field).sort(), ["alias", "canonical_name", "location", "profession", "profile_link", "profile_link"]);
  assert.deepEqual(r.claims.find((c) => c.field === "canonical_name")!.sourceIds.length, 2);
  assert.equal(r.pillars.length, 5);
  assert.equal(r.pillars.reduce((s, p) => s + p.allocation, 0), 100);
  assert.throws(() => buildResearchProfile({ name: "  ", profession: "" }));
});

test("search links are encoded public URLs for the given name", () => {
  const links = searchLinks("Priya Sharma", "Bombay High Court");
  assert.ok(links.length >= 5);
  assert.ok(links.every((l) => l.url.startsWith("https://")));
  assert.ok(links[0].url.includes(encodeURIComponent('Advocate "Priya Sharma" Bombay High Court')));
  assert.ok(searchLinks("Priya Sharma", "", "Chartered Accountant")[0].url.includes(encodeURIComponent('Chartered Accountant "Priya Sharma"')));
});

test("starter ideas come from practice areas and publications, start as research_needed, no duplicates", () => {
  const w = seedWorkspace();
  const pid = w.activeProfessionalId;
  const ideas = starterIdeas({ professionalId: pid, claims: w.claims, publications: w.publications, pillars: w.pillars.filter((p) => p.professionalId === pid), existingTitles: [], authorId: "member-editor" });
  assert.ok(ideas.length >= 5);
  assert.ok(ideas.every((i) => i.status === "research_needed" && i.body === "" && i.score.evidence.score === 0));
  const again = starterIdeas({ professionalId: pid, claims: w.claims, publications: w.publications, pillars: [], existingTitles: ideas.map((i) => i.title), authorId: "x" });
  assert.equal(again.length, 0);
  assert.equal(starterIdeas({ professionalId: "nobody", claims: w.claims, publications: w.publications, pillars: [], existingTitles: [], authorId: "x" }).length, 0);
});

test("case CSV import: validation, CNR dedupe, sources created, nothing partial on error", () => {
  const header = "cnr,title,court,case_type,acts,status,filing_date,disposal_date,represented_side,appearance_evidence,source_url";
  const ok = `${header}\nDLHC01,A vs. B,High Court of Delhi,Writ Petition (Civil),,pending,2024-01-01,,petitioner,"Petitioner Adv: X",https://ecourtsindia.com/cnr/DLHC01\nDLST02,C vs D,CMM Saket,Criminal Complaint Case,Negotiable Instruments Act - 138,disposed,2023-01-01,2024-01-01,,,https://services.ecourts.gov.in/x`;
  const r = importCasesCsv(ok, { professionalId: "p", existing: [], sources: [] });
  assert.deepEqual(r.errors, []);
  assert.equal(r.cases.length, 2);
  assert.equal(r.cases[1].category, "cheque_dishonour");
  assert.deepEqual(r.cases[0].parties.map((p) => p.name), ["A", "B"]);
  assert.equal(r.cases[0].representedSideVerified, false);
  assert.deepEqual(r.sources.map((s) => s.tier), ["D", "A"]);
  const again = importCasesCsv(ok, { professionalId: "p", existing: r.cases, sources: r.sources });
  assert.equal(again.cases.length, 0);
  assert.equal(again.skipped.length, 2);
  const bad = importCasesCsv(`${header}\nX1,E vs F,Court,,,maybe,2024-13-01,,respondent,,`, { professionalId: "p", existing: [], sources: [] });
  assert.equal(bad.cases.length, 0);
  assert.match(bad.errors[0], /status must be/);
  assert.match(bad.errors[0], /dates must be/);
  assert.match(bad.errors[0], /appearance_evidence/);
  assert.match(importCasesCsv("cnr,status\nX,pending", { professionalId: "p", existing: [], sources: [] }).errors[0], /Missing required column/);
});

test("deletes cascade and unlink", () => {
  const w = seedWorkspace();
  const pid = w.activeProfessionalId;
  const idea = { ...w.content[0], caseIds: [w.cases[0].id], claimIds: [w.claims[0].id] };
  const ws = { ...w, content: [idea, ...w.content.slice(1)], orders: [{ id: "o", caseId: w.cases[0].id, orderNumber: null, orderDate: null, orderUrl: null, pdfUrl: null, isFinal: true, extractionStatus: "not_started" as const, extractedAt: null, orderText: "", review: null, createdAt: "", updatedAt: "" }] };
  const a = deleteCase(ws, w.cases[0].id);
  assert.equal(a.orders.length, 0);
  assert.deepEqual(a.content[0].caseIds, []);
  assert.deepEqual(deleteClaim(ws, w.claims[0].id).content[0].claimIds, []);
  assert.ok(deletePublication(ws, "pub-posh-book").content.every((c) => !c.publicationIds.includes("pub-posh-book")));
  assert.ok(deletePillar(ws, "pil-posh").content.filter((c) => c.pillarId === "pil-posh").length === 0);
  assert.equal(deleteContent(ws, idea.id).content.length, ws.content.length - 1);
  const gone = deleteProfessional(ws, pid);
  assert.equal(gone.professionals.length, 0);
  assert.equal(gone.claims.length + gone.cases.length + gone.orders.length + gone.content.length + gone.pillars.length + gone.publications.length, 0);
  assert.equal(gone.sources.length, 0, "sources used only by this profile are removed");
  assert.equal(gone.activeProfessionalId, "");
});

test("blank workspace has no example data", () => {
  const b = blankWorkspace();
  assert.equal(b.professionals.length + b.sources.length + b.claims.length + b.cases.length + b.content.length, 0);
  assert.ok(b.members.length > 0);
});

test("robots.txt rules and page extraction", () => {
  const robots = "User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: BadBot\nDisallow: /";
  assert.equal(robotsAllows(robots, "/profile/x"), true);
  assert.equal(robotsAllows(robots, "/private/a"), false);
  assert.equal(robotsAllows(robots, "/private/public/a"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /", "/anything"), false);
  assert.equal(robotsAllows("", "/x"), true);
  const page = extractPage(`<html><head><title>Ignored</title><meta property="og:title" content="Jane Doe &amp; Co"><meta name="description" content="Advocate in Delhi"></head><body><nav>menu</nav><script>evil()</script><p>Jane practises arbitration.</p></body></html>`);
  assert.equal(page.title, "Jane Doe & Co");
  assert.equal(page.description, "Advocate in Delhi");
  assert.match(page.text, /Jane practises arbitration\./);
  assert.doesNotMatch(page.text, /evil|menu/);
});
