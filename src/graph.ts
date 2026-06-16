import type { MemoryNote } from "./model";
export function renderGraph(host: HTMLElement, notes: MemoryNote[], onClick: (path: string) => void): void {
  void onClick;
  host.createDiv({ cls: "ac-empty", text: `Graph: ${notes.length} notes (coming in the next step).` });
}
