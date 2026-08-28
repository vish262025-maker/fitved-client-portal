import { describe, it, expect } from "vitest";
import { normalizeSlot, findConflict, conflictLabel } from "@/lib/trainerAvailability";

const SLOT = "7:00 AM – 8:00 AM";
const DAYS = ["Monday", "Wednesday", "Friday"];

describe("normalizeSlot", () => {
  it("treats en dash, hyphen, spacing and case as the same slot", () => {
    expect(normalizeSlot("7:00 AM – 8:00 AM")).toBe(normalizeSlot("7:00 am - 8:00 am"));
    expect(normalizeSlot("7:00 AM—8:00 AM")).toBe(normalizeSlot("7:00 AM - 8:00 AM"));
  });

  it("is empty for nothing", () => {
    expect(normalizeSlot(null)).toBe("");
    expect(normalizeSlot(undefined)).toBe("");
  });
});

describe("findConflict", () => {
  const base = { trainerId: "t1", slot: SLOT, days: DAYS, plans: [], slots: [] };

  it("reports no clash for a free trainer", () => {
    expect(findConflict(base)).toEqual({ busyDays: [], slotRostered: false });
  });

  it("finds the days a plan at the same slot already takes", () => {
    const c = findConflict({
      ...base,
      plans: [{ trainer_id: "t1", time_slot: SLOT, training_days: ["Monday", "Friday"] }],
    });
    expect(c.busyDays).toEqual(["Monday", "Friday"]);
  });

  it("ignores a plan at a different time", () => {
    const c = findConflict({
      ...base,
      plans: [{ trainer_id: "t1", time_slot: "9:00 AM – 10:00 AM", training_days: DAYS }],
    });
    expect(c.busyDays).toEqual([]);
  });

  it("ignores another trainer's plan", () => {
    const c = findConflict({
      ...base,
      plans: [{ trainer_id: "t2", time_slot: SLOT, training_days: DAYS }],
    });
    expect(c.busyDays).toEqual([]);
  });

  it("only reports days the booking actually wants", () => {
    const c = findConflict({
      ...base,
      plans: [{ trainer_id: "t1", time_slot: SLOT, training_days: ["Tuesday", "Monday"] }],
    });
    expect(c.busyDays).toEqual(["Monday"]);
  });

  it("matches across dash and spacing differences", () => {
    const c = findConflict({
      ...base,
      plans: [{ trainer_id: "t1", time_slot: "7:00 am - 8:00 am", training_days: ["Monday"] }],
    });
    expect(c.busyDays).toEqual(["Monday"]);
  });

  it("flags a rostered society slot even with no days to report", () => {
    const c = findConflict({ ...base, slots: [{ trainer_id: "t1", time_slot: SLOT }] });
    expect(c).toEqual({ busyDays: [], slotRostered: true });
  });

  it("reports days in the order the booking asks for them", () => {
    const c = findConflict({
      ...base,
      plans: [{ trainer_id: "t1", time_slot: SLOT, training_days: ["Friday", "Monday", "Wednesday"] }],
    });
    expect(c.busyDays).toEqual(["Monday", "Wednesday", "Friday"]);
  });

  it("says nothing when the booking has no time", () => {
    expect(findConflict({ ...base, slot: null })).toEqual({ busyDays: [], slotRostered: false });
  });
});

describe("conflictLabel", () => {
  it("names the clashing days", () => {
    expect(conflictLabel({ busyDays: ["Monday", "Friday"], slotRostered: false }, SLOT))
      .toBe("busy Mon, Fri");
  });

  it("distinguishes a rostered slot from a real clash", () => {
    expect(conflictLabel({ busyDays: [], slotRostered: true }, SLOT)).toBe("runs a class at this time");
    expect(conflictLabel({ busyDays: [], slotRostered: false }, SLOT)).toBe("free at this time");
  });
});
