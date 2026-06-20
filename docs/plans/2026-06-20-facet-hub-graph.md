# Facet-Hub Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cluster the Obsidian Memory graph around deterministic facet hubs (project/harness/tag) via a "group by" selector — no LLM, no vault writes.

**Architecture:** Pure `buildGraph(notes, groupBy)` (query.ts) synthesizes hub nodes + note→hub edges and is unit-tested; `renderGraph` (graph.ts) draws hub nodes distinctly and reports hub clicks; `MemoryView` (view.ts) adds the selector and turns a hub click into a facet filter.

**Tech Stack:** TypeScript, d3-force, vitest. Plugin-only — no agentcairn-core/vault changes.

## Global Constraints

- Plugin-render only: **no vault writes, no LLM, no Python-core changes.**
- `groupBy="none"` must reproduce today's graph byte-for-byte (regression-guarded).
- Pure logic (`query.ts`) is unit-tested with vitest; DOM (`graph.ts`/`view.ts`) is gated by `npm run build` + manual QA (Obsidian DOM is unavailable under vitest — repo convention).
- Hub node id format: `hub:<facet>:<value>`. `related:` note→note edges are retained alongside hub edges.
- Every commit leaves `npm run lint && npm test && npm run build` green (husky pre-commit runs all three).

---

## Task 1: `buildGraph(notes, groupBy)` + types (query.ts)

**Files:**
- Modify: `src/query.ts`
- Test: `tests/query.test.ts`

**Interfaces:**
- Produces: `export type GroupBy = "none" | "project" | "harness" | "tag";` · `export interface HubNode { id: string; facet: GroupBy; value: string; count: number; }` · `Graph` gains `hubs: HubNode[]` · `buildGraph(notes: MemoryNote[], groupBy?: GroupBy): Graph`.

- [ ] **Step 1: Write the failing tests** — append to `tests/query.test.ts` (it already imports from `../src/query` and constructs `MemoryNote`s; mirror the existing note-fixture style in that file):

```ts
import { buildGraph } from "../src/query";
import type { MemoryNote } from "../src/model";

function note(path: string, extra: Partial<MemoryNote> = {}): MemoryNote {
  return {
    path, title: path, tags: [], links: [], currency: "current",
    project: undefined, harness: undefined, session: undefined,
    importance: undefined, created: undefined, ...extra,
  } as MemoryNote;
}

test("groupBy none → no hubs, unchanged shape", () => {
  const g = buildGraph([note("a.md", { links: ["b.md"] }), note("b.md")], "none");
  expect(g.hubs).toEqual([]);
  expect(g.edges).toEqual([{ source: "a.md", target: "b.md" }]);
});

test("groupBy project → one hub per value, with counts + note→hub edges", () => {
  const g = buildGraph(
    [note("a.md", { project: "P" }), note("b.md", { project: "P" }), note("c.md", { project: "Q" })],
    "project",
  );
  const byId = Object.fromEntries(g.hubs.map((h) => [h.id, h]));
  expect(byId["hub:project:P"].count).toBe(2);
  expect(byId["hub:project:Q"].count).toBe(1);
  expect(g.edges).toContainEqual({ source: "a.md", target: "hub:project:P" });
  expect(g.edges).toContainEqual({ source: "c.md", target: "hub:project:Q" });
});

test("groupBy tag → a note attaches to each of its tag hubs", () => {
  const g = buildGraph([note("a.md", { tags: ["x", "y"] })], "tag");
  expect(g.hubs.map((h) => h.id).sort()).toEqual(["hub:tag:x", "hub:tag:y"]);
  expect(g.edges).toContainEqual({ source: "a.md", target: "hub:tag:x" });
  expect(g.edges).toContainEqual({ source: "a.md", target: "hub:tag:y" });
});

test("note missing the facet gets no hub edge and is isolated when otherwise unlinked", () => {
  const g = buildGraph([note("a.md", {})], "project"); // no project, no links
  expect(g.hubs).toEqual([]);
  expect(g.isolated.has("a.md")).toBe(true);
});
```

