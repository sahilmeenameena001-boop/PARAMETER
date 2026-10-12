import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertClientOwnership, requireUser } from "@/lib/brand-transformation/auth";
import { getSupabaseAdmin } from "@/lib/brand-transformation/supabase-admin";

const Finding = z.object({
  category: z.string().min(1), element: z.string().min(1), currentScore: z.number().min(0).max(10),
  targetScore: z.number().min(0).max(10).default(9), weight: z.number().positive().default(1),
  severity: z.enum(["low", "medium", "high", "critical"]), observation: z.string().min(1),
  issues: z.array(z.string()).default([]), recommendations: z.array(z.string()).default([]),
});
const Body = z.object({ sourceText: z.string().min(20), title: z.string().optional() });
const Extraction = z.object({ title: z.string(), currentPositioning: z.string(), desiredPositioning: z.string(), findings: z.array(Finding).min(1) });

export async function POST(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  let auditId: string | null = null;
  try {
    const identity = await requireUser(request);
    const { clientId } = await context.params;
    const input = Body.parse(await request.json());
    if (!process.env.N8N_AUDIT_WEBHOOK_URL) return NextResponse.json({ error: "N8N_AUDIT_WEBHOOK_URL is not configured" }, { status: 503 });
    const db = getSupabaseAdmin();
    const { data: client, error: clientError } = await db.from("brand_clients").select("*").eq("id", clientId).single();
    if (clientError) throw clientError;
    assertClientOwnership(client, identity.organizationId);
    const response = await fetch(process.env.N8N_AUDIT_WEBHOOK_URL, {
      method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET || "" },
      body: JSON.stringify({ sourceText: input.sourceText }), signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`n8n audit workflow failed: ${response.status}`);
    const extracted = Extraction.parse(await response.json());
    const { data: latest } = await db.from("brand_audits").select("version").eq("client_id", clientId).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: audit, error: auditError } = await db.from("brand_audits").insert({
      client_id: clientId, title: input.title || extracted.title, version: (latest?.version || 0) + 1,
      status: "in_review", source_text: input.sourceText, created_by: identity.userId,
    }).select().single();
    if (auditError) throw auditError;
    auditId = audit.id;
    const { error: findingError } = await db.from("brand_audit_findings").insert(extracted.findings.map((f) => ({
      audit_id: audit.id, category: f.category, element: f.element, current_score: f.currentScore,
      target_score: f.targetScore, weight: f.weight, severity: f.severity, observation: f.observation,
      issues: f.issues, recommendations: f.recommendations, status: "open",
    })));
    if (findingError) throw findingError;
    await db.from("brand_clients").update({ current_positioning: extracted.currentPositioning, desired_positioning: extracted.desiredPositioning }).eq("id", clientId);
    return NextResponse.json({ auditId: audit.id, version: audit.version, findings: extracted.findings.length }, { status: 201 });
  } catch (error) {
    if (auditId) await getSupabaseAdmin().from("brand_audits").delete().eq("id", auditId);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : message === "UNAUTHORIZED" ? 401 : 500 });
  }
}

