import { forceSimulation, forceLink, forceManyBody, forceCenter, Simulation, SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import { buildGraph, GraphEdge } from "./query";
import type { MemoryNote } from "./model";

function colorFor(key: string | undefined): string {
  if (!key) return "var(--text-muted)";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}
interface Node extends SimulationNodeDatum { path: string; note: MemoryNote; }
interface Link extends SimulationLinkDatum<Node> { source: Node; target: Node; }

export function renderGraph(host: HTMLElement, notes: MemoryNote[], onClick: (path: string) => void): void {
  host.empty?.() ?? (host.innerHTML = "");
  const MAX = 2000;
  const used = notes.length > MAX ? notes.slice(0, MAX) : notes;
  if (notes.length > MAX) {
    const d = document.createElement("div"); d.className = "ac-empty";
    d.textContent = `Showing first ${MAX} of ${notes.length} notes.`; host.appendChild(d);
  }
  const { edges } = buildGraph(used);
  const nodes: Node[] = used.map((n) => ({ path: n.path, note: n }));
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  const links: Link[] = edges.map((e: GraphEdge) => ({ source: byPath.get(e.source)!, target: byPath.get(e.target)! }));

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "ac-graph");
  const w = host.clientWidth || 600, hgt = host.clientHeight || 400;
  svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`); host.appendChild(svg);
  const gLinks = document.createElementNS(NS, "g"); const gNodes = document.createElementNS(NS, "g");
  svg.appendChild(gLinks); svg.appendChild(gNodes);

  const lineEls = links.map((l) => {
    const ln = document.createElementNS(NS, "line"); ln.setAttribute("stroke", "var(--background-modifier-border)");
    if (l.source.note.currency !== "current" || l.target.note.currency !== "current") ln.setAttribute("stroke-dasharray", "3,3");
    gLinks.appendChild(ln); return ln;
  });
  const circleEls = nodes.map((n) => {
    const c = document.createElementNS(NS, "circle"); c.setAttribute("r", "6"); c.setAttribute("fill", colorFor(n.note.project));
    if (n.note.currency !== "current") c.setAttribute("opacity", "0.45");
    c.addEventListener("click", () => onClick(n.path));
    const t = document.createElementNS(NS, "title"); t.textContent = `${n.note.title}${n.note.project ? ` · ${n.note.project}` : ""}`;
    c.appendChild(t); gNodes.appendChild(c); return c;
  });

  const sim: Simulation<Node, Link> = forceSimulation(nodes)
    .force("link", forceLink<Node, Link>(links).distance(40))
    .force("charge", forceManyBody<Node>().strength(-80))
    .force("center", forceCenter(w / 2, hgt / 2));
  const fitViewBox = () => {
    if (!nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const x = n.x ?? 0, y = n.y ?? 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const pad = 24;
    const vw = Math.max(maxX - minX, 1) + pad * 2;
    const vh = Math.max(maxY - minY, 1) + pad * 2;
    svg.setAttribute("viewBox", `${minX - pad} ${minY - pad} ${vw} ${vh}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  };
  sim.on("tick", () => {
    links.forEach((l, i) => {
      lineEls[i].setAttribute("x1", String(l.source.x)); lineEls[i].setAttribute("y1", String(l.source.y));
      lineEls[i].setAttribute("x2", String(l.target.x)); lineEls[i].setAttribute("y2", String(l.target.y));
    });
    nodes.forEach((n, i) => { circleEls[i].setAttribute("cx", String(n.x)); circleEls[i].setAttribute("cy", String(n.y)); });
    fitViewBox();
  });
}
