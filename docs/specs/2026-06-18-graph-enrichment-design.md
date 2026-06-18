# Memory graph enrichment — design

**Date:** 2026-06-18
**Status:** Approved (brainstorm) → ready for implementation plan
**Repo:** ccf/agentcairn-obsidian (the Obsidian plugin; current version 0.2.0)

## Problem

The plugin had a d3-force Memory Graph (commit `07d9226`: project-colored, currency-aware) but it
was **cut** (`bdd3401`) because real vaults were edge-starved — captured memories had no
`[[wikilinks]]`, so the graph was a cloud of disconnected dots. agentcairn's `cairn link` (CLI
0.20.x) now writes each note's top semantic neighbors as a `related:` frontmatter list of
`[[wikilinks]]`, which Obsidian resolves into real links. The graph is worth restoring — and
enriching into a navigable "memory journey" (issue #43).

## Goal

Restore the Memory Graph fed by the now-real `related:` edges, and make it a navigable surface:
project color, currency-aware de-emphasis, importance-scaled nodes, isolated-node handling, a
legend, click-to-open, and node-selection driving the provenance panel.

The data is already available: `main.ts` `buildModel()` populates each `MemoryNote.links` from
`app.metadataCache.resolvedLinks`, so post-`cairn link` the `related:` edges are present with no new
wiring. This is restore + enrich, not new plumbing.

Non-goals: a semantic "path-2" graph (cosine edges computed in-plugin); large-vault perf tuning
(560 nodes is comfortable for d3-force); editing/writing links from the plugin (read-only reader).

## Design

### Dependency

`d3-force` was removed with the cut. Re-add **`d3-force`** (the focused force module, ~tens of KB —
not full d3), bundled by the existing esbuild config. Rationale: the proven layout code is
recoverable from `07d9226`; a hand-rolled simulation risks subtle layout bugs for no real bundle
saving. Bundled deps are fine for the community store.

### `query.ts` — pure graph builder

Add `buildGraph(notes: MemoryNote[]): GraphData` where:

```
interface GraphNode { path: string; title: string; project?: string; currency: Currency;
                      importance?: number; isolated: boolean; }
interface GraphEdge { source: string; target: string; }
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; }
```

- Build a set of memory-note paths. Edges come from each note's `links`, **kept only when the
  target resolves to another memory-note path** (non-memory links and dangling targets dropped).
  `links` holds resolved target paths (from `resolvedLinks`), so targets are compared by path.
- Edges are **undirected + deduped** (a–b and b–a collapse to one; self-edges dropped).
- `isolated = true` for any node with degree 0.
- Pure and deterministic → unit-tested.

### `view.ts` — restore toggle + graph render

- Restore the **List / Graph segmented toggle** (was `77dec6d`) and a `mode` field; List stays the
  default.
- `renderGraph(body, notes)` (recover the d3-force scaffold from `07d9226`), with scope-3 encoding:
  - **Fill = project** via a stable `projectColor(name)` (deterministic name→palette hash, so a
    project keeps its color across renders; undefined project → neutral gray).
  - **Radius = importance** via `nodeRadius(importance)` (0–1 → min..max px; missing → default).
  - **Currency** = de-emphasis: `superseded`/`expired`/`not_yet_valid` rendered at reduced opacity
    with a muted stroke; `current` full.
  - **Isolated nodes** rendered but dimmed and parked toward the margin (a weak outward force or a
    fixed peripheral band), so the connected core reads clearly. Not hidden.
  - **Edges** drawn as thin lines.
  - **Legend** panel: project swatches (for projects present), the four currency states, and "edge =
    related memory."
  - The existing **filter bar** applies in graph mode (filters the node set before `buildGraph`).
- `projectColor`, `nodeRadius`, and the currency→opacity mapping are **pure helpers** (in `query.ts`
  or a small `viz.ts`) so they're unit-testable; the d3/DOM render stays thin.

### Interactions (the journey)

- **Click a node → open the note** (`plugin.openNote(path)`).
- **Select a node → provenance panel** shows *that* note (project · harness · session · currency ·
  importance · created), overriding the active-file default. `renderProvenance` gains an optional
  "selected note" argument; with none selected it falls back to the active file (current behavior).
  Selecting empty space clears the selection.

### Error handling / edge cases

- Empty vault or all-isolated: graph renders the nodes (dimmed) with the existing "No memories" path
  unaffected; no crash on zero edges.
- A `related:` target that doesn't resolve to a memory note is silently dropped (handled in
  `buildGraph`).
- d3-force runs a bounded tick count / `alphaMin` stop (no runaway simulation); viewBox auto-fits to
  node extent (the `0d73e8b` fix behavior is preserved/restored).

## Testing

- **`buildGraph` (vitest, pure):** edges only among memory notes; non-memory/dangling targets
  excluded; undirected dedup; self-edge dropped; `isolated` flag correct; a fully-linked trio and a
  lone node.
- **Viz helpers (pure):** `projectColor` deterministic + stable per name, distinct across names;
  `nodeRadius` clamps importance 0/1/missing; currency→opacity mapping.
- The d3/Obsidian view layer is exercised manually (Obsidian DOM isn't unit-testable here, matching
  the existing test split). Manual QA in a real vault after `cairn link` is the human gate before
  the store-submission PR.

## Rollout

Plugin minor release (0.2.0 → 0.3.0) once merged + manually QA'd in a real vault. Community-store
submission stays human-gated (per project convention). README/CHANGELOG note the restored,
edge-aware graph and the node→provenance navigation.
