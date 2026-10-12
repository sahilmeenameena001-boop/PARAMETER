import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/brand-transformation/auth";
import { getSupabaseAdmin } from "@/lib/brand-transformation/supabase-admin";

const Body = z.object({ recommendationIndex: z.number().int().nonnegative().optional() });

export async function POST(request: NextRequest, context: { params: Promise<{ findingId: string }> }) {
  try {
    const identity = await requireUser(request);
    const { findingId } = await context.params;
    const body = Body.parse(await request.json().catch(() => ({})));
    const db = getSupabaseAdmin();
    const { data: finding, error } = await db.from("brand_audit_findings").select("*, brand_audits!inner(client_id, brand_clients!inner(organization_id))").eq("id", findingId).single();
    if (error) throw error;
    if (finding.brand_audits.brand_clients.organization_id !== identity.organizationId) throw new Error("FORBIDDEN");
    const recommendations: string[] = finding.recommendations || [];
    const selected = body.recommendationIndex === undefined ? recommendations : [recommendations[body.recommendationIndex]].filter(Boolean);
    if (!selected.length) return NextResponse.json({ error: "No recommendation found" }, { status: 400 });
    const rows = selected.map((recommendation) => ({
      client_id: finding.brand_audits.client_id,
      finding_id: finding.id,
      title: recommendation,
      description: `Created from ${finding.category} / ${finding.element}: ${finding.observation}`,
      priority: finding.severity,
      status: "todo",
      output_required: recommendation,
      created_by: identity.userId,
    }));
    const { data, error: insertError } = await db.from("brand_transformation_tasks").insert(rows).select();
    if (insertError) throw insertError;
    return NextResponse.json({ tasks: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : message === "UNAUTHORIZED" ? 401 : 500 });
  }
}

