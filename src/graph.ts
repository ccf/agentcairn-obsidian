import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY,
  Simulation, SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import { buildGraph, GraphEdge } from "./query";
import { projectColor, nodeRadius, currencyOpacity } from "./viz";
import type { MemoryNote } from "./model";

interface Node extends SimulationNodeDatum { path: string; note: MemoryNote; isolated: boolean; }
interface Link extends SimulationLinkDatum<Node> { source: Node; target: Node; }

const NS = "http://www.w3.org/2000/svg";

export function renderGraph(
  host: HTMLElement,
  notes: MemoryNote[],
  onClick: (path: string) => void,
  onBackgroundClick: () => void = () => {},
): Simulation<Node, Link> {
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
  // Clicking empty canvas (not a node) clears the selection and returns provenance to the active note.
  svg.addEventListener("click", (e) => { if (e.target === svg) onBackgroundClick(); });
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
    .force("xIso", forceX<Node>((n) => (n.isolated ? w * 0.92 : w / 2)).strength((n) => (n.isolated ? 0.3 : 0)))
    .force("yIso", forceY<Node>(() => hgt / 2).strength((n) => (n.isolated ? 0.05 : 0)));
  sim.on("tick", () => {
    links.forEach((l, i) => {
      lineEls[i].setAttribute("x1", String(l.source.x)); lineEls[i].setAttribute("y1", String(l.source.y));
      lineEls[i].setAttribute("x2", String(l.target.x)); lineEls[i].setAttribute("y2", String(l.target.y));
    });
    nodes.forEach((n, i) => { circleEls[i].setAttribute("cx", String(n.x)); circleEls[i].setAttribute("cy", String(n.y)); });
  });

  renderLegend(host, used);
  return sim;
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
