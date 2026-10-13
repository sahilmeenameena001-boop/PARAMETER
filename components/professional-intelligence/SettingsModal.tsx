"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound } from "lucide-react";
import { button, field, Labeled, Modal, primary } from "./ui";
import type { TabProps } from "./useWorkspace";

/** Integrations settings. The key goes from this form straight to the local server (.env.local); it is never shown again. */
export default function SettingsModal({ onClose, notify }: { onClose: () => void; notify: TabProps["notify"] }) {
  const [status, setStatus] = useState<{ configured: boolean; hint: string | null } | null>(null);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/professional-intelligence/settings").then(async (r) => {
      const j = await r.json();
      if (!r.ok) setError(j.error || "Settings unavailable."); else setStatus(j.firecrawl);
    }).catch(() => setError("Could not reach the local server."));
  }, []);

  async function save(value: string) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/professional-intelligence/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firecrawlApiKey: value }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Could not save."); return; }
      setStatus(j.firecrawl); setKey("");
      window.dispatchEvent(new Event("pi-settings-changed"));
      notify(value ? "Firecrawl key saved. Auto-discover is ready — no restart needed." : "Firecrawl key removed.");
    } catch { setError("Could not reach the local server."); }
    finally { setBusy(false); }
  }

  return <Modal title="Settings · Integrations" onClose={onClose}>
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="flex items-center gap-2 font-semibold"><KeyRound size={16} />Firecrawl (Auto-discover)</p>
        {status && <p className={`mt-2 flex items-center gap-2 text-xs ${status.configured ? "text-emerald-700" : "text-amber-700"}`}>{status.configured ? <><CheckCircle2 size={14} />Connected (key ending {status.hint})</> : "Not connected"}</p>}
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-600">
          <li>Open your Firecrawl API keys page and copy your key (starts with <code>fc-</code>).</li>
          <li>Paste it below and click Save. It is stored only in <code>.env.local</code> on this computer.</li>
        </ol>
        <a href="https://www.firecrawl.dev/app/api-keys" target="_blank" rel="noopener noreferrer" className={`${button} mt-3 !py-1.5 text-xs`}><ExternalLink size={13} />Open Firecrawl API keys</a>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (key.trim()) save(key.trim()); }}>
          <Labeled text="API key" className="flex-1"><input type="password" autoComplete="off" spellCheck={false} className={field} value={key} onChange={(e) => setKey(e.target.value)} placeholder="fc-…" aria-label="Firecrawl API key" /></Labeled>
          <button className={`${primary} self-end`} disabled={busy || !key.trim()}>{busy ? "Saving…" : "Save"}</button>
        </form>
        {status?.configured && <button className="mt-2 text-xs text-red-700 underline" disabled={busy} onClick={() => save("")}>Remove key</button>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">{error}</p>}
      <p className="text-xs text-slate-500">Settings work only when the app runs on this computer (localhost). The key is never sent to the browser or included in exports.</p>
      <div className="flex justify-end"><button className={button} onClick={onClose}>Close</button></div>
    </div>
  </Modal>;
}
