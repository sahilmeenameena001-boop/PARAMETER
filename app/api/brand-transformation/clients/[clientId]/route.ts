import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/brand-transformation/supabase-admin";
import { assertClientOwnership, requireUser } from "@/lib/brand-transformation/auth";
import { calculateMetrics } from "@/lib/brand-transformation/scoring";

export async function GET(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  try {
    const identity = await requireUser(request);
    const { clientId } = await context.params;
    const db = getSupabaseAdmin();
    const { data: client, error: clientError } = await db.from("brand_clients").select("*").eq("id", clientId).single();
    if (clientError) throw clientError;
    assertClientOwnership(client, identity.organizationId);

    const { data: audit } = await db.from("brand_audits").select("*").eq("client_id", clientId).order("version", { ascending: false }).limit(1).maybeSingle();
    const [findingsResult, tokensResult, tasksResult] = await Promise.all([
      audit ? db.from("brand_audit_findings").select("*").eq("audit_id", audit.id).order("created_at") : Promise.resolve({ data: [], error: null }),
      db.from("brand_tokens").select("*").eq("client_id", clientId).order("token_type"),
      db.from("brand_transformation_tasks").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
    ]);
    if (findingsResult.error) throw findingsResult.error;
    if (tokensResult.error) throw tokensResult.error;
    if (tasksResult.error) throw tasksResult.error;
    const findings = findingsResult.data || [];
    const tasks = tasksResult.data || [];
    return NextResponse.json({
      client,
      audit: audit ? { ...audit, findings } : null,
      brandTokens: tokensResult.data || [],
      tasks,
      metrics: calculateMetrics(findings as never[], tasks),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

