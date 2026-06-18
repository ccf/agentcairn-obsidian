# Memory Graph Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the cut d3-force Memory Graph — now fed by real `related:` edges — and enrich it into a navigable journey (project color, importance-scaled nodes, currency de-emphasis, isolated-node handling, legend, click-to-open, node→provenance).

**Architecture:** Pure data/viz layers (`query.ts` `buildGraph`, new `viz.ts` helpers) are unit-tested with vitest; the DOM/d3 render (`graph.ts`) and the view wiring (`view.ts`) are gated by the TypeScript build (`npm run build`) and manual QA (Obsidian DOM isn't unit-testable here). Most code is recoverable from the pre-cut commit `07d9226`.

**Tech Stack:** TypeScript, Obsidian plugin API, d3-force, esbuild, vitest. Spec: `docs/specs/2026-06-18-graph-enrichment-design.md`. Recover cut code with `git show 07d9226:src/graph.ts` and `git show 07d9226:src/query.ts`.

**Commands:** `npm test` (vitest), `npm run build` (tsc typecheck + esbuild). Run both before each commit; the build is the gate for the DOM tasks.

---

## File Structure

- **`src/query.ts`** — restore `buildGraph` (edges among memory notes, undirected/deduped) and extend it to return `isolated: Set<string>` (degree-0 paths). Pure.
- **`src/viz.ts`** (new) — pure presentation helpers: `projectColor`, `nodeRadius`, `currencyOpacity`. No DOM. Unit-tested.
- **`src/graph.ts`** (restore + enrich) — `renderGraph(host, notes, onClick)`: SVG + d3-force, using the `viz.ts` helpers, with importance radius, isolated dim/park, and a legend.
- **`src/view.ts`** — restore List/Graph toggle; add `selectedPath` + a lightweight provenance refresh so clicking a graph node drives the provenance panel without rebuilding the graph.
- **`package.json`** — re-add `d3-force` + `@types/d3-force`; bump version to `0.3.0`.
- **`styles.css`**, **`README.md`**, **`CHANGELOG.md`** — graph/legend styles + docs.
- **Tests:** `tests/query.test.ts` (extend), `tests/viz.test.ts` (new).

---

## Task 1: `buildGraph` with isolated-node detection

**Files:**
- Modify: `src/query.ts`
- Test: `tests/query.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/query.test.ts` (it already imports from `../src/query`; mirror its existing `MemoryNote` fixture style — a helper that returns a note with `links: string[]`, `currency: "current"`, `tags: []`, etc.):

```typescript
import { buildGraph } from "../src/query";
import type { MemoryNote } from "../src/model";

const note = (path: string, links: string[] = []): MemoryNote => ({
  path, title: path, tags: [], currency: "current", links,
});

describe("buildGraph", () => {
  it("builds undirected, deduped edges only among memory notes", () => {
    const notes = [note("a.md", ["b.md", "x.md"]), note("b.md", ["a.md"]), note("c.md")];
    const g = buildGraph(notes);
    // a–b is one undirected edge (despite a→b and b→a); x.md is not a memory note → dropped
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/git/agentcairn-obsidian && npm test`
Expected: FAIL (`buildGraph` not exported / `isolated` undefined).

- [ ] **Step 3: Implement** — add to `src/query.ts` (this restores the cut `buildGraph` and adds `isolated` + self-edge guard):

```typescript
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
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/git/agentcairn-obsidian && npm test`
Expected: PASS (3 new tests + existing query/model tests).

- [ ] **Step 5: Commit**

```bash
git add src/query.ts tests/query.test.ts
git commit -m "feat(graph): buildGraph with undirected edges + isolated detection"
```

---

## Task 2: pure viz helpers

**Files:**
- Create: `src/viz.ts`
- Test: `tests/viz.test.ts`

- [ ] **Step 1: Write the failing tests** — create `tests/viz.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { projectColor, nodeRadius, currencyOpacity } from "../src/viz";

describe("projectColor", () => {
  it("is deterministic per name and muted for undefined", () => {
    expect(projectColor("agentcairn")).toBe(projectColor("agentcairn"));
    expect(projectColor(undefined)).toBe("var(--text-muted)");
  });
  it("differs across distinct names", () => {
    expect(projectColor("alpha")).not.toBe(projectColor("beta"));
  });
});

describe("nodeRadius", () => {
  it("scales importance 0..1 into the radius band and clamps", () => {
    expect(nodeRadius(0)).toBe(4);
    expect(nodeRadius(1)).toBe(10);
    expect(nodeRadius(undefined)).toBe(6); // default when missing
    expect(nodeRadius(5)).toBe(10); // clamped above 1
  });
});

describe("currencyOpacity", () => {
  it("full for current, dimmed otherwise", () => {
    expect(currencyOpacity("current")).toBe(1);
    expect(currencyOpacity("superseded")).toBe(0.45);
    expect(currencyOpacity("expired")).toBe(0.45);
    expect(currencyOpacity("not_yet_valid")).toBe(0.45);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/git/agentcairn-obsidian && npm test`
Expected: FAIL (`../src/viz` not found).

- [ ] **Step 3: Implement** — create `src/viz.ts`:

```typescript
import type { Currency } from "./model";

/** Deterministic name→HSL hue (mirrors the pre-cut colorFor); muted when no project. */
export function projectColor(key: string | undefined): string {
  if (!key) return "var(--text-muted)";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

const R_MIN = 4, R_MAX = 10, R_DEFAULT = 6;
/** Importance 0..1 → radius band; missing → default; clamped. */
export function nodeRadius(importance: number | undefined): number {
  if (importance == null || Number.isNaN(importance)) return R_DEFAULT;
  const clamped = Math.max(0, Math.min(1, importance));
  return R_MIN + clamped * (R_MAX - R_MIN);
}

/** Current = full; superseded/expired/not_yet_valid = dimmed. */
export function currencyOpacity(c: Currency): number {
  return c === "current" ? 1 : 0.45;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/git/agentcairn-obsidian && npm test`
Expected: PASS (viz tests + all prior).

- [ ] **Step 5: Commit**

```bash
git add src/viz.ts tests/viz.test.ts
git commit -m "feat(graph): pure viz helpers (projectColor, nodeRadius, currencyOpacity)"
```

---

## Task 3: restore + enrich `graph.ts` (d3-force render)

**Files:**
- Create: `src/graph.ts`
- Modify: `package.json` (re-add deps)
- Verify: `npm run build`

- [ ] **Step 1: Re-add the d3-force dependency**

Run:
```bash
cd ~/git/agentcairn-obsidian && npm install --save-exact d3-force@3.0.0 && npm install --save-dev --save-exact @types/d3-force@3.0.10
```
Confirm `d3-force` is in `dependencies` and `@types/d3-force` in `devDependencies` of `package.json`.

- [ ] **Step 2: Create `src/graph.ts`** — restore the pre-cut render (`git show 07d9226:src/graph.ts`) and enrich with the viz helpers + isolated handling + legend. Full file:

```typescript
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY,
  Simulation, SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import { buildGraph, GraphEdge } from "./query";
import { projectColor, nodeRadius, currencyOpacity } from "./viz";
import type { MemoryNote } from "./model";

interface Node extends SimulationNodeDatum { path: string; note: MemoryNote; isolated: boolean; }
interface Link extends SimulationLinkDatum<Node> { source: Node; target: Node; }

const NS = "http://www.w3.org/2000/svg";

export function renderGraph(host: HTMLElement, notes: MemoryNote[], onClick: (path: string) => void): void {
  host.empty?.() ?? (host.innerHTML = "");
  const MAX = 2000;
  const used = notes.length > MAX ? notes.slice(0, MAX) : notes;
  if (notes.length > MAX) {
    const d = document.createElement("div"); d.className = "ac-empty";
    d.textContent = `Showing first ${MAX} of ${notes.length} notes.`; host.appendChild(d);
  }
  const { edges, isolated } = buildGraph(used);
  const nodes: Node[] = used.map((n) => ({ path: n.path, note: n, isolated: isolated.has(n.path) }));
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  const links: Link[] = edges.map((e: GraphEdge) => ({ source: byPath.get(e.source)!, target: byPath.get(e.target)! }));

  const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "ac-graph");
  const w = host.clientWidth || 600, hgt = host.clientHeight || 400;
  svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`); host.appendChild(svg);
  const gLinks = document.createElementNS(NS, "g"); const gNodes = document.createElementNS(NS, "g");
  svg.appendChild(gLinks); svg.appendChild(gNodes);

  const lineEls = links.map((l) => {
    const ln = document.createElementNS(NS, "line"); ln.setAttribute("stroke", "var(--background-modifier-border)");
    if (l.source.note.currency !== "current" || l.target.note.currency !== "current") ln.setAttribute("stroke-dasharray", "3,3");
    gLinks.appendChild(ln); return ln;
  });
  const circleEls = nodes.map((n) => {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("r", String(nodeRadius(n.note.importance)));
    c.setAttribute("fill", projectColor(n.note.project));
    // isolated nodes are dimmed beyond their currency dimming so the connected core reads first
    const op = currencyOpacity(n.note.currency) * (n.isolated ? 0.5 : 1);
    c.setAttribute("opacity", String(op));
    c.style.cursor = "pointer";
    c.addEventListener("click", () => onClick(n.path));
    const t = document.createElementNS(NS, "title");
    t.textContent = `${n.note.title}${n.note.project ? ` · ${n.note.project}` : ""}`;
    c.appendChild(t); gNodes.appendChild(c); return c;
  });

  const sim: Simulation<Node, Link> = forceSimulation(nodes)
    .force("link", forceLink<Node, Link>(links).distance(40))
    .force("charge", forceManyBody<Node>().strength(-80))
    .force("center", forceCenter(w / 2, hgt / 2))
    // park isolated nodes toward the right margin so they don't crowd the connected core
    .force("xIso", forceX<Node>((n) => (n.isolated ? w * 0.92 : w / 2)).strength((n) => (n.isolated ? 0.3 : 0)))
    .force("yIso", forceY<Node>((n) => (n.isolated ? hgt / 2 : hgt / 2)).strength((n) => (n.isolated ? 0.05 : 0)));
  sim.on("tick", () => {
    links.forEach((l, i) => {
      lineEls[i].setAttribute("x1", String(l.source.x)); lineEls[i].setAttribute("y1", String(l.source.y));
      lineEls[i].setAttribute("x2", String(l.target.x)); lineEls[i].setAttribute("y2", String(l.target.y));
    });
    nodes.forEach((n, i) => { circleEls[i].setAttribute("cx", String(n.x)); circleEls[i].setAttribute("cy", String(n.y)); });
  });

  renderLegend(host, used);
}

