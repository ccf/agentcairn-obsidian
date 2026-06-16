import { describe, it, expect } from "vitest";
import { filterNotes, sortNotes, buildGraph } from "../src/query";
import type { MemoryNote } from "../src/model";

const mk = (p: Partial<MemoryNote>): MemoryNote => ({
  path: p.path ?? "x.md", title: p.title ?? "T", tags: p.tags ?? [],
  currency: p.currency ?? "current", links: p.links ?? [], ...p,
});

describe("filterNotes", () => {
  const notes = [
    mk({ path: "a.md", title: "Rotate jwt key", project: "agentcairn", harness: "codex", tags: ["auth"] }),
    mk({ path: "b.md", title: "DuckDB gotcha", project: "other", harness: "claude-code", currency: "superseded" }),
  ];
  it("keyword matches title/tags/path (case-insensitive)", () => {
    expect(filterNotes(notes, { query: "jwt" }).map(n => n.path)).toEqual(["a.md"]);
    expect(filterNotes(notes, { query: "AUTH" }).map(n => n.path)).toEqual(["a.md"]);
  });
  it("filters by project/harness/currency/tag", () => {
    expect(filterNotes(notes, { project: "other" }).map(n => n.path)).toEqual(["b.md"]);
    expect(filterNotes(notes, { currency: "superseded" }).map(n => n.path)).toEqual(["b.md"]);
    expect(filterNotes(notes, { harness: "codex" }).map(n => n.path)).toEqual(["a.md"]);
    expect(filterNotes(notes, { tag: "auth" }).map(n => n.path)).toEqual(["a.md"]);
  });
});

describe("sortNotes", () => {
  const notes = [
    mk({ path: "a.md", created: "2026-06-10T00:00:00Z", importance: 0.2 }),
    mk({ path: "b.md", created: "2026-06-14T00:00:00Z", importance: 0.9 }),
    mk({ path: "c.md" }),
  ];
  it("newest puts later created first, undefined last", () => {
    expect(sortNotes(notes, "newest").map(n => n.path)).toEqual(["b.md", "a.md", "c.md"]);
  });
  it("importance desc, undefined last", () => {
    expect(sortNotes(notes, "importance").map(n => n.path)).toEqual(["b.md", "a.md", "c.md"]);
  });
});

describe("buildGraph", () => {
  it("keeps only edges between in-set memory notes; drops unresolved", () => {
    const notes = [mk({ path: "a.md", links: ["b.md", "ghost.md"] }), mk({ path: "b.md", links: [] })];
    const g = buildGraph(notes);
    expect(g.nodes.map(n => n.path).sort()).toEqual(["a.md", "b.md"]);
    expect(g.edges).toEqual([{ source: "a.md", target: "b.md" }]);
  });
});
