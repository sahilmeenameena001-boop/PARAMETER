import type { Claim, ClaimField, Member, Workspace } from "@/types/professional-intelligence";
import { canSeeVisibility, isContactField } from "./access.ts";
import { effectiveSourceStatus } from "./evidence.ts";
import { summarizeLitigation } from "./litigation.ts";
import { CATEGORY_LABEL } from "./constants.ts";

// Advocate summary ("profile card") built only from stored claims. Every value carries its status and sources.
// Contacts and office addresses are included only when the viewer may see them; unverified items are excluded
// unless explicitly requested, and are always labelled.

export interface SummaryItem { value: string; label: string | null; status: Claim["status"]; basis: Claim["basis"]; confidence: Claim["confidence"]; sources: { title: string; url: string; tier: string; status: string; accessedAt: string | null }[] }

export interface AdvocateSummary {
  generatedAt: string;
  professionalId: string;
  name: string;
  profession: SummaryItem | null;
  photo: SummaryItem | null;
  location: SummaryItem | null;
  officeAddresses: SummaryItem[];
  emails: SummaryItem[];
  phones: SummaryItem[];
  otherContacts: SummaryItem[];
  contactsWithheld: number; // contact items the viewer is not allowed to see
  enrolment: SummaryItem | null;
  affiliations: SummaryItem[];
  roles: SummaryItem[];
  education: SummaryItem[];
  credentials: SummaryItem[];
  practiceAreas: SummaryItem[];
  publications: { title: string; publisher: string; identifier: string | null; edition: string | null; publicationDate: string | null; status: string }[];
  speaking: SummaryItem[];
  profileLinks: SummaryItem[];
  litigation: { records: number; underlyingMatters: number; pending: number; disposed: number; outcomesVerified: number; byCategory: { category: string; count: number }[]; courts: { court: string; count: number }[]; note: string };
  narrative: string;
  completeness: { verified: number; total: number };
  includesUnverified: boolean;
  disclaimer: string;
}

// Classified by the value itself, so pointers like "See source row 273" never appear as an email or phone.
const isEmail = (c: Claim) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(c.value.trim());
const isPhone = (c: Claim) => /^[+\d(][\d\s()./-]{7,}$/.test(c.value.trim()) && c.value.replace(/\D/g, "").length >= 8;

export function buildSummary(ws: Workspace, professionalId: string, viewer: Pick<Member, "role"> | null, opts: { includeUnverified?: boolean; now?: Date } = {}): AdvocateSummary {
  const now = opts.now ?? new Date();
  const professional = ws.professionals.find((p) => p.id === professionalId);
  if (!professional) throw new Error("Professional not found.");
  const include = (c: Claim) => c.status === "verified" || (opts.includeUnverified && c.status !== "rejected");
  const all = ws.claims.filter((c) => c.professionalId === professionalId && c.status !== "rejected");
  const item = (c: Claim): SummaryItem => ({
    value: c.value, label: c.label, status: c.status, basis: c.basis, confidence: c.confidence,
    sources: ws.sources.filter((s) => c.sourceIds.includes(s.id)).map((s) => ({ title: s.title, url: s.url, tier: s.tier, status: effectiveSourceStatus(s, now), accessedAt: s.accessedAt })),
  });
  // Verified first, then higher confidence.
  const rank = (c: Claim) => (c.status === "verified" ? 0 : 1) * 10 + ({ high: 0, medium: 1, low: 2 }[c.confidence]);
  const pick = (field: ClaimField) => all.filter((c) => c.field === field && include(c)).sort((a, b) => rank(a) - rank(b));
  const first = (field: ClaimField) => { const c = pick(field)[0]; return c ? item(c) : null; };

  const contactClaims = all.filter((c) => isContactField(c.field) && include(c));
  const visible = contactClaims.filter((c) => canSeeVisibility(viewer, c.visibility));
  const channels = visible.filter((c) => c.field === "contact");
  const emails = channels.filter(isEmail);
  const phones = channels.filter((c) => !isEmail(c) && isPhone(c));
  const other = channels.filter((c) => !emails.includes(c) && !phones.includes(c));

  const cases = ws.cases.filter((c) => c.professionalId === professionalId);
  const lit = summarizeLitigation(cases, ws.orders.filter((o) => cases.some((c) => c.id === o.caseId)));
  const pubs = ws.publications.filter((p) => p.professionalId === professionalId && (p.status === "verified" || opts.includeUnverified));

  const profession = first("profession");
  const location = first("location");
  const firm = pick("affiliation")[0];
  const areas = pick("practice_area").map((c) => c.value);
  const enrolment = first("bar_enrolment");
  const tag = (s: SummaryItem | null | undefined) => (s && s.status !== "verified" ? " [unverified]" : "");
  const narrative = [
    `${professional.displayName}${profession ? ` is ${/^[aeiou]/i.test(profession.value) ? "an" : "a"} ${profession.value}${tag(profession)}` : ""}${location ? ` based in ${location.value}${tag(location)}` : ""}.`,
    firm ? `Affiliated with ${firm.label ?? firm.value}${tag(item(firm))}.` : "",
    areas.length ? `Practice areas include ${areas.slice(0, 5).join(", ")}.` : "",
    enrolment ? `Bar enrolment ${enrolment.value}${tag(enrolment)}.` : "",
    pubs.length ? `Author of ${pubs.map((p) => `“${p.title}”`).join(", ")}${pubs.some((p) => p.status !== "verified") ? " [unverified]" : ""}.` : "",
    lit.records ? `${lit.records} court record(s) on file (${lit.byStatus.pending} pending, ${lit.byStatus.disposed} disposed); ${lit.outcomesVerified} outcome(s) reviewed.` : "",
  ].filter(Boolean).join(" ");

  return {
    generatedAt: now.toISOString(), professionalId, name: professional.displayName,
    profession, photo: first("photo"), location,
    officeAddresses: visible.filter((c) => c.field === "office_address").map(item),
    emails: emails.map(item), phones: phones.map(item), otherContacts: other.map(item),
    contactsWithheld: contactClaims.length - visible.length,
    enrolment, affiliations: pick("affiliation").map(item), roles: pick("role").map(item), education: pick("education").map(item),
    credentials: pick("credential").map(item), practiceAreas: pick("practice_area").map(item),
    publications: pubs.map((p) => ({ title: p.title, publisher: p.publisher, identifier: p.identifier, edition: p.edition, publicationDate: p.publicationDate, status: p.status })),
    speaking: pick("speaking").map(item), profileLinks: pick("profile_link").map(item),
    litigation: {
      records: lit.records, underlyingMatters: lit.underlyingMatters, pending: lit.byStatus.pending, disposed: lit.byStatus.disposed, outcomesVerified: lit.outcomesVerified,
      byCategory: Object.entries(lit.byCategory).map(([k, v]) => ({ category: CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL], count: v ?? 0 })).sort((a, b) => b.count - a.count),
      courts: Object.entries(lit.byCourt).map(([court, count]) => ({ court, count })).sort((a, b) => b.count - a.count),
      note: "Counts come from stored records. 'Disposed' is a status, not a result; no win rate is calculated.",
    },
    narrative,
    completeness: { verified: all.filter((c) => c.status === "verified").length, total: all.length },
    includesUnverified: !!opts.includeUnverified,
    disclaimer: "Compiled from the listed sources. Items marked unverified have not been confirmed by a reviewer. Contact details are shown only to authorised users.",
  };
}
