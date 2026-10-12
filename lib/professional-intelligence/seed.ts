import type { Claim, ContentIdea, ContentPillar, CourtCase, OpportunityScore, Professional, Publication, SourceEvidence, Workspace } from "@/types/professional-intelligence";
import { normalizeCategory } from "./litigation.ts";

// Example profile. Every fact below is a RESEARCH LEAD: status "unverified"/"unreviewed" until a reviewer checks it.
// Excerpts were captured by an automated fetch on 2026-10-12 and must be re-checked against the live source.
const P = "prof-amish-tandon";
const ACCESSED = "2026-10-12T00:00:00.000Z";
const T = ACCESSED;

const src = (s: Partial<SourceEvidence> & Pick<SourceEvidence, "id" | "url" | "title" | "publisher" | "sourceType" | "tier">): SourceEvidence => ({
  publishedAt: null, accessedAt: ACCESSED, status: "unreviewed", excerpt: "", verificationMethod: null, reviewerId: null, reviewedAt: null,
  accessNotes: "", notes: "", attachmentText: null, createdAt: T, updatedAt: T, ...s,
});

export const SEED_SOURCES: SourceEvidence[] = [
  src({
    id: "src-dhc-nominated-counsel-2026-01", tier: "A", sourceType: "official_directory",
    url: "https://delhihighcourt.nic.in/files/2026-01/nomcouncil/nominatedcounsel13012026.pdf",
    title: "Delhi High Court — nominated counsel list (file dated 13-01-2026)", publisher: "delhihighcourt.nic.in",
    excerpt: "Row 273 | AMISH TANDON | [address, mobile and email columns present — values withheld here] | D/1106/2009",
    accessNotes: "372-page PDF. Automated extraction processed only the first part of the document; the page number and the panel/section heading for row 273 were NOT confirmed. Confirm authenticity of the file on the official site before relying on it.",
    notes: "Supports name + an enrolment-style number. Does not by itself establish any Government of India panel designation. Contact values exist in the source; they were deliberately not copied into this workspace.",
  }),
  src({
    id: "src-niyogi-posh-book", tier: "B", sourceType: "publisher_page",
    url: "https://niyogibooksindia.com/books/law-of-sexual-harassment-at-workplace/",
    title: "Law of Sexual Harassment At Workplace : Practice & Procedure — Niyogi Books", publisher: "Niyogi Books India",
    excerpt: "Law of Sexual Harassment At Workplace : Practice & Procedure · By Amish Tandon · Category: Law Books, Paper Missile Books · ISBN: 978-93-85285-83-7 · MRP: 695 · '…cover all relevant judgements passed by Indian courts from 1997 … until June 2017.' · Format: Paper Back",
    notes: "Edition and publication date are not stated on the page. Note: an eCourtsIndia listing names 'Niyogi Offset Pvt. Ltd' as a party in a matter — do not infer any client relationship.",
  }),
  src({
    id: "src-ecourtsindia-profile", tier: "D", sourceType: "third_party_directory",
    url: "https://ecourtsindia.com/lawyer/amish-tandon", title: "Advocate Amish Tandon — Lawyer Profile | eCourtsIndia", publisher: "eCourtsIndia",
    excerpt: "Case Status: Disposed 141 · Pending 95. Courts include NCLAT Delhi (84), High Court of Delhi (40), NCLT Delhi (31). Case types include Interlocutory Application (62), Criminal Complaint Case (29), Interlocutory Application (IBC) (27), Company Appeal (AT) (Insolvency) (21), Civil Suit (20), Writ Petition (Civil) (19). Listing shows 'Petitioner Adv: AMISH TANDON' on matters.",
    notes: "Aggregator counts are NOT deduplicated, count interlocutory applications as separate entries, and are not used as totals anywhere. Only 10 matters from page 1 (of 24) were imported. Name-based matching may include other advocates with the same name.",
  }),
  src({
    id: "src-linkedin", tier: "C", sourceType: "self_published_profile",
    url: "https://www.linkedin.com/in/amish-tandon-37621923/", title: "LinkedIn profile — Amish Tandon", publisher: "LinkedIn",
    status: "inaccessible", accessedAt: null,
    accessNotes: "Login wall. Not fetched automatically (no login/CAPTCHA bypass). A reviewer should view it manually and record claims with the excerpt.",
  }),
];

