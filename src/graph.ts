import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY,
  Simulation, SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import { buildGraph, GraphEdge, GroupBy, HubNode } from "./query";
import { projectColor, nodeRadius, currencyOpacity } from "./viz";
import type { MemoryNote } from "./model";

// Discriminated d3 node types
interface NoteNode extends SimulationNodeDatum { kind: "note"; id: string; note: MemoryNote; isolated: boolean; }
interface HubNodeD extends SimulationNodeDatum { kind: "hub"; id: string; hub: HubNode; }
type GNode = NoteNode | HubNodeD;
interface Link extends SimulationLinkDatum<GNode> { source: GNode; target: GNode; isHubEdge: boolean; }

const NS = "http://www.w3.org/2000/svg";

const hubR = (count: number) => Math.min(22, 10 + Math.sqrt(count) * 2);
const hubFill = (h: HubNode) => (h.facet === "project" ? projectColor(h.value) : "var(--text-accent)");

export function renderGraph(
  host: HTMLElement,
  notes: MemoryNote[],
  opts: {
    groupBy: GroupBy;
    onNodeClick: (path: string) => void;
    onHubClick: (facet: GroupBy, value: string) => void;
    onBackgroundClick?: () => void;
  },
): Simulation<GNode, Link> {
  host.empty();
  const MAX = 2000;
  const used = notes.length > MAX ? notes.slice(0, MAX) : notes;
  if (notes.length > MAX) {
    const d = activeDocument.createElement("div"); d.className = "ac-empty";
    d.textContent = `Showing first ${MAX} of ${notes.length} notes.`; host.appendChild(d);
  }
  const { edges, isolated, hubs } = buildGraph(used, opts.groupBy);

  // Build unified node array
  const noteNodes: NoteNode[] = used.map((n) => ({ kind: "note", id: n.path, note: n, isolated: isolated.has(n.path) }));
  const hubNodes: HubNodeD[] = hubs.map((h) => ({ kind: "hub", id: h.id, hub: h }));
  const allNodes: GNode[] = [...noteNodes, ...hubNodes];

  const byId = new Map<string, GNode>(allNodes.map((n) => [n.id, n]));
  const links: Link[] = edges
    .map((e: GraphEdge) => {
      const source = byId.get(e.source);
      const target = byId.get(e.target);
      if (!source || !target) return null;
      return { source, target, isHubEdge: e.target.startsWith("hub:") || e.source.startsWith("hub:") };
    })
    .filter((l): l is Link => l !== null);

  const svg = activeDocument.createElementNS(NS, "svg"); svg.setAttribute("class", "ac-graph");
  const w = host.clientWidth || 600, hgt = host.clientHeight || 400;
  svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`); host.appendChild(svg);
  // Clicking empty canvas (not a node) clears the selection and returns provenance to the active note.
  svg.addEventListener("click", (e) => { if (e.target === svg) opts.onBackgroundClick?.(); });
  const gLinks = activeDocument.createElementNS(NS, "g"); const gNodes = activeDocument.createElementNS(NS, "g");
  svg.appendChild(gLinks); svg.appendChild(gNodes);

  const lineEls = links.map((l) => {
    const ln = activeDocument.createElementNS(NS, "line");
    ln.setAttribute("stroke", "var(--background-modifier-border)");
    if (l.isHubEdge) {
      ln.setAttribute("class", "ac-hub-edge");
    } else {
      // non-hub edge: dash if either endpoint is non-current
      const srcCurrency = l.source.kind === "note" ? l.source.note.currency : "current";
      const tgtCurrency = l.target.kind === "note" ? l.target.note.currency : "current";
      if (srcCurrency !== "current" || tgtCurrency !== "current") ln.setAttribute("stroke-dasharray", "3,3");
    }
    gLinks.appendChild(ln); return ln;
  });

  // Render note circles
  const circleEls = noteNodes.map((n) => {
    const c = activeDocument.createElementNS(NS, "circle");
    c.setAttribute("r", String(nodeRadius(n.note.importance)));
    c.setAttribute("fill", projectColor(n.note.project));
    const op = currencyOpacity(n.note.currency) * (n.isolated ? 0.5 : 1);
    c.setAttribute("opacity", String(op));
    c.addEventListener("click", () => opts.onNodeClick(n.note.path));
    const t = activeDocument.createElementNS(NS, "title");
    t.textContent = `${n.note.title}${n.note.project ? ` · ${n.note.project}` : ""}`;
    c.appendChild(t); gNodes.appendChild(c); return c;
  });

  // Render hub circles + labels
  const hubEls = hubNodes.map((n) => {
    const c = activeDocument.createElementNS(NS, "circle");
    c.setAttribute("r", String(hubR(n.hub.count)));
    c.setAttribute("fill", hubFill(n.hub));
    c.setAttribute("class", "ac-hub");
    c.addEventListener("click", () => opts.onHubClick(n.hub.facet, n.hub.value));
    const t = activeDocument.createElementNS(NS, "title");
    t.textContent = `${n.hub.value} (${n.hub.count})`;
    c.appendChild(t); gNodes.appendChild(c);

    const lbl = activeDocument.createElementNS(NS, "text");
    lbl.setAttribute("class", "ac-hub-label");
    lbl.textContent = n.hub.value;
    gNodes.appendChild(lbl);

    return { circle: c, label: lbl };
  });

  const sim: Simulation<GNode, Link> = forceSimulation(allNodes)
    .force("link", forceLink<GNode, Link>(links).distance(40))
    .force("charge", forceManyBody<GNode>().strength(-80))
    .force("center", forceCenter(w / 2, hgt / 2))
    .force("xIso", forceX<GNode>((n) => (n.kind === "note" && n.isolated ? w * 0.92 : w / 2)).strength((n) => (n.kind === "note" && n.isolated ? 0.3 : 0)))
    .force("yIso", forceY<GNode>(() => hgt / 2).strength((n) => (n.kind === "note" && n.isolated ? 0.05 : 0)));
  sim.on("tick", () => {
    links.forEach((l, i) => {
      lineEls[i].setAttribute("x1", String(l.source.x)); lineEls[i].setAttribute("y1", String(l.source.y));
      lineEls[i].setAttribute("x2", String(l.target.x)); lineEls[i].setAttribute("y2", String(l.target.y));
    });
    noteNodes.forEach((n, i) => { circleEls[i].setAttribute("cx", String(n.x)); circleEls[i].setAttribute("cy", String(n.y)); });
    hubNodes.forEach((n, i) => {
      const r = hubR(n.hub.count);
      hubEls[i].circle.setAttribute("cx", String(n.x));
      hubEls[i].circle.setAttribute("cy", String(n.y));
      hubEls[i].label.setAttribute("x", String((n.x ?? 0) + r + 2));
      hubEls[i].label.setAttribute("y", String((n.y ?? 0) + 4));
    });
  });

  renderLegend(host, used);
  return sim;
}

// `notes` is MemoryNote[], so project is read directly as n.project.
function renderLegend(host: HTMLElement, notes: MemoryNote[]): void {
  const legend = activeDocument.createElement("div"); legend.className = "ac-legend";
  const projects = [...new Set(notes.map((n) => n.project).filter((p): p is string => !!p))].sort();
  for (const p of projects) {
    const row = activeDocument.createElement("div"); row.className = "ac-legend-row";
    const sw = activeDocument.createElement("span"); sw.className = "ac-swatch";
    sw.style.background = projectColor(p); row.appendChild(sw);
    row.appendChild(activeDocument.createTextNode(p)); legend.appendChild(row);
  }
  const note = activeDocument.createElement("div"); note.className = "ac-legend-note";
  note.textContent = "Dim = superseded/expired/isolated · edge = related memory";
  legend.appendChild(note);
  host.appendChild(legend);
}
