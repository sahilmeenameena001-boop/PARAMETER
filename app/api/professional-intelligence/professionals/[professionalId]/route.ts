import { NextRequest, NextResponse } from "next/server";
import { redactClaim } from "@/lib/professional-intelligence/access";
import { summarizeLitigation } from "@/lib/professional-intelligence/litigation";
import { errorResponse, loadProfessional, must, requireMember, toCase, toClaim, toContent, toOrder, toSource } from "@/lib/professional-intelligence/server";

type Row = Record<string, any>;

export async function GET(request: NextRequest, context: { params: Promise<{ professionalId: string }> }) {
  try {
    const { identity, member, db } = await requireMember(request);
    const { professionalId } = await context.params;
    const professional = await loadProfessional(db, professionalId, identity.organizationId);

    const [claims, cases, publications, pillars, content, performance, sources] = await Promise.all([
      db.from("pi_claims").select("*, pi_claim_evidence(source_id)").eq("professional_id", professionalId).then(must<Row[]>),
      db.from("pi_court_cases").select("*, pi_case_evidence(source_id), pi_court_case_parties(*)").eq("professional_id", professionalId).then(must<Row[]>),
      db.from("pi_publications").select("*, pi_publication_evidence(source_id)").eq("professional_id", professionalId).then(must<Row[]>),
      db.from("pi_content_pillars").select("*").eq("professional_id", professionalId).then(must<Row[]>),
      db.from("pi_content_ideas").select("*, pi_content_evidence(*), pi_content_approvals(*), pi_content_revisions(*)").eq("professional_id", professionalId).order("planned_date").then(must<Row[]>),
      db.from("pi_content_performance").select("*").eq("professional_id", professionalId).then(must<Row[]>),
      db.from("pi_source_evidence").select("*").eq("organization_id", identity.organizationId).then(must<Row[]>),
    ]);
    const caseIds = cases.map((c) => c.id);
    const orders = caseIds.length ? await db.from("pi_court_orders").select("*, pi_case_outcome_reviews(*)").in("case_id", caseIds).then(must<Row[]>) : [];

    const mappedCases = cases.map((c) => toCase(c, (c.pi_case_evidence ?? []).map((e: Row) => e.source_id), c.pi_court_case_parties ?? []));
    const mappedOrders = orders.map((o) => {
      const latest = [...(o.pi_case_outcome_reviews ?? [])].sort((a: Row, b: Row) => String(b.verified_at).localeCompare(String(a.verified_at)))[0] ?? null;
      return toOrder(o, latest);
    });
    return NextResponse.json({
      member,
      professional,
      sources: sources.map(toSource),
      // Restricted contact values never leave the server for non-reviewers.
      claims: claims.map((c) => redactClaim(toClaim(c, (c.pi_claim_evidence ?? []).map((e: Row) => e.source_id)), member)),
      cases: mappedCases,
      orders: mappedOrders,
      publications,
      pillars,
      content: content.map((c) => toContent(c, c.pi_content_evidence ?? [], c.pi_content_approvals ?? [], c.pi_content_revisions ?? [])),
      performance,
      litigationSummary: summarizeLitigation(mappedCases, mappedOrders),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
