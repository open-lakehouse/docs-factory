// Where a blog post stands against its target release date.
export type DateFlag = "released" | "overdue" | "soon" | "scheduled" | "unscheduled";

/** "Soon" means a target within this many days. */
export const SOON_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Target dates are UTC calendar dates; compare against today's UTC date. */
export function dateFlag(target: Date | undefined, released: boolean, now: Date): DateFlag {
  if (released) return "released";
  if (!target) return "unscheduled";
  const days = daysUntil(target, now);
  if (days < 0) return "overdue";
  if (days <= SOON_DAYS) return "soon";
  return "scheduled";
}

/** Whole days from today (UTC) to the target; negative when past. */
export function daysUntil(target: Date, now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target.getTime() - today) / DAY_MS);
}
