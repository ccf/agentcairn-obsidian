import type { Currency, MemoryNote } from "./model";

export interface GraphEdge { source: string; target: string; }
export interface Graph { nodes: MemoryNote[]; edges: GraphEdge[]; isolated: Set<string>; }

export function buildGraph(notes: MemoryNote[]): Graph {
  const inSet = new Set(notes.map((n) => n.path));
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();
  for (const n of notes) {
    for (const t of n.links) {
      if (t === n.path || !inSet.has(t)) continue; // drop self-edges + non-memory targets
      const key = [n.path, t].sort().join(" ");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: n.path, target: t });
      degree.set(n.path, (degree.get(n.path) ?? 0) + 1);
      degree.set(t, (degree.get(t) ?? 0) + 1);
    }
  }
  const isolated = new Set(notes.map((n) => n.path).filter((p) => !degree.get(p)));
  return { nodes: notes, edges, isolated };
}

export interface FilterCriteria { query?: string; project?: string; harness?: string; currency?: Currency; tag?: string; }

export function filterNotes(notes: MemoryNote[], c: FilterCriteria): MemoryNote[] {
  const q = c.query?.trim().toLowerCase();
  return notes.filter((n) => {
    if (c.project && n.project !== c.project) return false;
    if (c.harness && n.harness !== c.harness) return false;
    if (c.currency && n.currency !== c.currency) return false;
    if (c.tag && !n.tags.includes(c.tag)) return false;
    if (q) { const hay = `${n.title} ${n.tags.join(" ")} ${n.path}`.toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  });
}

export type SortKey = "newest" | "importance";

export function sortNotes(notes: MemoryNote[], key: SortKey): MemoryNote[] {
  const copy = [...notes];
  if (key === "newest") {
    copy.sort((a, b) => (b.created ? Date.parse(b.created) : -Infinity) - (a.created ? Date.parse(a.created) : -Infinity));
  } else {
    copy.sort((a, b) => (b.importance ?? -Infinity) - (a.importance ?? -Infinity));
  }
  return copy;
}
