import { describe, it, expect } from "vitest";
import { subscriptionTerm, tomorrowISO, planStartDate, termStart } from "@/lib/term";
import { subscriptionTerm as serverTerm } from "../../api/_lib/term";

describe("subscriptionTerm", () => {
  it("ends on the last day inside the term, not the anniversary", () => {
    expect(subscriptionTerm("2026-08-24", 3).end).toBe("2026-11-23");
  });

  it("clamps when the target month is shorter", () => {
    expect(subscriptionTerm("2026-01-31", 1).end).toBe("2026-02-27");
  });

  it("handles a one-month term across a year boundary", () => {
    expect(subscriptionTerm("2026-12-15", 1).end).toBe("2027-01-14");
  });

  it("keeps the start date it was given", () => {
    expect(subscriptionTerm("2026-08-28T10:00:00Z", 6).start).toBe("2026-08-28");
  });
});

describe("tomorrowISO", () => {
  it("is the next day", () => {
    expect(tomorrowISO("2026-08-27")).toBe("2026-08-28");
  });

  it("rolls over month and year ends", () => {
    expect(tomorrowISO("2026-08-31")).toBe("2026-09-01");
    expect(tomorrowISO("2026-12-31")).toBe("2027-01-01");
  });

  it("rolls into a leap day", () => {
    expect(tomorrowISO("2028-02-28")).toBe("2028-02-29");
  });
});

/**
 * The client copy exists so admin actions land on the same end date the
 * payment service would have produced. If these two ever drift, a plan's
 * length depends on which side of the app touched it last.
 */
describe("client and server term calculations agree", () => {
  const starts = ["2026-01-31", "2026-02-28", "2026-08-24", "2026-11-30", "2027-12-15", "2028-02-29"];
  const months = [1, 2, 3, 6, 12];
  it("match on every start × duration combination", () => {
    for (const s of starts) {
      for (const m of months) {
        expect(subscriptionTerm(s, m)).toEqual(serverTerm(s, m));
      }
    }
  });
});

describe("planStartDate", () => {
  const MWF = ["Monday", "Wednesday", "Friday"];

  it("is tomorrow when no class falls on it", () => {
    // 2026-08-27 is a Thursday, so tomorrow is Friday — a class day for MWF.
    // Tuesday's tomorrow is Wednesday... use a clean case: Sat -> Sun.
    expect(planStartDate(MWF, "2026-08-29")).toBe("2026-08-30"); // Sun, not a class day
  });

  it("skips a day when the first day would itself be a class", () => {
    // 2026-08-27 Thu -> tomorrow Fri IS a class day, so start Saturday.
    expect(planStartDate(MWF, "2026-08-27")).toBe("2026-08-29");
  });

  it("only ever skips one day", () => {
    const everyDay = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    expect(planStartDate(everyDay, "2026-08-27")).toBe("2026-08-29");
  });

  it("falls back to tomorrow with no training days", () => {
    expect(planStartDate([], "2026-08-27")).toBe("2026-08-28");
  });

  it("rolls across a month end", () => {
    // 2026-08-31 is a Monday; tomorrow is Tuesday.
    expect(planStartDate(["Tuesday"], "2026-08-31")).toBe("2026-09-02");
  });
});

describe("termStart — buying while a plan is running adds time", () => {
  it("starts the day after the current plan ends", () => {
    // Ritu's case: plan runs to 12 Sep, she renews on 28 Aug.
    expect(termStart("2026-08-28", "2026-09-12")).toBe("2026-09-13");
  });

  it("starts on the purchase date when nothing is running", () => {
    expect(termStart("2026-08-28", null)).toBe("2026-08-28");
    expect(termStart("2026-08-28", undefined)).toBe("2026-08-28");
  });

  it("starts on the purchase date when the old plan already ended", () => {
    expect(termStart("2026-08-28", "2026-07-31")).toBe("2026-08-28");
  });

  it("handles a plan ending today — the new one starts tomorrow", () => {
    expect(termStart("2026-08-28", "2026-08-28")).toBe("2026-08-29");
  });

  it("rolls across month and year ends", () => {
    expect(termStart("2026-08-28", "2026-08-31")).toBe("2026-09-01");
    expect(termStart("2026-08-28", "2026-12-31")).toBe("2027-01-01");
  });

  it("keeps the full term: a 3-month plan bought mid-plan runs 3 months from the handover", () => {
    const start = termStart("2026-08-28", "2026-09-12");
    expect(subscriptionTerm(start, 3).end).toBe("2026-12-12");
  });

  it("agrees with the server's copy of the rule", async () => {
    const server = await import("../../api/_lib/term");
    expect(server.termStart("2026-08-28", "2026-09-12")).toBe(termStart("2026-08-28", "2026-09-12"));
  });
});
