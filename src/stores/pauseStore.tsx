import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { calculatePlanEndDate, calculatePlanRenewalDate, extendEndDateBySessions, countLostTrainingDays, isoDate } from "@/lib/sessionPlan";
import { writePlanCompat, planBaseEndDate } from "@/lib/subscription";

// Today's date as a local YYYY-MM-DD string
function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getYesterdayLocalISO(todayStr?: string): string {
  const d = todayStr ? new Date(todayStr) : new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Recalculate end/renewal dates for ALL of a customer's plans — not just the
// latest. This is what makes retroactive changes reconcile correctly: when a
// plan is backdated, or a pause/off-day is added into an OLD plan's window,
// that plan's own timeline is recomputed from its own start_date. Each plan
// only ever sees the pauses/offs inside its own window (countLostTrainingDays
// bounds by [start, baseEnd]), and each extra class is credited to the plan
// whose period it falls in.
export async function recalculatePlanDates(userId: string) {
  const { data: plans, error: plansError } = await supabase
    .from("plans")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: true });

  if (plansError || !plans?.length) return;

  const { data: pauses, error: pausesError } = await (supabase.from("pauses") as any)
    .select("*")
    .eq("client_id", userId);

  if (pausesError) return;

  // Trainer off-days that hit this customer's sessions extend the plan too —
  // that's the studio's absence, so unlike pauses it is never capped.
  const { data: profile } = await supabase
    .from("profiles").select("trainer_id, time_slot").eq("id", userId).maybeSingle();
  let offTimes: { from_date: string; to_date: string; time_slot: string | null }[] = [];
  if (profile?.trainer_id) {
    const { data: offs } = await supabase
      .from("trainer_off_times")
      .select("from_date,to_date,time_slot")
      .eq("trainer_id", profile.trainer_id);
    offTimes = offs ?? [];
  }

  // Compensation classes: extra classes the trainer already took to make up
  // for off-days — each one consumes an off-day bonus of the plan whose
  // period it falls in. (Query fails silently until the migration runs.)
  let compDates: string[] = [];
  try {
    const { data: comps } = await (supabase as any)
      .from("comp_classes")
      .select("class_date")
      .eq("client_id", userId);
    compDates = (comps ?? []).map((c: { class_date: string }) => c.class_date);
  } catch { /* table not created yet */ }

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const trainingDays = plan.training_days || [];
    if (!trainingDays.length || !plan.start_date || !plan.total_sessions) continue;

    // Base end date (if nothing was missed). A purchased plan is TIME-based —
    // start + duration — so recalculating must not silently rewrite its term
    // from the session count. Legacy plans with no duration keep the
    // session-derived date they have always had.
    let currentEndDate =
      planBaseEndDate(plan as any, () =>
        calculatePlanEndDate(plan.start_date, plan.total_sessions, trainingDays),
      ) ?? calculatePlanEndDate(plan.start_date, plan.total_sessions, trainingDays);
    const baseEndISO = isoDate(currentEndDate);

    // Count lost training days inside THIS plan's window. Overlapping
    // pause + off days only count once (as paused).
    const { pausedLost, offLost } = countLostTrainingDays(
      plan.start_date,
      baseEndISO,
      trainingDays,
      (pauses ?? []).map((p: any) => ({ from: p.from_date, to: p.to_date })),
      offTimes,
      profile?.time_slot ?? null,
    );

    // An extra class belongs to the plan whose period contains it: from this
    // plan's start up to the next plan's start (open-ended for the latest).
    const nextStart = plans[i + 1]?.start_date as string | undefined;
    const compTaken = compDates.filter(
      (d) => d >= plan.start_date && (!nextStart || d < nextStart),
    ).length;

    // Customer pauses carry forward at most 1/3 of the plan; trainer off-days
    // are added in full on top, minus any already compensated by extra classes.
    const maxCarryForward = Math.floor(plan.total_sessions / 3);
    const netOffBonus = Math.max(0, offLost - compTaken);
    const actualExtension = Math.min(pausedLost, maxCarryForward) + netOffBonus;

    currentEndDate = extendEndDateBySessions(currentEndDate, actualExtension, trainingDays);
    const renewalDate = calculatePlanRenewalDate(currentEndDate, trainingDays);

    const newEnd = isoDate(currentEndDate);
    const newRenewal = isoDate(renewalDate);

    // Record the commercial terms alongside the dates: baseEndISO is what the
    // customer was sold, actualExtension is what pauses and trainer off-days
    // added on top. Storing both makes an extension auditable instead of just
    // implied by an end date that quietly moved.
    //
    // This needs no idempotency guard: every value above is recomputed from
    // the plan's own start date, so running it twice produces the same dates.
    // A repeated call can't stack a second extension onto the first.
    const hasBookkeeping = "original_end_date" in plan;
    const bookkeepingCurrent =
      !hasBookkeeping ||
      ((plan as any).original_end_date === baseEndISO &&
        (plan as any).pause_extension_days === actualExtension);

    // Skip the write when nothing changed — recalc runs from many flows and
    // most plans are already correct.
    if (plan.end_date === newEnd && plan.renewal_date === newRenewal && bookkeepingCurrent) continue;

    const { error: updateError } = await writePlanCompat(supabase, "update", {
      end_date: newEnd,
      renewal_date: newRenewal,
      original_end_date: baseEndISO,
      pause_extension_days: actualExtension,
    }, plan.id);

    if (updateError) {
      console.error(`Failed to update plan ${plan.id} dates:`, updateError);
    }
  }
}

