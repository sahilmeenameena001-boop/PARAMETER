"use client";

import { useCallback, useEffect, useState } from "react";
import type { Member, Workspace } from "@/types/professional-intelligence";
import { WorkflowError } from "@/lib/professional-intelligence/evidence";
import { blankWorkspace } from "@/lib/professional-intelligence/seed";

export const TABS = ["Overview", "Summary", "Professional DNA", "Evidence Registry", "Litigation Intelligence", "Publications", "Content Strategy", "Editorial Calendar", "Performance"] as const;
export type Tab = typeof TABS[number];

const STORAGE_KEY = "scl-professional-intelligence-v1";

export interface Notice { kind: "ok" | "error"; text: string }

export interface TabProps {
  ws: Workspace;
  pid: string;
  actor: Member;
  /** Applies a change; workflow errors are shown to the user instead of being applied. Returns true on success. */
  run: (action: string, fn: (ws: Workspace) => Workspace, entity?: { entity: string; id: string }) => boolean;
  notify: (text: string, kind?: Notice["kind"]) => void;
  goTo: (tab: Tab, focusId?: string) => void;
  focusId: string | null;
}

function isWorkspace(value: unknown): value is Workspace {
  const v = value as Workspace;
  return !!v && v.schemaVersion === 1 && ["members", "professionals", "sources", "claims", "cases", "orders", "publications", "pillars", "content", "performance", "auditLog"].every((k) => Array.isArray((v as unknown as Record<string, unknown>)[k]));
}

export function parseWorkspace(text: string): Workspace {
  const parsed = JSON.parse(text);
  // Older exports predate automatic discovery.
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed.candidates)) parsed.candidates = [];
  if (!isWorkspace(parsed)) throw new Error("This file is not a Professional Intelligence workspace export.");
  return parsed;
}

export function useWorkspace() {
  const [ws, setWs] = useState<Workspace>(blankWorkspace);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setWs(parseWorkspace(saved));
    } catch { setNotice({ kind: "error", text: "Saved workspace could not be loaded. Starting with an empty workspace." }); }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ws)); }
    catch { setNotice({ kind: "error", text: "Browser storage is unavailable or full. Changes last for this session only — export a backup." }); }
  }, [ws, ready]);

  const notify = useCallback((text: string, kind: Notice["kind"] = "ok") => setNotice({ kind, text }), []);

  const run = useCallback<TabProps["run"]>((action, fn, entity) => {
    try {
      setWs((current) => {
        const next = fn(current);
        if (next === current) return current;
        const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), actorId: current.currentUserId, action, entity: entity?.entity ?? "workspace", entityId: entity?.id ?? "", detail: "" };
        return { ...next, auditLog: [entry, ...next.auditLog].slice(0, 500) };
      });
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof WorkflowError || error instanceof Error ? error.message : "Action failed." });
      return false;
    }
  }, []);

  return { ws, setWs, ready, notice, setNotice, notify, run };
}

/**
 * Runs fn synchronously against the latest state so workflow errors surface before React schedules the update.
 * Tabs call this: validate(ws) first, then run(...) with a pure updater.
 */
export function attempt<T>(notify: TabProps["notify"], fn: () => T): T | null {
  try { return fn(); }
  catch (error) { notify(error instanceof Error ? error.message : "Action failed.", "error"); return null; }
}
