import type { Currency, MemoryNote } from "./model";

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
