import { gatewayReady } from "../_lib/env.js";
import { verifyCheckoutSignature, fetchPayment } from "../_lib/razorpay.js";
import { admin, activateFromOrder, markPaymentFailed } from "../_lib/db.js";
import { json, methodOnly } from "../_lib/http.js";

/**
 * POST /api/payments/verify
 *   { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * The only path by which a subscription becomes paid from the browser — and it
 * believes nothing the browser says. The signature is HMAC-SHA256 over
 * `order|payment` using our secret, so it can only have come from Razorpay,
 * and the payment is then re-read from Razorpay's own API to confirm it was
 * actually captured for the right amount.
 */
export default async function handler(req: any, res: any) {
  if (!methodOnly(req, res, "POST")) return;
  if (!gatewayReady()) return json(res, 503, { error: "gateway_not_configured" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
  const orderId = String(body.razorpay_order_id ?? "");
  const paymentId = String(body.razorpay_payment_id ?? "");
  const signature = String(body.razorpay_signature ?? "");

  if (!orderId || !paymentId || !signature) {
    return json(res, 400, { error: "missing_fields" });
  }

  if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
    // A forged callback. Leave the plan pending — never mark it failed, or an
    // attacker could grief a real customer's genuine in-flight payment.
    return json(res, 400, { error: "invalid_signature" });
  }

  // Signature proves authenticity; this proves the money actually moved.
  const payment = await fetchPayment(paymentId);
  if (!payment) return json(res, 502, { error: "payment_lookup_failed" });
  if (payment.order_id !== orderId) return json(res, 400, { error: "order_mismatch" });

  const sb = admin();

  if (payment.status === "failed") {
    await markPaymentFailed(sb, orderId, "failed");
    return json(res, 200, { status: "failed" });
  }
  if (payment.status !== "captured" && payment.status !== "authorized") {
    return json(res, 200, { status: "pending" });
  }

  const result = await activateFromOrder(sb, {
    orderId,
    paymentId,
    amountPaise: Number(payment.amount ?? 0),
    method: payment.method ?? "razorpay",
  });

  if (result.status === "error") return json(res, 500, { error: result.error });
  if (result.status === "not_found") return json(res, 404, { error: "plan_not_found" });
  return json(res, 200, { status: "success", plan_id: result.planId });
}