const caseSrc = (cnr: string) => src({
  id: `src-ecourtsindia-${cnr}`, tier: "D", sourceType: "third_party_directory", url: `https://ecourtsindia.com/cnr/${cnr}`,
  title: `eCourtsIndia case page ${cnr}`, publisher: "eCourtsIndia",
  excerpt: "Listed on the advocate profile page with 'Petitioner Adv: AMISH TANDON'.",
  notes: "Verify against the official eCourts services record (services.ecourts.gov.in) or the court's own website before relying on it.",
});

const claim = (c: Partial<Claim> & Pick<Claim, "id" | "field" | "value">): Claim => ({
  professionalId: P, label: null, effectiveFrom: null, effectiveTo: null, basis: "stated", confidence: "low", status: "unverified",
  visibility: "internal", sourceIds: [], reviewerId: null, verifiedAt: null, supersedesId: null, notes: "", createdAt: T, updatedAt: T, ...c,
});

export const SEED_CLAIMS: Claim[] = [
  claim({ id: "cl-name", field: "canonical_name", value: "Amish Tandon", confidence: "medium", sourceIds: ["src-dhc-nominated-counsel-2026-01", "src-niyogi-posh-book", "src-ecourtsindia-profile"] }),
  claim({ id: "cl-profession", field: "profession", value: "Advocate", confidence: "medium", sourceIds: ["src-dhc-nominated-counsel-2026-01", "src-ecourtsindia-profile"] }),
  claim({ id: "cl-location", field: "location", value: "New Delhi, India", basis: "inferred", sourceIds: ["src-dhc-nominated-counsel-2026-01", "src-ecourtsindia-profile"], notes: "Inferred from the Delhi HC listing address column and court distribution; confirm." }),
  claim({ id: "cl-enrolment", field: "bar_enrolment", value: "D/1106/2009", confidence: "medium", sourceIds: ["src-dhc-nominated-counsel-2026-01"], notes: "Value in the last column of row 273. Column heading not confirmed — verify it is the enrolment number." }),
  claim({ id: "cl-firm", field: "affiliation", label: "Innovatus Law", value: "Innovatus Law (firm association)", notes: "Research lead from the brief. No source attached yet." }),
  claim({ id: "cl-panel", field: "role", label: "Government of India", value: "Senior Panel Counsel, Government of India — Ministry of Law and Justice, Department of Legal Affairs", notes: "Research lead from the brief. Requires an official DoLA / court notification. Tenure and current status unknown." }),
  claim({ id: "cl-pa-commercial", field: "practice_area", value: "Commercial litigation / civil suits", basis: "inferred", sourceIds: ["src-ecourtsindia-profile"], notes: "Inferred from listed case types." }),
  claim({ id: "cl-pa-ibc", field: "practice_area", value: "Corporate insolvency (IBC) and company law", basis: "inferred", sourceIds: ["src-ecourtsindia-profile"], notes: "Inferred from NCLT/NCLAT listings." }),
  claim({ id: "cl-pa-ni", field: "practice_area", value: "Cheque dishonour (NI Act s.138)", basis: "inferred", sourceIds: ["src-ecourtsindia-profile"] }),
  claim({ id: "cl-pa-arb", field: "practice_area", value: "Arbitration", basis: "inferred", sourceIds: ["src-ecourtsindia-profile"], notes: "Only 2 arbitration listings on the aggregator — weak signal." }),
  claim({ id: "cl-pa-posh", field: "practice_area", value: "Workplace / POSH law", basis: "inferred", confidence: "medium", sourceIds: ["src-niyogi-posh-book"], notes: "Inferred from authorship; authorship ≠ current practice." }),
  claim({ id: "cl-pub", field: "publication", value: "Law of Sexual Harassment At Workplace : Practice & Procedure (Niyogi Books)", confidence: "medium", sourceIds: ["src-niyogi-posh-book"] }),
  claim({ id: "cl-li", field: "profile_link", label: "LinkedIn", value: "https://www.linkedin.com/in/amish-tandon-37621923/", visibility: "public", sourceIds: ["src-linkedin"], notes: "Confirm the profile belongs to this advocate." }),
  claim({ id: "cl-ecourts", field: "profile_link", label: "eCourtsIndia", value: "https://ecourtsindia.com/lawyer/amish-tandon", visibility: "public", sourceIds: ["src-ecourtsindia-profile"] }),
  claim({ id: "cl-contact-listed", field: "contact", label: "Court-listed contact (phone, email, address)", value: "See source row 273 — not copied", visibility: "restricted", sourceIds: ["src-dhc-nominated-counsel-2026-01"], notes: "Personal-looking contact details. Restricted. An authorised reviewer decides whether any public channel may be used." }),
];

