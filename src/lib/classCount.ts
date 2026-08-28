import { serviceModeOf, type ServiceMode } from "@/lib/serviceMode";

export interface SessionRow {
  id: string;
  trainer_id?: string | null;
  user_id?: string | null;
  session_date: string;
  time_slot?: string | null;
  society_id?: string | null;
  batch_id?: string | null;
  status: string;
  attended?: boolean | null;
  training_mode?: string | null;
  training_type?: string | null;
  service_mode?: string | null;
  class_key?: string | null;
}

/**
 * The identity of the CLASS a session row belongs to.
 *
 * Session rows are per customer, so a batch of four produces four rows for one
 * class. Group rows sharing trainer + date + slot + batch collapse to one key;
 * a personal session is its own class. Mirrors the generated `class_key`
 * column so the client and the database agree.
 */
export function classKey(s: SessionRow): string {
  if (s.class_key) return s.class_key;
  const mode = serviceModeOf(s);
  if (mode.endsWith("_personal")) return s.id;
  const m = s.training_mode ?? "offline";
  return [m, s.trainer_id ?? "-", s.session_date, s.time_slot ?? "-",
          s.batch_id ?? s.society_id ?? "-"].join("|");
}

/** A class only counts once it has actually been taught. */
export const isTaught = (s: SessionRow) => s.status === "completed";

/** Distinct classes taught — never multiplied by how many customers attended. */
export function classesTaught(sessions: SessionRow[], month?: string): number {
  const keys = new Set<string>();
  for (const s of sessions) {
    if (!isTaught(s)) continue;
    if (month && s.session_date.slice(0, 7) !== month) continue;
    keys.add(classKey(s));
  }
  return keys.size;
}

/**
 * Distinct classes still to come. Pass `month` to scope it to the month being
 * viewed — an "upcoming" figure sitting under "August" must mean the rest of
 * August, not every class left in the subscription.
 */
export function classesUpcoming(sessions: SessionRow[], today: string, month?: string): number {
  const keys = new Set<string>();
  for (const s of sessions) {
    if (s.status !== "scheduled" || s.session_date < today) continue;
    if (month && s.session_date.slice(0, 7) !== month) continue;
    keys.add(classKey(s));
  }
  return keys.size;
}

/**
 * Per-customer attendance — deliberately separate from the class count.
 *
 * A row counts once the class actually RAN. 'paused' means the class went
 * ahead but this client was on a break, so it belongs in the denominator as an
 * absence — counting only 'completed' rows silently dropped those people and
 * reported "no absences" while the calendar showed them.
 *
 * 'trainer_off' and 'cancelled' are excluded: no class happened at all.
 */
export function attendance(sessions: SessionRow[], month?: string) {
  const rows = sessions.filter(
    (s) => (s.status === "completed" || s.status === "paused") &&
           (!month || s.session_date.slice(0, 7) === month),
  );
  const absent = rows.filter((s) => s.attended === false || s.status === "paused").length;
  return { attended: rows.length - absent, absent, total: rows.length };
}

/**
 * Trainer days off in a month.
 *
 * `days` counts distinct DATES the trainer was unavailable — two slots off on
 * the same day is still one day off. `classes` counts the class instances
 * those days cost, which is the number that matters for make-ups.
 */
export function daysOff(sessions: SessionRow[], month?: string) {
  const dates = new Set<string>();
  const classes = new Set<string>();
  for (const s of sessions) {
    if (s.status !== "trainer_off") continue;
    if (month && s.session_date.slice(0, 7) !== month) continue;
    dates.add(s.session_date);
    classes.add(classKey(s));
  }
  return { days: dates.size, classes: classes.size };
}

/** Months that actually have activity, newest first, for the month selector. */
export function activityMonths(sessions: SessionRow[]): string[] {
  const set = new Set(sessions.map((s) => s.session_date.slice(0, 7)));
  set.add(new Date().toISOString().slice(0, 7));
  return [...set].sort().reverse();
}

export const monthLabel = (k: string) =>
  new Date(k + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/** Groups rows into class instances, for the session list. */
export function toClasses(sessions: SessionRow[], month?: string) {
  const map = new Map<string, { key: string; date: string; slot: string | null;
    society_id: string | null; batch_id: string | null; status: string;
    mode: ServiceMode; members: SessionRow[] }>();
  for (const s of sessions) {
    if (month && s.session_date.slice(0, 7) !== month) continue;
    const k = classKey(s);
    const existing = map.get(k);
    if (existing) { existing.members.push(s); continue; }
    map.set(k, {
      key: k, date: s.session_date, slot: s.time_slot ?? null,
      society_id: s.society_id ?? null, batch_id: s.batch_id ?? null,
      status: s.status, mode: serviceModeOf(s), members: [s],
    });
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}
