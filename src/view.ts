import { ItemView, WorkspaceLeaf } from "obsidian";
import type AgentcairnPlugin from "./main";
import { filterNotes, sortNotes, SortKey, FilterCriteria } from "./query";
import { MemoryNote } from "./model";

export const VIEW_TYPE_MEMORY = "agentcairn-memory";

export class MemoryView extends ItemView {
  plugin: AgentcairnPlugin;
  criteria: FilterCriteria = {};
  sort: SortKey = "newest";
  private timer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AgentcairnPlugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_TYPE_MEMORY; }
  getDisplayText() { return "agentcairn memory"; }
  getIcon() { return "brain"; }

  async onOpen() {
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.render()));
    this.render();
  }
  async onClose() {}

  scheduleRender() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 200);
  }

  render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("agentcairn-memory");
    const all = this.plugin.buildModel();
    this.renderFilterBar(root, all);
    const shown = sortNotes(filterNotes(all, this.criteria), this.sort);
    const body = root.createDiv({ cls: "ac-body" });
    if (all.length === 0) body.createDiv({ cls: "ac-empty", text: "No agentcairn memories found in this vault." });
    else this.renderList(body, shown);
    this.renderProvenance(root);
  }

  private renderFilterBar(root: HTMLElement, all: MemoryNote[]) {
    const bar = root.createDiv({ cls: "ac-filter" });
    const search = bar.createEl("input", { attr: { type: "text", placeholder: "search…" } });
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
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const note = this.plugin.buildModel().find((n) => n.path === file.path);
    if (!note) return;
    const p = root.createDiv({ cls: "ac-prov" });
    p.createDiv({ cls: "ac-prov-h", text: "active note" });
    p.createDiv({ text: [note.project, note.harness, note.session && `session ${note.session}`].filter(Boolean).join(" · ") });
    p.createSpan({ cls: `ac-badge ac-${note.currency}`, text: note.currency });
  }
}
