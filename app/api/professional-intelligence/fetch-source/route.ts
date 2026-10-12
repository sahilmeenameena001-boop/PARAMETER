import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/brand-transformation/auth";
import { fetchSourceMetadata, FetchRefused } from "@/lib/professional-intelligence/fetch-source";

const Body = z.object({ url: z.string().url().max(2048) });
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

/**
 * Fetches public page metadata to prefill a source record. Open for the local workspace (requests to a localhost
 * server only); any other host requires an authenticated user. Disable entirely with PI_SOURCE_FETCH=off.
 */
export async function POST(request: NextRequest) {
  try {
    if (process.env.PI_SOURCE_FETCH === "off") return NextResponse.json({ error: "Source fetching is disabled." }, { status: 503 });
    const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
    if (!LOCAL_HOSTS.includes(host)) await requireUser(request);
    const { url } = Body.parse(await request.json());
    return NextResponse.json(await fetchSourceMetadata(url));
  } catch (error) {
    if (error instanceof FetchRefused) return NextResponse.json({ error: error.message, refused: true }, { status: 422 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Enter a valid URL." }, { status: 400 });
    const message = error instanceof Error ? error.message : "Fetch failed";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: message }, { status: 401 });
    return NextResponse.json({ error: `Could not fetch the page: ${message}` }, { status: 502 });
  }
}
