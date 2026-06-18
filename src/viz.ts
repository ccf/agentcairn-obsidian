import type { Currency } from "./model";

/** Deterministic name→HSL hue (mirrors the pre-cut colorFor); muted when no project. */
export function projectColor(key: string | undefined): string {
  if (!key) return "var(--text-muted)";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

const R_MIN = 4, R_MAX = 10, R_DEFAULT = 6;
/** Importance 0..1 → radius band; missing → default; clamped. */
export function nodeRadius(importance: number | undefined): number {
  if (importance == null || Number.isNaN(importance)) return R_DEFAULT;
  const clamped = Math.max(0, Math.min(1, importance));
  return R_MIN + clamped * (R_MAX - R_MIN);
}

/** Current = full; superseded/expired/not_yet_valid = dimmed. */
export function currencyOpacity(c: Currency): number {
  return c === "current" ? 1 : 0.45;
}
