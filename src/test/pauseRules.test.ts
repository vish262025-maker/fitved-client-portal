import { describe, it, expect } from "vitest";
import { pauseDatesError, setByFitved } from "@/lib/pauseRules";

const today = "2026-09-11";

describe("a customer or trainer adding a pause", () => {
  it("cannot start it in the past", () => {
    expect(pauseDatesError("2026-09-09", "2026-09-11", today)).toMatch(/past/);
  });
  it("can start it today", () => {
    expect(pauseDatesError("2026-09-11", "2026-09-13", today)).toBeNull();
  });
  it("can start it later", () => {
    expect(pauseDatesError("2026-09-15", "2026-09-20", today)).toBeNull();
  });
});

describe("the admin adding a pause", () => {
  it("can record Ashwani's 9–11 Sept pause on the 11th", () => {
    expect(pauseDatesError("2026-09-09", "2026-09-11", today, { byAdmin: true })).toBeNull();
  });
  it("still needs the end on or after the start", () => {
    expect(pauseDatesError("2026-09-11", "2026-09-09", today, { byAdmin: true })).toMatch(/end on or after/);
  });
  it("still needs both dates", () => {
    expect(pauseDatesError("", "2026-09-09", today, { byAdmin: true })).toMatch(/both/);
  });
});

describe("setByFitved", () => {
  const customer = "c-1";
  it("is true for a pause the admin or trainer put in", () => {
    expect(setByFitved("admin-9", customer)).toBe(true);
  });
  it("is false for the customer's own pause", () => {
    expect(setByFitved(customer, customer)).toBe(false);
  });
  it("treats pauses from before created_by was recorded as the customer's", () => {
    expect(setByFitved(null, customer)).toBe(false);
  });
});
