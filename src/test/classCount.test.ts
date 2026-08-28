import { describe, it, expect } from "vitest";
import {
  classKey, classesTaught, classesUpcoming, attendance, daysOff, toClasses, activityMonths,
} from "@/lib/classCount";

let n = 0;
const s = (o: Partial<Parameters<typeof classKey>[0]> = {}) => ({
  id: `s${++n}`, trainer_id: "T1", session_date: "2026-08-03", time_slot: "7:00 AM – 8:00 AM",
  society_id: "SOC1", batch_id: null, status: "completed", attended: null,
  training_mode: "offline", training_type: "group", ...o,
}) as any;

/** A group class attended by `people` customers on one date. */
const groupClass = (date: string, people: number, extra: any = {}) =>
  Array.from({ length: people }, () => s({ session_date: date, ...extra }));

describe("one completed slot = one class", () => {
  it("TEST 1 — 1 batch, 4 customers, 3 sessions → 3 classes, not 12", () => {
    const rows = [...groupClass("2026-08-03", 4), ...groupClass("2026-08-05", 4), ...groupClass("2026-08-07", 4)];
    expect(rows).toHaveLength(12);
    expect(classesTaught(rows)).toBe(3);
  });

  it("TEST 2 — 2 batches x 4 customers x 3 sessions → 6 classes, not 24", () => {
    const a = ["2026-08-03", "2026-08-05", "2026-08-07"].flatMap((d) =>
      groupClass(d, 4, { time_slot: "7:00 AM – 8:00 AM" }));
    const b = ["2026-08-03", "2026-08-05", "2026-08-07"].flatMap((d) =>
      groupClass(d, 4, { time_slot: "8:00 AM – 9:00 AM" }));
    expect([...a, ...b]).toHaveLength(24);
    expect(classesTaught([...a, ...b])).toBe(6);
  });

  it("TEST 3 — personal, 1 customer, 8 sessions → 8 classes", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      s({ training_type: "personal", session_date: `2026-08-0${i + 1}` }));
    expect(classesTaught(rows)).toBe(8);
  });

  it("TEST 4 — online group, 10 customers, 5 sessions → 5 classes, not 50", () => {
    const rows = ["01", "03", "05", "07", "09"].flatMap((d) =>
      groupClass(`2026-08-${d}`, 10, { training_mode: "online", society_id: null, batch_id: "B1" }));
    expect(rows).toHaveLength(50);
    expect(classesTaught(rows)).toBe(5);
  });

  it("TEST 5 — online personal, 4 + 6 sessions across two customers → 10", () => {
    const mk = (uid: string, count: number) => Array.from({ length: count }, (_, i) =>
      s({ training_mode: "online", training_type: "personal", user_id: uid,
          society_id: null, batch_id: "B1", session_date: `2026-08-1${i}` }));
    expect(classesTaught([...mk("A", 4), ...mk("B", 6)])).toBe(10);
  });

  it("TEST 6 — month filter counts each month independently", () => {
    const aug = Array.from({ length: 10 }, (_, i) =>
      s({ training_type: "personal", session_date: `2026-08-${String(i + 1).padStart(2, "0")}` }));
    const jul = Array.from({ length: 7 }, (_, i) =>
      s({ training_type: "personal", session_date: `2026-07-${String(i + 1).padStart(2, "0")}` }));
    const all = [...aug, ...jul];
    expect(classesTaught(all, "2026-08")).toBe(10);
    expect(classesTaught(all, "2026-07")).toBe(7);
    expect(activityMonths(all)).toEqual(expect.arrayContaining(["2026-08", "2026-07"]));
  });

  it("TEST 7 — one absent customer does not reduce the class count", () => {
    const rows = groupClass("2026-08-03", 4);
    rows[1].attended = false;
    expect(classesTaught(rows)).toBe(1);
    expect(attendance(rows)).toEqual({ attended: 3, absent: 1, total: 4 });
  });

  it("TEST 8 — future sessions are upcoming, never taught", () => {
    const rows = groupClass("2099-01-05", 4, { status: "scheduled" });
    expect(classesTaught(rows)).toBe(0);
    expect(classesUpcoming(rows, "2026-08-25")).toBe(1);
  });

  it("TEST 9 — day off and cancelled never count as taught", () => {
    for (const status of ["trainer_off", "cancelled", "paused", "missed"]) {
      expect(classesTaught(groupClass("2026-08-03", 4, { status }))).toBe(0);
    }
  });
});

