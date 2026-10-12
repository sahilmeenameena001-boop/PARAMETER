import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CONTENT_STATUSES } from "@/lib/professional-intelligence/constants";
import { transitionContent } from "@/lib/professional-intelligence/content";
import { errorResponse, loadProfessional, must, requireMember, toCase, toClaim, toContent, toOrder, toSource } from "@/lib/professional-intelligence/server";
import type { ContentStatus } from "@/types/professional-intelligence";

type Row = Record<string, any>;
const Body = z.object({
  to: z.enum(CONTENT_STATUSES as [ContentStatus, ...ContentStatus[]]),
  note: z.string().max(2000).optional(),
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  publishedUrl: z.string().url().optional(),
});

/** Server-side approval gate. The same rules run in the UI, here, and again in the database trigger. */
export async function POST(request: NextRequest, context: { params: Promise<{ contentId: string }> }) {
  try {
    const { identity, member, db } = await requireMember(request);
    const { contentId } = await context.params;
    const body = Body.parse(await request.json());
    const row = await db.from("pi_content_ideas").select("*, pi_content_evidence(*), pi_content_approvals(*), pi_content_revisions(*)").eq("id", contentId).single().then(must<Row>);
    await loadProfessional(db, row.professional_id, identity.organizationId);
    const item = toContent(row, row.pi_content_evidence ?? [], row.pi_content_approvals ?? [], row.pi_content_revisions ?? []);

    const [sources, claims, cases] = await Promise.all([
      item.sourceIds.length ? db.from("pi_source_evidence").select("*").in("id", item.sourceIds).then(must<Row[]>) : [],
      item.claimIds.length ? db.from("pi_claims").select("*").in("id", item.claimIds).then(must<Row[]>) : [],
      item.caseIds.length ? db.from("pi_court_cases").select("*").in("id", item.caseIds).then(must<Row[]>) : [],
    ]);
    const orders = cases.length ? await db.from("pi_court_orders").select("*, pi_case_outcome_reviews(*)").in("case_id", cases.map((c) => c.id)).then(must<Row[]>) : [];

    const next = transitionContent(item, body.to, {
      actor: member, note: body.note, scheduledAt: body.scheduledAt ?? null, publishedUrl: body.publishedUrl ?? null,
      sources: sources.map(toSource), claims: claims.map((c) => toClaim(c, [])),
      cases: cases.map((c) => toCase(c, [], [])), orders: orders.map((o) => toOrder(o, (o.pi_case_outcome_reviews ?? [])[0] ?? null)),
    });

    const update: Row = { status: next.status, scheduled_at: next.scheduledAt, published_at: next.publishedAt, published_url: next.publishedUrl };
    if (next.status === "approved") update.approved_by = member.id;
    const { error } = await db.from("pi_content_ideas").update(update).eq("id", contentId);
    if (error) throw error;
    await db.from("pi_content_approvals").insert({ content_id: contentId, from_status: item.status, to_status: next.status, note: body.note ?? "", actor_id: member.id }).then(must);
    return NextResponse.json({ status: next.status });
  } catch (error) {
    return errorResponse(error);
  }
}
