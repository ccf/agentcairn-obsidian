# CLAUDE.md — agentcairn-obsidian

Obsidian plugin to **see, filter, and navigate** an [agentcairn](https://github.com/ccf/agentcairn)
agent-memory vault from inside Obsidian. It is a **read-only reader**: it never writes to the vault.

## What it is (and isn't)

- **Pure-JS reader.** It reads Obsidian's `metadataCache` (frontmatter + `resolvedLinks`) — it does
  **not** read agentcairn's DuckDB index. Everything it shows comes from the Markdown notes Obsidian
  has already parsed.
- A note counts as a memory when its frontmatter has `type: memory` (see `parseMemoryNote`).
- The **Memory Graph** is populated by the `related:` frontmatter wikilinks that agentcairn's
  `cairn link` command writes. With no links, the graph is just dots — run `cairn link` in the vault
  first, then open the Graph tab.

## Architecture (`src/`)

| File | Responsibility | Pure? |
|---|---|---|
| `model.ts` | `MemoryNote`, `parseMemoryNote`, `computeCurrency` (mirrors agentcairn's validity_status) | pure |
| `query.ts` | `filterNotes`, `sortNotes`, `buildGraph` (edges among memory notes, undirected/deduped, isolated set) | pure |
| `viz.ts` | presentation helpers: `projectColor`, `nodeRadius`, `currencyOpacity` | pure |
| `graph.ts` | `renderGraph` — d3-force SVG graph (returns the `Simulation` so the view can stop it) | DOM |
| `view.ts` | `MemoryView` — list/graph toggle, filter bar, provenance panel | DOM |
| `main.ts` | plugin entry; `buildModel()` builds `MemoryNote[]` from `metadataCache` | DOM |

**Boundary:** keep logic in the pure layer (`model`/`query`/`viz`) where it can be unit-tested; the
DOM layer (`graph`/`view`/`main`) should be thin glue over it.

## Commands

- `npm test` — vitest (the pure layers: `tests/*.test.ts`).
- `npm run build` — `tsc -noEmit -skipLibCheck` (typecheck) + esbuild bundle to `main.js`.
- `npm run lint` — eslint with `eslint-plugin-obsidianmd` over `src`/`tests`.
- `npm run dev` — esbuild watch.

## Linting

`npm run lint` runs **`eslint-plugin-obsidianmd`** — the same rule set the Obsidian community-store
review uses. It catches: APIs newer than the declared `minAppVersion` (`no-unsupported-api`, reads
`@since` from `obsidian.d.ts`), non-sentence-case UI text (`ui/sentence-case`), raw `document` instead
of `activeDocument` (popout safety), floating promises, and flagged dependencies (`module-replacements`).
Config: `eslint.config.mjs` (typed rules need `tsconfig.json`; build/config `.mjs` files are ignored).

## Testing convention

- **Pure logic is TDD'd with vitest** (`model`, `query`, `viz`). Add a failing test first.
- **The DOM/d3 layer has no unit tests** — Obsidian's DOM isn't available under vitest. It is gated
  by `npm run build` (typecheck) and **manual QA in a real vault**. Don't try to unit-test `view.ts`/
  `graph.ts`/`main.ts`; verify them by building and loading the plugin.

## Commit / CI gates

- A **husky pre-commit** hook runs `npm run lint && npm test && npm run build`. **CI**
  (`.github/workflows/ci.yml`) runs lint + test + build on push/PR. Every commit must leave them
  green; never bypass with `--no-verify`.

## Human gates (do NOT automate)

- **Manual QA in a real, `cairn link`-populated vault** before claiming the graph works.
- **Community-store submission** is human-gated. Merging to `main` and bumping the version is normal
  dev; submitting/updating the store listing is the maintainer's call.

## Release

Tag `X.Y.Z` → `.github/workflows/release.yml` builds and creates a GitHub Release with
`main.js` + `manifest.json` + `styles.css`. Keep `version` in sync across `package.json`,
`manifest.json`, and `versions.json` (map the new version to the current `minAppVersion`).
