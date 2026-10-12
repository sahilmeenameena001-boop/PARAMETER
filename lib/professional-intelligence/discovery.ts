import type { Claim, ClaimField, CourtCase, DiscoveredCase, DiscoveryCandidate, DiscoverySuggestion, SourceEvidence, Workspace } from "@/types/professional-intelligence";
import { classifyUrl } from "./research.ts";
import { normalizeCategory, normalizeCnr } from "./litigation.ts";

// Automatic discovery produces CANDIDATES only. Nothing becomes a source or claim until a person accepts it,
// and accepted items are still unverified. Contact details (phones/emails) are never extracted.

export type DiscoveryDepth = "quick" | "standard" | "deep";
export const DEPTH_QUERIES: Record<DiscoveryDepth, number> = { quick: 3, standard: 6, deep: 10 };

export interface PersonContext { name: string; aliases: string[]; profession: string; location: string; context: string }

export function buildQueries(p: PersonContext, depth: DiscoveryDepth = "standard"): string[] {
  const n = `"${p.name.trim()}"`;
  const loc = p.location.trim();
  const prof = p.profession.trim() || "advocate";
  const ctx = p.context.trim();
  const all = [
    `${n} ${prof}${loc ? ` ${loc}` : ""}${ctx ? ` ${ctx}` : ""}`,
    `${n} ${prof} law firm partner OR associate OR chambers`,
    `${n} site:ecourtsindia.com`,
    `${n} advocate (site:nic.in OR site:gov.in)`,
    `${n} book OR author OR ISBN law`,
    `${n} site:indiankanoon.org`,
    `${n} ${prof} LL.B OR LL.M OR "enrolled" OR "Bar Council"`,
    `${n} speaker OR webinar OR conference OR lecture law`,
    `${n} ${prof} news`,
    ...p.aliases.filter(Boolean).map((a) => `"${a.trim()}" ${prof}${loc ? ` ${loc}` : ""}`),
  ];
  return [...new Set(all)].slice(0, DEPTH_QUERIES[depth]);
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Same-person likelihood 0–100 with reasons. Same-name collisions are common, so the score is a hint, not proof. */
export function matchScore(p: PersonContext, page: { title: string; text: string; url: string }): { score: number; reasons: string[] } {
  const hay = norm(`${page.title} ${page.text}`);
  const reasons: string[] = [];
  let score = 0;
  const names = [p.name, ...p.aliases].map(norm).filter(Boolean);
  if (names.some((n) => hay.includes(n))) { score += 45; reasons.push("Full name appears on the page"); }
  else {
    const parts = norm(p.name).split(" ").filter((x) => x.length > 1);
    if (parts.length && parts.every((x) => hay.includes(x))) { score += 20; reasons.push("Name parts appear separately"); }
    else reasons.push("Full name not found on the page");
  }
  if (norm(page.title).includes(norm(p.name))) { score += 10; reasons.push("Name in page title"); }
  const prof = norm(p.profession);
  if (prof && hay.includes(prof)) { score += 15; reasons.push(`Mentions "${p.profession}"`); }
  else if (/\b(advocate|lawyer|counsel|attorney|solicitor|barrister)\b/.test(hay)) { score += 10; reasons.push("Legal profession mentioned"); }
  const loc = norm(p.location).split(" ")[0];
  if (loc && hay.includes(loc)) { score += 10; reasons.push(`Mentions ${p.location}`); }
  for (const term of norm(p.context).split(" ").filter((x) => x.length > 3).slice(0, 5)) {
    if (hay.includes(term)) { score += 4; reasons.push(`Context term "${term}"`); }
  }
  const hits = names.reduce((s, n) => s + (n ? hay.split(n).length - 1 : 0), 0);
  if (hits >= 3) { score += 10; reasons.push(`Name appears ${hits} times`); }
  return { score: Math.min(100, score), reasons };
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?91[\s-]?)?(?:\(?0\d{2,4}\)?[\s-]?)?\b\d{5}[\s-]?\d{5}\b|\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g;

/** Removes emails and phone numbers. Returns the redacted text and how many items were removed. */
export function redactContacts(text: string) {
  let removed = 0;
  const out = text.replace(EMAIL, () => { removed++; return "[email removed]"; }).replace(PHONE, () => { removed++; return "[phone removed]"; });
  return { text: out, removed };
}

const ABBREVIATIONS = /\b(no|nos|mr|mrs|ms|dr|sh|smt|ltd|pvt|co|vs|v|adv|sr|jr|inc|govt|dept|sec|regd|approx|ll)\./gi;

function sentences(text: string) {
  // Protect abbreviation full stops ("enrolment no. MAH/…", "Pvt. Ltd.") so they do not end a sentence.
  return text.replace(ABBREVIATIONS, (m) => m.replace(".", "․")).replace(/[ \t\r\f\v]+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z("“])|\s*\n\s*|\s+[|•·]\s+/).map((s) => s.replace(/․/g, ".").trim()).filter((s) => s.length > 15 && s.length < 600);
}

const PRACTICE_AREAS: [RegExp, string][] = [
  [/\b(insolvency|ibc|nclt|nclat|bankruptcy)\b/i, "Corporate insolvency (IBC)"],
  [/\barbitration\b/i, "Arbitration"],
  [/\b(sexual harassment|posh|internal committee)\b/i, "Workplace / POSH law"],
  [/\b(cheque|negotiable instruments|section 138)\b/i, "Cheque dishonour (NI Act s.138)"],
  [/\b(commercial (litigation|disputes?|suits?)|civil litigation|recovery suits?)\b/i, "Commercial litigation"],
  [/\b(company law|corporate law|companies act)\b/i, "Company law"],
  [/\b(criminal law|bail|criminal litigation)\b/i, "Criminal law"],
  [/\b(family law|matrimonial|divorce|custody)\b/i, "Family law"],
  [/\b(intellectual property|trademark|copyright|patent)\b/i, "Intellectual property"],
  [/\b(tax(ation)?|gst|income tax)\b/i, "Tax"],
  [/\b(real estate|property law|rera)\b/i, "Real estate / RERA"],
  [/\b(employment law|labour law|service matters?)\b/i, "Employment & service law"],
  [/\b(constitutional law|writ petitions?|public interest litigation)\b/i, "Constitutional / writ"],
  [/\b(consumer (law|protection|disputes?))\b/i, "Consumer law"],
];

/**
 * Pulls suggested facts out of page text. Each suggestion carries the sentence it came from. Suggestions are only taken
 * from sentences that mention the person (or from pages that are clearly about them), to limit same-name confusion.
 */
export function extractSuggestions(p: PersonContext, page: { title: string; text: string; url: string }): { suggestions: DiscoverySuggestion[]; cnrs: DiscoveredCase[] } {
  const clean = redactContacts(page.text).text;
  const name = norm(p.name);
  const surname = name.split(" ").at(-1) ?? name;
  const titleAboutPerson = norm(page.title).includes(name);
  const all = sentences(clean);
  const relevant = all.filter((s) => titleAboutPerson || norm(s).includes(name) || (surname.length > 3 && norm(s).includes(surname)));
  const out: DiscoverySuggestion[] = [];
  const add = (field: ClaimField, value: string, excerpt: string, label: string | null = null) => {
    value = value.trim().replace(/[\s,;:.]+$/, "");
    if (value.length < 2 || value.length > 200) return;
    if (out.some((x) => x.field === field && norm(x.value) === norm(value))) return;
    out.push({ field, value, label, excerpt: excerpt.slice(0, 400) });
  };
  for (const s of relevant) {
    const m = s.match(/\b(?:enrol(?:l)?ment|enrolled|enrolment no\.?|bar council (?:no\.?|number))\b[^\n]{0,80}?\b([A-Z]{1,4}\s?\/\s?\d{1,6}\s?\/\s?(?:19|20)\d{2})\b/i) ?? s.match(/\b([A-Z]{1,4}\/\d{2,6}\/(?:19|20)\d{2})\b/);
    if (m) add("bar_enrolment", m[1].replace(/\s+/g, ""), s);
    const edu = s.match(/\b(LL\.?\s?B\.?|LL\.?\s?M\.?|B\.?A\.?\s?LL\.?B|BBA\s?LL\.?B|Ph\.?D|B\.?Com)\b[^.]{0,80}?\b(?:from|at|,)\s+((?:the\s+)?[A-Z][\w.&' -]{3,80}?(?:University|College|School of Law|Law School|Institute|NLU|National Law [\w ]+))/);
    if (edu) add("education", `${edu[1].replace(/\s+/g, "")} — ${edu[2]}`, s);
    const firm = s.match(/\b(?:[Pp]artner|[Aa]ssociate|[Ff]ounder|[Ff]ounding [Pp]artner|[Mm]anaging [Pp]artner|[Cc]ounsel|[Oo]f [Cc]ounsel|[Pp]rincipal)\s+(?:at|of|with|,)\s+((?:M\/s\.?\s+)?[A-Z][\w&.' -]{2,60}(?:Law|Legal|Associates|Partners|Chambers|LLP|Advocates|& Co\.?))\b/);
    if (firm) add("affiliation", firm[1], s, firm[1]);
    const role = s.match(/\b((?:Senior |Additional |Standing |Central Government |Government |Panel )+(?:Panel )?Counsel|Amicus Curiae|Public Prosecutor|Legal Advisor|Arbitrator|Mediator)\b[^.]{0,80}/);
    if (role) add("role", role[0], s);
    const isbn = s.match(/\bISBN(?:-1[03])?:?\s*((?:97[89][-\s]?)?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,7}[-\s]?[\dX])\b/i);
    if (isbn) add("publication", `${page.title.replace(/\s*[-|–].*$/, "")} (ISBN ${isbn[1].replace(/\s/g, "")})`, s);
    if (/\b(spoke|speaker|keynote|panelist|webinar|lecture|conference|session)\b/i.test(s)) add("speaking", s.slice(0, 160), s);
    if (/\b(advocate|lawyer|counsel|attorney|solicitor|barrister)\b/i.test(s) && !out.some((x) => x.field === "profession")) {
      const prof = s.match(/\b(advocate|lawyer|counsel|attorney|solicitor|barrister)\b/i)![1];
      add("profession", prof[0].toUpperCase() + prof.slice(1).toLowerCase(), s);
    }
    for (const [re, area] of PRACTICE_AREAS) if (re.test(s)) add("practice_area", area, s);
  }
  if (p.location) {
    const loc = relevant.find((s) => norm(s).includes(norm(p.location)));
    if (loc) add("location", p.location, loc);
  }
  // CNRs: 4 letters + 12 digits (e.g. DLHC010248372023). Titles are taken from the same line when present.
  const cnrs: DiscoveredCase[] = [];
  // Party names exclude digits so a title never swallows a neighbouring CNR.
  const TITLE = /([A-Z][A-Za-z.&,' ()-]{1,90}?\s+(?:Vs\.?|v\.|versus)\s+[A-Z][A-Za-z.&,' -]{1,90}?)(?=\s*(?:\*|\\|\||Petitioner|Respondent|Judge|Court|Adv|\]|\(|$))/g;
  for (const line of clean.split(/\n/)) {
    const ids = [...line.matchAll(/\b([A-Z]{4}\d{12})\b/g)].map((m) => ({ cnr: m[1], at: m.index ?? 0 }));
    const titles = [...line.matchAll(TITLE)].map((m) => ({ text: m[1].replace(/\*+/g, "").replace(/^[\s[(]+/, "").trim(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
    for (const { cnr, at } of ids) {
      if (cnrs.some((c) => c.cnr === cnr)) continue;
      // Nearest title on the same line with no other CNR in between.
      const clear = (t: { start: number; end: number }) => !ids.some((o) => o.cnr !== cnr && o.at > Math.min(at, t.start) && o.at < Math.max(at, t.end));
      const best = titles.filter(clear).sort((a, b) => Math.min(Math.abs(a.start - at), Math.abs(a.end - at)) - Math.min(Math.abs(b.start - at), Math.abs(b.end - at)))[0];
      cnrs.push({ cnr, title: best?.text ?? null, excerpt: line.trim().slice(Math.max(0, at - 150), at + 150) });
    }
  }
  // eCourtsIndia listing blocks: [**Title**  Petitioner Adv: …  Court: …  Case Type: …  Case Status: …](…/cnr/XXXX)
  for (const m of clean.matchAll(/\[\*\*([^*\]]{3,200})\*\*([\s\S]{0,1200}?)\]\(https?:\/\/(?:www\.)?ecourtsindia\.com\/cnr\/([A-Z]{4}\d{12})\)/g)) {
    const [, title, body, cnr] = m;
    const field = (label: string) => body.match(new RegExp(`${label}\\s*:\\s*([^\\\\\\n]+)`, "i"))?.[1]?.trim().replace(/^-$/, "") || null;
    const adv = body.match(/(Petitioner|Respondent|Appellant|Complainant|Accused)\s+Adv\s*:\s*([^\\\n]+)/i);
    const status = field("Case Status")?.toLowerCase();
    const entry: DiscoveredCase = {
      cnr, title: title.trim(), excerpt: `${title.trim()} — ${body.replace(/\\+/g, " ").replace(/\s+/g, " ").trim()}`.slice(0, 400),
      court: field("Court"), caseType: field("Case Type"), acts: field("Case Category"),
      status: status === "pending" || status === "disposed" ? status : null,
      appearance: adv ? { side: adv[1].toLowerCase(), text: `${adv[1]} Adv: ${adv[2].trim()}` } : null,
    };
    const i = cnrs.findIndex((c) => c.cnr === cnr);
    if (i >= 0) cnrs[i] = { ...cnrs[i], ...entry }; else cnrs.push(entry);
  }
  // Also pick up eCourtsIndia-style links: /cnr/XXXX
  for (const m of page.text.matchAll(/\/cnr\/([A-Z]{4}\d{12})/g)) if (!cnrs.some((c) => c.cnr === m[1])) cnrs.push({ cnr: m[1], title: null, excerpt: `Linked case /cnr/${m[1]}` });
  return { suggestions: out, cnrs: cnrs.slice(0, 50) };
}

export interface RawResult { url: string; title: string; description: string; text: string; query: string; scraped: boolean; note: string }

/** Turns raw search results into deduplicated, scored candidates. Results already registered as sources are skipped. */
export function buildCandidates(p: PersonContext & { professionalId: string }, results: RawResult[], knownUrls: string[], now = new Date()): DiscoveryCandidate[] {
  const at = now.toISOString();
  const seen = new Set(knownUrls.map((u) => u.replace(/\/$/, "")));
  const out: DiscoveryCandidate[] = [];
  for (const r of results) {
    const key = r.url.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    let c;
    try { c = classifyUrl(r.url); } catch { continue; }
    const page = { title: r.title, text: `${r.description}\n${r.text}`, url: r.url };
    const { score, reasons } = matchScore(p, page);
    const { suggestions, cnrs } = extractSuggestions(p, page);
    const contactsSeen = redactContacts(page.text).removed;
    const excerptSource = sentences(redactContacts(page.text).text).find((s) => norm(s).includes(norm(p.name))) ?? redactContacts(r.description).text;
    out.push({
      id: `cand-${crypto.randomUUID().slice(0, 8)}`, professionalId: p.professionalId, url: r.url, title: r.title || c.publisher, publisher: c.publisher,
      sourceType: c.sourceType, tier: c.tier, loginWalled: c.loginWalled, matchScore: score, matchReasons: reasons, excerpt: excerptSource.slice(0, 500),
      pageText: r.scraped ? redactContacts(r.text).text.slice(0, 6000) : "", suggestions, cnrs, query: r.query, scraped: r.scraped,
      note: [r.note, contactsSeen ? `${contactsSeen} contact detail(s) on the page were not captured.` : ""].filter(Boolean).join(" "),
      status: "pending", foundAt: at,
    });
  }
  return out.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Accepting a candidate registers it as an UNREVIEWED source and adds the selected suggestions as UNVERIFIED claims
 * and the selected CNRs as unverified court records (existing CNRs are not duplicated).
 */
export function acceptCandidate(ws: Workspace, candidateId: string, pick: { suggestionIdx: number[]; cnrs: string[] }, now = new Date()): Workspace {
  const cand = ws.candidates.find((c) => c.id === candidateId);
  if (!cand || cand.status !== "pending") return ws;
  const at = now.toISOString();
  const existing = ws.sources.find((s) => s.url === cand.url);
  const source: SourceEvidence = existing ?? {
    id: `src-${crypto.randomUUID().slice(0, 8)}`, url: cand.url, title: cand.title, publisher: cand.publisher, sourceType: cand.sourceType, tier: cand.tier,
    publishedAt: null, accessedAt: cand.scraped ? cand.foundAt : null, status: cand.loginWalled ? "inaccessible" : "unreviewed", excerpt: cand.excerpt,
    verificationMethod: null, reviewerId: null, reviewedAt: null,
    accessNotes: `Found by automatic discovery (query: ${cand.query}). Match score ${cand.matchScore}/100 — confirm it is the same person. ${cand.note}`.trim(),
    notes: `Match reasons: ${cand.matchReasons.join("; ")}`, attachmentText: cand.pageText || null, createdAt: at, updatedAt: at,
  };
  const claims: Claim[] = pick.suggestionIdx.map((i) => cand.suggestions[i]).filter(Boolean).map((s) => ({
    id: `cl-${crypto.randomUUID().slice(0, 8)}`, professionalId: cand.professionalId, field: s.field, value: s.value, label: s.label, effectiveFrom: null, effectiveTo: null,
    basis: "stated", confidence: "low", status: "unverified", visibility: "internal", sourceIds: [source.id], reviewerId: null, verifiedAt: null, supersedesId: null,
    notes: `Auto-discovered. Evidence: “${s.excerpt}”`, createdAt: at, updatedAt: at,
  }));
  const known = new Set(ws.cases.filter((c) => c.professionalId === cand.professionalId).map((c) => normalizeCnr(c.cnr)));
  const personName = norm(ws.professionals.find((p) => p.id === cand.professionalId)?.displayName ?? "");
  const SIDES = ["petitioner", "respondent", "appellant", "complainant", "accused"];
  const cases: CourtCase[] = cand.cnrs.filter((c) => pick.cnrs.includes(c.cnr) && !known.has(normalizeCnr(c.cnr))).map((c) => {
    const title = c.title ?? `Case ${c.cnr}`;
    const [a, b] = title.split(/\s+v(?:s\.?|ersus|\.)\s+/i);
    // The listing's "X Adv:" line is used only when it names this person; it stays unverified.
    const namesPerson = !!c.appearance && !!personName && norm(c.appearance.text).includes(personName);
    const side = namesPerson && SIDES.includes(c.appearance!.side) ? (c.appearance!.side as CourtCase["representedSide"]) : null;
    const caseType = c.caseType && !/unrecognized/i.test(c.caseType) ? c.caseType : "";
    return {
      id: `case-${crypto.randomUUID().slice(0, 8)}`, professionalId: cand.professionalId, cnr: c.cnr, caseNumber: null, title, court: c.court || "Unknown — check official record",
      bench: null, caseTypeRaw: c.caseType ?? "", actsRaw: c.acts ?? null, ...normalizeCategory(caseType, c.acts ?? null, c.court ?? ""), categoryOverridden: false, parentCaseId: null, filingDate: null, disposalDate: null,
      status: c.status ?? "unknown", lastCheckedAt: at, parties: c.title ? [a, b].filter(Boolean).map((name) => ({ name: name.trim(), side: "unknown" as const })) : [],
      representedSide: side, representedSideVerified: false,
      appearanceEvidence: c.appearance ? `Listing on ${cand.publisher} shows “${c.appearance.text}” (third-party, unverified). Attendance not inferred.` : `Listed on ${cand.publisher}: “${c.excerpt}”`,
      caseUrl: /ecourtsindia\.com/.test(cand.url) ? `https://ecourtsindia.com/cnr/${c.cnr}` : null, orderListUrl: null, sourceIds: [source.id],
      notes: "Auto-discovered from a listing. Verify court, status and dates against the official record.", createdAt: at, updatedAt: at,
    };
  });
  return {
    ...ws,
    sources: existing ? ws.sources : [source, ...ws.sources],
    claims: [...ws.claims, ...claims],
    cases: [...ws.cases, ...cases],
    candidates: ws.candidates.map((c) => (c.id === candidateId ? { ...c, status: "accepted" } : c)),
  };
}

export function rejectCandidate(ws: Workspace, candidateId: string): Workspace {
  return { ...ws, candidates: ws.candidates.map((c) => (c.id === candidateId ? { ...c, status: "rejected" } : c)) };
}

/** Clip payload from the "Clip to SCL" browser extension (carried in the URL fragment, never sent to the server). */
export interface ClipPayload { url: string; title: string; selection: string; clippedAt: string }

export function decodeClip(hash: string): ClipPayload | null {
  const m = hash.match(/[#&]clip=([^&]+)/);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]).replace(/-/g, "+").replace(/_/g, "/"))));
    const v = JSON.parse(json);
    const url = new URL(String(v.url));
    if (!/^https?:$/.test(url.protocol)) return null;
    return { url: url.toString(), title: String(v.title ?? "").slice(0, 300), selection: String(v.selection ?? "").slice(0, 20000), clippedAt: String(v.clippedAt ?? new Date().toISOString()) };
  } catch { return null; }
}