// `notes` is MemoryNote[], so project is read directly as n.project.
function renderLegend(host: HTMLElement, notes: MemoryNote[]): void {
  const legend = document.createElement("div"); legend.className = "ac-legend";
  const projects = [...new Set(notes.map((n) => n.project).filter((p): p is string => !!p))].sort();
  for (const p of projects) {
    const row = document.createElement("div"); row.className = "ac-legend-row";
    const sw = document.createElement("span"); sw.className = "ac-swatch";
    sw.style.background = projectColor(p); row.appendChild(sw);
    row.appendChild(document.createTextNode(p)); legend.appendChild(row);
  }
  const note = document.createElement("div"); note.className = "ac-legend-note";
  note.textContent = "dim = superseded/expired/isolated · edge = related memory";
  legend.appendChild(note);
  host.appendChild(legend);
}
```

- [ ] **Step 3: Run the build (typecheck gate)**

Run: `cd ~/git/agentcairn-obsidian && npm run build`
Expected: succeeds (no TS errors; esbuild bundles `d3-force`). Fix any type error before committing.

- [ ] **Step 4: Run tests** (unaffected, but confirm nothing broke)

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graph.ts package.json package-lock.json
git commit -m "feat(graph): restore d3-force render, enriched with importance/isolated/legend"
```

