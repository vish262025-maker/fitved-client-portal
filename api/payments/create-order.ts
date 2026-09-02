import { gatewayReady, missingConfig, RZP_KEY_ID } from "../_lib/env.js";
import { createOrder } from "../_lib/razorpay.js";
import { admin } from "../_lib/db.js";
import { json, methodOnly } from "../_lib/http.js";

/**
 * POST /api/payments/create-order   { plan_id }
 *
 * Creates a Razorpay order for a plan that is awaiting payment.
 *
 * The amount is read from `plan_options` on the server. It is never taken from
 * the request, and deliberately not from `plans.amount` either — the browser
 * holds an anon key with open RLS and could rewrite that column, so pricing
 * comes from the catalogue the admin controls.
 */
export default async function handler(req: any, res: any) {
  if (!methodOnly(req, res, "POST")) return;

  if (!gatewayReady()) {
    // 503 + this code is the signal the client falls back on, so booking keeps
    // working exactly as it does today until the keys are configured.
    return json(res, 503, { error: "gateway_not_configured", missing: missingConfig() });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
  const planId = String(body.plan_id ?? "").trim();
  if (!planId) return json(res, 400, { error: "plan_id required" });

  const sb = admin();

  const { data: plan, error } = await (sb as any)
    .from("plans")
    // training_mode/type are read by the category guard below — without them
    // it compared undefined against the running plan, defaulted both sides to
    // "offline group", and let every mismatch through.
    .select("id, user_id, plan_option_id, payment_status, razorpay_order_id, total_sessions, training_mode, training_type")
    .eq("id", planId)
    .maybeSingle();

  if (error) return json(res, 500, { error: error.message });
  if (!plan) return json(res, 404, { error: "plan_not_found" });
  if (plan.payment_status === "success") {
    return json(res, 409, { error: "already_paid" });
  }
  if (!plan.plan_option_id) return json(res, 409, { error: "plan_has_no_price" });

  /**
   * Four independent reads, and the profile the response needs.
   *
   * These ran one after another, each a separate round trip to the database
   * before Razorpay was even called — the customer watched a button do
   * nothing for most of a second. Nothing here depends on anything else here,
   * so they go together.
   */
  const [{ data: current }, { data: option }, { data: override }, { data: profile }] =
    await Promise.all([
      // A running subscription fixes the category they may buy into. The
      // browser hides the other categories, but the browser is not the
      // authority: a customer on an offline group plan must not be able to pay
      // for online personal and strand the classes they are still owed.
      (sb as any).from("plans")
        .select("training_mode, training_type, end_date")
        .eq("user_id", plan.user_id).eq("status", "active")
        .or("payment_status.is.null,payment_status.eq.success")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      (sb as any).from("plan_options")
        .select("id, name, price").eq("id", plan.plan_option_id).maybeSingle(),
      // A customer can hold a negotiated price for a plan; it is what their
      // own screens display, so it has to be what the gateway charges.
      (sb as any).from("plan_price_overrides")
        .select("price").eq("user_id", plan.user_id)
        .eq("plan_option_id", plan.plan_option_id).maybeSingle(),
      (sb as any).from("profiles").select("name, phone").eq("id", plan.user_id).maybeSingle(),
    ]);

  if (current) {
    const same = (a: any, b: any) =>
      ((a.training_mode ?? "offline") === (b.training_mode ?? "offline")) &&
      ((a.training_type ?? "group") === (b.training_type ?? "group"));
    if (!same(current, plan)) {
      return json(res, 409, {
        error: "category_locked",
        message: `You're on a ${current.training_mode} ${current.training_type} plan until ${current.end_date}.`,
      });
    }
  }

  // Always the listed price — the catalogue, or this customer's own listed
  // price where one is set. Never what a previous plan happened to cost: an
  // admin discount applied to one term is a one-off for that term.
  const listed = Number(option?.price ?? 0);
  const price = override?.price != null ? Number(override.price) : listed;
  if (!option || !(price > 0)) return json(res, 409, { error: "plan_has_no_price" });

  const amountPaise = Math.round(price * 100);

  const { order, error: rzpError } = await createOrder({
    amountPaise,
    receipt: `plan_${plan.id.replace(/-/g, "").slice(0, 30)}`,
    notes: { plan_id: plan.id, user_id: plan.user_id, plan_option_id: option.id },
  });
  if (!order) return json(res, 502, { error: rzpError ?? "order_failed" });

  // Bind the order to the plan. Verification later finds the plan BY this
  // order id, so a client can never redirect a payment onto a different plan.
  const { error: bindErr } = await (sb as any)
    .from("plans")
    .update({
      razorpay_order_id: order.id,
      payment_status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", plan.id)
    .neq("payment_status", "success");
  if (bindErr) return json(res, 500, { error: bindErr.message });

  return json(res, 200, {
    key_id: RZP_KEY_ID,          // publishable by design; the secret never leaves the server
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    plan_name: option.name ?? "FitVed plan",
    prefill: { name: profile?.name ?? "", contact: profile?.phone ?? "" },
  });
}
