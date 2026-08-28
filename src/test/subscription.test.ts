import { describe, it, expect } from "vitest";
import {
  deriveSubscriptionStatus, isPaid, daysRemaining, extensionDays, originalEndDate, isLockedIn, planBaseEndDate,
} from "@/lib/subscription";

const TODAY = "2026-08-25";
const base = {
  status: "active",
  start_date: "2026-08-01",
  end_date: "2026-09-30",
  total_sessions: 12,
  training_days: ["Monday", "Wednesday", "Friday"],
};

describe("subscription status", () => {
  it("is active for a paid, in-window plan", () => {
    expect(deriveSubscriptionStatus(base, { today: TODAY })).toBe("active");
  });

  it("is pending_payment until payment succeeds — even if the row says active", () => {
    for (const s of ["pending", "failed", "cancelled"]) {
      expect(deriveSubscriptionStatus({ ...base, payment_status: s }, { today: TODAY }))
        .toBe("pending_payment");
    }
  });

  it("treats a database without the payment column as paid (legacy offline rows)", () => {
    expect(isPaid(base)).toBe(true);
    expect(isPaid({ ...base, payment_status: null })).toBe(true);
    expect(isPaid({ ...base, payment_status: "pending" })).toBe(false);
  });

  it("expires on date regardless of the stored status", () => {
    expect(deriveSubscriptionStatus({ ...base, end_date: "2026-08-24" }, { today: TODAY }))
      .toBe("expired");
  });

  it("reports cancelled before it reports expired", () => {
    expect(deriveSubscriptionStatus(
      { ...base, status: "stopped", end_date: "2026-08-24" }, { today: TODAY },
    )).toBe("cancelled");
  });

  it("is paused only inside an active pause window", () => {
    const inside = [{ from: "2026-08-20", to: "2026-08-30" }];
    const past   = [{ from: "2026-08-01", to: "2026-08-10" }];
    expect(deriveSubscriptionStatus(base, { pauses: inside, today: TODAY })).toBe("paused");
    expect(deriveSubscriptionStatus(base, { pauses: past, today: TODAY })).toBe("active");
  });

  it("ignores a cancelled pause row", () => {
    const cancelled = [{ from: "2026-08-20", to: "2026-08-30", status: "completed" }];
    expect(deriveSubscriptionStatus(base, { pauses: cancelled, today: TODAY })).toBe("active");
  });

  it("has no plan when there is no plan", () => {
    expect(deriveSubscriptionStatus(null)).toBe("none");
  });
});

describe("extension bookkeeping", () => {
  it("prefers the stored extension count", () => {
    expect(extensionDays({ ...base, pause_extension_days: 7 })).toBe(7);
  });

  it("falls back to original vs current end date", () => {
    expect(extensionDays({ ...base, original_end_date: "2026-09-23" })).toBe(7);
  });

  it("never reports a negative extension", () => {
    expect(extensionDays({ ...base, original_end_date: "2026-10-30" })).toBe(0);
  });

  it("derives what was sold when the column is absent", () => {
    // 12 sessions on Mon/Wed/Fri from Sat 1 Aug = 4 weeks of classes.
    expect(originalEndDate(base)).toBe("2026-08-28");
  });

  it("keeps the sold date stable while the end date moves (no double-extend)", () => {
    const extended = { ...base, original_end_date: "2026-08-28", end_date: "2026-09-04" };
    expect(originalEndDate(extended)).toBe("2026-08-28");
    expect(extensionDays(extended)).toBe(7);
    // Re-deriving from the same row must not grow the extension.
    expect(extensionDays({ ...extended })).toBe(7);
  });
});

describe("days remaining", () => {
  it("counts whole days to the end date", () => {
    expect(daysRemaining(base, TODAY)).toBe(36);
  });
  it("floors at zero once expired", () => {
    expect(daysRemaining({ ...base, end_date: "2026-08-01" }, TODAY)).toBe(0);
  });
});

describe("no mid-term cancellation", () => {
  it("locks a paid, running, in-term plan", () => {
    expect(isLockedIn(base, TODAY)).toBe(true);
  });

  it("treats a plan collected outside the app as purchased", () => {
    expect(isLockedIn({ ...base, payment_status: null }, TODAY)).toBe(true);
  });

  it("does not lock a plan whose payment never completed", () => {
    expect(isLockedIn({ ...base, payment_status: "pending" }, TODAY)).toBe(false);
    expect(isLockedIn({ ...base, payment_status: "failed" }, TODAY)).toBe(false);
  });

  it("does not lock an expired plan — that is expiry, not cancellation", () => {
    expect(isLockedIn({ ...base, end_date: "2026-08-24" }, TODAY)).toBe(false);
  });

  it("does not lock a plan that is already stopped", () => {
    expect(isLockedIn({ ...base, status: "stopped" }, TODAY)).toBe(false);
  });

  it("locks a plan on its final day", () => {
    expect(isLockedIn({ ...base, end_date: TODAY }, TODAY)).toBe(true);
  });
});

describe("plan base end date — one rule", () => {
  const sessionDerived = () => new Date("2026-10-15T00:00:00Z");

  it("a purchased plan is time-based, not session-derived", () => {
    const end = planBaseEndDate(
      { start_date: "2026-08-24", duration_months: 3 } as any, sessionDerived);
    expect(end?.toISOString().slice(0, 10)).toBe("2026-11-23");
  });

  it("1 and 6 month terms", () => {
    expect(planBaseEndDate({ start_date: "2026-08-24", duration_months: 1 } as any, sessionDerived)
      ?.toISOString().slice(0, 10)).toBe("2026-09-23");
    expect(planBaseEndDate({ start_date: "2026-08-24", duration_months: 6 } as any, sessionDerived)
      ?.toISOString().slice(0, 10)).toBe("2027-02-23");
  });

  it("clamps when the target month is shorter", () => {
    expect(planBaseEndDate({ start_date: "2026-01-31", duration_months: 1 } as any, sessionDerived)
      ?.toISOString().slice(0, 10)).toBe("2026-02-27");
  });

  it("a legacy plan with no duration keeps the session-derived date", () => {
    expect(planBaseEndDate({ start_date: "2026-08-24" } as any, sessionDerived)
      ?.toISOString().slice(0, 10)).toBe("2026-10-15");
    expect(planBaseEndDate({ start_date: "2026-08-24", duration_months: 0 } as any, sessionDerived)
      ?.toISOString().slice(0, 10)).toBe("2026-10-15");
  });

  it("agrees with the payment service's own term maths", async () => {
    const { subscriptionTerm } = await import("../../api/_lib/term");
    for (const [start, months] of [["2026-08-24", 3], ["2026-01-31", 1], ["2026-12-15", 3]] as const) {
      expect(planBaseEndDate({ start_date: start, duration_months: months } as any, sessionDerived)
        ?.toISOString().slice(0, 10)).toBe(subscriptionTerm(start, months).end);
    }
  });
});
