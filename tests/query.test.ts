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

const note = (path: string, links: string[] = []): MemoryNote => ({
  path, title: path, tags: [], currency: "current", links,
});

describe("buildGraph", () => {
  it("builds undirected, deduped edges only among memory notes", () => {
    const notes = [note("a.md", ["b.md", "x.md"]), note("b.md", ["a.md"]), note("c.md")];
    const g = buildGraph(notes);
    expect(g.edges).toHaveLength(1);
    const e = g.edges[0];
    expect(new Set([e.source, e.target])).toEqual(new Set(["a.md", "b.md"]));
    expect(g.nodes).toHaveLength(3);
  });

  it("flags degree-0 notes as isolated", () => {
    const notes = [note("a.md", ["b.md"]), note("b.md", ["a.md"]), note("c.md")];
    const g = buildGraph(notes);
    expect(g.isolated.has("c.md")).toBe(true);
    expect(g.isolated.has("a.md")).toBe(false);
    expect(g.isolated.has("b.md")).toBe(false);
  });

  it("drops self-edges", () => {
    const g = buildGraph([note("a.md", ["a.md"])]);
    expect(g.edges).toHaveLength(0);
    expect(g.isolated.has("a.md")).toBe(true);
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
