import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Claim, ContentIdea, CourtCase, CourtOrder, Member, Role, SourceEvidence } from "@/types/professional-intelligence";
import { requireUser } from "@/lib/brand-transformation/auth";
import { getSupabaseAdmin } from "@/lib/brand-transformation/supabase-admin";
import { WorkflowError } from "./evidence.ts";
import { emptyScore } from "./scoring.ts";

type Row = Record<string, any>;

/** Resolves the caller via the dashboard's existing requireUser() and their professional-intelligence role. */
export async function requireMember(request: NextRequest) {
  const identity = await requireUser(request);
  const db = getSupabaseAdmin();
  const { data } = await db.from("pi_member_roles").select("role").eq("organization_id", identity.organizationId).eq("user_id", identity.userId).maybeSingle();
  const member: Member = { id: identity.userId, name: identity.userId, role: (data?.role as Role) ?? "viewer" };
  return { identity, member, db };
}

export async function loadProfessional(db: SupabaseClient, professionalId: string, organizationId: string) {
  const { data, error } = await db.from("pi_professionals").select("*").eq("id", professionalId).single();
  if (error) throw error;
  if (data.organization_id !== organizationId) throw new Error("FORBIDDEN");
  return data as Row;
}

export function errorResponse(error: unknown) {
  if (error instanceof WorkflowError) return NextResponse.json({ error: error.message, blocked: true }, { status: 422 });
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

export const toSource = (r: Row): SourceEvidence => ({
  id: r.id, url: r.url, title: r.title, publisher: r.publisher, sourceType: r.source_type, tier: r.tier, publishedAt: r.published_at,
  accessedAt: r.accessed_at, status: r.status, excerpt: r.excerpt, verificationMethod: r.verification_method, reviewerId: r.reviewer_id,
  reviewedAt: r.reviewed_at, accessNotes: r.access_notes, notes: r.notes, attachmentText: r.extracted_text ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
});

export const toClaim = (r: Row, sourceIds: string[]): Claim => ({
  id: r.id, professionalId: r.professional_id, field: r.field, value: r.value, label: r.label, effectiveFrom: r.effective_from,
  effectiveTo: r.effective_to, basis: r.basis, confidence: r.confidence, status: r.status, visibility: r.visibility, sourceIds,
  reviewerId: r.reviewer_id, verifiedAt: r.verified_at, supersedesId: r.supersedes_id, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
});

export const toCase = (r: Row, sourceIds: string[], parties: Row[]): CourtCase => ({
  id: r.id, professionalId: r.professional_id, cnr: r.cnr, caseNumber: r.case_number, title: r.title, court: r.court, bench: r.bench,
  caseTypeRaw: r.case_type_raw, actsRaw: r.acts_raw, category: r.category, categoryOverridden: r.category_overridden, isInterim: r.is_interim,
  parentCaseId: r.parent_case_id, filingDate: r.filing_date, disposalDate: r.disposal_date, status: r.status, lastCheckedAt: r.last_checked_at,
  parties: parties.map((p) => ({ name: p.name, side: p.side })), representedSide: r.represented_side, representedSideVerified: r.represented_side_verified,
  appearanceEvidence: r.appearance_evidence, caseUrl: r.case_url, orderListUrl: r.order_list_url, sourceIds, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
});

export const toOrder = (r: Row, review: Row | null): CourtOrder => ({
  id: r.id, caseId: r.case_id, orderNumber: r.order_number, orderDate: r.order_date, orderUrl: r.order_url, pdfUrl: r.pdf_url, isFinal: r.is_final,
  extractionStatus: r.extraction_status, extractedAt: r.extracted_at, orderText: r.order_text, createdAt: r.created_at, updatedAt: r.updated_at,
  review: review ? {
    outcome: review.operative_outcome, reliefSought: review.relief_sought, reliefGranted: review.relief_granted, disposalNature: review.procedural_or_merits,
    rationale: review.classification_rationale, excerpt: review.evidence_excerpt, method: review.method, confidence: review.confidence,
    reviewerId: review.reviewer_id, reviewedAt: review.verified_at,
  } : null,
});

export const toContent = (r: Row, evidence: Row[], approvals: Row[], revisions: Row[]): ContentIdea => ({
  id: r.id, professionalId: r.professional_id, title: r.title, pillarId: r.pillar_id, series: r.series, audience: r.audience, format: r.format,
  platform: r.platform, hook: r.hook, cta: r.cta, status: r.status, plannedDate: r.planned_date, scheduledAt: r.scheduled_at, publishedAt: r.published_at,
  publishedUrl: r.published_url, body: r.body,
  sourceIds: evidence.filter((e) => e.source_id).map((e) => e.source_id), claimIds: evidence.filter((e) => e.claim_id).map((e) => e.claim_id),
  caseIds: evidence.filter((e) => e.case_id).map((e) => e.case_id), publicationIds: evidence.filter((e) => e.publication_id).map((e) => e.publication_id),
  score: { ...emptyScore(), ...(r.score ?? {}) }, authorId: r.author_id,
  revisions: revisions.map((v) => ({ id: v.id, at: v.created_at, by: v.created_by, body: v.body, note: v.note })),
  approvals: approvals.map((a) => ({ id: a.id, at: a.created_at, by: a.actor_id, from: a.from_status, to: a.to_status, note: a.note })),
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return (result.data ?? []) as T;
}
