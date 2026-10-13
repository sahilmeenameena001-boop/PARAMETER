import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Local setup helper: the researcher pastes their own Firecrawl key into the app instead of editing .env.local by hand.
// Works only on a localhost server and for same-origin requests. The key is never returned to the browser.
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
const Body = z.object({ firecrawlApiKey: z.string().trim().max(200) });

function assertLocal(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!LOCAL_HOSTS.includes(host.replace(/:\d+$/, ""))) throw new Error("FORBIDDEN");
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== host) throw new Error("FORBIDDEN");
}

const envPath = () => path.join(process.cwd(), ".env.local");

async function setEnvValue(key: string, value: string) {
  let text = "";
  try { text = await readFile(envPath(), "utf8"); } catch { /* new file */ }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, "")}${text ? "\n" : ""}${line}\n`;
  await writeFile(envPath(), text, { encoding: "utf8", mode: 0o600 });
}

const status = () => {
  const key = process.env.FIRECRAWL_API_KEY ?? "";
  return { firecrawl: { configured: !!key, hint: key ? `…${key.slice(-4)}` : null } };
};

export async function GET(request: NextRequest) {
  try { assertLocal(request); } catch { return NextResponse.json({ error: "Settings are only available on a local server." }, { status: 403 }); }
  return NextResponse.json(status());
}

export async function POST(request: NextRequest) {
  try {
    assertLocal(request);
    const { firecrawlApiKey } = Body.parse(await request.json());
    if (firecrawlApiKey && !/^fc-[A-Za-z0-9_-]{8,}$/.test(firecrawlApiKey)) {
      return NextResponse.json({ error: "That does not look like a Firecrawl key (it should start with fc-)." }, { status: 400 });
    }
    await setEnvValue("FIRECRAWL_API_KEY", firecrawlApiKey);
    // Takes effect immediately for this server process; .env.local keeps it for the next start.
    if (firecrawlApiKey) process.env.FIRECRAWL_API_KEY = firecrawlApiKey;
    else delete process.env.FIRECRAWL_API_KEY;
    return NextResponse.json(status());
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Settings are only available on a local server." }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid key." }, { status: 400 });
    return NextResponse.json({ error: "Could not save the key to .env.local." }, { status: 500 });
  }
}
