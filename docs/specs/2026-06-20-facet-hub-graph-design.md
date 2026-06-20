# Facet-Hub Graph — Design

**Status:** approved 2026-06-20
**Repo:** agentcairn-obsidian (plugin-only — no agentcairn core / vault changes)
**Goal:** Make the Memory graph richer and more navigable by clustering memory notes around **deterministic facet hubs** (project / harness / tag) — structure already in the frontmatter — without LLM extraction.

## Background & decision

The v2 roadmap lists "optional LLM entity extraction." We evaluated it and **deferred it**: it cuts agentcairn's core differentiator (a *deterministic, no-hallucinated-entities* graph — `[[wikilinks]]` + `cairn link`'s semantic-neighbor `related:` edges) for value that a free, deterministic approach delivers. The motivation that justified the idea is **B: a richer Obsidian graph**, and the frontmatter already carries a real entity layer (`project`, `harness`, `tags`) the graph doesn't yet surface as nodes. This spec surfaces *that* — deterministically. Prose-level named-entity extraction (NER or LLM) stays a possible future follow-up to revisit only after seeing this.

## What we build

A **"Group by" facet selector** in the Memory view. When a facet is chosen, the graph adds **hub nodes** (one per distinct value of that facet present in the shown notes) and connects each memory note to its hub(s); memories visibly cluster around their project / harness / tag. Plugin-render only — no vault writes, no LLM, no core changes.

- Selector values: **`none`** (today's behavior, default) · **`project`** · **`harness`** · **`tag`**.
- One facet at a time (all-facets-at-once would be edge-soup at ~600 notes).
- Existing `related:` note→note edges are kept; hub edges are added and styled lighter, so the hubs drive clustering while related edges remain visible.
- **Click a hub → filter the view to that facet value** (reuses the existing filter criteria), so the graph doubles as navigation.

## Components (all in `agentcairn-obsidian`)

### `src/query.ts` — pure, unit-tested
- `export type GroupBy = "none" | "project" | "harness" | "tag";`
- `export interface HubNode { id: string; facet: GroupBy; value: string; count: number; }` — `id` is `hub:<facet>:<value>`; `count` = number of memory notes attached (for node sizing).
- Extend `Graph` to `{ nodes: MemoryNote[]; edges: GraphEdge[]; isolated: Set<string>; hubs: HubNode[]; }`.
- `buildGraph(notes: MemoryNote[], groupBy: GroupBy = "none"): Graph`:
  - `groupBy === "none"` → unchanged (empty `hubs`, existing note→note edges, existing `isolated`).
  - Otherwise: for each note, read the facet value(s) — `project`/`harness` are single (skip notes lacking it), `tag` is `tags[]` (a note yields one hub edge per tag). Create a `HubNode` per distinct value (with `count`), and a `GraphEdge { source: note.path, target: hub.id }` per attachment. Note→note `related:` edges are still included. `isolated` = notes with no edges of any kind under the current grouping.

### `src/graph.ts` — DOM, manual-QA
- `renderGraph` gains the hubs: render `HubNode`s as a distinct node kind — larger radius scaled by `count`, a visible text **label** (the facet value), and a distinct style (project hubs reuse `projectColor(value)`; harness/tag hubs use a neutral hub color). Memory-note nodes are unchanged (dots, title in `<title>`).
- The d3 node map is keyed by **id** (note `path` or `hub:<facet>:<value>`) so hub edges resolve.
- New callback `onHubClick(facet: GroupBy, value: string)` (alongside the existing node `onClick`/`onBackgroundClick`); clicking a hub invokes it.
- Hub edges styled lighter/thinner than `related:` edges so the two layers are distinguishable.

### `src/view.ts` — DOM, manual-QA
- New state `groupBy: GroupBy = "none"`.
- A **`group by`** `<select>` in the filter bar (`none`/`project`/`harness`/`tag`), next to the sort select; `onchange` sets `this.groupBy` and re-renders.
- Graph branch passes `this.groupBy` to `buildGraph`/`renderGraph`.
- `onHubClick(facet, value)` sets the matching `criteria` field (`project`/`harness`/`tag`) to `value` and re-renders (clustering → drill-down).

### `src/viz.ts`
- Add a hub-styling helper if useful (e.g. `hubRadius(count)`), mirroring `nodeRadius`. Optional.

## Data flow

`buildModel()` (frontmatter → `MemoryNote[]`, unchanged) → `filterNotes`/`sortNotes` (unchanged) → `buildGraph(shown, groupBy)` → `renderGraph(...)` draws memory dots + facet hubs + both edge layers. Hub click → set filter → re-render.

## Error handling / edge cases

- `groupBy="none"` is byte-for-byte today's graph (regression guard in tests).
- Notes missing the chosen facet (e.g. no `project`) get no hub edge; if they also have no `related:` edge they're `isolated` (parked aside, as today).
- A note with many tags attaches to many tag hubs — expected; the selector lets the user switch to `project`/`harness` for a tighter view.
- Empty vault / single note → no hubs, no crash (covered by existing empty-state handling).

## Testing

- **Pure (`tests/query.test.ts`, vitest):** `buildGraph(notes, groupBy)` — assert: hubs created one-per-distinct-value with correct `count`; a note→hub edge per attachment; multi-tag notes get multiple tag-hub edges; `project`/`harness` notes lacking the facet get no hub edge; `groupBy="none"` returns the unchanged shape (no hubs). This is the load-bearing logic and is fully unit-testable on any OS.
- **DOM (`graph.ts`/`view.ts`):** no unit tests (Obsidian DOM unavailable under vitest, per the repo convention) — gated by `npm run build` + **manual QA** in a real vault: select each facet, confirm hubs appear/labeled/clustered, related edges still show, hub-click filters.

## Out of scope (deferred)

- LLM / NER prose-level named-entity extraction (B2/B3).
- Writing facet `[[wikilinks]]` into the vault so Obsidian's *native* graph shows hubs (would mutate the vault; this spec is plugin-render only).
- Multiple facet layers at once.

## Definition of done

- A `group by` selector (`none`/`project`/`harness`/`tag`) in the Memory view; default `none` reproduces today's graph.
- Selecting a facet renders labeled hub nodes with memory notes clustered around them; `related:` edges still visible; hub size reflects member count.
- Clicking a hub filters the view to that facet value.
- `buildGraph(groupBy)` is unit-tested (incl. the `none` regression and multi-tag case); `npm run lint`/`test`/`build` green.
- No agentcairn-core or vault changes; no LLM.
