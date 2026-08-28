import { calculatePlanEndDate, calculatePlanRenewalDate, isoDate } from "@/lib/sessionPlan";
import type { BookingRequest } from "@/lib/bookingRequests";
import { writePlanCompat } from "@/lib/subscription";

/**
 * Keeps an online booking's `plans` row in step with the booking.
 *
 * The calendar, active-plan card, session counts and billing are all derived
 * from `plans` — that is the single source of truth for both offline and
 * online. Offline customers get their row from Admin → Customer → Plan; online
 * bookings are self-service, so the row is created here from the booking's own
 * batch schedule instead of a second, online-only calendar system.
 *
 * Idempotent: it updates the customer's existing open plan rather than adding
 * another, so re-saving a booking can't create duplicate plans or sessions.
 */
export async function syncPlanForOnlineBooking(
  sb: { from: (t: string) => any },
  booking: Pick<
    BookingRequest,
    "user_id" | "plan_option_id" | "preferred_days" | "status" | "training_mode"
  > & Partial<Pick<BookingRequest, "id" | "training_type">>,
  opts?: {
    startDate?: string | null;
    /**
     * "pending" when the payment gateway is live — the plan is created unpaid
     * and only /api/payments/verify may mark it success. Omitted (null) when
     * the gateway is off, which means money is collected outside the app, the
     * way every plan works today.
     */
    paymentStatus?: "pending" | null;
  }
): Promise<{ error: string | null; planId?: string }> {
  if (booking.training_mode !== "online") return { error: null };

  // A cancelled booking must not keep generating future sessions — but a plan
  // the customer already PAID for is not cancellable as a side effect of an
  // admin closing a booking. Purchased plans run their full term; ending one
  // early is a deliberate, recorded decision made in Admin → Plan.
  //
  // So this only retires a plan that was never actually bought: a gateway
  // booking abandoned before payment went through.
  if (booking.status === "cancelled") {
    const { data: open } = await sb
      .from("plans")
      .select("id, payment_status")
      .eq("user_id", booking.user_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // NULL payment_status = collected outside the app, which counts as paid.
    const paid = !open || open.payment_status == null || open.payment_status === "success";
    if (open && !paid) {
      await sb.from("plans")
        .update({ status: "stopped", updated_at: new Date().toISOString() })
        .eq("id", open.id);
    }
    return { error: null };
  }

  if (!booking.plan_option_id) return { error: null };

  const { data: option } = await sb
    .from("plan_options")
    .select("id, name, price, duration_months, total_sessions")
    .eq("id", booking.plan_option_id).maybeSingle();
  if (!option) return { error: "Plan option not found" };

  const days = booking.preferred_days ?? [];
  const totalSessions = Number(option.total_sessions ?? 0);
  // Without a schedule or a session count there is nothing to lay out on a
  // calendar; leave the plan alone rather than writing a meaningless row.
  if (!days.length || totalSessions <= 0) return { error: null };

  const startDate = opts?.startDate || isoDate(new Date());
  const endDate = isoDate(calculatePlanEndDate(startDate, totalSessions, days));
  // plans.renewal_date is NOT NULL — derive it the same way the offline plan
  // flow does (first training day after the plan ends).
  const renewalDate = isoDate(calculatePlanRenewalDate(endDate, days));

  const payload: Record<string, unknown> = {
    user_id: booking.user_id,
    total_sessions: totalSessions,
    training_days: days,
    start_date: startDate,
    end_date: endDate,
    renewal_date: renewalDate,
    amount: Number(option.price ?? 0),
    status: "active",
    updated_at: new Date().toISOString(),

    // Subscription record. `end_date` moves when pauses extend the plan;
    // `original_end_date` preserves what was actually sold.
    original_end_date: endDate,
    plan_option_id: booking.plan_option_id,
    training_mode: "online",
    training_type: booking.training_type ?? null,
    booking_request_id: booking.id ?? null,

    // "pending" = awaiting the gateway. When the gateway is off the column is
    // omitted entirely so the database default (NULL, per 20260825110000)
    // applies, meaning "collected outside the app" — today's behaviour.
    // The trigger in 20260825120000 forbids this client from ever writing
    // "success", so a booking can never pay for itself.
    ...(opts?.paymentStatus ? { payment_status: opts.paymentStatus } : {}),
  };

  // Reuse the customer's current active plan if they have one — changing plan
  // or schedule updates it in place instead of stacking historical rows.
  const { data: existing } = await sb
    .from("plans").select("id, start_date")
    .eq("user_id", booking.user_id).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (existing) {
    // Keep the original start date so a mid-plan edit doesn't reset progress.
    const { error } = await writePlanCompat(
      sb, "update",
      { ...payload, start_date: existing.start_date ?? startDate },
      existing.id,
    );
    return { error, planId: existing.id };
  }

  const { error, id } = await writePlanCompat(sb, "insert", payload);
  return { error, planId: id };
}
