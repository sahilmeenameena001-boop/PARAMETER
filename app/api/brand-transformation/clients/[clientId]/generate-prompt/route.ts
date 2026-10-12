import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertClientOwnership, requireUser } from "@/lib/brand-transformation/auth";
import { getSupabaseAdmin } from "@/lib/brand-transformation/supabase-admin";
import { buildCreativePrompt } from "@/lib/brand-transformation/prompts";

const Body = z.object({
  format: z.string().default("1080x1350px portrait"),
  content: z.object({
    headline: z.string().min(1), accent: z.string().optional(), standfirst: z.string().optional(),
    body: z.string().optional(), footer: z.string().optional(),
  }),
});

export async function POST(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  try {
    const identity = await requireUser(request);
    const { clientId } = await context.params;
    const input = Body.parse(await request.json());
    const db = getSupabaseAdmin();
    const [{ data: client, error: clientError }, { data: tokens, error: tokenError }] = await Promise.all([
      db.from("brand_clients").select("*").eq("id", clientId).single(),
      db.from("brand_tokens").select("*").eq("client_id", clientId).eq("status", "approved"),
    ]);
    if (clientError) throw clientError;
    if (tokenError) throw tokenError;
    assertClientOwnership(client, identity.organizationId);
    if (!tokens?.length) return NextResponse.json({ error: "Approve brand tokens before generating creatives" }, { status: 409 });
    let prompt = buildCreativePrompt({ clientName: client.name, positioning: client.desired_positioning || client.current_positioning || "", content: input.content, tokens, format: input.format });

    if (process.env.N8N_PROMPT_WEBHOOK_URL) {
      const response = await fetch(process.env.N8N_PROMPT_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET || "" },
        body: JSON.stringify({ prompt, client, tokens, content: input.content }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`n8n prompt workflow failed: ${response.status}`);
      const enhanced = await response.json();
      prompt = enhanced.prompt || prompt;
    }
    return NextResponse.json({ prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : message === "UNAUTHORIZED" ? 401 : 500 });
  }
}

