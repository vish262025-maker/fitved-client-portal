/**
 * Is a trainer already busy at a given time?
 *
 * Offline personal training is booked into a society and a time before anyone
 * knows who will teach it, so the admin picks a trainer afterwards — with no
 * indication of whether that person is already running a class then. Double-
 * booking only surfaces on the day, in front of the client.
 *
 * A commitment at the same time slot comes from two places:
 *   - plans they already hold at that slot (group or personal), which carry
 *     the exact days they run;
 *   - trainer_slots, the society group classes they are rostered for, which
 *     records the slot but not the days.
 */

export interface Commitment {
  trainer_id: string | null;
  time_slot: string | null;
  training_days?: string[] | null;
  society_id?: string | null;
}

export interface Conflict {
  /** Requested days this trainer is already committed on. */
  busyDays: string[];
  /** True when they run a class at this time but we can't say on which days. */
  slotRostered: boolean;
}

/**
 * Times are typed by hand in several places, so "7:00 AM – 8:00 AM" and
 * "7:00 am - 8:00 am" are the same slot and must compare equal.
 */
export function normalizeSlot(slot: string | null | undefined): string {
  if (!slot) return "";
  return slot
    .replace(/[‐-―]/g, "-")  // any dash → hyphen
    .replace(/\s+/g, "")
    .toLowerCase();
}

const shortDay = (d: string) => d.slice(0, 3).toLowerCase();

export function findConflict(args: {
  trainerId: string;
  slot: string | null;
  days: string[];
  /** Plans the candidate trainers already hold. */
  plans: Commitment[];
  /** Society group slots they are rostered for. */
  slots: Commitment[];
  /** Exclude the booking being assigned, so it can't conflict with itself. */
  ignorePlanId?: string;
}): Conflict {
  const want = normalizeSlot(args.slot);
  if (!want) return { busyDays: [], slotRostered: false };

  const wanted = new Set(args.days.map(shortDay));
  const busy = new Set<string>();

  for (const p of args.plans) {
    if (p.trainer_id !== args.trainerId) continue;
    if (normalizeSlot(p.time_slot) !== want) continue;
    for (const d of p.training_days ?? []) {
      if (wanted.has(shortDay(d))) busy.add(shortDay(d));
    }
  }

  const slotRostered = args.slots.some(
    (s) => s.trainer_id === args.trainerId && normalizeSlot(s.time_slot) === want,
  );

  // Report in the order the booking asks for, not the order we found them.
  const busyDays = args.days.filter((d) => busy.has(shortDay(d)));
  return { busyDays, slotRostered };
}

/** One-line summary for the trainer picker. */
export function conflictLabel(c: Conflict, slot: string | null): string {
  if (c.busyDays.length) {
    return `busy ${c.busyDays.map((d) => d.slice(0, 3)).join(", ")}`;
  }
  if (c.slotRostered) return "runs a class at this time";
  return slot ? "free at this time" : "";
}
