// Server-only helper: fetches public page metadata for the "Fetch details" button.
// Respects robots.txt, refuses login walls, blocks private/loopback addresses, and caps size and time.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const UA = "SCL-ProfessionalIntelligence/1.0 (+manual research assistant; respects robots.txt)";
const MAX_BYTES = 2_000_000;
const LOGIN_WALLED = ["linkedin.com", "facebook.com", "instagram.com"];

export class FetchRefused extends Error {}

function isPrivateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v === "::" || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublicHost(url: URL) {
  if (!/^https?:$/.test(url.protocol)) throw new FetchRefused("Only http(s) URLs can be fetched.");
  if (url.username || url.password) throw new FetchRefused("URLs with credentials are not fetched.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new FetchRefused("Local addresses are not fetched.");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new FetchRefused("Private network addresses are not fetched.");
}

/** Minimal robots.txt check for the "*" group and our user agent. Unreachable robots.txt = allowed (standard behaviour). */
export function robotsAllows(robotsTxt: string, path: string) {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  const rules: { allow: boolean; path: string }[] = [];
  let applies = false, inGroup = false;
  for (const line of lines) {
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase(), value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!inGroup) applies = false;
      inGroup = true;
      if (value === "*" || UA.toLowerCase().startsWith(value.toLowerCase())) applies = true;
    } else {
      inGroup = false;
      if (applies && (key === "allow" || key === "disallow") && value) rules.push({ allow: key === "allow", path: value });
    }
  }
  const matches = (rule: string) => {
    const re = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    return re.test(path);
  };
  const best = rules.filter((r) => matches(r.path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0];
  return !best || best.allow;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const meta = (html: string, name: string) => {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "").trim() : "";
};

export function extractPage(html: string) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const text = decode(html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return {
    title: meta(html, "og:title") || title,
    siteName: meta(html, "og:site_name"),
    description: meta(html, "description") || meta(html, "og:description"),
    publishedAt: meta(html, "article:published_time").slice(0, 10) || null,
    text: text.slice(0, 6000),
  };
}

export async function fetchSourceMetadata(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.replace(/^www\./, "");
  if (LOGIN_WALLED.some((d) => host === d || host.endsWith(`.${d}`))) throw new FetchRefused("This site requires a login. It is not fetched automatically — open it yourself and paste the relevant excerpt.");
  await assertPublicHost(url);

  try {
    const robots = await fetch(`${url.origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (robots.ok && !robotsAllows(await robots.text(), url.pathname + url.search)) throw new FetchRefused("robots.txt disallows automated access to this page. Open it yourself and enter the excerpt manually.");
  } catch (e) { if (e instanceof FetchRefused) throw e; }

  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(15000), redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    throw new FetchRefused(`The page redirects${location ? ` to ${new URL(location, url).toString()}` : ""}. Add the final URL instead.`);
  }
  if (response.status === 401 || response.status === 403) throw new FetchRefused(`Access denied (${response.status}). Mark the source inaccessible and add evidence manually.`);
  if (!response.ok) throw new FetchRefused(`The site returned ${response.status}.`);
  const type = response.headers.get("content-type") ?? "";
  if (/pdf/i.test(type)) return { kind: "pdf" as const, title: decodeURIComponent(url.pathname.split("/").pop() ?? "PDF"), siteName: host, description: "", publishedAt: null, text: "", fetchedAt: new Date().toISOString(), note: "PDF detected. Text extraction is not automated — open it and paste the relevant excerpt." };
  if (!/html|xml|text\/plain/i.test(type)) throw new FetchRefused(`Unsupported content type: ${type || "unknown"}.`);
  const reader = response.body?.getReader();
  let received = 0; const chunks: Uint8Array[] = [];
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > MAX_BYTES) { await reader.cancel(); break; }
    chunks.push(value);
  }
  const html = new TextDecoder().decode(Buffer.concat(chunks));
  const page = extractPage(html);
  const passwordField = /<input[^>]+type=["']password["']/i.test(html);
  return { kind: "html" as const, ...page, siteName: page.siteName || host, fetchedAt: new Date().toISOString(), note: passwordField ? "Page contains a login form — content may be incomplete." : received > MAX_BYTES ? "Page truncated at 2 MB." : "" };
}
