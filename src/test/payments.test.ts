import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";

const SECRET = "test_secret_do_not_use";
let rz: typeof import("../../api/_lib/razorpay");
let env: typeof import("../../api/_lib/env");

beforeAll(async () => {
  // The modules read config at import time, so seed it first.
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = SECRET;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_key";
  rz = await import("../../api/_lib/razorpay");
  env = await import("../../api/_lib/env");
});

const sign = (payload: string, secret = SECRET) =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex");

describe("checkout signature", () => {
  const order = "order_ABC123";
  const payment = "pay_XYZ789";

  it("accepts a signature Razorpay actually produced", () => {
    expect(rz.verifyCheckoutSignature(order, payment, sign(`${order}|${payment}`))).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(rz.verifyCheckoutSignature(order, payment, sign(`${order}|${payment}`, "wrong")))
      .toBe(false);
  });

  it("rejects a valid signature replayed onto a different order", () => {
    const stolen = sign(`${order}|${payment}`);
    expect(rz.verifyCheckoutSignature("order_OTHER", payment, stolen)).toBe(false);
  });

  it("rejects a valid signature replayed onto a different payment", () => {
    const stolen = sign(`${order}|${payment}`);
    expect(rz.verifyCheckoutSignature(order, "pay_OTHER", stolen)).toBe(false);
  });

  it("rejects empty and malformed signatures instead of throwing", () => {
    for (const bad of ["", "not-hex", "0".repeat(64)]) {
      expect(rz.verifyCheckoutSignature(order, payment, bad)).toBe(false);
    }
  });

  it("does not crash on a length mismatch (timingSafeEqual would throw)", () => {
    expect(() => rz.safeEqual("short", "a-much-longer-value")).not.toThrow();
    expect(rz.safeEqual("short", "a-much-longer-value")).toBe(false);
  });
});

describe("webhook signature", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } });

  it("accepts the raw body signed with the webhook secret", () => {
    expect(rz.verifyWebhookSignature(body, sign(body, "hook_secret"), "hook_secret")).toBe(true);
  });

  it("rejects a body that was altered after signing", () => {
    const sig = sign(body, "hook_secret");
    expect(rz.verifyWebhookSignature(body.replace("captured", "failed"), sig, "hook_secret"))
      .toBe(false);
  });
});

describe("gateway config", () => {
  it("is ready when every server variable is present", () => {
    expect(env.gatewayReady()).toBe(true);
    expect(env.missingConfig()).toEqual([]);
  });

  it("never exposes the secret through the config helpers", () => {
    expect(JSON.stringify(env.missingConfig())).not.toContain(SECRET);
  });
});

describe("subscription term", () => {
  let term: typeof import("../../api/_lib/term").subscriptionTerm;
  beforeAll(async () => { term = (await import("../../api/_lib/term")).subscriptionTerm; });

  it("runs a 3-month plan bought 24 Aug to 23 Nov", () => {
    expect(term("2026-08-24", 3)).toEqual({ start: "2026-08-24", end: "2026-11-23" });
  });

  it("handles 1 and 6 month plans", () => {
    expect(term("2026-08-24", 1).end).toBe("2026-09-23");
    expect(term("2026-08-24", 6).end).toBe("2027-02-23");
  });

  it("clamps when the target month is shorter", () => {
    // 31 Jan + 1 month must not roll into March.
    expect(term("2026-01-31", 1).end).toBe("2026-02-27");
  });

  it("crosses a year boundary", () => {
    expect(term("2026-12-15", 3).end).toBe("2027-03-14");
  });

  it("ignores a timestamp suffix on the start date", () => {
    expect(term("2026-08-24T11:30:00.000Z", 1).start).toBe("2026-08-24");
  });
});
