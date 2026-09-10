import { describe, it, expect } from "vitest";
import { classDone, sessionsTaken, sessionsRemaining, sessionProgressPct } from "@/lib/sessionProgress";

const S = (session_date: string, status: string, attended: boolean | null = null) =>
  ({ session_date, status, attended });

/**
 * Ashwani's plan, 10 Sept 2026. Twelve sessions, Tue/Thu/Sat, one class paused
 * on the first day of the term. Four classes had actually happened; the
 * dashboard said six because it was measuring elapsed days, not classes.
 */
const ashwani = {
  start_date: "2026-08-29",
  end_date: "2026-09-26",
  training_days: ["Tuesday", "Thursday", "Saturday"],
  total_sessions: 12,
};
const ashwaniRows = [
  S("2026-08-29", "paused"),
  S("2026-09-01", "scheduled"),
  S("2026-09-03", "scheduled"),
  S("2026-09-05", "scheduled"),
  S("2026-09-08", "scheduled"),
  S("2026-09-10", "scheduled"),   // today — not yet taken
  S("2026-09-12", "scheduled"),
  S("2026-09-15", "scheduled"),
  S("2026-09-17", "scheduled"),
  S("2026-09-19", "scheduled"),
  S("2026-09-22", "scheduled"),
  S("2026-09-24", "scheduled"),
  S("2026-09-26", "scheduled"),
];

describe("classDone", () => {
  const today = "2026-09-10";
  it("counts a past class that was never marked — it ran", () => {
    expect(classDone(S("2026-09-08", "scheduled"), today)).toBe(true);
  });
  it("does not count today's class before the day is over", () => {
    expect(classDone(S("2026-09-10", "scheduled"), today)).toBe(false);
  });
  it("does not count a future class", () => {
    expect(classDone(S("2026-09-12", "scheduled"), today)).toBe(false);
  });
  it("does not count a paused class", () => {
    expect(classDone(S("2026-08-29", "paused"), today)).toBe(false);
  });
  it("does not count a trainer's day off or a cancellation", () => {
    expect(classDone(S("2026-09-01", "trainer_off"), today)).toBe(false);
    expect(classDone(S("2026-09-01", "cancelled"), today)).toBe(false);
  });
  it("counts a class the trainer marked completed, even today", () => {
    expect(classDone(S("2026-09-10", "completed"), today)).toBe(true);
    expect(classDone(S("2026-09-10", "scheduled", true), today)).toBe(true);
  });
  it("does not count one the trainer marked unattended", () => {
    expect(classDone(S("2026-09-05", "scheduled", false), today)).toBe(false);
  });
});

describe("sessionsTaken", () => {
  it("reports the four classes Ashwani actually had, not six", () => {
    expect(sessionsTaken(ashwaniRows, ashwani, "2026-09-10")).toBe(4);
    expect(sessionsRemaining(4, ashwani)).toBe(8);
    expect(sessionProgressPct(4, ashwani)).toBe(33);
  });

  it("never exceeds what the plan entitles them to", () => {
    const overrun = Array.from({ length: 20 }, (_, i) => S(`2026-09-${String(i + 1).padStart(2, "0")}`, "completed"));
    expect(sessionsTaken(overrun, ashwani, "2026-10-30")).toBe(12);
  });

  it("is zero on the day a plan starts", () => {
    expect(sessionsTaken(ashwaniRows, ashwani, "2026-08-29")).toBe(0);
  });

  it("falls back to the schedule for plans with no session rows", () => {
    // Tue/Thu/Sat from 29 Aug through 9 Sept = 1, 3, 5, 8 Sept plus Sat 29 Aug.
    expect(sessionsTaken([], ashwani, "2026-09-10")).toBe(5);
    expect(sessionsTaken([], ashwani, "2026-08-29")).toBe(0);
  });

  it("stops counting the fallback once the plan has ended", () => {
    expect(sessionsTaken([], ashwani, "2027-01-01")).toBe(12);
  });

  it("has no plan, so no sessions", () => {
    expect(sessionsTaken(ashwaniRows, null, "2026-09-10")).toBe(0);
  });
});

describe("the schedule fallback", () => {
  it("stays silent when the customer has records, just none on this plan", () => {
    // Previous term generated rows; this term's have not been generated yet.
    // The calendar shows no ticks here, so the count must not invent any.
    expect(sessionsTaken([], ashwani, "2026-09-10", false)).toBe(0);
  });
});