export const SEED_PROFESSIONAL: Professional = { id: P, slug: "amish-tandon", displayName: "Amish Tandon", profession: "Advocate", isExample: true, lastCheckedAt: ACCESSED, createdAt: T, updatedAt: T };

// Page 1 of the eCourtsIndia listing (2026-10-12). Dates were not on the listing, so they are null — not guessed.
const RAW_CASES: [string, string, string, string, string, "pending" | "disposed", string | null, string][] = [
  ["DLWT010014442019", "Baldesh Kaur (Ex) Vs. National Insurance Company", "District & Sessions Judge, West, Tis Hazari Court, Delhi", "Hon'ble Presiding Off.-MACT", "Unrecognized case type", "disposed", "Indian Penal Code - 38", "Baldesh Kaur (Ex)|National Insurance Company"],
  ["DLSE010032872025", "Niyogi Offset Pvt. Ltd Vs. Mr. Brijesh Tiwari Proprietor", "District & Sessions Judge, South East, Saket Court, Delhi", "Hon'ble District Judge (Commercial Court)-04", "Execution Application (Civil)", "disposed", "Permanent Injuction - 151", "Niyogi Offset Pvt. Ltd|Mr. Brijesh Tiwari Proprietor"],
  ["DLHC010248372023", "Ms. Reet Singla Vs. Government Of Nct Of Delhi", "High Court of Delhi, Delhi", "Hon'ble Purushaindra Kumar Kaurav", "Writ Petition (Civil)", "disposed", null, "Ms. Reet Singla|Government Of NCT Of Delhi"],
  ["DLHC010352352022", "Chowgule Public School Vs. Directorate Of Education", "High Court of Delhi, Delhi", "Hon'ble Vikas Mahajan", "Writ Petition (Civil)", "pending", null, "Chowgule Public School|Directorate Of Education"],
  ["DLHC010342392020", "Ms Sumitra Devi Vs. Delhi Development Authority", "High Court of Delhi, Delhi", "Hon'ble Vikas Mahajan", "Writ Petition (Civil)", "pending", null, "Ms Sumitra Devi|Delhi Development Authority"],
  ["DLHC010346452021", "Sh Vishwanath Ojha Vs. Sh Surender Singh Bohania", "High Court of Delhi, Delhi", "Hon'ble Amit Bansal", "Civil Miscellaneous Application", "disposed", null, "Sh Vishwanath Ojha|Sh Surender Singh Bohania"],
  ["DLHC010421942024", "Smiths Detection Systems Private Limited Ors Vs. Union Of India Ministry Of Corporate Affairs", "High Court of Delhi, Delhi", "Hon'ble Tara Vitasta Ganju", "Writ Petition (Civil)", "pending", null, "Smiths Detection Systems Private Limited & Ors|Union Of India, Ministry Of Corporate Affairs"],
  ["DLHC010422562024", "Ms Smiths Detection Systems Private Limited Vs. Union Of India Ministry Of Corporate Affairs", "High Court of Delhi, Delhi", "Hon'ble Tara Vitasta Ganju", "Writ Petition (Civil)", "pending", null, "M/s Smiths Detection Systems Private Limited|Union Of India, Ministry Of Corporate Affairs"],
  ["DLHC010444912024", "Ifci Ltd Vs. Coastal Projects Ltd", "High Court of Delhi, Delhi", "Hon'ble Jasmeet Singh", "Unrecognized case type", "pending", null, "IFCI Ltd|Coastal Projects Ltd"],
  ["DLST020463582024", "Oxyzo Financial Services Limited Vs. Rkn Project Pvt Ltd", "Chief Metropolitan Magistrate, South, Saket Court, Delhi", "Hon'ble Judicial Magistrate First Class (NI Act)-03", "Criminal Complaint Case", "disposed", "Negotiable Instruments Act - 138", "Oxyzo Financial Services Limited|RKN Project Pvt Ltd"],
];

