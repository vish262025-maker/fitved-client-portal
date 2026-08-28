import { RZP_WEBHOOK_SECRET, gatewayReady } from "../_lib/env";
import { verifyWebhookSignature } from "../_lib/razorpay";
import { admin, activateFromOrder, markPaymentFailed } from "../_lib/db";
import { json, rawBody } from "../_lib/http";

// Razorpay signs the raw bytes, so the platform must not parse them for us.
export const config = { api: { bodyParser: false } };

/**
 * POST /api/payments/webhook
 *
 * The safety net. If a customer pays and then closes the tab, loses signal, or
 * the verify call fails, the browser never confirms — but Razorpay still tells
 * us server-to-server, and the subscription activates anyway.
 *
 * Shares activateFromOrder() with the verify endpoint, which is idempotent, so
 * whichever of the two arrives first wins and the other does nothing.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { error: "method_not_allowed" }); }
  if (!gatewayReady() || !RZP_WEBHOOK_SECRET) return json(res, 503, { error: "gateway_not_configured" });

  const raw = await rawBody(req);
  const signature = String(req.headers["x-razorpay-signature"] ?? "");
  if (!signature || !verifyWebhookSignature(raw, signature, RZP_WEBHOOK_SECRET)) {
    return json(res, 400, { error: "invalid_signature" });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return json(res, 400, { error: "bad_json" }); }

  const payment = event?.payload?.payment?.entity;
  const orderId = payment?.order_id ?? event?.payload?.order?.entity?.id;
  if (!orderId) return json(res, 200, { status: "ignored" }); // 200 so Razorpay stops retrying

  const sb = admin();

  switch (event.event) {
    case "payment.captured":
    case "order.paid":
      await activateFromOrder(sb, {
        orderId,
        paymentId: payment?.id ?? "",
        amountPaise: Number(payment?.amount ?? 0),
        method: payment?.method ?? "razorpay",
      });
      break;
    case "payment.failed":
      await markPaymentFailed(sb, orderId, "failed");
      break;
    default:
      break; // other events are not interesting yet
  }

  // Always 200 on a verified event — a non-2xx makes Razorpay retry for days.
  return json(res, 200, { status: "ok" });
}
