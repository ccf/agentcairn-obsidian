import type { Currency, MemoryNote } from "./model";

export interface GraphEdge { source: string; target: string; }
export type GroupBy = "none" | "project" | "harness" | "tag";
export interface HubNode { id: string; facet: GroupBy; value: string; count: number; }
export interface Graph { nodes: MemoryNote[]; edges: GraphEdge[]; isolated: Set<string>; hubs: HubNode[]; }

function facetValues(n: MemoryNote, facet: GroupBy): string[] {
  if (facet === "project") return n.project ? [n.project] : [];
  if (facet === "harness") return n.harness ? [n.harness] : [];
  if (facet === "tag") return n.tags;
  return [];
}

export function buildGraph(notes: MemoryNote[], groupBy: GroupBy = "none"): Graph {
  const inSet = new Set(notes.map((n) => n.path));
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();
  const addEdge = (a: string, b: string) => {
    const key = [a, b].sort().join(" ");
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source: a, target: b });
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  };
  for (const n of notes) {
    for (const t of n.links) {
      if (t === n.path || !inSet.has(t)) continue; // drop self-edges + non-memory targets
      addEdge(n.path, t);
    }
  }
  const hubCount = new Map<string, { value: string; count: number }>();
  if (groupBy !== "none") {
    for (const n of notes) {
      for (const value of new Set(facetValues(n, groupBy))) {
        const id = `hub:${groupBy}:${value}`;
        addEdge(n.path, id);
        const h = hubCount.get(id) ?? { value, count: 0 };
        h.count += 1;
        hubCount.set(id, h);
      }
    }
  }
  const hubs: HubNode[] = [...hubCount.entries()].map(([id, h]) => ({ id, facet: groupBy, value: h.value, count: h.count }));
  const isolated = new Set(notes.map((n) => n.path).filter((p) => !degree.get(p)));
  return { nodes: notes, edges, isolated, hubs };
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