export const SEED_CASE_SOURCES = RAW_CASES.map(([cnr]) => caseSrc(cnr));

export const SEED_CASES: CourtCase[] = RAW_CASES.map(([cnr, title, court, bench, caseType, status, acts, parties]) => {
  const { category, isInterim } = normalizeCategory(caseType, acts, court);
  const [first, second] = parties.split("|");
  return {
    id: `case-${cnr}`, professionalId: P, cnr, caseNumber: null, title, court, bench, caseTypeRaw: caseType, actsRaw: acts,
    category, categoryOverridden: false, isInterim, parentCaseId: null, filingDate: null, disposalDate: null, status, lastCheckedAt: ACCESSED,
    // Party names come from the case title; the title alone does not establish each party's procedural side.
    parties: [{ name: first, side: "unknown" }, { name: second, side: "unknown" }],
    representedSide: "petitioner", representedSideVerified: false,
    appearanceEvidence: "Third-party listing shows 'Petitioner Adv: AMISH TANDON' (Tier D, unverified). Hearing attendance is not inferred.",
    caseUrl: `https://ecourtsindia.com/cnr/${cnr}`, orderListUrl: null, sourceIds: [`src-ecourtsindia-${cnr}`, "src-ecourtsindia-profile"],
    notes: caseType === "Unrecognized case type" ? "Aggregator could not classify the case type — left as Other until the official record is checked." : "",
    createdAt: T, updatedAt: T,
  };
});

export const SEED_PUBLICATIONS: Publication[] = [{
  id: "pub-posh-book", professionalId: P, title: "Law of Sexual Harassment At Workplace : Practice & Procedure", authors: "Amish Tandon",
  publisher: "Niyogi Books (Paper Missile imprint category listed)", identifier: "ISBN 978-93-85285-83-7", edition: null, publicationDate: null,
  topics: ["POSH Act 2013", "Internal Committee inquiries", "Section-by-section analysis", "Case law 1997–June 2017"],
  practiceAreas: ["Workplace / POSH law"],
  contentIdeas: ["Author's notes: what changed since the June 2017 case-law cut-off", "Internal Committee procedure checklist (general information)"],
  sourceIds: ["src-niyogi-posh-book"], status: "unverified", reviewerId: null, verifiedAt: null,
  notes: "Edition and publication date not on publisher page — check the book's imprint page, ISBN registry or a library catalogue. Case-law coverage ends June 2017; any content must account for later developments.",
  createdAt: T, updatedAt: T,
}];

