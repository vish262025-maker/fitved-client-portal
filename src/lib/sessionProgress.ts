import { countTrainingDaysInRange } from "@/lib/sessionPlan";

/**
 * How many classes has this customer actually had?
 *
 * "Sessions used" was pure arithmetic on the calendar — elapsed days divided
 * by plan length, times the session count. That answers "how far through the
 * month are you", not "how many classes have you had", and the two drift the
 * moment a class is paused or the weeks hold an uneven number of training
 * days. Ashwani's dashboard read "6 used · 6 left" on a day his own calendar
 * showed four ticks: the ring was counting a class he had paused and the class
 * he was about to walk into that evening.
 *
 * So count the real session rows — and count them with exactly the rule
 * ClassCalendar paints a tick with, because the number under the bar has to
 * agree with the ticks above it. One rule, one place, every mode.
 */

export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface SessionLike {
  session_date: string;
  status: string;
  attended: boolean | null;
}

/**
 * Did this class happen? Mirrors ClassCalendar's "attended" state exactly.
 *
 * A pause class is not a class taken; a trainer's day off is not a class
 * taken; and today's class has not happened until today is over. A past class
 * still sitting at 'scheduled' did run — that is the same rule
 * expire_subscriptions() ages those rows by.
 */
export function classDone(s: SessionLike, today: string, pauses: PauseLike[] = []): boolean {
  if (s.attended === false || s.status === "missed" || s.status === "paused") return false;
  if (s.status === "trainer_off" || s.status === "cancelled") return false;
  if (s.attended === true) return true;
  if (pausedBy(s, pauses)) return false;
  if (s.status === "completed") return true;
  return s.session_date < today;
}

export interface PauseLike { from: string; to: string }

/**
 * A class the customer's own pause covers, that nobody has marked.
 *
 * The nightly job ages every past class to 'completed'. A pause entered even a
 * day late — Ashwani's 9–11 Sept pause was saved at 11:47 on the 11th — used
 * to find the 10 Sept class already 'completed' and be unable to take it
 * back: the calendar ticked it and the count spent it. A 'completed' row that
 * nobody marked is bookkeeping, not attendance, and a pause outranks it.
 * 20260911120000 fixes the rows themselves; this keeps the screen right in
 * the meantime and in any window before the trigger catches up.
 */
export function pausedBy(s: SessionLike, pauses: PauseLike[]): boolean {
  if (s.attended != null) return false;
  return pauses.some((p) => p.from && p.to && s.session_date >= p.from && s.session_date <= p.to);
}

export interface PlanLike {
  start_date: string;
  end_date: string;
  training_days?: string[] | null;
  total_sessions?: number | null;
}

/**
 * Classes taken so far on this plan, capped at what the plan entitles them to.
 *
 * `sessions` must already be narrowed to this plan — a customer on their
 * second term still carries last term's rows, and those are not this term's
 * attendance.
 */
export function sessionsTaken(
  sessions: SessionLike[],
  plan: PlanLike | null | undefined,
  today: string = todayLocalISO(),
  /**
   * Whether deriving from the schedule is allowed when `sessions` is empty.
   *
   * The calendar only derives when the customer has NO session records at all.
   * A customer whose previous term has rows but whose current one does not
   * gets a calendar with no ticks — so the count has to read zero too, or the
   * two disagree again in the one case nobody would think to check.
   */
  allowScheduleFallback = true,
  /** The customer's pauses — a class inside one is not a class taken. */
  pauses: PauseLike[] = [],
): number {
  if (!plan) return 0;
  const cap = Number(plan.total_sessions ?? 0) || Number.POSITIVE_INFINITY;

  if (sessions.length) {
    return Math.min(cap, sessions.filter((s) => classDone(s, today, pauses)).length);
  }
  if (!allowScheduleFallback) return 0;

  /**
   * Subscriptions sold before the sessions table existed have no rows, and the
   * calendar draws their ticks from the schedule — so count them the same way
   * rather than telling a customer mid-term that they have had no classes.
   * Yesterday is the last day that can have happened.
   */
  const lastDone = today <= plan.start_date ? null : minIso(prevDayIso(today), plan.end_date);
  if (!lastDone) return 0;
  return Math.min(cap, countTrainingDaysInRange(plan.start_date, lastDone, plan.training_days ?? []));
}

/** Classes still owed on this plan. */
export function sessionsRemaining(taken: number, plan: PlanLike | null | undefined): number {
  return Math.max(0, Number(plan?.total_sessions ?? 0) - taken);
}

/** Progress through the plan measured in classes, not in days. */
export function sessionProgressPct(taken: number, plan: PlanLike | null | undefined): number {
  const total = Number(plan?.total_sessions ?? 0);
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((taken / total) * 100)));
}

function prevDayIso(iso: string): string {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function minIso(a: string, b: string): string { return a < b ? a : b; }
