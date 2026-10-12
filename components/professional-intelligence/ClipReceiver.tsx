"use client";

import { useEffect, useState } from "react";
import { Scissors } from "lucide-react";
import type { SourceEvidence, SourceType } from "@/types/professional-intelligence";
import { SOURCE_TYPE_TIER, TIER_LABEL } from "@/lib/professional-intelligence/constants";
import { decodeClip, redactContacts, type ClipPayload } from "@/lib/professional-intelligence/discovery";
import { classifyUrl } from "@/lib/professional-intelligence/research";
import { button, field, label, Labeled, Modal, newId, nowIso, primary } from "./ui";
import type { TabProps } from "./useWorkspace";

/**
 * Receives clips from the "Clip to SCL" browser extension. The clip travels in the URL fragment (#clip=…), which
 * browsers never send to the server. The user chooses the professional and saves it as an unreviewed source.
 */
export default function ClipReceiver({ ws, run, notify, goTo, ready }: Pick<TabProps, "ws" | "run" | "notify" | "goTo"> & { ready: boolean }) {
  const [clip, setClip] = useState<ClipPayload | null>(null);
  useEffect(() => {
    if (!ready) return;
    const read = () => {
      const c = decodeClip(window.location.hash);
      if (window.location.hash.includes("clip=")) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
        if (!c) notify("The clip could not be read.", "error");
      }
      if (c) setClip(c);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [ready, notify]);
  if (!clip) return null;
  return <ClipModal clip={clip} onClose={() => setClip(null)} {...{ ws, run, notify, goTo }} />;
}

function ClipModal({ clip, ws, run, notify, goTo, onClose }: Pick<TabProps, "ws" | "run" | "notify" | "goTo"> & { clip: ClipPayload; onClose: () => void }) {
  const suggested = (() => { try { return classifyUrl(clip.url); } catch { return null; } })();
  const redacted = redactContacts(clip.selection);
  const [pid, setPid] = useState(ws.activeProfessionalId || ws.professionals[0]?.id || "");
  const [type, setType] = useState<SourceType>(suggested?.sourceType ?? "other");
  const [title, setTitle] = useState(clip.title || suggested?.publisher || clip.url);
  const [keepContacts, setKeepContacts] = useState(false);
  const [excerpt, setExcerpt] = useState(redacted.text.slice(0, 4000));
  const existing = ws.sources.find((s) => s.url === clip.url);

  function save() {
    if (!pid) return notify("Create a professional first (New research), then clip again.", "error");
    const at = nowIso();
    const text = keepContacts ? clip.selection.slice(0, 4000) : excerpt;
    if (existing) {
      run("Added clip to existing source", (w) => ({ ...w, sources: w.sources.map((s) => (s.id === existing.id ? { ...s, excerpt: s.excerpt ? `${s.excerpt}\n\n${text}` : text, accessedAt: clip.clippedAt, status: s.status === "verified" ? "unreviewed" : s.status === "inaccessible" ? "unreviewed" : s.status, verificationMethod: s.status === "verified" ? null : s.verificationMethod, updatedAt: at } : s)) }), { entity: "source", id: existing.id });
      notify("Clip appended to the existing source (it needs review again).");
    } else {
      const s: SourceEvidence = {
        id: newId("src"), url: clip.url, title, publisher: suggested?.publisher ?? new URL(clip.url).hostname, sourceType: type, tier: SOURCE_TYPE_TIER[type],
        publishedAt: null, accessedAt: clip.clippedAt, status: "unreviewed", excerpt: text, verificationMethod: null, reviewerId: null, reviewedAt: null,
        accessNotes: "Clipped manually by the researcher while viewing the page (Clip to SCL extension).", notes: "", attachmentText: null, createdAt: at, updatedAt: at,
      };
      run("Saved clip as source", (w) => ({ ...w, sources: [s, ...w.sources], activeProfessionalId: pid }), { entity: "source", id: s.id });
      notify("Clip saved as an unreviewed source. Link it to claims in Professional DNA (Add claim → Sources).");
    }
    goTo("Evidence Registry");
    onClose();
  }

  return <Modal title="Save clipped page" onClose={onClose} wide>
    <div className="space-y-4 text-sm">
      <p className="flex items-center gap-2 text-slate-600"><Scissors size={16} />From <a className="break-all underline" href={clip.url} target="_blank" rel="noopener noreferrer">{clip.url}</a></p>
      {!ws.professionals.length ? <p className="rounded-xl bg-amber-50 p-3 text-amber-900">No professional yet. Use <b>New research</b> first, then clip again.</p> : <>
        <div className="grid gap-3 md:grid-cols-2">
          <Labeled text="For professional"><select className={field} value={pid} onChange={(e) => setPid(e.target.value)}>{ws.professionals.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></Labeled>
          <Labeled text={`Source type → ${TIER_LABEL[SOURCE_TYPE_TIER[type]]}`}><select className={field} value={type} disabled={!!existing} onChange={(e) => setType(e.target.value as SourceType)}>{Object.keys(SOURCE_TYPE_TIER).map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Labeled>
          <Labeled text="Title" className="md:col-span-2"><input className={field} value={title} disabled={!!existing} onChange={(e) => setTitle(e.target.value)} /></Labeled>
        </div>
        {existing && <p className="rounded-xl bg-slate-50 p-3 text-xs">This URL is already a source (“{existing.title}”). The clip will be appended to its excerpt.</p>}
        <Labeled text="Clipped text (becomes the excerpt — edit to the part that supports a claim)"><textarea className={`${field} text-xs`} rows={8} value={keepContacts ? clip.selection.slice(0, 4000) : excerpt} disabled={keepContacts} onChange={(e) => setExcerpt(e.target.value)} /></Labeled>
        {redacted.removed > 0 && <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><input type="checkbox" className="mt-0.5" checked={keepContacts} onChange={(e) => setKeepContacts(e.target.checked)} />{redacted.removed} phone number(s)/email(s) were removed. Keep them only if they are public professional contacts you are allowed to store.</label>}
        {!clip.selection && <p className="text-xs text-slate-500">No text was selected — only the page link and title will be saved.</p>}
      </>}
      <div className="flex justify-end gap-2"><button className={button} onClick={onClose}>Discard</button><button className={primary} disabled={!ws.professionals.length} onClick={save}>Save as source</button></div>
    </div>
  </Modal>;
}
