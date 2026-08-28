import { describe, it, expect } from "vitest";
import {
  SERVICE_MODES, serviceModeOf, splitMode, usesSociety, usesBatch, isOnlineMode,
  visiblePlanOptions,
} from "@/lib/serviceMode";

describe("service mode partition", () => {
  it("covers exactly the four tracks", () => {
    expect([...SERVICE_MODES].sort()).toEqual(
      ["offline_group", "offline_personal", "online_group", "online_personal"],
    );
  });

  it("round-trips every mode through split and rebuild", () => {
    for (const m of SERVICE_MODES) {
      const { training_mode, training_type } = splitMode(m);
      expect(serviceModeOf({ training_mode, training_type })).toBe(m);
    }
  });

  it("assigns every mode/type combination to exactly one track", () => {
    const seen = new Set<string>();
    for (const mode of ["offline", "online"]) {
      for (const type of ["group", "personal"]) {
        const m = serviceModeOf({ training_mode: mode, training_type: type });
        expect(seen.has(m)).toBe(false); // mutually exclusive
        seen.add(m);
      }
    }
    expect(seen.size).toBe(SERVICE_MODES.length); // exhaustive
  });

  it("prefers the stored service_mode column over the pair", () => {
    expect(serviceModeOf({
      service_mode: "online_personal", training_mode: "offline", training_type: "group",
    })).toBe("online_personal");
  });

  it("ignores a service_mode value that isn't a known track", () => {
    expect(serviceModeOf({
      service_mode: "nonsense", training_mode: "online", training_type: "personal",
    })).toBe("online_personal");
  });

  it("treats legacy rows with no type as the historical society-batch model", () => {
    expect(serviceModeOf({ training_mode: "offline", training_type: null })).toBe("offline_group");
    expect(serviceModeOf({})).toBe("offline_group");
    expect(serviceModeOf(null)).toBe("offline_group");
  });

  it("scopes society to offline and batches to group, for every track", () => {
    for (const m of SERVICE_MODES) {
      expect(usesSociety(m)).toBe(m.startsWith("offline"));
      expect(usesBatch(m)).toBe(m.endsWith("_group"));
      expect(isOnlineMode(m)).toBe(!usesSociety(m));
    }
  });
});

describe("plan catalogue is filtered to one bucket", () => {
  // Your real catalogue.
  const CATALOGUE = [
    { price: 3499,  class_mode: "offline", training_type: "group" },
    { price: 9597,  class_mode: "offline", training_type: "group" },
    { price: 17994, class_mode: "offline", training_type: "group" },
    { price: 10000, class_mode: "offline", training_type: "personal" },
    { price: 18000, class_mode: "offline", training_type: "personal" },
    { price: 25500, class_mode: "offline", training_type: "personal" },
    { price: 2200,  class_mode: "online",  training_type: "group" },
    { price: 5700,  class_mode: "online",  training_type: "group" },
    { price: 9000,  class_mode: "online",  training_type: "group" },
    { price: 8000,  class_mode: "online",  training_type: "personal" },
    { price: 14000, class_mode: "online",  training_type: "personal" },
    { price: 19000, class_mode: "online",  training_type: "personal" },
  ];
  const prices = (m: any, t: any) => visiblePlanOptions(CATALOGUE, m, t).map((o) => o.price);

  it("an offline group customer sees ONLY the three offline group plans", () => {
    expect(prices("offline", "group")).toEqual([3499, 9597, 17994]);
  });

  it("never leaks another bucket's prices into the grid", () => {
    // The exact bug reported: online-group and offline-personal prices
    // appearing under an offline group customer.
    const shown = prices("offline", "group");
    for (const leaked of [5700, 9000, 10000, 2200, 8000]) {
      expect(shown).not.toContain(leaked);
    }
  });

  it("each bucket returns exactly three plans and they never overlap", () => {
    const buckets = [
      prices("offline", "group"), prices("offline", "personal"),
      prices("online", "group"),  prices("online", "personal"),
    ];
    buckets.forEach((b) => expect(b).toHaveLength(3));
    expect(new Set(buckets.flat()).size).toBe(12); // no plan in two buckets
  });

  it("a legacy row with no category is treated as offline group", () => {
    const legacy = [{ price: 999, class_mode: null, training_type: null }];
    expect(visiblePlanOptions(legacy, "offline", "group")).toHaveLength(1);
    expect(visiblePlanOptions(legacy, "online", "group")).toHaveLength(0);
    expect(visiblePlanOptions(legacy, "offline", "personal")).toHaveLength(0);
  });
});