export const SEED_PILLARS: ContentPillar[] = [
  { id: "pil-posh", professionalId: P, name: "POSH and workplace law", allocation: 35, description: "Prevention of sexual harassment, IC procedure, employer duties.", series: ["Inside POSH Law"] },
  { id: "pil-commercial", professionalId: P, name: "Commercial disputes", allocation: 25, description: "Suits, recovery, cheque dishonour, arbitration.", series: ["The Commercial Dispute Brief"] },
  { id: "pil-ibc", professionalId: P, name: "Insolvency and company law", allocation: 20, description: "IBC process, operational creditors, NCLT/NCLAT.", series: ["IBC Explained"] },
  { id: "pil-orders", professionalId: P, name: "Court-order explainers", allocation: 10, description: "Reviewed public orders explained neutrally.", series: ["From the Case File"] },
  { id: "pil-authority", professionalId: P, name: "Professional authority, publications & speaking", allocation: 10, description: "Book, scholarship, talks — verified facts only.", series: ["Counsel's Desk", "The Author's Notes"] },
];

const sc = (e: number, r: number, x: number, i: number, o: number, a: number, why: Partial<Record<keyof OpportunityScore, string>> = {}): OpportunityScore => ({
  evidence: { score: e, rationale: why.evidence ?? "No verified source linked yet." },
  relevance: { score: r, rationale: why.relevance ?? "Planner estimate." },
  expertise: { score: x, rationale: why.expertise ?? "Planner estimate pending verification." },
  interest: { score: i, rationale: why.interest ?? "Planner estimate — no search/social data connected." },
  originality: { score: o, rationale: why.originality ?? "Planner estimate." },
  readiness: { score: a, rationale: why.readiness ?? "Needs research and a draft." },
});

const idea = (n: number, date: string, title: string, pillarId: string, series: string | null, audience: string, format: ContentIdea["format"], hook: string, links: Partial<Pick<ContentIdea, "sourceIds" | "claimIds" | "caseIds" | "publicationIds">>, score: OpportunityScore): ContentIdea => ({
  id: `idea-${String(n).padStart(2, "0")}`, professionalId: P, title, pillarId, series, audience, format, platform: "LinkedIn", hook,
  cta: "Read the full explainer / follow the series (informational)", status: "research_needed", plannedDate: date, scheduledAt: null,
  publishedAt: null, publishedUrl: null, body: "", sourceIds: [], claimIds: [], caseIds: [], publicationIds: [], ...links, score,
  authorId: "member-editor", revisions: [], approvals: [], createdAt: T, updatedAt: T,
});