Run: `npx vitest run tests/query.test.ts` → FAIL (buildGraph takes one arg / no `hubs`).

- [ ] **Step 2: Implement** — in `src/query.ts`, replace the `GraphEdge`/`Graph`/`buildGraph` block (lines 3–24) with:

```ts
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
      for (const value of facetValues(n, groupBy)) {
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
```

- [ ] **Step 3: Run** `npx vitest run tests/query.test.ts` → PASS, then `npm test` (whole suite green, incl. any existing buildGraph test which still passes since `groupBy` defaults to `"none"`).

- [ ] **Step 4: Commit**

```bash
git add src/query.ts tests/query.test.ts
git commit -m "feat(graph): buildGraph facet hubs (project/harness/tag) — pure layer"
```

---

## Task 2: render hubs + hub clicks (graph.ts)

**Files:** Modify `src/graph.ts`. (DOM — no unit test; gated by `npm run build` + manual QA.)

**Interfaces:**
- Consumes: `buildGraph`, `GroupBy`, `HubNode`, `GraphEdge` from query.ts.
- Produces: `renderGraph(host, notes, opts): Simulation` where `opts = { groupBy: GroupBy; onNodeClick: (path: string) => void; onHubClick: (facet: GroupBy, value: string) => void; onBackgroundClick?: () => void }`.

- [ ] **Step 1: Rewrite `renderGraph`** to support two node kinds. Replace the current `renderGraph` body so it: changes the signature to the `opts` object above; calls `buildGraph(used, opts.groupBy)`; builds a unified node list (notes + `graph.hubs`) keyed by id (`note.path` / `hub.id`); renders note circles as today (radius `nodeRadius(importance)`, fill `projectColor(project)`, currency/isolated opacity, `onNodeClick`), and renders hub nodes distinctly:

```ts
// hub node: larger radius scaled by count, labeled, clickable
const hubR = (count: number) => Math.min(22, 10 + Math.sqrt(count) * 2);
// fill: project hubs reuse projectColor(value); others a neutral hub color
const hubFill = (h: HubNode) => (h.facet === "project" ? projectColor(h.value) : "var(--text-accent)");
```