describe("class grouping", () => {
  it("collapses a batch into one class carrying its customers", () => {
    const classes = toClasses(groupClass("2026-08-03", 4));
    expect(classes).toHaveLength(1);
    expect(classes[0].members).toHaveLength(4);
  });

  it("keeps two slots on the same day separate", () => {
    const rows = [...groupClass("2026-08-03", 4, { time_slot: "7 AM" }),
                  ...groupClass("2026-08-03", 4, { time_slot: "8 AM" })];
    expect(toClasses(rows)).toHaveLength(2);
  });

  it("prefers the database class_key when present", () => {
    expect(classKey(s({ class_key: "db-key" }))).toBe("db-key");
  });
});

describe("upcoming is scoped to the month being viewed", () => {
  const rows = [
    ...["2026-08-27", "2026-08-29"].flatMap((d) => groupClass(d, 4, { status: "scheduled" })),
    ...["2026-09-01", "2026-09-03", "2026-09-05"].flatMap((d) => groupClass(d, 4, { status: "scheduled" })),
  ];

  it("counts only the rest of the selected month", () => {
    expect(classesUpcoming(rows, "2026-08-25", "2026-08")).toBe(2);
    expect(classesUpcoming(rows, "2026-08-25", "2026-09")).toBe(3);
  });

  it("still counts everything ahead when no month is given", () => {
    expect(classesUpcoming(rows, "2026-08-25")).toBe(5);
  });

  it("ignores classes already past", () => {
    expect(classesUpcoming(rows, "2026-08-28", "2026-08")).toBe(1);
  });
});

describe("attendance counts a paused client as absent", () => {
  it("a client on pause is absent, and the class still counts once", () => {
    const rows = groupClass("2026-08-03", 4);
    rows[0].status = "paused";           // on a break that day
    expect(classesTaught(rows)).toBe(1); // the class still ran
    expect(attendance(rows)).toEqual({ attended: 3, absent: 1, total: 4 });
  });

  it("a trainer day off is not attendance at all", () => {
    const rows = groupClass("2026-08-03", 4, { status: "trainer_off" });
    expect(attendance(rows)).toEqual({ attended: 0, absent: 0, total: 0 });
  });

  it("cancelled classes are excluded from attendance", () => {
    const rows = groupClass("2026-08-03", 4, { status: "cancelled" });
    expect(attendance(rows).total).toBe(0);
  });

  it("mixes explicit absences with paused ones", () => {
    const rows = groupClass("2026-08-03", 4);
    rows[0].status = "paused";
    rows[1].attended = false;
    expect(attendance(rows)).toEqual({ attended: 2, absent: 2, total: 4 });
  });

  it("scopes to the selected month", () => {
    const aug = groupClass("2026-08-03", 4);
    const jul = groupClass("2026-07-03", 4);
    jul[0].status = "paused";
    const all = [...aug, ...jul];
    expect(attendance(all, "2026-08").absent).toBe(0);
    expect(attendance(all, "2026-07").absent).toBe(1);
  });
});

describe("trainer days off", () => {
  it("counts a day once however many clients it affected", () => {
    const rows = groupClass("2026-07-07", 4, { status: "trainer_off" });
    expect(daysOff(rows)).toEqual({ days: 1, classes: 1 });
  });

  it("counts two slots on one day as one day but two classes", () => {
    const rows = [
      ...groupClass("2026-07-07", 4, { status: "trainer_off", time_slot: "7 AM" }),
      ...groupClass("2026-07-07", 3, { status: "trainer_off", time_slot: "8 AM" }),
    ];
    expect(daysOff(rows)).toEqual({ days: 1, classes: 2 });
  });

  it("ignores everything that is not a day off", () => {
    expect(daysOff(groupClass("2026-07-07", 4))).toEqual({ days: 0, classes: 0 });
    expect(daysOff(groupClass("2026-07-07", 4, { status: "paused" })).days).toBe(0);
  });

  it("scopes to the selected month", () => {
    const rows = [
      ...groupClass("2026-07-07", 2, { status: "trainer_off" }),
      ...groupClass("2026-08-04", 2, { status: "trainer_off" }),
    ];
    expect(daysOff(rows, "2026-07").days).toBe(1);
    expect(daysOff(rows, "2026-08").days).toBe(1);
    expect(daysOff(rows).days).toBe(2);
  });
});
