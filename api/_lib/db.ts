import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_ROLE_KEY } from "./env.js";
import { subscriptionTerm } from "./term.js";

/**
 * Service-role client. This is the only identity allowed to mark a
 * subscription paid — the browser holds the anon key, and the database trigger
 * from migration 20260825120000 rejects payment writes from that role.
 */
export function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface ActivationResult {
  status: "activated" | "already_active" | "not_found" | "error";
  planId?: string;
  error?: string;
}

/**
 * Turn a verified payment into an active subscription.
 *
 * Idempotent by design, because it runs from two independent callers: the
 * browser's verify call and Razorpay's webhook. Whichever arrives first wins
 * and the other becomes a no-op — so a customer who closes the tab mid-redirect
 * still ends up activated, and one who doesn't is never charged into two plans.
 *
 * The plan is located by `razorpay_order_id`, never by an id the client sent.
 */
export async function activateFromOrder(
  sb: ReturnType<typeof admin>,
  input: { orderId: string; paymentId: string; amountPaise?: number; method?: string | null },
): Promise<ActivationResult> {
  const { data: plan, error } = await (sb as any)
    .from("plans")
    .select("id, user_id, amount, payment_status, start_date, plan_option_id, training_mode, training_type, batch_id, trainer_id, society_id, time_slot, training_days")
    .eq("razorpay_order_id", input.orderId)
    .maybeSingle();

  if (error) return { status: "error", error: error.message };
  if (!plan) return { status: "not_found" };

  // Replay: the webhook and the browser both reported the same payment.
  if (plan.payment_status === "success") {
    // Generation is idempotent, so re-running it costs nothing and repairs a
    // subscription whose first attempt failed part-way.
    await (sb as any).rpc("generate_sessions", { _plan_id: plan.id });
    return { status: "already_active", planId: plan.id };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  // What Razorpay actually captured, in rupees. The client's `amount` is not
  // trusted — the order was priced from the catalogue — so the subscription is
  // corrected to the charged figure or admin shows one price and billing another.
  const charged = input.amountPaise != null ? input.amountPaise / 100 : null;

  // Duration-based term: a 3-month plan ends 3 months after it starts, whether
  // or not every session was used.
  const patch: Record<string, unknown> = {
    payment_status: "success",
    razorpay_payment_id: input.paymentId,
    activated_at: nowIso,
    status: "active",
    updated_at: nowIso,
    ...(charged != null && charged > 0 ? { amount: charged } : {}),
  };

  /** See below: a personal plan's term begins when its trainer is assigned. */
  const startsOnAssignment = plan.training_type === "personal" && !plan.trainer_id;

  if (plan.plan_option_id) {
    const { data: option } = await (sb as any)
      .from("plan_options")
      .select("duration_months, total_sessions")
      .eq("id", plan.plan_option_id)
      .maybeSingle();

    const months = Number(option?.duration_months ?? 0);
    const start = plan.start_date ?? nowIso.slice(0, 10);
    /**
     * A personal plan does not START at payment.
     *
     * It has no trainer and no confirmed schedule until an admin arranges one,
     * so dating the term from the payment would burn days the customer cannot
     * train on — and show them a running plan, a progress ring and a calendar
     * for classes nobody is teaching. The term is set when the trainer is
     * assigned, counted from the first day they can actually attend.
     *
     * Group plans are unaffected: their trainer and schedule already exist.
     */
    // The duration is a property of the plan they bought, so record it either
    // way — only the DATES wait for the trainer.
    if (months > 0) patch.duration_months = months;

    if (months > 0 && !startsOnAssignment) {
      const term = subscriptionTerm(start, months);
      patch.start_date = term.start;
      patch.end_date = term.end;
      patch.original_end_date = term.end;
    }
    if (option?.total_sessions) patch.total_sessions = Number(option.total_sessions);

    if (plan.training_mode === "online") {
      // The batch carries the trainer, days and times for both group and
      // personal online training.
      if (plan.batch_id && !plan.trainer_id) {
        const { data: batch } = await (sb as any)
          .from("online_batches").select("trainer_id, days").eq("id", plan.batch_id).maybeSingle();
        if (batch?.trainer_id) patch.trainer_id = batch.trainer_id;
        if (batch?.days?.length) patch.training_days = batch.days;
      }
    } else if (
      plan.training_type !== "personal" &&
      plan.society_id && plan.time_slot && !plan.trainer_id
    ) {
      // Offline GROUP: the trainer is whoever runs that slot in that society.
      //
      // Offline PERSONAL is deliberately excluded. It books a society and a
      // time like a group plan does, so without this guard it matched the
      // trainer_slots row for that slot and silently inherited the GROUP
      // trainer — the personal booking never reached the admin queue, and a
      // trainer acquired a one-to-one client nobody had assigned them. An
      // admin assigns it after payment; until then it stays unassigned.
      const { data: slotRow } = await (sb as any)
        .from("trainer_slots").select("trainer_id")
        .eq("society_id", plan.society_id).eq("time_slot", plan.time_slot)
        .limit(1).maybeSingle();
      if (slotRow?.trainer_id) patch.trainer_id = slotRow.trainer_id;
    }
  }

  const { error: upErr } = await (sb as any)
    .from("plans").update(patch).eq("id", plan.id)
    // Guard against a concurrent activation between the read and the write.
    .neq("payment_status", "success");

  if (upErr) return { status: "error", error: upErr.message };

  // Money ledger. The unique index on razorpay_payment_id makes a duplicate
  // insert fail harmlessly rather than double-counting revenue.
  const rupees = charged ?? Number(plan.amount ?? 0);
  const { error: billErr } = await (sb as any).from("billing_history").insert({
    user_id: plan.user_id,
    plan_id: plan.id,
    payment_date: nowIso.slice(0, 10),
    amount: rupees,
    type: "payment",
    method: input.method ?? "razorpay",
    currency: "INR",
    razorpay_order_id: input.orderId,
    razorpay_payment_id: input.paymentId,
    notes: "Online payment",
  });
  if (billErr && !/duplicate key|unique/i.test(billErr.message)) {
    // Never fail the activation over the ledger — the customer has paid.
    console.warn("billing_history insert failed:", billErr.message);
  }

  // Mirror the assignment onto the customer's profile. The society, slot and
  // trainer chosen at checkout only lived on the plan, so the customer's
  // profile still read "no society / no time slot / no trainer" — which is
  // what made their dashboard say "Your society" and find no batches.
  // Online customers deliberately get no society: that is an offline concept.
  {
    const prof: Record<string, unknown> = {};
    if (patch.trainer_id ?? plan.trainer_id) prof.trainer_id = patch.trainer_id ?? plan.trainer_id;
    if (plan.training_mode === "online") {
      // Online has no society, but it does have a time: the batch's. Without
      // it the customer's profile showed "SCHEDULE —" after paying, and their
      // dashboard had no time to put against the next session.
      const bid = patch.batch_id ?? plan.batch_id;
      if (bid) {
        const { data: b } = await (sb as any)
          .from("online_batches").select("start_time, end_time").eq("id", bid).maybeSingle();
        if (b?.start_time && b?.end_time) prof.time_slot = `${b.start_time} – ${b.end_time}`;
      }
      // Their mode is now settled by what they bought.
      prof.class_mode = "online";
    } else {
      prof.class_mode = "offline";
      if (plan.society_id) {
        prof.society_id = plan.society_id;
        // profiles keeps a denormalised society NAME alongside the id; the
        // dashboard reads the name, so writing only the id leaves it blank.
        const { data: soc } = await (sb as any)
          .from("societies").select("name").eq("id", plan.society_id).maybeSingle();
        if (soc?.name) prof.society = soc.name;
      }
      if (plan.time_slot) prof.time_slot = plan.time_slot;
    }
    if (Object.keys(prof).length) {
      const { error: pErr } = await (sb as any)
        .from("profiles").update(prof).eq("id", plan.user_id);
      if (pErr) console.warn("profile assignment mirror failed:", pErr.message);
    }
  }

  // Lay out the calendar. Idempotent, so the webhook arriving after the
  // browser's verify call simply re-affirms the same rows.
  //
  // Skipped while a personal plan waits on its trainer: there is no confirmed
  // schedule to lay out yet, and generating from placeholder dates would put
  // classes on the customer's calendar that nobody is teaching.
  if (!startsOnAssignment) {
    const { error: genErr } = await (sb as any).rpc("generate_sessions", { _plan_id: plan.id });
    if (genErr) console.warn("session generation failed:", genErr.message);
  }

  return { status: "activated", planId: plan.id };
}

/** Records a failed or abandoned attempt without touching an active plan. */
export async function markPaymentFailed(
  sb: ReturnType<typeof admin>, orderId: string, state: "failed" | "cancelled",
): Promise<void> {
  await (sb as any)
    .from("plans")
    .update({ payment_status: state, updated_at: new Date().toISOString() })
    .eq("razorpay_order_id", orderId)
    .neq("payment_status", "success"); // a paid plan is never downgraded
}
