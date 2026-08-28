import { describe, it, expect } from "vitest";
import {
  assignmentFromPlan, latestAssignment, canSkipBooking, repurchaseRow,
  type PlanRow, type OptionRow,
} from "@/lib/repurchase";

const offlineGroupPlan: PlanRow = {
  training_mode: "offline",
  training_type: "group",
  society_id: "soc-1",
  day_set_id: "ds-1",
  training_days: ["Tuesday", "Thursday", "Saturday"],
  time_slot: "7:00 AM – 8:00 AM",
  trainer_id: "tr-1",
  payment_status: "success",
  created_at: "2026-08-01T00:00:00Z",
};

const opt = (over: Partial<OptionRow> = {}): OptionRow => ({
  id: "opt-1", class_mode: "offline", training_type: "group",
  total_sessions: 36, duration_months: 3, price: 9597, ...over,
});

describe("assignmentFromPlan", () => {
  it("carries the society, slot, day set and trainer forward", () => {
    const a = assignmentFromPlan(offlineGroupPlan)!;
    expect(a).toMatchObject({
      mode: "offline", type: "group", society_id: "soc-1",
      day_set_id: "ds-1", time_slot: "7:00 AM – 8:00 AM", trainer_id: "tr-1",
    });
    expect(a.training_days).toEqual(["Tuesday", "Thursday", "Saturday"]);
  });

  it("is null without a schedule — there is nothing to reuse", () => {
    expect(assignmentFromPlan({ ...offlineGroupPlan, training_days: [] })).toBeNull();
    expect(assignmentFromPlan(null)).toBeNull();
  });
});

describe("latestAssignment", () => {
  it("prefers a paid plan over a later abandoned checkout", () => {
    const abandoned: PlanRow = {
      ...offlineGroupPlan, society_id: "soc-OTHER", payment_status: "pending",
      created_at: "2026-08-20T00:00:00Z",
    };
    expect(latestAssignment([abandoned, offlineGroupPlan])!.society_id).toBe("soc-1");
  });

  it("falls back to an unpaid plan when nothing was ever paid", () => {
    const pending: PlanRow = { ...offlineGroupPlan, payment_status: "pending" };
    expect(latestAssignment([pending])!.society_id).toBe("soc-1");
  });

  it("takes the newest of several paid plans", () => {
    const newer: PlanRow = { ...offlineGroupPlan, society_id: "soc-2", created_at: "2026-08-15T00:00:00Z" };
    expect(latestAssignment([offlineGroupPlan, newer])!.society_id).toBe("soc-2");
  });

  it("treats NULL payment_status as paid — money collected outside the app", () => {
    const legacy: PlanRow = { ...offlineGroupPlan, payment_status: null };
    expect(latestAssignment([legacy])).not.toBeNull();
  });

  it("is null when no plan has a schedule", () => {
    expect(latestAssignment([{ ...offlineGroupPlan, training_days: null }])).toBeNull();
    expect(latestAssignment([])).toBeNull();
  });
});

describe("canSkipBooking", () => {
  const a = assignmentFromPlan(offlineGroupPlan);

  it("skips the wizard for a same-shape plan at a different price", () => {
    expect(canSkipBooking(a, opt({ id: "opt-6m", total_sessions: 72, price: 17994 }))).toBe(true);
  });

  it("asks again when switching offline → online: there is no society to carry", () => {
    expect(canSkipBooking(a, opt({ class_mode: "online" }))).toBe(false);
  });

  it("asks again when switching group → personal: a different slot entirely", () => {
    expect(canSkipBooking(a, opt({ training_type: "personal" }))).toBe(false);
  });

  it("asks a first-time buyer", () => {
    expect(canSkipBooking(null, opt())).toBe(false);
  });

  it("requires a slot offline", () => {
    expect(canSkipBooking({ ...a!, time_slot: null }, opt())).toBe(false);
  });

  it("requires a society for a group class, but not for personal", () => {
    expect(canSkipBooking({ ...a!, society_id: null }, opt())).toBe(false);
    expect(
      canSkipBooking({ ...a!, type: "personal", society_id: null }, opt({ training_type: "personal" })),
    ).toBe(true);
  });

  it("requires a known batch online", () => {
    const online = { ...a!, mode: "online" as const, society_id: null, time_slot: null, booking_request_id: null };
    expect(canSkipBooking(online, opt({ class_mode: "online" }))).toBe(false);
    expect(canSkipBooking({ ...online, booking_request_id: "br-1" }, opt({ class_mode: "online" }))).toBe(true);
  });
});

describe("repurchaseRow", () => {
  const row = repurchaseRow({
    userId: "u-1", option: opt({ id: "opt-6m", total_sessions: 72, duration_months: 6, price: 17994 }),
    assignment: assignmentFromPlan(offlineGroupPlan)!, today: "2026-08-27",
  });

  it("is born unpaid and stopped so an abandoned renewal is not a live plan", () => {
    expect(row.status).toBe("stopped");
    expect(row.payment_status).toBe("pending");
  });

  it("keeps the same place and time, and takes the new plan's terms", () => {
    expect(row).toMatchObject({
      society_id: "soc-1", time_slot: "7:00 AM – 8:00 AM", day_set_id: "ds-1",
      trainer_id: "tr-1", total_sessions: 72, duration_months: 6, plan_option_id: "opt-6m",
    });
  });

  it("leaves the real term to the server — dates are placeholders", () => {
    expect(row.start_date).toBe("2026-08-27");
    expect(row.end_date).toBe("2026-08-27");
  });
});
