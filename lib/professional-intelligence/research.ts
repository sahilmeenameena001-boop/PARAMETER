import type { Claim, ClaimField, ContentIdea, ContentPillar, Professional, Publication, SourceEvidence, SourceTier, SourceType } from "@/types/professional-intelligence";
import { SOURCE_TYPE_TIER } from "./constants.ts";
import { emptyScore } from "./scoring.ts";

/** Default pillars for a new professional — editable planning assumptions, not proven allocations. */
export const DEFAULT_PILLARS: Omit<ContentPillar, "id" | "professionalId">[] = [
  { name: "Core practice area", allocation: 35, description: "The professional's main verified practice area.", series: [] },
  { name: "Secondary practice area", allocation: 25, description: "A second verified area of work.", series: [] },
  { name: "Law & process explainers", allocation: 20, description: "Plain-language explainers of procedure and current law.", series: [] },
  { name: "Court-order explainers", allocation: 10, description: "Reviewed public orders explained neutrally.", series: [] },
  { name: "Professional authority", allocation: 10, description: "Publications, talks and credentials — verified facts only.", series: [] },
];

export interface UrlClassification { sourceType: SourceType; tier: SourceTier; publisher: string; profileLabel: string | null; loginWalled: boolean }

/**
 * Suggests a source type from the domain. This is only a starting point: an official-looking domain is NOT treated as
 * authentic — every source starts "unreviewed" until a reviewer checks it.
 */
export function classifyUrl(raw: string): UrlClassification {
  const url = new URL(raw);
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const is = (...domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));
  let sourceType: SourceType = "other";
  let profileLabel: string | null = null;
  let loginWalled = false;
  if (is("linkedin.com")) { sourceType = "self_published_profile"; profileLabel = "LinkedIn"; loginWalled = true; }
  else if (is("x.com", "twitter.com", "facebook.com", "instagram.com", "medium.com", "substack.com", "youtube.com")) { sourceType = "self_published_profile"; profileLabel = host.split(".")[0]; loginWalled = is("facebook.com", "instagram.com"); }
  else if (is("ecourtsindia.com", "indiankanoon.org", "casemine.com", "lawyered.in", "vakilsearch.com", "justdial.com")) { sourceType = "third_party_directory"; profileLabel = host === "ecourtsindia.com" ? "eCourtsIndia" : null; }
  else if (is("ecourts.gov.in", "sci.gov.in", "nclt.gov.in", "nclat.nic.in") || /\b(highcourt|hcourt|court)\b|courts?\./.test(host) && /(gov\.in|nic\.in)$/.test(host)) { sourceType = /\.pdf$/i.test(url.pathname) ? "official_directory" : "court_record"; }
  else if (/(gov\.in|nic\.in)$/.test(host)) sourceType = "institutional_record";
  else if (/books|publish|press|publication/.test(host)) sourceType = "publisher_page";
  else if (/barcouncil|bar-council|association|institute|society/.test(host)) sourceType = "professional_org";
  else if (/\blaw\b|legal|advocates?|associates|partners|chambers|llp/.test(host)) { sourceType = "firm_page"; }
  return { sourceType, tier: SOURCE_TYPE_TIER[sourceType], publisher: host, profileLabel, loginWalled };
}

