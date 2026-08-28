/**
 * Duration-based subscription term.
 *
 * A 3-month plan bought on 24 Aug runs to 23 Nov — the last day INSIDE the
 * term, not the anniversary. Sessions are never generated past this date, so a
 * plan expires on schedule even if sessions remain unused.
 */
export function subscriptionTerm(startISO: string, months: number): { start: string; end: string } {
  const start = startISO.slice(0, 10);
  const d = new Date(start + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Rolling a month onto a shorter one (31 Jan + 1 month) overflows into the
  // next month; clamp back to the last valid day instead.
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  d.setUTCDate(d.getUTCDate() - 1);
  return { start, end: d.toISOString().slice(0, 10) };
}

/**
 * When a newly bought term should begin.
 *
 * Buying while a plan is still running ADDS time, it does not restart it:
 * dating the new term from today would silently discard whatever was left on
 * the plan they are already paying for. So it begins the day after the current
 * one ends. With nothing running — or a plan that has already finished — it
 * begins on the purchase date.
 */
export function termStart(purchaseDate: string, currentEnd?: string | null): string {
  const start = purchaseDate.slice(0, 10);
  if (!currentEnd || currentEnd < start) return start;
  const d = new Date(currentEnd.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
