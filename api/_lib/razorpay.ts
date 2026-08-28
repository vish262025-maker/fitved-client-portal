import crypto from "node:crypto";
import { RZP_KEY_ID, RZP_KEY_SECRET } from "./env.js";

const API = "https://api.razorpay.com/v1";

function auth(): string {
  return "Basic " + Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString("base64");
}

/** Constant-time compare — a plain `===` on a signature leaks it by timing. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function hmac(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * The checkout handshake: Razorpay signs `order_id|payment_id` with our secret.
 * Only someone holding the secret can produce this, which is exactly why the
 * browser's word that "payment succeeded" is never enough on its own.
 */
export function verifyCheckoutSignature(
  orderId: string, paymentId: string, signature: string,
): boolean {
  return safeEqual(hmac(`${orderId}|${paymentId}`, RZP_KEY_SECRET), signature);
}

/** Webhooks sign the RAW request body — re-serialising JSON here would fail. */
export function verifyWebhookSignature(
  rawBody: string, signature: string, secret: string,
): boolean {
  return safeEqual(hmac(rawBody, secret), signature);
}

export interface RzpOrder { id: string; amount: number; currency: string; status: string }

export async function createOrder(input: {
  amountPaise: number; receipt: string; notes: Record<string, string>;
}): Promise<{ order: RzpOrder | null; error: string | null }> {
  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt.slice(0, 40), // Razorpay caps receipt length
      notes: input.notes,
      payment_capture: 1,
    }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) return { order: null, error: json?.error?.description ?? `Razorpay ${res.status}` };
  return { order: json as RzpOrder, error: null };
}

/** Re-reads the payment from Razorpay so we trust their record, not the client's. */
export async function fetchPayment(paymentId: string): Promise<any | null> {
  const res = await fetch(`${API}/payments/${paymentId}`, { headers: { Authorization: auth() } });
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}