---

## Task 4: `view.ts` — toggle + node→provenance

**Files:**
- Modify: `src/view.ts`
- Verify: `npm run build`

- [ ] **Step 1: Restore the List/Graph toggle + graph render.** In `src/view.ts`:
  - Add `import { renderGraph } from "./graph";` and a field `mode: "list" | "graph" = "list";` and `selectedPath: string | null = null;`.
  - In `render()`, after computing `shown`, branch:
    ```typescript
    if (all.length === 0) body.createDiv({ cls: "ac-empty", text: "No agentcairn memories found in this vault." });
    else if (this.mode === "list") this.renderList(body, shown);
    else renderGraph(body, shown, (path) => { this.selectedPath = path; this.plugin.openNote(path); this.refreshProvenance(); });
    ```
  - In `renderFilterBar`, add the toggle button (restored from `07d9226`):
    ```typescript
    const toggle = bar.createEl("button", { text: this.mode === "list" ? "Graph" : "List" });
    toggle.onclick = () => { this.mode = this.mode === "list" ? "graph" : "list"; this.render(); };
    ```

- [ ] **Step 2: Make provenance follow the selected node without rebuilding the graph.**
  - Replace the active-leaf-change handler in `onOpen` so it does NOT rebuild the graph while in graph mode:
    ```typescript
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      if (this.mode === "graph") this.refreshProvenance();
      else this.render();
    }));
    ```
  - Refactor provenance into a `refreshProvenance()` that removes and re-renders just the `.ac-prov` panel, preferring `selectedPath` then the active file:
    ```typescript
    private refreshProvenance() {
      const root = this.containerEl.children[1] as HTMLElement;
      this.renderProvenance(root);
    }
    ```
    and change `renderProvenance` to resolve the target note as: `selectedPath` (if set) → else active file. Concretely, replace its `const file = ...; const note = ... find(n => n.path === file.path)` with:
    ```typescript
    const model = this.plugin.buildModel();
    const targetPath = this.selectedPath ?? this.app.workspace.getActiveFile()?.path;
    const note = targetPath ? model.find((n) => n.path === targetPath) : undefined;
    if (!note) return;
    ```
    Keep the rest of `renderProvenance` (header + project/harness/session line + currency badge) as-is. Add an `importance` + `created` line to enrich the panel:
    ```typescript
    p.createDiv({ cls: "ac-prov-meta", text: [note.created?.slice(0,10), note.importance != null ? `imp ${note.importance}` : null].filter(Boolean).join(" · ") });
    ```
  - Clear selection when leaving graph mode: in the toggle handler set `this.selectedPath = null;` before `this.render()`.

