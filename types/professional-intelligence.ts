// Professional Authority Intelligence — shared types.
// Every material fact is a Claim linked to SourceEvidence records; nothing is "true" until a reviewer verifies it.

export type Role = "viewer" | "editor" | "legal_reviewer" | "admin";
export interface Member { id: string; name: string; role: Role }

export type SourceTier = "A" | "B" | "C" | "D";
export type SourceType =
  | "court_order" | "court_record" | "official_directory" | "institutional_record"
  | "publisher_page" | "professional_org" | "firm_page"
  | "self_published_profile" | "third_party_directory" | "secondary_reporting" | "other";
export type SourceStatus = "unreviewed" | "verified" | "contradicted" | "inaccessible" | "stale";

export interface SourceEvidence {
  id: string;
  url: string; // exact URL as accessed — never normalised
  title: string;
  publisher: string;
  sourceType: SourceType;
  tier: SourceTier;
  publishedAt: string | null;
  accessedAt: string | null;
  status: SourceStatus;
  excerpt: string;
  verificationMethod: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  accessNotes: string;
  notes: string;
  attachmentText: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ClaimField =
  | "canonical_name" | "alias" | "profession" | "location" | "bar_enrolment"
  | "affiliation" | "role" | "education" | "credential" | "practice_area"
  | "publication" | "speaking" | "contact" | "profile_link";
export type ClaimStatus = "unverified" | "verified" | "disputed" | "rejected";
export type Confidence = "low" | "medium" | "high";
export type ClaimBasis = "stated" | "inferred";
export type Visibility = "restricted" | "internal" | "public";

export interface Claim {
  id: string;
  professionalId: string;
  field: ClaimField;
  value: string;
  label: string | null; // e.g. contact channel type, affiliation organisation
  effectiveFrom: string | null;
  effectiveTo: string | null;
  basis: ClaimBasis;
  confidence: Confidence;
  status: ClaimStatus;
  visibility: Visibility;
  sourceIds: string[];
  reviewerId: string | null;
  verifiedAt: string | null;
  supersedesId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Professional {
  id: string;
  slug: string;
  displayName: string;
  profession: string;
  isExample: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CaseCategory =
  | "ibc" | "insolvency_appeal" | "commercial_civil" | "cheque_dishonour" | "arbitration"
  | "company_law" | "writ" | "execution" | "interim_misc" | "other";
export type CaseStatus = "pending" | "disposed" | "unknown";
export type PartySide = "petitioner" | "respondent" | "appellant" | "complainant" | "accused" | "unknown";

export interface CaseParty { name: string; side: PartySide }

export interface CourtCase {
  id: string;
  professionalId: string;
  cnr: string | null;
  caseNumber: string | null;
  title: string;
  court: string;
  bench: string | null;
  caseTypeRaw: string;
  actsRaw: string | null;
  category: CaseCategory;
  categoryOverridden: boolean;
  isInterim: boolean;
  parentCaseId: string | null;
  filingDate: string | null;
  disposalDate: string | null;
  status: CaseStatus;
  lastCheckedAt: string | null;
  parties: CaseParty[];
  // Only set when a source explicitly states it. `representedSideVerified` requires a reviewer.
  representedSide: PartySide | null;
  representedSideVerified: boolean;
  appearanceEvidence: string | null;
  caseUrl: string | null;
  orderListUrl: string | null;
  sourceIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type ExtractionStatus = "not_started" | "extracted" | "manual" | "failed" | "inaccessible";
export type Outcome =
  | "allowed" | "partly_allowed" | "dismissed" | "withdrawn" | "settled" | "remanded"
  | "infructuous" | "procedural_disposal" | "interim_direction" | "adjourned" | "other";
export type DisposalNature = "procedural" | "merits" | "undetermined";

export interface OutcomeReview {
  outcome: Outcome;
  reliefSought: string;
  reliefGranted: string;
  disposalNature: DisposalNature;
  rationale: string;
  excerpt: string; // must appear verbatim in the order text
  method: string;
  confidence: Confidence;
  reviewerId: string;
  reviewedAt: string;
}

export interface CourtOrder {
  id: string;
  caseId: string;
  orderNumber: string | null;
  orderDate: string | null;
  orderUrl: string | null;
  pdfUrl: string | null;
  isFinal: boolean;
  extractionStatus: ExtractionStatus;
  extractedAt: string | null;
  orderText: string;
  review: OutcomeReview | null;
  createdAt: string;
  updatedAt: string;
}

export interface Publication {
  id: string;
  professionalId: string;
  title: string;
  authors: string;
  publisher: string;
  identifier: string | null; // ISBN / DOI
  edition: string | null;
  publicationDate: string | null;
  topics: string[];
  practiceAreas: string[];
  contentIdeas: string[];
  sourceIds: string[];
  status: ClaimStatus;
  reviewerId: string | null;
  verifiedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPillar { id: string; professionalId: string; name: string; allocation: number; description: string; series: string[] }

export type ContentStatus = "idea" | "research_needed" | "draft" | "legal_review" | "approved" | "scheduled" | "published" | "rejected";
export type ContentFormat = "linkedin_post" | "carousel" | "article" | "video" | "newsletter" | "blog";

export interface ScoreComponent { score: number; rationale: string }
export interface OpportunityScore {
  evidence: ScoreComponent;
  relevance: ScoreComponent;
  expertise: ScoreComponent;
  interest: ScoreComponent;
  originality: ScoreComponent;
  readiness: ScoreComponent;
}

export interface ContentRevision { id: string; at: string; by: string; body: string; note: string }
export interface ContentApproval { id: string; at: string; by: string; from: ContentStatus; to: ContentStatus; note: string }

export interface ContentIdea {
  id: string;
  professionalId: string;
  title: string;
  pillarId: string;
  series: string | null;
  audience: string;
  format: ContentFormat;
  platform: string;
  hook: string;
  cta: string;
  status: ContentStatus;
  plannedDate: string | null; // planning slot — not a publishing commitment
  scheduledAt: string | null; // only set once approved and scheduled
  publishedAt: string | null;
  publishedUrl: string | null;
  body: string;
  sourceIds: string[];
  claimIds: string[];
  caseIds: string[];
  publicationIds: string[];
  score: OpportunityScore;
  authorId: string;
  revisions: ContentRevision[];
  approvals: ContentApproval[];
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceRecord {
  id: string;
  professionalId: string;
  contentId: string | null;
  platform: string;
  publishedAt: string | null;
  periodStart: string;
  periodEnd: string;
  impressions: number | null;
  clicks: number | null;
  reactions: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  qualifiedEnquiries: number | null;
  consultations: number | null;
  attributionEvidence: string;
  origin: "manual" | "csv" | "integration";
  createdAt: string;
}

export interface AuditEntry { id: string; at: string; actorId: string; action: string; entity: string; entityId: string; detail: string }

export interface DiscoverySuggestion { field: ClaimField; value: string; label: string | null; excerpt: string }

export interface DiscoveredCase {
  cnr: string;
  title: string | null;
  excerpt: string;
  court?: string | null;
  caseType?: string | null;
  acts?: string | null;
  status?: "pending" | "disposed" | null;
  appearance?: { side: string; text: string } | null; // as printed by the listing, e.g. "Petitioner Adv: NAME"
}

export interface DiscoveryCandidate {
  id: string;
  professionalId: string;
  url: string;
  title: string;
  publisher: string;
  sourceType: SourceType;
  tier: SourceTier;
  loginWalled: boolean;
  matchScore: number; // 0–100 heuristic same-person likelihood
  matchReasons: string[];
  excerpt: string;
  pageText: string; // contact details redacted
  suggestions: DiscoverySuggestion[];
  cnrs: DiscoveredCase[];
  query: string;
  scraped: boolean;
  note: string;
  status: "pending" | "accepted" | "rejected";
  foundAt: string;
}

export interface Workspace {
  schemaVersion: 1;
  members: Member[];
  currentUserId: string;
  activeProfessionalId: string;
  professionals: Professional[];
  sources: SourceEvidence[];
  claims: Claim[];
  cases: CourtCase[];
  orders: CourtOrder[];
  publications: Publication[];
  pillars: ContentPillar[];
  content: ContentIdea[];
  performance: PerformanceRecord[];
  candidates: DiscoveryCandidate[];
  auditLog: AuditEntry[];
}
