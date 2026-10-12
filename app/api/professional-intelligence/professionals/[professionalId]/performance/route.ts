import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canEdit } from "@/lib/professional-intelligence/access";
import { importPerformanceCsv } from "@/lib/professional-intelligence/performance";
import { errorResponse, loadProfessional, must, requireMember } from "@/lib/professional-intelligence/server";

type Row = Record<string, any>;
const Body = z.object({ csv: z.string().min(1).max(2_000_000) });

/** Manual/CSV metric import. No analytics integration is configured in this project, so nothing is fetched automatically. */
export async function POST(request: NextRequest, context: { params: Promise<{ professionalId: string }> }) {
  try {
    const { identity, member, db } = await requireMember(request);
    if (!canEdit(member)) return NextResponse.json({ error: "Editor role required" }, { status: 403 });
    const { professionalId } = await context.params;
    await loadProfessional(db, professionalId, identity.organizationId);
    const { csv } = Body.parse(await request.json());
    const content = await db.from("pi_content_ideas").select("id").eq("professional_id", professionalId).then(must<Row[]>);
    const { records, errors } = importPerformanceCsv(csv, { professionalId, contentIds: content.map((c) => c.id) });
    if (errors.length) return NextResponse.json({ imported: 0, errors }, { status: 422 });
    if (records.length) {
      await db.from("pi_content_performance").insert(records.map((r) => ({
        professional_id: professionalId, content_id: r.contentId, platform: r.platform, published_at: r.publishedAt,
        period_start: r.periodStart, period_end: r.periodEnd, impressions: r.impressions, clicks: r.clicks, reactions: r.reactions,
        comments: r.comments, saves: r.saves, shares: r.shares, qualified_enquiries: r.qualifiedEnquiries, consultations: r.consultations,
        attribution_evidence: r.attributionEvidence, origin: "csv", created_by: member.id,
      }))).then(must);
    }
    return NextResponse.json({ imported: records.length, errors: [] }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
