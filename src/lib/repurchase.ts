import { payForPlan, type PayResult } from "@/lib/payments";

/**
 * Buying again when we already know where the customer trains.
 *
 * A first purchase has to ask: which society, which day pattern, which slot.
 * A renewal — or an existing customer moving to a longer plan — has already
 * answered all of that, and the answer does not change. Asking again is a
 * checkout step that can only produce the same values it started with, so
 * this reuses the assignment from their last plan and goes straight to the
 * gateway. Only the price differs between plans.
 *
 * The assignment is copied from the customer's own previous plan row, never
 * from anything the browser supplies, and the new row is still born unpaid —
 * a verified payment is what activates it, exactly as in the full flow.
 */

export type Mode = "online" | "offline";
export type TrainingType = "group" | "personal";

export interface PlanRow {
  id?: string;
  training_mode?: string | null;
  training_type?: string | null;
  society_id?: string | null;
  day_set_id?: string | null;
  training_days?: string[] | null;
  time_slot?: string | null;
  trainer_id?: string | null;
  booking_request_id?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
}

export interface OptionRow {
  id: string;
  class_mode?: string | null;
  training_type?: string | null;
  total_sessions?: number | null;
  duration_months?: number | null;
  price?: number | string | null;
}

export interface Assignment {
  mode: Mode;
  type: TrainingType;
  society_id: string | null;
  day_set_id: string | null;
  training_days: string[];
  time_slot: string | null;
  trainer_id: string | null;
  booking_request_id: string | null;
}

export const optionMode = (o: OptionRow): Mode =>
  (o.class_mode ?? "offline") === "online" ? "online" : "offline";

export const optionType = (o: OptionRow): TrainingType =>
  (o.training_type ?? "group") === "personal" ? "personal" : "group";

/** Read the where/when out of a plan row. */
export function assignmentFromPlan(plan: PlanRow | null | undefined): Assignment | null {
  if (!plan) return null;
  const days = (plan.training_days ?? []).filter(Boolean);
  if (!days.length) return null;
  return {
    mode: plan.training_mode === "online" ? "online" : "offline",
    type: plan.training_type === "personal" ? "personal" : "group",
    society_id: plan.society_id ?? null,
    day_set_id: plan.day_set_id ?? null,
    training_days: days,
    time_slot: plan.time_slot ?? null,
    trainer_id: plan.trainer_id ?? null,
    booking_request_id: plan.booking_request_id ?? null,
  };
}

/**
 * Of all the customer's plans, the one whose assignment we should carry
 * forward: the most recent that actually has a schedule. A plan they paid for
 * beats an abandoned checkout, because an abandoned checkout may have been a
 * half-finished attempt at something they decided against.
 */
export function latestAssignment(plans: PlanRow[]): Assignment | null {
  const withSchedule = plans.filter((p) => (p.training_days ?? []).filter(Boolean).length > 0);
  const paid = withSchedule.filter((p) => p.payment_status == null || p.payment_status === "success");
  const pool = paid.length ? paid : withSchedule;
  const newest = [...pool].sort(
    (a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  )[0];
  return assignmentFromPlan(newest);
}

/**
 * Can this customer buy this plan without being asked anything?
 *
 * Only when the new plan runs the same way as the old one. Switching offline →
 * online has no society to carry over; switching group → personal is a
 * different slot entirely. Those still go through the booking flow, because
 * there is a genuine question to ask.
 */
export function canSkipBooking(
  assignment: Assignment | null,
  option: OptionRow | null | undefined,
): boolean {
  if (!assignment || !option) return false;
  if (assignment.mode !== optionMode(option)) return false;
  if (assignment.type !== optionType(option)) return false;
  if (!assignment.training_days.length) return false;
  if (assignment.mode === "online") return !!assignment.booking_request_id;
  if (!assignment.time_slot) return false;
  // A group class happens at a society; personal training may be booked
  // without one until an admin places the client.
  if (assignment.type === "group" && !assignment.society_id) return false;
  return true;
}

/** The unpaid plan row a repurchase creates. Exported for testing. */
export function repurchaseRow(args: {
  userId: string;
  option: OptionRow;
  assignment: Assignment;
  today: string;
}): Record<string, unknown> {
  const { userId, option, assignment, today } = args;
  return {
    user_id: userId,
    plan_option_id: option.id,
    training_mode: assignment.mode,
    training_type: assignment.type,
    society_id: assignment.society_id,
    day_set_id: assignment.day_set_id,
    training_days: assignment.training_days,
    time_slot: assignment.time_slot,
    trainer_id: assignment.trainer_id,
    booking_request_id: assignment.booking_request_id,
    total_sessions: option.total_sessions ?? 0,
    duration_months: option.duration_months ?? null,
    start_date: today,
    // Placeholders. The real term is set server-side from duration_months
    // when the payment is verified.
    end_date: today,
    renewal_date: today,
    amount: Number(option.price ?? 0),
    // Born unpaid and stopped, like every other checkout: an abandoned
    // renewal must not read as a running plan or unlock pause classes.
    status: "stopped",
    payment_status: "pending",
  };
}

export type RepurchaseResult = PayResult | { status: "not_eligible" };

/**
 * Create the unpaid plan and open the gateway. One call, no intermediate page.
 */
export async function repurchase(
  sb: { from: (t: string) => any },
  args: { userId: string; option: OptionRow; assignment: Assignment | null; today?: string },
): Promise<RepurchaseResult> {
  const { userId, option, assignment } = args;
  if (!canSkipBooking(assignment, option)) return { status: "not_eligible" };

  const today = args.today ?? new Date().toISOString().slice(0, 10);
  const row = repurchaseRow({ userId, option, assignment: assignment!, today });

  // Closing the gateway and pressing Renew again must not leave a trail of
  // abandoned plans behind. An unpaid checkout for this same plan is that
  // same attempt, so reuse it — one pending row per plan, however many times
  // they change their mind. A paid plan is never touched here.
  const { data: open } = await sb
    .from("plans")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_option_id", option.id)
    .eq("payment_status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open?.id) {
    const { error: upErr } = await sb
      .from("plans")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", open.id)
      .neq("payment_status", "success");
    if (upErr) throw new Error(upErr.message);
    return await payForPlan(open.id);
  }

  const { data: created, error } = await sb
    .from("plans")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!created?.id) throw new Error("Couldn't start your renewal. Please try again.");

  return await payForPlan(created.id);
}
