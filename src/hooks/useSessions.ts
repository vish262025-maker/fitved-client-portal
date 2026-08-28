import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SessionStatus =
  | "scheduled" | "completed" | "missed" | "cancelled" | "trainer_off" | "paused";

export interface TrainingSession {
  id: string;
  plan_id: string;
  user_id: string;
  training_mode: "offline" | "online";
  batch_id: string | null;
  society_id: string | null;
  trainer_id: string | null;
  session_date: string;
  time_slot: string | null;
  status: SessionStatus;
  attended: boolean | null;
}

/**
 * A customer's real session records — persisted rows generated from the
 * subscription and its schedule, not derived from dates, so attendance and
 * "sessions remaining" mean something. Offline and online share this table.
 *
 * Returns [] on a database that hasn't run 20260825140000 yet, so the rest of
 * the dashboard keeps rendering.
 */
export function useSessions(userId: string | undefined, planId?: string | null) {
  return useQuery({
    queryKey: ["sessions", userId, planId ?? "all"],
    enabled: !!userId,
    queryFn: async (): Promise<TrainingSession[]> => {
      let q = (supabase as any)
        .from("training_sessions").select("*").neq("status", "cancelled")
        .eq("user_id", userId).order("session_date", { ascending: true });
      if (planId) q = q.eq("plan_id", planId);
      const { data, error } = await q;
      if (error) return [];
      return (data ?? []) as TrainingSession[];
    },
  });
}

/** Sessions a trainer is running, for their dashboard. */
export function useTrainerSessions(trainerId: string | undefined, from?: string, to?: string) {
  return useQuery({
    queryKey: ["trainer-sessions", trainerId, from ?? "", to ?? ""],
    enabled: !!trainerId,
    queryFn: async (): Promise<TrainingSession[]> => {
      let q = (supabase as any)
        .from("training_sessions").select("*").neq("status", "cancelled")
        .eq("trainer_id", trainerId).order("session_date", { ascending: true });
      if (from) q = q.gte("session_date", from);
      if (to) q = q.lte("session_date", to);
      const { data, error } = await q;
      if (error) return [];
      return (data ?? []) as TrainingSession[];
    },
  });
}

/** Completed / remaining counts for a subscription. */
export function sessionCounts(sessions: TrainingSession[], totalSessions?: number | null) {
  const completed = sessions.filter((s) => s.status === "completed" || s.attended === true).length;
  const total = totalSessions ?? sessions.length;
  return { total, completed, remaining: Math.max(0, total - completed) };
}
