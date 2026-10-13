import type { CaseCategory, ClaimField, ContentFormat, ContentStatus, Outcome, SourceStatus, SourceTier, SourceType } from "@/types/professional-intelligence";

export const TIER_LABEL: Record<SourceTier, string> = {
  A: "Tier A · Official record",
  B: "Tier B · Publisher / institution",
  C: "Tier C · Self-published profile",
  D: "Tier D · Third-party / secondary",
};

export const SOURCE_TYPE_TIER: Record<SourceType, SourceTier> = {
  court_order: "A", court_record: "A", official_directory: "A", institutional_record: "A",
  publisher_page: "B", professional_org: "B", firm_page: "B",
  self_published_profile: "C",
  third_party_directory: "D", secondary_reporting: "D", other: "D",
};

export const SOURCE_STATUSES: SourceStatus[] = ["unreviewed", "verified", "contradicted", "inaccessible", "stale"];

// Sources older than this are flagged stale in the UI (the stored status is not changed automatically).
export const STALE_AFTER_DAYS = 180;

export const CLAIM_FIELD_LABEL: Record<ClaimField, string> = {
  canonical_name: "Canonical name", alias: "Alias", profession: "Profession", location: "Professional location",
  bar_enrolment: "Bar enrolment", affiliation: "Affiliation", role: "Role / appointment", education: "Education",
  credential: "Credential", practice_area: "Practice area", publication: "Publication", speaking: "Speaking / training",
  contact: "Contact channel", office_address: "Office address", photo: "Photo", profile_link: "Profile link",
};

// Fields that can hold only one current value; two different live values are a conflict.
export const SINGLE_VALUE_FIELDS: ClaimField[] = ["canonical_name", "profession", "location", "bar_enrolment"];

// Fields that may only be verified against an official (Tier A) record.
export const TIER_A_REQUIRED: ClaimField[] = ["bar_enrolment", "role"];

export const CATEGORY_LABEL: Record<CaseCategory, string> = {
  ibc: "Corporate insolvency / IBC",
  insolvency_appeal: "Insolvency appeals",
  commercial_civil: "Commercial recovery / civil suits",
  cheque_dishonour: "Cheque dishonour / NI Act s.138",
  arbitration: "Arbitration",
  company_law: "Company law",
  writ: "Writ / public-law proceedings",
  execution: "Execution / enforcement",
  interim_misc: "Interim or miscellaneous applications",
  other: "Other / unclassified",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  allowed: "Allowed", partly_allowed: "Partly allowed", dismissed: "Dismissed", withdrawn: "Withdrawn",
  settled: "Settled", remanded: "Remanded", infructuous: "Infructuous", procedural_disposal: "Procedural disposal",
  interim_direction: "Interim direction", adjourned: "Adjourned", other: "Other",
};

export const CONTENT_STATUSES: ContentStatus[] = ["idea", "research_needed", "draft", "legal_review", "approved", "scheduled", "published", "rejected"];
export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  idea: "Idea", research_needed: "Research needed", draft: "Draft", legal_review: "Legal review",
  approved: "Approved", scheduled: "Scheduled", published: "Published", rejected: "Rejected",
};
export const FORMAT_LABEL: Record<ContentFormat, string> = {
  linkedin_post: "LinkedIn post", carousel: "Carousel", article: "Article", video: "Short video", newsletter: "Newsletter", blog: "Blog",
};

export const SCORE_MAX = { evidence: 25, relevance: 25, expertise: 20, interest: 15, originality: 10, readiness: 5 } as const;
export const SCORE_LABEL: Record<keyof typeof SCORE_MAX, string> = {
  evidence: "Evidence strength & traceability", relevance: "Audience relevance", expertise: "Demonstrated expertise",
  interest: "Search / social interest", originality: "Differentiation", readiness: "Asset readiness",
};

export const LEGAL_DISCLAIMER =
  "This post is general legal information, not legal advice. Facts and law change; consult a qualified advocate about your specific situation.";
