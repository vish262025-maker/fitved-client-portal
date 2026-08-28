/**
 * Razorpay checkout, client half.
 *
 * The browser's only jobs are to open the widget and to relay Razorpay's
 * signed response back to the server. It never decides the amount (the server
 * reads that from the plan catalogue) and it never decides that a payment
 * succeeded — `/api/payments/verify` re-checks the signature and re-reads the
 * payment from Razorpay before anything is activated.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface GatewayConfig {
  enabled: boolean;
  /** Why it is off, so the UI can say something useful instead of "disabled". */
  reason?: "no_api" | "not_configured";
  missing?: string[];
}

/** Cached so every booking page doesn't re-ask on each render. */
let configPromise: Promise<GatewayConfig> | null = null;

export function gatewayConfig(): Promise<GatewayConfig> {
  if (!configPromise) {
    configPromise = fetch("/api/payments/config")
      .then(async (r) => {
        // `vite` serves /api/* as raw source, so a 200 is not proof of an API.
        // Only a JSON body from the real function counts.
        const body = await r.json().catch(() => null);
        if (body && typeof body.enabled === "boolean") return body as GatewayConfig;
        if (body?.error === "gateway_not_configured") {
          return { enabled: false, reason: "not_configured" as const, missing: body.missing };
        }
        return { enabled: false, reason: "no_api" as const };
      })
      .catch(() => ({ enabled: false, reason: "no_api" as const }))
      // Only a positive answer is worth remembering. A transient failure —
      // the API restarting, a dropped connection — used to be cached for the
      // life of the page, so every booking screen afterwards claimed payments
      // were switched off until a full reload.
      .then((cfg) => {
        if (!cfg.enabled) configPromise = null;
        return cfg;
      });
  }
  return configPromise;
}

function loadCheckout(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as any).Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export type PayResult =
  | { status: "success"; planId?: string }
  | { status: "cancelled" }
  | { status: "failed"; message: string }
  | { status: "unavailable" }; // gateway off — caller keeps the old flow

interface OrderResponse {
  key_id: string; order_id: string; amount: number; currency: string;
  plan_name: string; prefill: { name: string; contact: string };
}

/**
 * Charges for an existing `plans` row and resolves once the SERVER has
 * confirmed the payment. A "cancelled" result leaves the plan unpaid and
 * re-bookable; nothing is activated on this side.
 */
export async function payForPlan(planId: string): Promise<PayResult> {
  const orderRes = await fetch("/api/payments/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_id: planId }),
  }).catch(() => null);

  if (!orderRes) return { status: "failed", message: "Couldn't reach the payment service." };
  if (orderRes.status === 503) return { status: "unavailable" };

  const order = await orderRes.json().catch(() => null);
  if (!orderRes.ok || !order?.order_id) {
    if (order?.error === "already_paid") return { status: "success", planId };
    return { status: "failed", message: describe(order?.error) };
  }

  if (!(await loadCheckout())) {
    return { status: "failed", message: "Couldn't load the payment window. Check your connection." };
  }

  const o = order as OrderResponse;

  return new Promise<PayResult>((resolve) => {
    let settled = false;
    const done = (r: PayResult) => { if (!settled) { settled = true; resolve(r); } };

    const rzp = new (window as any).Razorpay({
      key: o.key_id,
      order_id: o.order_id,
      amount: o.amount,
      currency: o.currency,
      name: "FitVed",
      description: o.plan_name,
      prefill: { name: o.prefill.name, contact: o.prefill.contact },
      theme: { color: "#1E3A5F" },
      // Razorpay hands us a signed response; the server decides what it means.
      handler: async (resp: any) => {
        const v = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          }),
        }).catch(() => null);

        const body = v ? await v.json().catch(() => null) : null;
        if (v?.ok && body?.status === "success") return done({ status: "success", planId: body.plan_id });

        // The money may well have been taken — Razorpay's webhook will still
        // activate the plan server-to-server, so never imply it was lost.
        done({
          status: "failed",
          message: "Payment received but confirmation is still processing. Refresh in a moment.",
        });
      },
      modal: { ondismiss: () => done({ status: "cancelled" }) },
    });

    rzp.on("payment.failed", (e: any) =>
      done({ status: "failed", message: e?.error?.description ?? "Payment failed." }));

    rzp.open();
  });
}

function describe(code: unknown): string {
  switch (code) {
    case "plan_has_no_price": return "This plan has no price set. Please contact support.";
    case "plan_not_found":    return "We couldn't find your plan. Please try booking again.";
    default:                  return "Couldn't start the payment. Please try again.";
  }
}
