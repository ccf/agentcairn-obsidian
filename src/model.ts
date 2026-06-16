export type Currency = "current" | "superseded" | "expired" | "not_yet_valid";

export interface MemoryNote {
  path: string; title: string; project?: string; harness?: string; session?: string;
  importance?: number; created?: string; tags: string[];
  validFrom?: string; validUntil?: string; supersededBy?: string;
  currency: Currency; links: string[];
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && !Number.isNaN(v) ? v : undefined);

function parseDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function computeCurrency(
  n: { validFrom?: string; validUntil?: string; supersededBy?: string }, now: Date
): Currency {
  if (n.supersededBy) return "superseded";
  const vu = parseDate(n.validUntil);
  if (vu && now.getTime() >= vu.getTime()) return "expired";
  const vf = parseDate(n.validFrom);
  if (vf && vf.getTime() > now.getTime()) return "not_yet_valid";
  return "current";
}

export function parseMemoryNote(
  fm: Record<string, unknown>, path: string, title: string, linkTargets: string[], now: Date
): MemoryNote | null {
  if (fm?.type !== "memory") return null;
  const tags = Array.isArray(fm.tags) ? fm.tags.filter((t): t is string => typeof t === "string") : [];
  const source = str(fm.source);
  const m = source?.match(/^memory:\/\/session\/(.+)$/);
  const base = { validFrom: str(fm.valid_from), validUntil: str(fm.valid_until), supersededBy: str(fm.superseded_by) };
  return {
    path, title: str(fm.title) ?? title, project: str(fm.project), harness: str(fm.harness),
    session: m ? m[1] : undefined, importance: num(fm.importance), created: str(fm.created), tags,
    ...base, currency: computeCurrency(base, now), links: linkTargets,
  };
}
