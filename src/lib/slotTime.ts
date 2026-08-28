/**
 * Slot times, written the one way the whole app compares them.
 *
 * Every availability check — trainer conflicts, off-day matching — compares
 * slot strings, so they have to be composed identically wherever a customer
 * or an admin enters one.
 */

/** "14:00" → "2:00 PM". Empty in, empty out. */
export function to12h(v: string): string {
  if (!v) return "";
  const [H, M] = v.split(":").map(Number);
  if (Number.isNaN(H) || Number.isNaN(M)) return "";
  const period = H >= 12 ? "PM" : "AM";
  const h = H % 12 === 0 ? 12 : H % 12;
  return `${h}:${String(M).padStart(2, "0")} ${period}`;
}

/**
 * One hour after the given 24h time, wrapping past midnight.
 *
 * A class is an hour by default, so choosing a start is enough to imply an
 * end — the customer only touches the second field if theirs is different.
 */
export function plusOneHour(v: string): string {
  if (!v) return "";
  const [H, M] = v.split(":").map(Number);
  if (Number.isNaN(H) || Number.isNaN(M)) return "";
  return `${String((H + 1) % 24).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}

/** "7:00 AM – 8:00 AM", or "" until both ends are set. */
export function composeSlot(start: string, end: string): string {
  return start && end ? `${to12h(start)} – ${to12h(end)}` : "";
}
