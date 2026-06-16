import { describe, it, expect } from "vitest";
import { parseMemoryNote, computeCurrency } from "../src/model";

const NOW = new Date("2026-06-15T00:00:00Z");

describe("parseMemoryNote", () => {
  it("returns null for non-memory notes", () => {
    expect(parseMemoryNote({ type: "note" }, "a.md", "A", [], NOW)).toBeNull();
    expect(parseMemoryNote({}, "a.md", "A", [], NOW)).toBeNull();
  });
  it("extracts fields and parses session from source", () => {
    const fm = { type: "memory", title: "Rotate key", project: "agentcairn", harness: "codex",
      source: "memory://session/sess-9", importance: 0.81, created: "2026-06-14T00:00:00Z", tags: ["ingested"] };
    const n = parseMemoryNote(fm, "memories/x.md", "Rotate key", ["memories/y.md"], NOW);
    expect(n).not.toBeNull();
    expect(n!.project).toBe("agentcairn");
    expect(n!.harness).toBe("codex");
    expect(n!.session).toBe("sess-9");
    expect(n!.importance).toBe(0.81);
    expect(n!.links).toEqual(["memories/y.md"]);
    expect(n!.currency).toBe("current");
  });
  it("omits odd-typed fields without throwing", () => {
    const n = parseMemoryNote({ type: "memory", importance: "high", created: 123, project: 7 }, "a.md", "A", [], NOW);
    expect(n!.importance).toBeUndefined();
    expect(n!.created).toBeUndefined();
    expect(n!.project).toBeUndefined();
  });
});

describe("computeCurrency", () => {
  it("superseded wins over everything", () => {
    expect(computeCurrency({ supersededBy: "z", validUntil: "2099-01-01T00:00:00Z" }, NOW)).toBe("superseded");
  });
  it("expired when now >= valid_until (end-exclusive)", () => {
    expect(computeCurrency({ validUntil: "2026-06-15T00:00:00Z" }, NOW)).toBe("expired");
    expect(computeCurrency({ validUntil: "2026-06-16T00:00:00Z" }, NOW)).toBe("current");
  });
  it("not_yet_valid when valid_from > now", () => {
    expect(computeCurrency({ validFrom: "2026-06-16T00:00:00Z" }, NOW)).toBe("not_yet_valid");
  });
  it("current otherwise", () => {
    expect(computeCurrency({}, NOW)).toBe("current");
  });
});
