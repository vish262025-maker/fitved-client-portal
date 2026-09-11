import { describe, it, expect } from "vitest";
import { pauseDatesError } from "@/lib/pauseRules";

const today = "2026-09-11";

describe("adding a pause", () => {
  it("refuses Ashwani's backdated 9–11 Sept pause", () => {
    expect(pauseDatesError("2026-09-09", "2026-09-11", today)).toMatch(/past/);
  });
  it("allows a pause starting today", () => {
    expect(pauseDatesError("2026-09-11", "2026-09-13", today)).toBeNull();
  });
  it("allows a future pause", () => {
    expect(pauseDatesError("2026-09-15", "2026-09-20", today)).toBeNull();
  });
  it("refuses an end before the start", () => {
    expect(pauseDatesError("2026-09-20", "2026-09-15", today)).toMatch(/end on or after/);
  });
  it("needs both dates", () => {
    expect(pauseDatesError("", "2026-09-15", today)).toMatch(/both/);
  });
});

describe("editing a pause", () => {
  const upcoming = { from: "2026-09-15", to: "2026-09-20" };
  const running  = { from: "2026-09-08", to: "2026-09-14" };

  it("can move an upcoming pause to other future dates", () => {
    expect(pauseDatesError("2026-09-16", "2026-09-22", today, upcoming)).toBeNull();
  });
  it("cannot drag an upcoming pause back into the past", () => {
    expect(pauseDatesError("2026-09-09", "2026-09-20", today, upcoming)).toMatch(/Past classes/);
  });
  it("can extend a running pause", () => {
    expect(pauseDatesError("2026-09-08", "2026-09-18", today, running)).toBeNull();
  });
  it("can end a running pause early, as far back as yesterday", () => {
    expect(pauseDatesError("2026-09-08", "2026-09-10", today, running)).toBeNull();
  });
  it("cannot shorten a running pause into days already gone", () => {
    expect(pauseDatesError("2026-09-08", "2026-09-09", today, running)).toMatch(/Past classes/);
  });
  it("cannot move the start of a pause that already began", () => {
    expect(pauseDatesError("2026-09-05", "2026-09-14", today, running)).toMatch(/Past classes/);
  });
  it("saving a running pause unchanged is fine", () => {
    expect(pauseDatesError("2026-09-08", "2026-09-14", today, running)).toBeNull();
  });
});
