import { ItemView, WorkspaceLeaf } from "obsidian";
import type AgentcairnPlugin from "./main";
import { filterNotes, sortNotes, SortKey, FilterCriteria, GroupBy } from "./query";
import { MemoryNote } from "./model";
import { renderGraph } from "./graph";

export const VIEW_TYPE_MEMORY = "agentcairn-memory";

export class MemoryView extends ItemView {
  plugin: AgentcairnPlugin;
  criteria: FilterCriteria = {};
  sort: SortKey = "newest";
  mode: "list" | "graph" = "list";
  groupBy: GroupBy = "none";
  selectedPath: string | null = null;
  private timer: number | null = null;
  private sim: { stop: () => void } | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AgentcairnPlugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_TYPE_MEMORY; }
  getDisplayText() { return "Agentcairn memory"; }
  getIcon() { return "brain"; }

  async onOpen() {
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      if (this.mode === "graph") this.refreshProvenance();
      else this.render();
    }));
    this.render();
  }
  async onClose() { this.sim?.stop(); this.sim = null; }

  scheduleRender() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 200);
  }

  render() {
    // Stop any prior d3-force simulation before tearing down the SVG, so re-renders
    // (toggle, filter, vault change) don't leave layout loops ticking on detached nodes.
    this.sim?.stop();
    this.sim = null;
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("agentcairn-memory");
    const all = this.plugin.buildModel();
    this.renderFilterBar(root, all);
    const shown = sortNotes(filterNotes(all, this.criteria), this.sort);
    // Drop a selection that filtering/sort has removed from view, so provenance never
    // labels an off-screen note as "selected".
    if (this.selectedPath && !shown.some((n) => n.path === this.selectedPath)) this.selectedPath = null;
    const body = root.createDiv({ cls: "ac-body" });
    if (all.length === 0) body.createDiv({ cls: "ac-empty", text: "No agentcairn memories found in this vault." });
    else if (this.mode === "list") this.renderList(body, shown);
    else this.sim = renderGraph(body, shown, {
      groupBy: this.groupBy,
      onNodeClick: (path) => { this.selectedPath = path; this.plugin.openNote(path); this.refreshProvenance(); },
      onHubClick: (facet, value) => { (this.criteria as Record<string, unknown>)[facet] = value; this.render(); },
      onBackgroundClick: () => { this.selectedPath = null; this.refreshProvenance(); },
    });
    this.renderProvenance(root);
  }

  private renderFilterBar(root: HTMLElement, all: MemoryNote[]) {
    const bar = root.createDiv({ cls: "ac-filter" });
    const search = bar.createEl("input", { attr: { type: "text", placeholder: "Search…" } });
    search.value = this.criteria.query ?? "";
    search.oninput = () => { this.criteria.query = search.value; this.scheduleRender(); };
    const uniq = (f: (n: MemoryNote) => string | undefined) =>
      [...new Set(all.map(f).filter((v): v is string => !!v))].sort();
    this.dropdown(bar, "project", uniq((n) => n.project));
    this.dropdown(bar, "harness", uniq((n) => n.harness));
    this.dropdown(bar, "currency", ["current", "superseded", "expired", "not_yet_valid"]);
    const sortSel = bar.createEl("select");
    for (const k of ["newest", "importance"]) sortSel.createEl("option", { value: k, text: k });
    sortSel.value = this.sort;
    sortSel.onchange = () => { this.sort = sortSel.value as SortKey; this.scheduleRender(); };
    const groupSel = bar.createEl("select");
    for (const g of ["none", "project", "harness", "tag"]) {
      groupSel.createEl("option", { value: g, text: g === "none" ? "group: none" : `group: ${g}` });
    }
    groupSel.value = this.groupBy;
    groupSel.onchange = () => { this.groupBy = groupSel.value as GroupBy; this.render(); };
    const toggle = bar.createEl("button", { text: this.mode === "list" ? "Graph" : "List" });
    toggle.onclick = () => { this.mode = this.mode === "list" ? "graph" : "list"; this.selectedPath = null; this.render(); };
  }

  private dropdown(bar: HTMLElement, key: keyof FilterCriteria, opts: string[]) {
    const sel = bar.createEl("select");
    sel.createEl("option", { value: "", text: `${key}: all` });
    for (const o of opts) sel.createEl("option", { value: o, text: o });
    sel.value = (this.criteria[key] as string) ?? "";
    sel.onchange = () => { (this.criteria as Record<string, unknown>)[key] = sel.value || undefined; this.scheduleRender(); };
  }

  private renderList(body: HTMLElement, notes: MemoryNote[]) {
    const list = body.createDiv({ cls: "ac-list" });
    for (const n of notes) {
      const row = list.createDiv({ cls: `ac-row ac-${n.currency}` });
      row.onclick = () => this.plugin.openNote(n.path);
      row.createDiv({ cls: "ac-title", text: n.title });
      const meta = [n.created?.slice(0, 10), n.harness, n.project, n.importance != null ? `imp ${n.importance}` : null]
        .filter(Boolean).join(" · ");
      row.createDiv({ cls: "ac-meta", text: meta });
      if (n.currency !== "current") row.createSpan({ cls: "ac-badge", text: n.currency });
    }
  }

  private renderProvenance(root: HTMLElement) {
    root.querySelector(".ac-prov")?.remove();
    const model = this.plugin.buildModel();
    const targetPath = this.selectedPath ?? this.app.workspace.getActiveFile()?.path;
    const note = targetPath ? model.find((n) => n.path === targetPath) : undefined;
    if (!note) return;
    const p = root.createDiv({ cls: "ac-prov" });
    p.createDiv({ cls: "ac-prov-h", text: this.selectedPath ? "selected" : "active note" });
    p.createDiv({ text: [note.project, note.harness, note.session && `session ${note.session}`].filter(Boolean).join(" · ") });
    p.createSpan({ cls: `ac-badge ac-${note.currency}`, text: note.currency });
    p.createDiv({ cls: "ac-prov-meta", text: [note.created?.slice(0, 10), note.importance != null ? `imp ${note.importance}` : null].filter(Boolean).join(" · ") });
  }

  private refreshProvenance() {
    const root = this.containerEl.children[1] as HTMLElement;
    this.renderProvenance(root);
  }
}
