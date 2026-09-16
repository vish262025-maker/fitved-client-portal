/**
 * When a pause may be saved.
 *
 * A pause says "these classes will not happen". A customer or a trainer
 * saying that about a class that is already over would be rewriting history,
 * so from their screens a pause starts today or later.
 *
 * The admin is the exception, on purpose. Customers tell FitVed about a missed
 * class after the fact — Ashwani's 9–11 Sept pause was entered by the admin
 * on the 11th — and when the admin records it, it has to take effect: the
 * class comes off the count, the calendar shows it paused, the plan is
 * extended. (20260911120000 makes the database honour a pause that arrives
 * after its class was closed; 20260911130000 holds this same rule there.)
 *
 * Returns the message to show, or null when the dates are fine. Keep the
 * wording in step with pause_dates_guard().
 */
export function pauseDatesError(
  from: string,
  to: string,
  today: string,
  opts: { byAdmin?: boolean } = {},
): string | null {
  if (!from || !to) return "Pick both dates.";
  if (to < from) return "A pause must end on or after the day it starts.";
  if (!opts.byAdmin && from < today) {
    return "A pause can't start in the past. Pick today or a later date.";
  }
  return null;
}

/**
 * Was this pause put in by someone other than the customer — an admin or
 * their trainer? Those are FitVed's to change, not the customer's to delete.
 * Pauses from before created_by was recorded count as the customer's own.
 */
export function setByFitved(createdBy: string | null | undefined, customerId: string | null | undefined): boolean {
  return !!createdBy && !!customerId && createdBy !== customerId;
}
