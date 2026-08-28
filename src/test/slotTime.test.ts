import { describe, it, expect } from "vitest";
import { to12h, plusOneHour, composeSlot } from "@/lib/slotTime";

describe("to12h", () => {
  it("formats morning, noon, afternoon and midnight", () => {
    expect(to12h("07:00")).toBe("7:00 AM");
    expect(to12h("12:00")).toBe("12:00 PM");
    expect(to12h("14:13")).toBe("2:13 PM");
    expect(to12h("00:30")).toBe("12:30 AM");
  });
  it("is empty for nothing", () => {
    expect(to12h("")).toBe("");
  });
});

describe("plusOneHour", () => {
  it("adds an hour, keeping the minutes", () => {
    expect(plusOneHour("14:13")).toBe("15:13");
    expect(plusOneHour("07:00")).toBe("08:00");
  });
  it("wraps past midnight", () => {
    expect(plusOneHour("23:30")).toBe("00:30");
  });
  it("is empty for nothing", () => {
    expect(plusOneHour("")).toBe("");
  });
});

describe("composeSlot", () => {
  it("matches the format used everywhere else", () => {
    expect(composeSlot("07:00", "08:00")).toBe("7:00 AM – 8:00 AM");
  });
  it("waits for both ends", () => {
    expect(composeSlot("07:00", "")).toBe("");
    expect(composeSlot("", "08:00")).toBe("");
  });
});
