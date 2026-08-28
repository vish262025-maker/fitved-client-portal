import { calculatePlanEndDate, isoDate } from "@/lib/sessionPlan";

/**
 * One place that decides what a subscription *is*.
 *
 * `plans` is the single source of truth — the calendar, active-plan card,
 * session counts, billing, admin and the trainer roster all read that one row.
 * Status is therefore DERIVED here rather than stored, so a plan can never sit
 * in the database claiming "active" after its end date has passed.
 *
 * This mirrors the SQL `subscription_status()` function from migration
 * 20260824130000 exactly. Both must agree: the client uses this for rendering,
 * the server uses the SQL one for anything that must not be spoofable.
 */

export type SubscriptionStatus =
  | "none"            // no plan at all
  | "pending_payment" // booked, money not confirmed — NOT usable
  | "cancelled"       // stopped by admin/customer
  | "paused"          // inside an active pause window
  | "expired"         // past its end date
  | "active";

export type PaymentStatus = "pending" | "success" | "failed" | "cancelled";

/** Only `success` grants access. Anything else is an unpaid subscription. */
export const PAID: PaymentStatus = "success";

export const SUBSCRIPTION_LABEL: Record<SubscriptionStatus, string> = {
  none: "No plan",
  pending_payment: "Payment pending",
  cancelled: "Cancelled",
  paused: "Paused",
  expired: "Expired",
  active: "Active",
};

/** Badge tone, so every surface shows the same status in the same colour. */
export const SUBSCRIPTION_TONE: Record<SubscriptionStatus, "green" | "amber" | "red" | "slate"> = {
  none: "slate",
  pending_payment: "amber",
  cancelled: "red",
  paused: "amber",
  expired: "red",
  active: "green",
};

export interface PlanLike {
  id?: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  total_sessions?: number | null;
  training_days?: string[] | null;
  /** Added by 20260824130000 — undefined on a database that hasn't run it. */
  payment_status?: PaymentStatus | string | null;
  original_end_date?: string | null;
  pause_extension_days?: number | null;
}

export interface PauseLike { from: string; to: string; status?: string | null }

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Payment gate.
 *
 * A database that predates the payment columns returns `undefined` here, and
 * every plan on it was collected offline — so undefined means paid. Only an
 * explicit non-success value withholds access. This is what keeps the app
 * behaving identically before and after the migration is run.
 */
export function isPaid(plan: PlanLike | null | undefined): boolean {
  if (!plan) return false;
  const s = plan.payment_status;
  return s == null || s === PAID;
}

export function deriveSubscriptionStatus(
  plan: PlanLike | null | undefined,
  opts: { pauses?: PauseLike[]; today?: string } = {},
): SubscriptionStatus {
  if (!plan) return "none";
  const today = opts.today ?? todayISO();

  // Order matters and matches the SQL function: an unpaid plan is never
  // "active", and a cancelled one is never resurrected by its dates.
  if (!isPaid(plan)) return "pending_payment";
  if (plan.status === "stopped" || plan.status === "cancelled") return "cancelled";

  const paused = (opts.pauses ?? []).some(
    (p) => (p.status ?? "active") === "active" && today >= p.from && today <= p.to,
  );
  if (paused) return "paused";

  if (plan.end_date && today > plan.end_date) return "expired";
  return "active";
}

/**
 * A purchased plan runs its full term — it cannot be cancelled part-way
 * through. True while the plan is paid for, running, and still inside its
 * term, which is exactly when the database refuses to cancel it without a
 * recorded admin reason (migration 20260825130000).
 *
 * NULL payment_status counts as purchased: that means the money was collected
 * outside the app, which is how offline plans have always worked.
 */
export function isLockedIn(plan: PlanLike | null | undefined, today = todayISO()): boolean {
  if (!plan || !isPaid(plan)) return false;
  if (plan.status !== "active") return false;
  if (plan.end_date && today > plan.end_date) return false; // expired, not cancellable
  return true;
}

/** Does this subscription currently grant access to sessions? */
export function isUsable(status: SubscriptionStatus): boolean {
  return status === "active";
}

