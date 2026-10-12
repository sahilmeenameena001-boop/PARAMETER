import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reviewOrderOutcome } from "@/lib/professional-intelligence/litigation";
import { errorResponse, loadProfessional, must, requireMember, toOrder } from "@/lib/professional-intelligence/server";

type Row = Record<string, any>;
const Body = z.object({
  outcome: z.enum(["allowed", "partly_allowed", "dismissed", "withdrawn", "settled", "remanded", "infructuous", "procedural_disposal", "interim_direction", "adjourned", "other"]),
  reliefSought: z.string().max(4000).default(""),
  reliefGranted: z.string().max(4000).default(""),
  disposalNature: z.enum(["procedural", "merits", "undetermined"]),
  rationale: z.string().min(20).max(8000),
  excerpt: z.string().min(1).max(8000),
  method: z.string().min(1).max(1000),
  confidence: z.enum(["low", "medium", "high"]),
});

export async function POST(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { identity, member, db } = await requireMember(request);
    const { orderId } = await context.params;
    const input = Body.parse(await request.json());
    const row = await db.from("pi_court_orders").select("*, pi_court_cases!inner(professional_id)").eq("id", orderId).single().then(must<Row>);
    await loadProfessional(db, row.pi_court_cases.professional_id, identity.organizationId);
    const reviewed = reviewOrderOutcome(toOrder(row, null), input, member);
    const r = reviewed.review!;
    const inserted = await db.from("pi_case_outcome_reviews").insert({
      order_id: orderId, operative_outcome: r.outcome, relief_sought: r.reliefSought, relief_granted: r.reliefGranted,
      procedural_or_merits: r.disposalNature, classification_rationale: r.rationale, evidence_excerpt: r.excerpt, method: r.method,
      confidence: r.confidence, reviewer_id: member.id,
    }).select().single().then(must<Row>);
    return NextResponse.json({ review: inserted }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
