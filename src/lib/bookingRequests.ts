/**
 * Booking requests — a paid customer request awaiting an admin action.
 * Currently drives Offline Personal Training, where the admin assigns the
 * trainer after payment (the customer never picks one).
 */

export type BookingStatus =
  | "pending_trainer_assignment"
  | "trainer_assigned"
  | "training_ongoing"
  | "completed"
  | "cancelled";

export const OPEN_STATUSES: BookingStatus[] = ["pending_trainer_assignment", "trainer_assigned"];

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_trainer_assignment: "Pending trainer assignment",
  trainer_assigned: "Trainer assigned",
  training_ongoing: "Training ongoing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export interface BookingRequest {
  id: string;
  user_id: string;
  plan_option_id: string | null;
  assigned_admin_id: string | null;
  training_mode: "offline" | "online";
  training_type: "personal" | "group";
  /** Online bookings join an admin-configured batch/slot; null when offline. */
  batch_id?: string | null;
  preferred_days: string[] | null;
  preferred_time: string | null;
  society_name: string | null;
  address: string | null;
  payment_ref: string | null;
  payment_status: string;
  status: BookingStatus;
  trainer_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  created_at: string;
}

/** Human-readable "Mon, Wed, Fri – 7:00 PM". */
export function slotSummary(days: string[] | null, time: string | null): string {
  const d = (days ?? []).map((x) => x.slice(0, 3)).join(", ");
  if (d && time) return `${d} – ${time}`;
  return d || time || "—";
}

/**
 * Server-side guard for trainer assignment. Re-checks everything the UI claims,
 * so an assignment can never be forced through by a crafted client call:
 *  - the trainer really belongs to this request's admin (no cross-admin assign)
 *  - the trainer is active
 *  - the trainer has no other commitment at the customer's chosen slot
 *
 * Returns an error message, or null when the assignment is allowed.
 */
export async function validateAssignment(
  sb: { from: (t: string) => any },
  req: Pick<BookingRequest, "id" | "assigned_admin_id" | "preferred_time">,
  trainerId: string
): Promise<string | null> {
  // Re-read the request: another admin (or another tab) may have rejected or
  // completed it since this screen was rendered.
  const { data: live } = await sb
    .from("booking_requests")
    .select("status, assigned_admin_id")
    .eq("id", req.id)
    .maybeSingle();
  if (!live) return "That request no longer exists.";
  if (!OPEN_STATUSES.includes(live.status)) {
    return `This request is ${STATUS_LABEL[live.status as BookingStatus] ?? live.status} and can no longer be assigned.`;
  }
  if (live.assigned_admin_id !== req.assigned_admin_id) {
    return "This request now belongs to a different admin.";
  }

  const { data: trainer } = await sb
    .from("trainers")
    .select("id, name, active, assigned_admin_id")
    .eq("id", trainerId)
    .maybeSingle();

  if (!trainer) return "That trainer no longer exists.";
  if (trainer.active === false) return `${trainer.name} is no longer active.`;
  if (!req.assigned_admin_id || trainer.assigned_admin_id !== req.assigned_admin_id) {
    return "That trainer belongs to a different admin.";
  }

  const conflict = await trainerConflictAt(sb, trainerId, req.preferred_time, req.id);
  return conflict;
}

/**
 * Why a trainer can't take a given slot, or null if they're free.
 * A trainer is busy if they already run a society batch at that time, or are
 * already assigned to another open booking at the same time.
 */
export async function trainerConflictAt(
  sb: { from: (t: string) => any },
  trainerId: string,
  time: string | null,
  ignoreRequestId?: string
): Promise<string | null> {
  if (!time) return null;

  const { data: batches } = await sb
    .from("trainer_slots").select("time_slot").eq("trainer_id", trainerId);
  if (((batches ?? []) as { time_slot: string | null }[]).some((b) => b.time_slot === time)) {
    return "Already running a group batch at this time";
  }

  const { data: booked } = await sb
    .from("booking_requests")
    .select("id, preferred_time, status")
    .eq("trainer_id", trainerId)
    .in("status", OPEN_STATUSES);
  const clash = ((booked ?? []) as any[]).some(
    (b) => b.preferred_time === time && b.id !== ignoreRequestId
  );
  return clash ? "Already assigned to another client at this time" : null;
}
