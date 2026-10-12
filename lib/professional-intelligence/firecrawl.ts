// Server-only Firecrawl search client used by automatic discovery.
// The API key is read from FIRECRAWL_API_KEY on the server and never sent to the browser.
import type { RawResult } from "./discovery.ts";
import { robotsAllows } from "./fetch-source.ts";

const LOGIN_WALLED = /(^|\.)(linkedin|facebook|instagram)\.com$/i;

export class DiscoveryUnavailable extends Error {}

interface FcItem { url?: string; title?: string; description?: string; markdown?: string; metadata?: { title?: string; description?: string; sourceURL?: string } }

/** Accepts both the v2 shape ({ data: { web: [...] } }) and the v1 shape ({ data: [...] }). */
export function parseFirecrawlSearch(json: unknown): FcItem[] {
  const data = (json as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as FcItem[];
  if (data && typeof data === "object" && Array.isArray((data as { web?: unknown }).web)) return (data as { web: FcItem[] }).web;
  return [];
}

const robotsCache = new Map<string, Promise<string | null>>();
async function robotsFor(origin: string) {
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.text() : null)).catch(() => null));
  }
  return robotsCache.get(origin)!;
}

export async function firecrawlSearch(query: string, opts: { limit: number; scrape: boolean }): Promise<RawResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new DiscoveryUnavailable("FIRECRAWL_API_KEY is not set. Add it to .env.local and restart the server.");
  const base = (process.env.FIRECRAWL_API_BASE || "https://api.firecrawl.dev").replace(/\/$/, "");
  const body: Record<string, unknown> = { query, limit: opts.limit, location: "India", ...(opts.scrape ? { scrapeOptions: { formats: ["markdown"], onlyMainContent: true } } : {}) };
  const response = await fetch(`${base}/v2/search`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (response.status === 401 || response.status === 403) throw new DiscoveryUnavailable("Firecrawl rejected the API key.");
  if (response.status === 402) throw new DiscoveryUnavailable("Firecrawl account is out of credits.");
  if (response.status === 429) throw new DiscoveryUnavailable("Firecrawl rate limit reached — try again in a minute.");
  if (!response.ok) throw new Error(`Firecrawl search failed (${response.status}).`);
  const items = parseFirecrawlSearch(await response.json());

  const out: RawResult[] = [];
  for (const item of items) {
    const url = item.url ?? item.metadata?.sourceURL;
    if (!url) continue;
    let u: URL;
    try { u = new URL(url); } catch { continue; }
    const title = item.title ?? item.metadata?.title ?? u.hostname;
    const description = item.description ?? item.metadata?.description ?? "";
    let text = item.markdown ?? "";
    let note = "";
    if (LOGIN_WALLED.test(u.hostname)) { text = ""; note = "Login-walled site: only the public search snippet is kept."; }
    else if (text) {
      const robots = await robotsFor(u.origin);
      if (robots && !robotsAllows(robots, u.pathname + u.search)) { text = ""; note = "robots.txt disallows automated reading: only the search snippet is kept."; }
    }
    out.push({ url, title, description, text: text.slice(0, 20_000), query, scraped: !!text, note });
  }
  return out;
}