For each hub: an SVG `circle` (`r = hubR(h.count)`, `fill = hubFill(h)`, class `ac-hub`) with a click handler `opts.onHubClick(h.facet, h.value)`, plus an SVG `text` label set to `h.value` placed next to the node (updated each tick alongside the circle's `cx`/`cy`). Hub edges (target id starts with `hub:`) get a lighter stroke (class `ac-hub-edge`) so they read as a secondary layer under the `related:` edges.

The d3 `Link` source/target must resolve via the unified id→node map (so `hub:*` targets resolve). Keep the existing forces; the link force naturally clusters notes around their hub. Keep `renderLegend`. Return the `Simulation` as today. Use `activeDocument.createElementNS`/`createElement` (per the existing popout-safe convention).

- [ ] **Step 2: Add hub styles** to `styles.css`:

```css
.ac-graph .ac-hub { cursor: pointer; stroke: var(--background-primary); stroke-width: 1.5px; }
.ac-graph .ac-hub-label { font-size: 10px; fill: var(--text-muted); pointer-events: none; }
.ac-graph line.ac-hub-edge { stroke: var(--background-modifier-border); opacity: 0.5; }
```

- [ ] **Step 3: Typecheck/build** `npm run build` → exits 0 (the `opts` signature change will surface every caller; view.ts is updated in Task 3 — if building Task 2 alone fails only on the view.ts call site, that's expected and fixed in Task 3; confirm graph.ts itself has no type errors via `npx tsc -noEmit -skipLibCheck` and note the single expected view.ts error).

- [ ] **Step 4: Commit**

```bash
git add src/graph.ts styles.css
git commit -m "feat(graph): render facet hub nodes + hub-click callback"
```

---

## Task 3: group-by selector + hub→filter (view.ts)

**Files:** Modify `src/view.ts`. (DOM — manual QA.)

**Interfaces:** Consumes `GroupBy` (query.ts) and the new `renderGraph(host, notes, opts)` (Task 2).

- [ ] **Step 1: Add state + selector.** In `MemoryView`, add `groupBy: GroupBy = "none";` (import `GroupBy` from `./query`). In `renderFilterBar`, after the sort `<select>`, add a "group by" select:

```ts
const groupSel = bar.createEl("select");
for (const g of ["none", "project", "harness", "tag"]) groupSel.createEl("option", { value: g, text: g === "none" ? "group: none" : `group: ${g}` });
groupSel.value = this.groupBy;
groupSel.onchange = () => { this.groupBy = groupSel.value as GroupBy; this.render(); };
```

- [ ] **Step 2: Pass to renderGraph + handle hub clicks.** In `render()`, change the graph branch to the new `opts` signature:

```ts
else this.sim = renderGraph(body, shown, {
  groupBy: this.groupBy,
  onNodeClick: (path) => { this.selectedPath = path; this.plugin.openNote(path); this.refreshProvenance(); },
  onHubClick: (facet, value) => { (this.criteria as Record<string, unknown>)[facet] = value; this.render(); },
  onBackgroundClick: () => { this.selectedPath = null; this.refreshProvenance(); },
});
```

(`facet` is `"project"|"harness"|"tag"` here — all valid `FilterCriteria` keys — so the hub click drills the view down to that facet value.)

- [ ] **Step 3: Build + run** `npm run build` (exits 0 now that the caller matches) and `npm test` (green). Manual-QA note for the reviewer/QA: open the Memory view → Graph, switch `group by` across none/project/harness/tag, confirm labeled hubs appear with notes clustered, `related:` edges still show, and clicking a hub filters the list/graph to that value.

- [ ] **Step 4: Commit**

```bash
git add src/view.ts
git commit -m "feat(view): group-by facet selector + hub-click drilldown"
```

---

## Task 4: docs + version

**Files:** Modify `README.md`, `CHANGELOG.md`, `manifest.json`, `package.json`, `versions.json`.

- [ ] **Step 1: Docs.** In `README.md`, under the Memory Graph feature, add a line: the graph can **group by** project/harness/tag — facet hub nodes cluster related memories; click a hub to filter. Add a `CHANGELOG.md` entry (if the file exists; else skip) describing the facet-hub "group by" graph.

- [ ] **Step 2: Version bump** to **0.4.0** (minor — new feature) across `manifest.json`, `package.json`, and add `"0.4.0": "<current minAppVersion>"` to `versions.json` (mirror the existing entries' minAppVersion value).

- [ ] **Step 3: Verify + commit** `npm run lint && npm test && npm run build` green, then:

```bash
git add README.md CHANGELOG.md manifest.json package.json versions.json
git commit -m "docs: facet-hub graph + bump 0.4.0"
```

(Tagging `0.4.0` → the GitHub release / community-store update is a post-merge step the maintainer decides on — not part of this plan.)

---

## Self-Review

**Spec coverage:** GroupBy/HubNode/`buildGraph(groupBy)` + tests → Task 1; hub rendering + `onHubClick` + lighter hub edges → Task 2; group-by selector + hub→filter drilldown → Task 3; docs/version → Task 4. `groupBy="none"` regression guard is Task 1's first test. Deferred items (LLM/NER, vault-written links, multi-facet) correctly absent.

**Placeholder scan:** Task 1 is complete code + tests. Tasks 2–3 are DOM (manual-QA per repo convention) but give concrete code (signature, hub render rules, styles, view wiring) — no vague "handle rendering." Task 2's note about a single expected view.ts build error until Task 3 is an ordering fact, not a placeholder.

**Type consistency:** `GroupBy`/`HubNode`/`Graph.hubs`/`buildGraph(notes, groupBy)` are defined in Task 1 and consumed verbatim in Tasks 2–3. `renderGraph(host, notes, opts)` with `onNodeClick`/`onHubClick`/`onBackgroundClick` is defined in Task 2 and called identically in Task 3. Hub id format `hub:<facet>:<value>` is consistent across query (creation) and graph (the `hub:`-prefix edge check).
