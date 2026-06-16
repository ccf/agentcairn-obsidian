import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { MemoryView, VIEW_TYPE_MEMORY } from "./view";
import { parseMemoryNote, MemoryNote } from "./model";

export default class AgentcairnPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE_MEMORY, (leaf) => new MemoryView(leaf, this));
    this.addRibbonIcon("brain", "agentcairn memory", () => this.activateView());
    this.addCommand({ id: "open-memory-view", name: "Open Memory view", callback: () => this.activateView() });
    this.registerEvent(this.app.metadataCache.on("resolved", () => this.refreshViews()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refreshViews()));
  }
  onunload() {}
  buildModel(now: Date = new Date()): MemoryNote[] {
    const resolved = this.app.metadataCache.resolvedLinks;
    const out: MemoryNote[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
      const linkTargets = Object.keys(resolved[file.path] ?? {});
      const note = parseMemoryNote(fm, file.path, file.basename, linkTargets, now);
      if (note) out.push(note);
    }
    return out;
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_MEMORY)[0];
    if (!leaf) { leaf = workspace.getRightLeaf(false)!; await leaf.setViewState({ type: VIEW_TYPE_MEMORY, active: true }); }
    workspace.revealLeaf(leaf);
  }
  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MEMORY)) (leaf.view as MemoryView).scheduleRender();
  }
  openNote(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) this.app.workspace.getLeaf(false).openFile(file);
  }
}