/** Whole days left, floored at 0. `null` when the plan has no end date. */
export function daysRemaining(plan: PlanLike | null | undefined, today = todayISO()): number | null {
  if (!plan?.end_date) return null;
  const ms = new Date(plan.end_date).getTime() - new Date(today).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * How many days pauses and trainer off-days have added to this plan.
 *
 * Prefers the stored value; falls back to recomputing what was originally sold
 * so the number is still right on a database that hasn't run the migration.
 */
export function extensionDays(plan: PlanLike | null | undefined): number {
  if (!plan) return 0;
  if (typeof plan.pause_extension_days === "number") return plan.pause_extension_days;

  const original = plan.original_end_date ?? originalEndDate(plan);
  if (!original || !plan.end_date || plan.end_date <= original) return 0;
  return Math.round(
    (new Date(plan.end_date).getTime() - new Date(original).getTime()) / 86_400_000,
  );
}

/** What the plan was sold as, ignoring any extensions. */
export function originalEndDate(plan: PlanLike | null | undefined): string | null {
  if (!plan) return null;
  if (plan.original_end_date) return plan.original_end_date;
  if (!plan.start_date || !plan.total_sessions || !plan.training_days?.length) return null;
  return isoDate(calculatePlanEndDate(plan.start_date, plan.total_sessions, plan.training_days));
}

/**
 * Add whole months, clamping to the last valid day (31 Jan + 1 month = 28 Feb).
 * Mirrors api/_lib/term.ts so the client and the payment service agree.
 */
function addMonths(iso: string, months: number): Date {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d;
}

/**
 * The term a subscription was SOLD as, before any pause extension.
 *
 * ONE rule, used by every caller:
 *  - a plan with a duration is time-based — a 3-month plan bought on 24 Aug
 *    ends 23 Nov whether or not every session was used;
 *  - a legacy plan with no duration keeps the session-derived end date it has
 *    always had, so existing customers are unaffected.
 *
 * Returns null when neither is knowable, meaning "leave the date alone".
 */
export function planBaseEndDate(
  plan: PlanLike & { duration_months?: number | null },
  sessionDerived: () => Date | null,
): Date | null {
  const months = Number(plan?.duration_months ?? 0);
  if (plan?.start_date && months > 0) {
    const d = addMonths(plan.start_date, months);
    d.setUTCDate(d.getUTCDate() - 1); // inclusive last day
    return d;
  }
  return sessionDerived();
}

// ── Schema compatibility ─────────────────────────────────────────────────
// Columns introduced by 20260824130000. Until the user runs that migration
// the live database rejects them, so writes strip them and retry.
export const SUBSCRIPTION_COLUMNS = [
  "plan_option_id", "training_mode", "training_type", "original_end_date",
  "pause_extension_days", "payment_status", "razorpay_order_id",
  "razorpay_payment_id", "activated_at", "booking_request_id",
] as const;

const MISSING_COLUMN = /column .* does not exist|schema cache|Could not find/i;

/**
 * Write to `plans`, degrading to the legacy column set if the subscription
 * migration hasn't been run yet. Follows the project's existing
 * feature-detect-at-the-query-layer convention rather than assuming the
 * generated types match the live database.
 */
export async function writePlanCompat(
  sb: { from: (t: string) => any },
  op: "insert" | "update",
  payload: Record<string, unknown>,
  planId?: string,
): Promise<{ error: string | null; degraded: boolean; id?: string }> {
  // Inserts return the new row's id — the payment flow needs it to raise a
  // Razorpay order against the plan it just created.
  const run = async (body: Record<string, unknown>) =>
    op === "insert"
      ? await sb.from("plans").insert(body).select("id").maybeSingle()
      : await sb.from("plans").update(body).eq("id", planId);

  const { data, error } = await run(payload);
  if (!error) return { error: null, degraded: false, id: data?.id ?? planId };
  if (!MISSING_COLUMN.test(error.message ?? "")) return { error: error.message, degraded: false };

  const legacy = { ...payload };
  for (const c of SUBSCRIPTION_COLUMNS) delete legacy[c];
  const { data: retryData, error: retry } = await run(legacy);
  return { error: retry?.message ?? null, degraded: true, id: retryData?.id ?? planId };
}
