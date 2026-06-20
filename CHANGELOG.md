# Changelog

## [0.4.0]

### Added
- Memory Graph **group by** selector (none / project / harness / tag): choosing a facet renders hub nodes — one per distinct value — with memory notes clustered around them; existing `related:` edges remain visible; click a hub to filter the view to that facet value. Deterministic, no LLM, no vault writes.

## [0.3.0]

### Added
- Memory Graph (restored): d3-force view of `related:` edges written by `cairn link` — project-colored, importance-sized, currency-dimmed nodes; isolated notes parked aside; legend; click a node to open it and drive the provenance panel.
