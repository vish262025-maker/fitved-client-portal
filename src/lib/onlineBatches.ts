import { sortDays, daySetLabel } from "@/lib/daySets";

/**
 * Online offerings. A "batch" seats several customers (group training); a
 * "slot" is the same shape with capacity 1 (1-to-1 personal training).
 * Both live in `online_batches` and are configured by the admin.
 */
export interface OnlineBatch {
  id: string;
  assigned_admin_id: string;
  training_type: "group" | "personal";
  name: string | null;
  trainer_id: string | null;
  days: string[];
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
  active: boolean;
  sort_order: number;
}

/**
 * "7:00 AM – 8:00 AM", or "" when the admin hasn't set times yet.
 *
 * Null-tolerant on purpose: callers routinely hold "the batch currently
 * selected", which is null while the list is still loading and for any offline
 * row. Throwing there takes the whole page white, so an absent batch simply
 * has no timing to report.
 */
export const batchTiming = (
  b: Pick<OnlineBatch, "start_time" | "end_time"> | null | undefined,
): string =>
  !b ? "" : b.start_time && b.end_time ? `${b.start_time} – ${b.end_time}` : (b.start_time ?? "");

/** "Mon · Wed · Fri" */
export const batchDays = (b: Pick<OnlineBatch, "days">): string => daySetLabel(b.days ?? []);

/** Fallback display name so a batch always reads sensibly. */
export const batchName = (b: OnlineBatch): string =>
  b.name?.trim() || `${batchDays(b)}${batchTiming(b) ? ` · ${batchTiming(b)}` : ""}`;

/** Seats left, or null when the batch is uncapped. */
export const seatsLeft = (b: OnlineBatch, taken: number): number | null =>
  b.capacity == null ? null : Math.max(0, b.capacity - taken);

/** A customer may only join an active batch that still has room. */
export const isJoinable = (b: OnlineBatch, taken: number): boolean => {
  if (!b.active) return false;
  const left = seatsLeft(b, taken);
  return left == null || left > 0;
};

/**
 * Guard run before a booking is written. Mirrors the UI rules so a stale page
 * or a crafted call can't join a full, inactive or foreign-admin batch.
 */
export async function validateBatchJoin(
  sb: { from: (t: string) => any },
  batchId: string,
  adminId: string | null,
  trainingType: "group" | "personal"
): Promise<{ error: string | null; batch?: OnlineBatch }> {
  const { data: batch } = await sb
    .from("online_batches").select("*").eq("id", batchId).maybeSingle();

  if (!batch) return { error: "That option is no longer available." };
  if (!batch.active) return { error: "That option is no longer available." };
  if (batch.training_type !== trainingType) return { error: "That option doesn't match this plan." };
  if (adminId && batch.assigned_admin_id !== adminId) {
    return { error: "That option isn't available for your account." };
  }

  if (batch.capacity != null) {
    const { data: taken } = await sb
      .from("booking_requests").select("id")
      .eq("batch_id", batchId)
      .in("status", ["pending_trainer_assignment", "trainer_assigned", "training_ongoing"]);
    if ((taken ?? []).length >= batch.capacity) {
      return { error: "That batch just filled up. Please pick another." };
    }
  }
  return { error: null, batch: batch as OnlineBatch };
}

export { sortDays };