export const SEED_CONTENT: ContentIdea[] = [
  idea(1, "2026-11-03", "A guide to workplace sexual-harassment law", "pil-posh", "Inside POSH Law", "HR leaders & employers", "carousel", "What every employer with 10+ employees must have in place — in 8 slides.", { publicationIds: ["pub-posh-book"], sourceIds: ["src-niyogi-posh-book"] }, sc(8, 22, 14, 11, 5, 2)),
  idea(2, "2026-11-05", "Court decree versus actual recovery", "pil-commercial", "The Commercial Dispute Brief", "Founders & finance heads", "linkedin_post", "Winning a decree and getting paid are two different stages.", {}, sc(0, 20, 10, 9, 7, 2)),
  idea(3, "2026-11-07", "Author and legal scholarship introduction", "pil-authority", "The Author's Notes", "Lawyers, students, HR professionals", "linkedin_post", "Why I wrote a section-by-section guide to the POSH Act.", { publicationIds: ["pub-posh-book"], claimIds: ["cl-pub"], sourceIds: ["src-niyogi-posh-book"] }, sc(8, 15, 16, 6, 6, 3, { readiness: "Publisher page captured; edition/date unverified." })),
  idea(4, "2026-11-10", "Procedural fairness in internal committee inquiries", "pil-posh", "Inside POSH Law", "IC members & HR", "article", "Five procedural steps that decide whether an IC report survives scrutiny.", { publicationIds: ["pub-posh-book"] }, sc(5, 23, 14, 10, 7, 1)),
  idea(5, "2026-11-12", "Operational creditors and the IBC", "pil-ibc", "IBC Explained", "SME suppliers & CFOs", "carousel", "Unpaid invoices and the IBC: what an operational creditor can and cannot do.", {}, sc(0, 21, 12, 11, 5, 2)),
  idea(6, "2026-11-14", "A verified insolvency-appeal explainer", "pil-orders", "From the Case File", "Insolvency professionals", "article", "What a reviewed NCLAT order actually decided — and what it did not.", {}, sc(0, 16, 14, 7, 8, 0, { readiness: "Blocked: no NCLAT final order captured and reviewed yet." })),
  idea(7, "2026-11-17", "What happens when a POSH inquiry is challenged?", "pil-posh", "Inside POSH Law", "Employers & employees", "linkedin_post", "An IC report can be challenged. Here is the general route.", {}, sc(0, 21, 12, 10, 6, 2)),
  idea(8, "2026-11-19", "Cheque-dishonour process: common questions", "pil-commercial", "The Commercial Dispute Brief", "Small businesses", "carousel", "Bounced cheque? The statutory timeline in plain language.", {}, sc(0, 22, 11, 12, 3, 2)),
  idea(9, "2026-11-21", "Stages of a commercial suit", "pil-commercial", "The Commercial Dispute Brief", "Founders & in-house counsel", "carousel", "From plaint to decree: the stages of a commercial suit.", {}, sc(0, 19, 10, 9, 4, 2)),
  idea(10, "2026-11-24", "A book-focused author feature", "pil-authority", "The Author's Notes", "Readers, HR community", "video", "The questions readers ask most about workplace harassment law.", { publicationIds: ["pub-posh-book"], sourceIds: ["src-niyogi-posh-book"] }, sc(8, 14, 15, 5, 6, 2)),
  idea(11, "2026-11-26", "Arbitration clauses: drafting considerations", "pil-commercial", "Counsel's Desk", "In-house counsel", "linkedin_post", "Three clause choices that shape any future dispute.", {}, sc(0, 18, 6, 9, 5, 2, { expertise: "Weak signal: few arbitration listings." })),
  idea(12, "2026-11-28", "What a final NCLAT order can and cannot establish", "pil-ibc", "IBC Explained", "Creditors & insolvency professionals", "linkedin_post", "A final order is not a scorecard. How to read one.", {}, sc(0, 15, 12, 6, 8, 1)),
];

export function seedWorkspace(): Workspace {
  return {
    schemaVersion: 1,
    members: [
      { id: "member-editor", name: "Content editor (demo)", role: "editor" },
      { id: "member-reviewer", name: "Legal reviewer (demo)", role: "legal_reviewer" },
      { id: "member-admin", name: "Admin (demo)", role: "admin" },
      { id: "member-viewer", name: "Viewer (demo)", role: "viewer" },
    ],
    currentUserId: "member-editor",
    activeProfessionalId: P,
    professionals: [SEED_PROFESSIONAL],
    sources: [...SEED_SOURCES, ...SEED_CASE_SOURCES],
    claims: SEED_CLAIMS,
    cases: SEED_CASES,
    orders: [],
    publications: SEED_PUBLICATIONS,
    pillars: SEED_PILLARS,
    content: SEED_CONTENT,
    performance: [],
    candidates: [],
    auditLog: [],
  };
}

export function emptyProfessional(name: string, profession: string): Professional {
  const now = new Date().toISOString();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { id: `prof-${slug}-${crypto.randomUUID().slice(0, 6)}`, slug, displayName: name, profession, isExample: false, lastCheckedAt: null, createdAt: now, updatedAt: now };
}

/** Empty workspace for real research: demo members only, no professionals or data. */
export function blankWorkspace(): Workspace {
  const base = seedWorkspace();
  return { ...base, activeProfessionalId: "", professionals: [], sources: [], claims: [], cases: [], orders: [], publications: [], pillars: [], content: [], performance: [], candidates: [], auditLog: [] };
}
