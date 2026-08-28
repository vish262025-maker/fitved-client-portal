/**
 * Duration-based subscription term.
 *
 * Mirrors `api/_lib/term.ts` exactly. The server owns the term when a payment
 * is verified; admin actions that move a start date have to arrive at the same
 * end date, or the customer's plan silently changes length depending on which
 * side of the app touched it last.
 *
 * A 3-month plan starting 24 Aug runs to 23 Nov — the last day INSIDE the
 * term, not the anniversary.
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

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

/** Weekday name for an ISO date, matching how training days are stored. */
export function weekdayOf(iso: string): string {
  return DAY_NAMES[new Date(iso + "T00:00:00Z").getUTCDay()];
}

/**
 * The day a plan should begin.
 *
 * Tomorrow — the first day a trainer could actually turn up — unless a class
 * falls on that very day. A plan whose start date is also its first class
 * reads as though the customer already owes a session before anything has
 * begun, so it starts the day after instead and the first class comes cleanly
 * inside the term.
 */
export function planStartDate(trainingDays: string[], today?: string): string {
  const first = tomorrowISO(today);
  if (!trainingDays?.length) return first;
  return trainingDays.includes(weekdayOf(first)) ? tomorrowISO(first) : first;
}

/** Tomorrow, in ISO date form. */
export function tomorrowISO(today?: string): string {
  const d = new Date((today ?? new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