export interface PauseRecord {
  id: string;
  from: string;
  to: string;
  status: "active" | "completed";
}

interface PauseContextValue {
  activePause: PauseRecord | null;
  history: PauseRecord[];
  loading: boolean;
  pause: (from: string, to: string) => Promise<void>;
  resume: () => Promise<void>;
}

const PauseContext = createContext<PauseContextValue | undefined>(undefined);

export function PauseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pauses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from("pauses") as any)
        .select("*")
        .eq("client_id", user!.id)
        .order("from_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = todayLocalISO();

  const records: PauseRecord[] = (data ?? []).map((p) => ({
    id: p.id,
    from: p.from_date,
    to: p.to_date,
    status: p.status as "active" | "completed",
  }));

  // A pause whose end date has passed is treated as resumed automatically.
  const activePause =
    records.find((p) => p.status === "active" && p.to >= today) ?? null;
  const history = records.filter(
    (p) => p.status === "completed" || (p.status === "active" && p.to < today)
  );

  // Persist auto-resume: mark any expired "active" pauses as completed in the DB
  const autoCompleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!user) return;
      const { error } = await supabase
        .from("pauses")
        .update({ status: "completed" })
        .in("id", ids);
      if (error) throw error;
      await recalculatePlanDates(user.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pauses", user?.id] });
      qc.invalidateQueries({ queryKey: ["plan", user?.id] });
    },
  });

  useEffect(() => {
    const expiredIds = records
      .filter((p) => p.status === "active" && p.to < today)
      .map((p) => p.id);
    if (expiredIds.length > 0 && !autoCompleteMut.isPending) {
      autoCompleteMut.mutate(expiredIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const pauseMut = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await (supabase.from("pauses") as any).insert({
        user_id: user.id,
        client_id: user.id,
        from_date: from.slice(0, 10),
        to_date: to.slice(0, 10),
        status: "active",
      });
      if (error) throw error;
      await recalculatePlanDates(user.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pauses", user?.id] });
      qc.invalidateQueries({ queryKey: ["plan", user?.id] });
    },
  });

  const resumeMut = useMutation({
    mutationFn: async () => {
      if (!activePause || !user) return;
      const today = todayLocalISO();
      
      if (today <= activePause.from) {
        // Day-1 Resume: Cancel the accidental pause completely by deleting it
        const { error } = await supabase
          .from("pauses")
          .delete()
          .eq("id", activePause.id);
        if (error) throw error;
      } else {
        // Resume after start: block customer from resuming
        throw new Error("You cannot resume a pause after it has already started. Please contact your trainer or admin.");
      }
      await recalculatePlanDates(user.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pauses", user?.id] });
      qc.invalidateQueries({ queryKey: ["plan", user?.id] });
    },
  });

  const pause = useCallback(async (from: string, to: string) => {
    await pauseMut.mutateAsync({ from, to });
  }, [pauseMut]);

  const resume = useCallback(async () => {
    await resumeMut.mutateAsync();
  }, [resumeMut]);

  const value = useMemo(
    () => ({ activePause, history, loading: isLoading, pause, resume }),
    [activePause, history, isLoading, pause, resume]
  );
  return <PauseContext.Provider value={value}>{children}</PauseContext.Provider>;
}

export function usePauseStore() {
  const ctx = useContext(PauseContext);
  if (!ctx) throw new Error("usePauseStore must be used inside PauseProvider");
  return ctx;
}
