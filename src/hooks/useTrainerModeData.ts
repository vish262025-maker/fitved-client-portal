import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { splitMode, usesBatch, isOnlineMode, serviceModeOf, type ServiceMode } from "@/lib/serviceMode";
import type { SessionRow } from "@/lib/classCount";

export interface ModeCustomer {
  user_id: string; name: string | null; phone: string | null;
  plan_id: string | null; plan_name: string | null;
  total_sessions: number | null;
  start_date: string | null; end_date: string | null;
  plan_status: "active" | "expired" | "none";
  slot: string | null; days: string[];
  /** Where they train. A one-to-one trainer travels to the client. */
  society: string | null; address: string | null;
}

export interface ModeGroup {
  key: string; title: string; subtitle: string | null;
  days: string[]; slot: string | null;
  /** Ids the batch's own sessions carry, so its class count can be isolated. */
  society_id: string | null; batch_id: string | null;
  customers: ModeCustomer[];
}

export interface TrainerModeData {
  sessions: SessionRow[];
  groups: ModeGroup[];      // societies / batches — group modes
  clients: ModeCustomer[];  // personal modes
  /**
   * Every name the sessions refer to, roster or not. The roster answers "who
   * do I teach now"; a session is a historical fact about someone who may
   * since have changed society, trainer or track — and it still has to render
   * with their name on it.
   */
  names: Record<string, string>;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * One service track's roster and sessions.
 *
 * ROSTER SOURCE differs by mode, deliberately:
 *  - offline: the batch is the society + slot a customer is assigned to on
 *    their PROFILE. That membership is what the trainer actually teaches, and
 *    it does not disappear the day a plan expires — so a batch of four stays a
 *    batch of four, with each member's plan status shown against them.
 *  - online: there is no society, so the batch comes from the subscription's
 *    online_batches link.
 *
 * Class counts never come from this roster — they collapse sessions by slot in
 * @/lib/classCount, so customers can never multiply classes.
 */
export function useTrainerModeData(trainerId: string | undefined, mode: ServiceMode) {
  const { training_mode, training_type } = splitMode(mode);

  return useQuery({
    queryKey: ["trainer-mode-data", trainerId, mode],
    enabled: !!trainerId,
    queryFn: async (): Promise<TrainerModeData> => {
      // ── Sessions for this track ──────────────────────────────────────
      let { data: sessions, error } = await (supabase as any)
        .from("training_sessions").select("*").neq("status", "cancelled")
        .eq("trainer_id", trainerId).eq("service_mode", mode)
        .order("session_date", { ascending: false });
      if (error) {
        const res = await (supabase as any).from("training_sessions").select("*").neq("status", "cancelled")
          .eq("trainer_id", trainerId).eq("training_mode", training_mode)
          .order("session_date", { ascending: false });
        sessions = (res.data ?? []).filter(
          (r: any) => (r.training_type ?? "group") === training_type,
        );
      }
      sessions = (sessions ?? []) as SessionRow[];

      // Every plan this trainer holds, any status — a client's mode and plan
      // details come from their most recent one.
      const { data: allPlans } = await (supabase as any)
        .from("plans").select("*")
        .eq("trainer_id", trainerId)
        .order("created_at", { ascending: false });
      const plans = (allPlans ?? []) as any[];

      /**
       * Which plan defines a client's track.
       *
       * A checkout the customer abandoned is not a plan they are on, so it
       * must not move them between tracks: starting — and dropping — a
       * personal-training purchase used to relocate a group client out of
       * their own batch, leaving their real sessions on a calendar whose
       * roster no longer contained them. Only a plan they paid for decides
       * this; an unpaid row is the answer only when there is nothing else.
       */
      const isPaid = (p: any) => p.payment_status == null || p.payment_status === "success";
      const latestPlanFor = (uid: string) =>
        plans.find((p) => p.user_id === uid && isPaid(p))
        ?? plans.find((p) => p.user_id === uid)
        ?? null;

      // Names for everyone these sessions belong to — independent of any
      // roster, so a day's detail can always show who was in the class.
      const sessionUids = [...new Set((sessions ?? []).map((r: any) => r.user_id).filter(Boolean))];
      const { data: sessionProfiles } = sessionUids.length
        ? await (supabase as any).from("profiles").select("id, name").in("id", sessionUids)
        : { data: [] };
      const names: Record<string, string> = Object.fromEntries(
        ((sessionProfiles ?? []) as any[]).map((p) => [p.id, p.name ?? "Client"]),
      );

      const { data: options } = await (supabase as any)
        .from("plan_options").select("id, name");
      const optById = Object.fromEntries(((options ?? []) as any[]).map((o) => [o.id, o]));

      const today = todayISO();
      const toCustomer = (
        uid: string, prof: any, plan: any, slot: string | null, days: string[],
        place?: { name?: string | null; address?: string | null } | null,
      ): ModeCustomer => ({
        user_id: uid,
        name: prof?.name ?? null,
        phone: prof?.phone ?? null,
        plan_id: plan?.id ?? null,
        plan_name: plan?.plan_option_id ? optById[plan.plan_option_id]?.name ?? null : null,
        total_sessions: plan?.total_sessions ?? null,
        start_date: plan?.start_date ?? null,
        end_date: plan?.end_date ?? null,
        plan_status: !plan ? "none"
          : plan.status === "active" && (!plan.end_date || plan.end_date >= today) ? "active"
          : "expired",
        slot: slot ?? plan?.time_slot ?? null,
        days: days.length ? days : (plan?.training_days ?? []),
        society: place?.name ?? null,
        address: place?.address ?? null,
      });

      // ── ONLINE: roster comes from the subscription's batch ────────────
      if (isOnlineMode(mode)) {
        const mine = plans.filter((p) => serviceModeOf(p) === mode);
        const uids = [...new Set(mine.map((p) => p.user_id))];
        const batchIds = [...new Set(mine.map((p) => p.batch_id).filter(Boolean))];
        const [{ data: profs }, { data: batches }, { data: ownBatches }] = await Promise.all([
          uids.length ? (supabase as any).from("profiles").select("id, name, phone").in("id", uids)
                      : Promise.resolve({ data: [] }),
          batchIds.length ? (supabase as any).from("online_batches").select("*").in("id", batchIds)
                          : Promise.resolve({ data: [] }),
          // Batches this trainer is assigned to, whether or not anyone has
          // bought into them yet. Without this the roster was built purely
          // from customer subscriptions, so a trainer given a brand-new batch
          // was told "no batches assigned to you" — the assignment existed,
          // it just had nobody in it to reveal it.
          (supabase as any).from("online_batches").select("*")
            .eq("trainer_id", trainerId).eq("training_type", training_type),
        ]);
        const profById = Object.fromEntries(((profs ?? []) as any[]).map((p) => [p.id, p]));
        const allBatches = [...((batches ?? []) as any[]), ...((ownBatches ?? []) as any[])];
        const batchById = Object.fromEntries(allBatches.map((b) => [b.id, b]));

        if (!usesBatch(mode)) {
          return {
            sessions, groups: [], names,
            clients: mine.map((p) => {
              const b = p.batch_id ? batchById[p.batch_id] : null;
              return toCustomer(p.user_id, profById[p.user_id], p,
                b ? `${b.start_time} – ${b.end_time}` : p.time_slot, b?.days ?? []);
            }),
          };
        }

        const map = new Map<string, ModeGroup>();

        // Seed with every batch the trainer holds, so an empty one still
        // appears — with no customers rather than not at all.
        for (const b of ((ownBatches ?? []) as any[])) {
          map.set(b.id, {
            key: b.id, title: b.name ?? "Batch",
            subtitle: null, society_id: null, batch_id: b.id,
            days: b.days ?? [],
            slot: b.start_time && b.end_time ? `${b.start_time} – ${b.end_time}` : null,
            customers: [],
          });
        }

        for (const p of mine) {
          const b = p.batch_id ? batchById[p.batch_id] : null;
          const key = p.batch_id ?? "unassigned";
          if (!map.has(key)) {
            map.set(key, {
              key, title: b?.name ?? "Unassigned batch",
              subtitle: null, // online has no society/address
              society_id: null, batch_id: p.batch_id ?? null,
              days: b?.days ?? p.training_days ?? [],
              slot: b ? `${b.start_time} – ${b.end_time}` : p.time_slot ?? null,
              customers: [],
            });
          }
          map.get(key)!.customers.push(
            toCustomer(p.user_id, profById[p.user_id], p,
              b ? `${b.start_time} – ${b.end_time}` : p.time_slot, b?.days ?? []),
          );
        }
        return { sessions, groups: [...map.values()], clients: [], names };
      }

      // ── OFFLINE: roster is the society + slot assignment on profiles ──
      const { data: profs } = await (supabase as any)
        .from("profiles").select("id, name, phone, society_id, time_slot")
        .eq("trainer_id", trainerId);
      const people = (profs ?? []) as any[];

      const socIds = [...new Set(people.map((p) => p.society_id).filter(Boolean))];
      const { data: socs } = socIds.length
        ? await (supabase as any).from("societies").select("id, name, address").in("id", socIds)
        : { data: [] };
      const socById = Object.fromEntries(((socs ?? []) as any[]).map((s) => [s.id, s]));

      // A client belongs to this track when their latest plan says so. With no
      // plan at all they are a society member, which is group training.
      const inTrack = people.filter((p) => {
        const plan = latestPlanFor(p.id);
        return plan ? serviceModeOf(plan) === mode : mode === "offline_group";
      });

      if (!usesBatch(mode)) {
        return {
          sessions, groups: [], names,
          clients: inTrack.map((p) => {
            const plan = latestPlanFor(p.id);
            const soc = p.society_id ? socById[p.society_id] : null;
            return toCustomer(p.id, p, plan, p.time_slot, plan?.training_days ?? [], soc);
          }),
        };
      }

      const map = new Map<string, ModeGroup>();
      for (const p of inTrack) {
        const plan = latestPlanFor(p.id);
        const soc = p.society_id ? socById[p.society_id] : null;
        const key = `${p.society_id ?? "-"}|${p.time_slot ?? "-"}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            title: soc?.name ?? "Unassigned",
            subtitle: soc?.address ?? null,
            society_id: p.society_id ?? null, batch_id: null,
            days: plan?.training_days ?? [],
            slot: p.time_slot ?? null,
            customers: [],
          });
        }
        map.get(key)!.customers.push(
          toCustomer(p.id, p, plan, p.time_slot, plan?.training_days ?? []),
        );
      }
      return { sessions, groups: [...map.values()], clients: [], names };
    },
  });
}
