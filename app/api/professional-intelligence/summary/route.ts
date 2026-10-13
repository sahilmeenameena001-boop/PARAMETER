import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Workspace } from "@/types/professional-intelligence";
import { requireUser } from "@/lib/brand-transformation/auth";
import { buildSummary } from "@/lib/professional-intelligence/summary";

const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
const Body = z.object({
  professionalId: z.string().min(1),
  includeUnverified: z.boolean().default(false),
  workspace: z.object({
    schemaVersion: z.literal(1), members: z.array(z.any()), currentUserId: z.string(), professionals: z.array(z.any()),
    sources: z.array(z.any()), claims: z.array(z.any()), cases: z.array(z.any()), orders: z.array(z.any()), publications: z.array(z.any()),
  }).passthrough(),
});

/**
 * Stateless summary API: POST a workspace export (or the local workspace) and a professionalId to get the advocate
 * summary JSON. On a localhost server the caller's role comes from the workspace's current member; from any other host
 * the caller must be authenticated and is treated as a viewer (public contacts only).
 */
export async function POST(request: NextRequest) {
  try {
    const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
    const local = LOCAL_HOSTS.includes(host);
    if (!local) await requireUser(request);
    const input = Body.parse(await request.json());
    const ws = { pillars: [], content: [], performance: [], candidates: [], auditLog: [], activeProfessionalId: "", ...input.workspace } as unknown as Workspace;
    const member = local ? ws.members.find((m) => m.id === ws.currentUserId) ?? null : { role: "viewer" as const };
    return NextResponse.json(buildSummary(ws, input.professionalId, member, { includeUnverified: input.includeUnverified }));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Send { professionalId, workspace } — workspace is the JSON from Export." }, { status: 400 });
    const message = error instanceof Error ? error.message : "Summary failed";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : message === "Professional not found." ? 404 : 500 });
  }
}
