"use client";
import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";

export default function PromptStudio({ clientId, requestHeaders }: { clientId: string; requestHeaders: Record<string,string> }) {
  const [headline, setHeadline] = useState("");
  const [standfirst, setStandfirst] = useState("");
  const [footer, setFooter] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/brand-transformation/clients/${clientId}/generate-prompt`, {
        method: "POST", headers: requestHeaders,
        body: JSON.stringify({ content: { headline, standfirst, footer } }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Prompt generation failed");
      setPrompt(json.prompt);
    } catch (e) { setError(e instanceof Error ? e.message : "Prompt generation failed"); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border bg-white p-5 shadow-sm">
    <div className="mb-4"><h2 className="font-semibold">Brand-aware Prompt Studio</h2><p className="text-sm text-slate-500">Generates Prompt 1 using only approved client rules.</p></div>
    <div className="grid gap-3 md:grid-cols-3">
      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Headline" value={headline} onChange={(e)=>setHeadline(e.target.value)} />
      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Standfirst" value={standfirst} onChange={(e)=>setStandfirst(e.target.value)} />
      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Footer / CTA" value={footer} onChange={(e)=>setFooter(e.target.value)} />
    </div>
    <button disabled={!headline.trim()||busy} onClick={generate} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50"><Sparkles className="h-4 w-4" />{busy?"Generating…":"Generate Prompt 1"}</button>
    {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    {prompt && <div className="mt-4 rounded-xl bg-slate-950 p-4 text-slate-100"><div className="mb-2 flex justify-end"><button onClick={()=>navigator.clipboard.writeText(prompt)} className="inline-flex items-center gap-1 text-xs"><Copy className="h-3 w-3" /> Copy</button></div><pre className="whitespace-pre-wrap text-xs leading-5">{prompt}</pre></div>}
  </section>;
}

