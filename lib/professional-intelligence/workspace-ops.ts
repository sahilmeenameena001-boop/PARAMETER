import type { Workspace } from "@/types/professional-intelligence";

// Pure workspace operations used by the UI. Deletes keep the workspace consistent: dependants are removed or unlinked.

const sourceIdsIn = (ws: Workspace) => new Set([
  ...ws.claims.flatMap((c) => c.sourceIds), ...ws.cases.flatMap((c) => c.sourceIds),
  ...ws.publications.flatMap((p) => p.sourceIds), ...ws.content.flatMap((c) => c.sourceIds),
]);

/** Removes a professional and everything that belongs to them. Sources used only by them are removed; shared sources stay. */
export function deleteProfessional(ws: Workspace, pid: string): Workspace {
  const caseIds = new Set(ws.cases.filter((c) => c.professionalId === pid).map((c) => c.id));
  const theirs = sourceIdsIn({ ...ws, claims: ws.claims.filter((c) => c.professionalId === pid), cases: ws.cases.filter((c) => caseIds.has(c.id)), publications: ws.publications.filter((p) => p.professionalId === pid), content: ws.content.filter((c) => c.professionalId === pid) });
  const next: Workspace = {
    ...ws,
    professionals: ws.professionals.filter((p) => p.id !== pid),
    claims: ws.claims.filter((c) => c.professionalId !== pid),
    cases: ws.cases.filter((c) => c.professionalId !== pid),
    orders: ws.orders.filter((o) => !caseIds.has(o.caseId)),
    publications: ws.publications.filter((p) => p.professionalId !== pid),
    pillars: ws.pillars.filter((p) => p.professionalId !== pid),
    content: ws.content.filter((c) => c.professionalId !== pid),
    performance: ws.performance.filter((p) => p.professionalId !== pid),
    candidates: ws.candidates.filter((c) => c.professionalId !== pid),
  };
  const stillUsed = sourceIdsIn(next);
  next.sources = ws.sources.filter((s) => !theirs.has(s.id) || stillUsed.has(s.id));
  if (next.activeProfessionalId === pid) next.activeProfessionalId = next.professionals[0]?.id ?? "";
  return next;
}

export function deleteClaim(ws: Workspace, id: string): Workspace {
  return { ...ws, claims: ws.claims.filter((c) => c.id !== id), content: ws.content.map((c) => (c.claimIds.includes(id) ? { ...c, claimIds: c.claimIds.filter((x) => x !== id) } : c)) };
}

export function deleteCase(ws: Workspace, id: string): Workspace {
  return {
    ...ws,
    cases: ws.cases.filter((c) => c.id !== id).map((c) => (c.parentCaseId === id ? { ...c, parentCaseId: null } : c)),
    orders: ws.orders.filter((o) => o.caseId !== id),
    content: ws.content.map((c) => (c.caseIds.includes(id) ? { ...c, caseIds: c.caseIds.filter((x) => x !== id) } : c)),
  };
}

export function deletePublication(ws: Workspace, id: string): Workspace {
  return { ...ws, publications: ws.publications.filter((p) => p.id !== id), content: ws.content.map((c) => (c.publicationIds.includes(id) ? { ...c, publicationIds: c.publicationIds.filter((x) => x !== id) } : c)) };
}

export function deleteContent(ws: Workspace, id: string): Workspace {
  return { ...ws, content: ws.content.filter((c) => c.id !== id), performance: ws.performance.map((p) => (p.contentId === id ? { ...p, contentId: null } : p)) };
}

export function deletePillar(ws: Workspace, id: string): Workspace {
  return { ...ws, pillars: ws.pillars.filter((p) => p.id !== id), content: ws.content.map((c) => (c.pillarId === id ? { ...c, pillarId: "" } : c)) };
}

export function isSourceUsed(ws: Workspace, id: string) {
  return sourceIdsIn(ws).has(id);
}