- [ ] **Step 3: Build (typecheck gate)**

Run: `cd ~/git/agentcairn-obsidian && npm run build`
Expected: succeeds. Fix type errors before committing.

- [ ] **Step 4: Run tests** (confirm pure layers unaffected)

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/view.ts
git commit -m "feat(graph): List/Graph toggle + node selection drives provenance panel"
```

---

## Task 5: styles, docs, version, verify

**Files:**
- Modify: `styles.css`, `README.md`, `CHANGELOG.md` (create if absent), `package.json`, `manifest.json`, `versions.json`

- [ ] **Step 1: Graph + legend styles** — append to `styles.css`:

```css
.ac-graph { width: 100%; height: 60vh; display: block; }
.ac-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 6px 4px; font-size: 12px; color: var(--text-muted); }
.ac-legend-row { display: inline-flex; align-items: center; gap: 4px; }
.ac-swatch { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.ac-legend-note { flex-basis: 100%; }
.ac-prov-meta { color: var(--text-muted); font-size: 12px; }
```

- [ ] **Step 2: Version bump** — set `"version": "0.3.0"` in `package.json` and `manifest.json`; add the new version to `versions.json` (mirror the existing entry format, mapping `0.3.0` to the same minAppVersion as the current entry).

- [ ] **Step 3: README + CHANGELOG** — in `README.md`, document the restored graph (List/Graph toggle, project color, currency dimming, importance-sized nodes, click-to-open, node→provenance) and note it's populated by `cairn link`'s `related:` edges. Add a `CHANGELOG.md` entry (Keep a Changelog style) under a `## [0.3.0]` heading:
  ```markdown
  ### Added
  - Memory Graph (restored): d3-force view of `related:` edges written by `cairn link` — project-colored, importance-sized, currency-dimmed nodes; isolated notes parked aside; legend; click a node to open it and drive the provenance panel.
  ```

- [ ] **Step 4: Full verify**

Run: `cd ~/git/agentcairn-obsidian && npm test && npm run build`
Expected: tests green; build succeeds (bundles `d3-force`, no TS errors).

- [ ] **Step 5: Commit**

```bash
git add styles.css README.md CHANGELOG.md package.json manifest.json versions.json
git commit -m "docs(graph): styles, README/CHANGELOG, version 0.3.0"
```

---

## Manual QA (human gate, before any store-submission PR)

Not a code task — note for the human: in a real vault that's had `cairn link` run, open the Memory view, switch to Graph, and confirm: edges appear between related memories; nodes are project-colored and importance-sized; superseded/isolated nodes are dimmed; the legend lists projects; clicking a node opens it and updates the provenance panel; the connected core isn't crowded by isolated nodes. The community-store submission stays human-gated per project convention.

---

## Self-Review Notes (author)

- **Spec coverage:** dependency re-add → Task 3.1; `buildGraph`+isolated → Task 1; viz helpers (projectColor/nodeRadius/currencyOpacity) → Task 2; d3 render + encoding (color/radius/currency/isolated/legend) → Task 3; toggle + click-to-open + node→provenance → Task 4; styles/docs/version → Task 5; manual-QA + store-gate → noted. No gaps.
- **No placeholders:** every code step has complete code; the legend `n.note?.project` simplification is called out explicitly to use `n.project`.
- **Type consistency:** `Graph { nodes, edges, isolated: Set<string> }`, `GraphEdge {source,target}`, `renderGraph(host, notes, onClick)`, `projectColor(string|undefined)`, `nodeRadius(number|undefined)`, `currencyOpacity(Currency)` — used identically across tasks. `MemoryNote` fields (`links`, `importance`, `project`, `currency`) match `model.ts`.
- **Test layer split:** pure logic (Tasks 1–2) is vitest-tested; DOM/d3 (Tasks 3–4) is gated by `npm run build` + manual QA, matching the repo's existing split (no Obsidian DOM tests).