export interface ResearchInput {
  name: string;
  profession: string;
  location?: string;
  aliases?: string[];
  urls?: string[];
  notes?: string;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "professional";

/** Creates an empty, fully-unverified research profile for any person from a name and optional starting URLs. */
export function buildResearchProfile(input: ResearchInput, now = new Date()) {
  const at = now.toISOString();
  const name = input.name.trim();
  if (!name) throw new Error("A name is required.");
  const slug = slugify(name);
  const pid = `prof-${slug}-${crypto.randomUUID().slice(0, 6)}`;
  const professional: Professional = { id: pid, slug, displayName: name, profession: input.profession.trim(), isExample: false, lastCheckedAt: null, createdAt: at, updatedAt: at };

  const errors: string[] = [];
  const seen = new Set<string>();
  const sources: SourceEvidence[] = [];
  const claims: Claim[] = [];
  const claim = (field: ClaimField, value: string, extra: Partial<Claim> = {}): Claim => ({
    id: `cl-${crypto.randomUUID().slice(0, 8)}`, professionalId: pid, field, value, label: null, effectiveFrom: null, effectiveTo: null,
    basis: "stated", confidence: "low", status: "unverified", visibility: "internal", sourceIds: [], reviewerId: null, verifiedAt: null,
    supersedesId: null, notes: "", createdAt: at, updatedAt: at, ...extra,
  });

  for (const raw of (input.urls ?? []).map((u) => u.trim()).filter(Boolean)) {
    let parsed: URL;
    try { parsed = new URL(raw); } catch { errors.push(`Not a valid URL: ${raw}`); continue; }
    if (!/^https?:$/.test(parsed.protocol)) { errors.push(`Only http(s) URLs: ${raw}`); continue; }
    if (seen.has(raw)) continue;
    seen.add(raw);
    const c = classifyUrl(raw);
    const source: SourceEvidence = {
      id: `src-${crypto.randomUUID().slice(0, 8)}`, url: raw, title: `${c.profileLabel ?? c.publisher} — ${name}`, publisher: c.publisher,
      sourceType: c.sourceType, tier: c.tier, publishedAt: null, accessedAt: null, status: c.loginWalled ? "inaccessible" : "unreviewed",
      excerpt: "", verificationMethod: null, reviewerId: null, reviewedAt: null,
      accessNotes: c.loginWalled ? "Login-walled site: not fetched automatically. Review manually and record the excerpt." : "Added as a research lead. Open it, record the excerpt and access date, then verify.",
      notes: "Source type suggested from the domain — confirm it.", attachmentText: null, createdAt: at, updatedAt: at,
    };
    sources.push(source);
    if (c.profileLabel) claims.push(claim("profile_link", raw, { label: c.profileLabel, visibility: "public", sourceIds: [source.id], notes: "Confirm this profile belongs to this person." }));
  }

  const allSourceIds = sources.map((s) => s.id);
  claims.unshift(claim("canonical_name", name, { sourceIds: allSourceIds, notes: allSourceIds.length ? "Confirm the name as it appears in each source." : "Entered by researcher — attach a source." }));
  if (input.profession.trim()) claims.push(claim("profession", input.profession.trim(), { notes: "Entered by researcher — attach a source." }));
  if (input.location?.trim()) claims.push(claim("location", input.location.trim(), { notes: "Entered by researcher — attach a source." }));
  for (const alias of (input.aliases ?? []).map((a) => a.trim()).filter(Boolean)) claims.push(claim("alias", alias, { notes: "Entered by researcher — attach a source." }));

  const pillars: ContentPillar[] = DEFAULT_PILLARS.map((p, i) => ({ ...p, id: `pil-${slug}-${i}-${crypto.randomUUID().slice(0, 4)}`, professionalId: pid }));
  return { professional, sources, claims, pillars, errors };
}

/** Public search pages a researcher can open themselves. Nothing is fetched automatically. */
/** General web searches are prefixed with the profession ("Advocate" by default) to avoid same-name results. */
export function searchLinks(name: string, extra = "", profession = "") {
  const q = (s: string) => encodeURIComponent(s);
  const quoted = `"${name.trim()}"`;
  const titled = `${profession.trim() || "Advocate"} ${quoted}`;
  const ctx = extra.trim() ? ` ${extra.trim()}` : "";
  return [
    { label: "Google", url: `https://www.google.com/search?q=${q(titled + ctx)}` },
    { label: "LinkedIn (via Google)", url: `https://www.google.com/search?q=${q(`site:linkedin.com/in ${titled}${ctx}`)}` },
    { label: "eCourtsIndia lawyer search", url: `https://www.google.com/search?q=${q(`site:ecourtsindia.com/lawyer ${quoted}`)}` },
    { label: "Indian Kanoon (judgments mentioning)", url: `https://indiankanoon.org/search/?formInput=${q(quoted)}` },
    { label: "Official court sites (gov.in / nic.in)", url: `https://www.google.com/search?q=${q(`${quoted} (site:nic.in OR site:gov.in)`)}` },
    { label: "Books & publications", url: `https://www.google.com/search?tbm=bks&q=${q(`inauthor:${quoted}`)}` },
    { label: "News", url: `https://www.google.com/search?tbm=nws&q=${q(titled + ctx)}` },
  ];
}

/**
 * Draft content ideas derived from the person's practice-area claims and publications. They start as
 * "research_needed" with zero scores; nothing claims expertise until the underlying claims are verified.
 */
export function starterIdeas(input: { professionalId: string; claims: Claim[]; publications: Publication[]; pillars: ContentPillar[]; existingTitles: string[]; authorId: string; now?: Date }): ContentIdea[] {
  const at = (input.now ?? new Date()).toISOString();
  const pillarAt = (i: number) => input.pillars[Math.min(i, input.pillars.length - 1)]?.id ?? "";
  const areas = input.claims.filter((c) => c.professionalId === input.professionalId && c.field === "practice_area" && c.status !== "rejected");
  const pubs = input.publications.filter((p) => p.professionalId === input.professionalId);
  const drafts: Omit<ContentIdea, "id" | "createdAt" | "updatedAt">[] = [];
  const base = (title: string, pillarId: string, hook: string, links: Partial<ContentIdea>) => ({
    professionalId: input.professionalId, title, pillarId, series: null, audience: "General audience", format: "linkedin_post" as const, platform: "LinkedIn",
    hook, cta: "Read the full explainer / follow the series (informational)", status: "research_needed" as const, plannedDate: null, scheduledAt: null,
    publishedAt: null, publishedUrl: null, body: "", sourceIds: [], claimIds: [], caseIds: [], publicationIds: [], score: emptyScore(),
    authorId: input.authorId, revisions: [], approvals: [], ...links,
  });
  areas.forEach((a, i) => {
    drafts.push(base(`${a.value}: a plain-language guide`, pillarAt(i === 0 ? 0 : 1), `What anyone dealing with ${a.value.toLowerCase()} should understand first.`, { claimIds: [a.id], sourceIds: a.sourceIds }));
    drafts.push(base(`${a.value}: common questions, answered generally`, pillarAt(2), "Five questions people ask most — general information only.", { claimIds: [a.id], sourceIds: a.sourceIds }));
  });
  pubs.forEach((p) => drafts.push(base(`Author's notes: ${p.title}`, pillarAt(4), "Why this work was written and who it is for.", { publicationIds: [p.id], sourceIds: p.sourceIds })));
  const taken = new Set(input.existingTitles.map((t) => t.toLowerCase()));
  return drafts.filter((d) => !taken.has(d.title.toLowerCase())).map((d) => ({ ...d, id: `idea-${crypto.randomUUID().slice(0, 8)}`, createdAt: at, updatedAt: at }));
}
