/** Weekday helpers for society day sets (fixed 3-day training patterns). */

export const WEEKDAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Group Training always runs three days a week. */
export const DAYS_PER_SET = 3;

const POS = new Map<string, number>(WEEKDAYS.map((d, i) => [d, i]));

/** Sorts days into weekday order so Thu/Sat/Tue and Tue/Thu/Sat are one set. */
export const sortDays = (days: string[]): string[] =>
  [...days].sort((a, b) => (POS.get(a) ?? 99) - (POS.get(b) ?? 99));

/** "Tuesday, Thursday, Saturday" → "Tue · Thu · Sat" */
export const daySetLabel = (days: string[]): string =>
  sortDays(days).map((d) => d.slice(0, 3)).join(" · ");

export interface DaySet {
  id: string;
  society_id: string;
  label: string | null;
  days: string[];
  active: boolean;
  sort_order: number;
}

/**
 * Validates a day set before it is saved or accepted from a customer.
 * Mirrors the DB constraints so bad input never reaches the database.
 */
export function validateDaySet(days: string[]): string | null {
  const unique = [...new Set(days)];
  if (unique.length !== days.length) return "A day can only appear once";
  if (days.length !== DAYS_PER_SET) return `Pick exactly ${DAYS_PER_SET} training days`;
  if (days.some((d) => !POS.has(d))) return "Invalid day";
  return null;
}

/**
 * Derives a society's day sets from the schedules its members already train on
 * (plans.training_days). This is the same analysis the society_day_sets
 * migration performs in SQL, and is used as a live fallback so day selection
 * works before that migration has been run.
 *
 * Only exact 3-day patterns count; days are normalised into weekday order so
 * "Thu, Sat, Tue" and "Tue, Thu, Sat" collapse into one set. Ordered by how
 * many members actually train that pattern.
 */
export async function deriveDaySetsFromPlans(
  sb: { from: (t: string) => any },
  societyId: string
): Promise<DaySet[]> {
  const { data: members } = await sb
    .from("profiles").select("id").eq("society_id", societyId);
  const ids = ((members ?? []) as { id: string }[]).map((m) => m.id);
  if (!ids.length) return [];

  const { data: plans } = await sb
    .from("plans").select("training_days").in("user_id", ids).not("training_days", "is", null);

  const counts = new Map<string, { days: string[]; uses: number }>();
  for (const p of (plans ?? []) as { training_days: string[] | null }[]) {
    const raw = p.training_days ?? [];
    const days = sortDays([...new Set(raw)]);
    if (validateDaySet(days)) continue; // skip ad-hoc / non-3-day schedules
    const key = days.join("|");
    const hit = counts.get(key);
    if (hit) hit.uses += 1;
    else counts.set(key, { days, uses: 1 });
  }

  return [...counts.values()]
    .sort((a, b) => b.uses - a.uses)
    .map((c, i) => ({
      id: `derived:${societyId}:${c.days.join("|")}`,
      society_id: societyId,
      label: daySetLabel(c.days),
      days: c.days,
      active: true,
      sort_order: i + 1,
    }));
}
