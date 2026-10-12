import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/brand-transformation/auth";
import { buildCandidates, buildQueries, DEPTH_QUERIES, type RawResult } from "@/lib/professional-intelligence/discovery";
import { DiscoveryUnavailable, firecrawlSearch } from "@/lib/professional-intelligence/firecrawl";

export const maxDuration = 300;

const Body = z.object({
  professionalId: z.string().min(1).max(200),
  name: z.string().min(2).max(120),
  aliases: z.array(z.string().max(120)).max(10).default([]),
  profession: z.string().max(120).default(""),
  location: z.string().max(120).default(""),
  context: z.string().max(200).default(""),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  readPages: z.boolean().default(true),
  knownUrls: z.array(z.string().max(2048)).max(2000).default([]),
});
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
const RESULTS_PER_QUERY = 5;

/** GET reports whether discovery is configured (never returns the key). */
export async function GET() {
  return NextResponse.json({ configured: !!process.env.FIRECRAWL_API_KEY, provider: "firecrawl", queriesPerDepth: DEPTH_QUERIES, resultsPerQuery: RESULTS_PER_QUERY });
}

/**
 * Runs focused searches for one person and returns scored CANDIDATES. Nothing is saved server-side;
 * the browser stores candidates for human review. Same access rule as fetch-source.
 */
export async function POST(request: NextRequest) {
  try {
    const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
    if (!LOCAL_HOSTS.includes(host)) await requireUser(request);
    const input = Body.parse(await request.json());
    const queries = buildQueries(input, input.depth);
    const results: RawResult[] = [];
    const warnings: string[] = [];
    // Two queries at a time keeps within typical Firecrawl rate limits.
    for (let i = 0; i < queries.length; i += 2) {
      const batch = await Promise.allSettled(queries.slice(i, i + 2).map((q) => firecrawlSearch(q, { limit: RESULTS_PER_QUERY, scrape: input.readPages })));
      for (const [j, r] of batch.entries()) {
        if (r.status === "fulfilled") results.push(...r.value);
        else if (r.reason instanceof DiscoveryUnavailable) throw r.reason;
        else warnings.push(`Query "${queries[i + j]}" failed: ${r.reason instanceof Error ? r.reason.message : "error"}`);
      }
    }
    const candidates = buildCandidates({ ...input }, results, input.knownUrls);
    return NextResponse.json({
      queries, candidates, warnings,
      stats: { results: results.length, unique: candidates.length, pagesRead: results.filter((r) => r.scraped).length },
    });
  } catch (error) {
    if (error instanceof DiscoveryUnavailable) return NextResponse.json({ error: error.message, setup: true }, { status: 503 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid discovery request." }, { status: 400 });
    const message = error instanceof Error ? error.message : "Discovery failed";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: message }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
