import { NextRequest, NextResponse } from "next/server";
import type { Workspace } from "@/types/professional-intelligence";
import { buildSummary } from "@/lib/professional-intelligence/summary";
import { errorResponse, loadProfessional, must, requireMember, toCase, toClaim, toOrder, toSource } from "@/lib/professional-intelligence/server";

type Row = Record<string, any>;

/** Live (Supabase) advocate summary. Contacts are filtered by the caller's role from pi_member_roles. ?includeUnverified=1 adds labelled leads. */
export async function GET(request: NextRequest, context: { params: Promise<{ professionalId: string }> }) {
  try {
    const { identity, member, db } = await requireMember(request);
    const { professionalId } = await context.params;
    const p = await loadProfessional(db, professionalId, identity.organizationId);
    const [claims, cases, publications, sources] = await Promise.all([
      db.from("pi_claims").select("*, pi_claim_evidence(source_id)").eq("professional_id", professionalId).then(must<Row[]>),
      db.from("pi_court_cases").select("*, pi_case_evidence(source_id)").eq("professional_id", professionalId).then(must<Row[]>),
      db.from("pi_publications").select("*").eq("professional_id", professionalId).then(must<Row[]>),
      db.from("pi_source_evidence").select("*").eq("organization_id", identity.organizationId).then(must<Row[]>),
    ]);
    const orders = cases.length ? await db.from("pi_court_orders").select("*, pi_case_outcome_reviews(*)").in("case_id", cases.map((c) => c.id)).then(must<Row[]>) : [];
    const ws = {
      schemaVersion: 1, members: [member], currentUserId: member.id, activeProfessionalId: professionalId,
      professionals: [{ id: p.id, slug: p.slug, displayName: p.display_name, profession: p.profession, isExample: p.is_example, lastCheckedAt: p.last_checked_at, createdAt: p.created_at, updatedAt: p.updated_at }],
      sources: sources.map(toSource),
      claims: claims.map((c) => toClaim(c, (c.pi_claim_evidence ?? []).map((e: Row) => e.source_id))),
      cases: cases.map((c) => toCase(c, (c.pi_case_evidence ?? []).map((e: Row) => e.source_id), [])),
      orders: orders.map((o) => toOrder(o, (o.pi_case_outcome_reviews ?? [])[0] ?? null)),
      publications: publications.map((x) => ({ id: x.id, professionalId: x.professional_id, title: x.title, authors: x.authors, publisher: x.publisher, identifier: x.identifier, edition: x.edition, publicationDate: x.publication_date, topics: x.topics, practiceAreas: x.practice_areas, contentIdeas: x.content_ideas, sourceIds: [], status: x.status, reviewerId: x.reviewer_id, verifiedAt: x.verified_at, notes: x.notes, createdAt: x.created_at, updatedAt: x.updated_at })),
      pillars: [], content: [], performance: [], candidates: [], auditLog: [],
    } as Workspace;
    const includeUnverified = ["1", "true"].includes(request.nextUrl.searchParams.get("includeUnverified") ?? "");
    return NextResponse.json(buildSummary(ws, professionalId, member, { includeUnverified }));
  } catch (error) {
    return errorResponse(error);
  }
}
