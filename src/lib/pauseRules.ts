/**
 * When a pause may be saved.
 *
 * A pause says "these classes will not happen". Said about a class that is
 * already over, it rewrites history: the nightly job has closed that class as
 * taken, and a pause arriving afterwards either fails to take it back or —
 * once it does — hands the customer a carry-forward for a day that is gone.
 * Ashwani's 9–11 Sept pause was typed in at 11:47 on the 11th, from the admin
 * tab, which had no date limit at all.
 *
 * So a pause can only ever be about today or later — on every screen that
 * creates or edits one, and in the database (20260911130000) for anything
 * that doesn't come through a screen. Editing follows the same idea: only the
 * dates a change actually affects have to be today or later, so an admin can
 * still extend a running pause or end it early.
 *
 * Returns the message to show, or null when the dates are fine. Keep the
 * wording in step with pause_dates_guard() so the customer, the trainer and
 * the admin all hear the same thing.
 */
export function pauseDatesError(
  from: string,
  to: string,
  today: string,
  original?: { from: string; to: string } | null,
): string | null {
  if (!from || !to) return "Pick both dates.";
  if (to < from) return "A pause must end on or after the day it starts.";

  if (!original) {
    return from < today ? "A pause can't start in the past. Pick today or a later date." : null;
  }

  // Moving the start changes every day between the old and new start.
  if (from !== original.from && minIso(from, original.from) < today) {
    return "Past classes can't be changed. Only today or later dates can be moved.";
  }
  // Moving the end changes the days after the earlier of the two ends.
  if (to !== original.to && minIso(to, original.to) < prevDay(today)) {
    return "Past classes can't be changed. Only today or later dates can be moved.";
  }
  return null;
}

function minIso(a: string, b: string) { return a < b ? a : b; }
function prevDay(iso: string) {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
