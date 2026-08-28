import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { daySetLabel } from "@/lib/daySets";
import { subscriptionTerm, tomorrowISO, planStartDate } from "@/lib/term";
import { calculatePlanEndDate, calculatePlanRenewalDate, isoDate } from "@/lib/sessionPlan";
import { findConflict, conflictLabel } from "@/lib/trainerAvailability";
import { Input } from "@/components/ui/input";

/**
 * Paid subscriptions still waiting for a trainer.
 *
 * Offline personal training has no batch, so no trainer can be resolved when
 * the payment clears — an admin picks one. The customer is already active and
 * already has their calendar; this fills in who runs it.
 *
 * Reads `plans` directly: the subscription is the record, so there is no
 * separate booking row to keep in step.
 */
const WEEKDAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

export function AwaitingTrainer(
  { adminId, mode }: { adminId: string | null; mode: "online" | "offline" },
) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Record<string, string>>({});
  // The customer proposes days and a time; the admin confirms or adjusts them
  // to what a trainer can actually do, before anything is committed.
  const [dayEdit, setDayEdit] = useState<Record<string, string[]>>({});
  const [slotEdit, setSlotEdit] = useState<Record<string, string>>({});
  const daysOf = (r: any): string[] => dayEdit[r.id] ?? r.training_days ?? [];
  const slotOf = (r: any): string | null =>
    slotEdit[r.id] !== undefined ? slotEdit[r.id] : (r.time_slot ?? null);
  const [saving, setSaving] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["awaiting-trainer", adminId, mode],
    queryFn: async () => {
      const { data: plans } = await (supabase as any)
        .from("plans")
        .select("id, user_id, training_mode, training_type, society_id, training_days, time_slot, start_date, end_date, amount, discount, total_sessions, duration_months, plan_option_id")
        // Personal training waits on an admin to pick a trainer; online group
        // never does, since its trainer comes with the batch. Each mode is
        // confirmed where that kind of customer lives — offline under Personal
        // Bookings, online under Online Customers — so the queue is scoped.
        .eq("training_type", "personal")
        .eq("training_mode", mode)
        .eq("payment_status", "success")
        .eq("status", "active")
        .is("trainer_id", null)
        .order("created_at", { ascending: true });
      if (!plans?.length) return [];

      const ids = [...new Set(plans.map((p: any) => p.user_id))];
      const socIds = [...new Set(plans.map((p: any) => p.society_id).filter(Boolean))];
      const [{ data: profiles }, { data: societies }] = await Promise.all([
        (supabase as any).from("profiles").select("id, name, phone, assigned_admin_id").in("id", ids),
        socIds.length
          ? (supabase as any).from("societies").select("id, name").in("id", socIds)
          : Promise.resolve({ data: [] }),
      ]);

      return plans
        .map((p: any) => ({
          ...p,
          profile: (profiles ?? []).find((x: any) => x.id === p.user_id) ?? null,
          society: (societies ?? []).find((s: any) => s.id === p.society_id) ?? null,
        }))
        // Each admin only sees their own customers.
        .filter((r: any) => (adminId ? r.profile?.assigned_admin_id === adminId : true));
    },
  });

  const trainersQ = useQuery({
    queryKey: ["assignable-trainers", adminId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainers").select("id, name, assigned_admin_id, active").eq("active", true).order("name");
      return (data ?? []).filter((t: any) => (adminId ? t.assigned_admin_id === adminId : true));
    },
  });

  // What the candidate trainers already have on. Used to say, at the moment of
  // choosing, whether this person is free at the time the client booked.
  const trainerIds = (trainersQ.data ?? []).map((t: any) => t.id);
  const commitmentsQ = useQuery({
    queryKey: ["trainer-commitments", trainerIds.join(",")],
    enabled: trainerIds.length > 0,
    queryFn: async () => {
      const [{ data: plans }, { data: slots }] = await Promise.all([
        (supabase as any)
          .from("plans")
          .select("id, trainer_id, time_slot, training_days, society_id, status, payment_status")
          .in("trainer_id", trainerIds)
          .eq("status", "active"),
        (supabase as any)
          .from("trainer_slots")
          .select("trainer_id, time_slot, society_id")
          .in("trainer_id", trainerIds),
      ]);
      // An unpaid plan is not a commitment — nobody is being taught under it.
      const live = ((plans ?? []) as any[]).filter(
        (p) => p.payment_status == null || p.payment_status === "success",
      );
      return { plans: live, slots: (slots ?? []) as any[] };
    },
  });

  const conflictFor = (trainerId: string, row: any) =>
    findConflict({
      trainerId,
      slot: slotOf(row),
      days: daysOf(row),
      plans: commitmentsQ.data?.plans ?? [],
      slots: commitmentsQ.data?.slots ?? [],
    });

  const assign = async (planId: string) => {
    const trainerId = picked[planId];
    if (!trainerId) { toast.error("Pick a trainer first"); return; }
    const row: any = (q.data ?? []).find((r: any) => r.id === planId);
    setSaving(planId);
    try {
      /**
       * Accepting the booking starts the plan tomorrow.
       *
       * The customer paid on some earlier day and had no trainer until now, so
       * counting the term from the purchase date charges them for days nobody
       * could have trained them — the kind of thing that turns into a dispute.
       * The full term runs from the first day the trainer can actually show up.
       */
      const days: string[] = daysOf(row);
      // Never begin on a day that is itself a class — see planStartDate.
      const start = planStartDate(days);
      const slot: string | null = slotOf(row);
      const months = Number(row?.duration_months ?? 0);
      const end = months > 0
        ? subscriptionTerm(start, months).end
        : isoDate(calculatePlanEndDate(start, Number(row?.total_sessions ?? 0), days));
      const renewal = isoDate(calculatePlanRenewalDate(end, days));

      const { error } = await (supabase as any)
        .from("plans").update({
          trainer_id: trainerId,
          // The confirmed schedule, which may differ from what was requested.
          training_days: days,
          time_slot: slot,
          start_date: start,
          end_date: end,
          // What was sold, before any pause moves end_date.
          original_end_date: end,
          renewal_date: renewal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", planId);
      if (error) throw error;

      // The trainer's own roster is built from profiles.trainer_id, not from
      // the plan — so writing the plan alone assigned a trainer who then could
      // not see the client anywhere on their dashboard. Mirror the assignment,
      // along with where and when they train, so the client arrives complete.
      const prof: Record<string, unknown> = { trainer_id: trainerId };
      if (row?.society_id) prof.society_id = row.society_id;
      if (slot) prof.time_slot = slot;
      if (row?.society?.name) prof.society = row.society.name;
      const { error: profErr } = await (supabase as any)
        .from("profiles").update(prof).eq("id", row?.user_id);
      if (profErr) toast.error("Trainer saved, but their roster didn't update: " + profErr.message);

      // Push the trainer onto the sessions that already exist. Generation is
      // idempotent, so this updates them in place rather than duplicating.
      const { error: genErr } = await (supabase as any).rpc("generate_sessions", { _plan_id: planId });
      if (genErr) toast.error("Trainer saved, but the schedule didn't refresh: " + genErr.message);
      else toast.success("Trainer assigned — plan starts tomorrow");

      qc.invalidateQueries({ queryKey: ["awaiting-trainer", adminId, mode] });
      qc.invalidateQueries({ queryKey: ["admin-personal-bookings", adminId] });
      qc.invalidateQueries({ queryKey: ["admin-customer-list"] });
      qc.invalidateQueries({ queryKey: ["trainer-mode-data"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't assign the trainer");
    } finally {
      setSaving(null);
    }
  };

  const rows = q.data ?? [];
  if (!rows.length) return null;

  return (
    <Card className="mb-6 p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl text-foreground">Awaiting trainer</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Paid subscriptions with no trainer yet. The customer is already active — assigning
        a trainer fills in their existing schedule.
      </p>

      <div className="mt-4 space-y-3">
        {rows.map((r: any) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium">
                {r.profile?.name ?? "Customer"}
                <Badge variant={r.training_mode === "online" ? "default" : "secondary"}>
                  {r.training_mode === "online" ? "Online" : "Offline"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {r.training_mode === "online" ? "Online" : "Offline"} · Personal
                {r.society ? ` · ${r.society.name}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                Requested: {daySetLabel(r.training_days ?? [])}
                {r.time_slot ? ` · ${r.time_slot}` : ""}
              </p>

              {/* Confirm the schedule, or change it to what a trainer can do.
                  Availability below reacts to whatever is set here. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = daysOf(r).includes(d);
                  return (
                    <button key={d} type="button"
                      onClick={() => setDayEdit((p) => ({
                        ...p,
                        [r.id]: on ? daysOf(r).filter((x) => x !== d) : [...daysOf(r), d],
                      }))}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        on ? "border-primary bg-primary text-primary-foreground"
                           : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}>
                      {d.slice(0, 3)}
                    </button>
                  );
                })}
                <Input
                  className="h-8 w-[190px] text-[12px]"
                  value={slotOf(r) ?? ""}
                  onChange={(e) => setSlotEdit((p) => ({ ...p, [r.id]: e.target.value }))}
                  placeholder="7:00 AM – 8:00 AM"
                  aria-label="Confirmed time slot"
                />
              </div>
              {r.profile?.phone && (
                <p className="text-sm text-muted-foreground">{r.profile.phone}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {r.total_sessions ?? "—"} sessions
                {r.duration_months ? ` · ${r.duration_months} month${r.duration_months === 1 ? "" : "s"}` : ""}
                {" · paid ₹"}
                {Math.max(0, Number(r.amount ?? 0) - Number(r.discount ?? 0)).toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-muted-foreground">
                Starts {planStartDate(daysOf(r))} once you assign a trainer
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Select value={picked[r.id] ?? ""} onValueChange={(v) => setPicked((p) => ({ ...p, [r.id]: v }))}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Pick trainer" /></SelectTrigger>
                <SelectContent>
                  {(trainersQ.data ?? []).map((t: any) => {
                    const c = conflictFor(t.id, r);
                    // Already teaching at this time — on named days or on a
                    // rostered class — cannot be assigned to it as well.
                    const clash = c.busyDays.length > 0 || c.slotRostered;
                    return (
                      <SelectItem key={t.id} value={t.id} disabled={clash}>
                        <span className="flex items-center gap-2">
                          <span>{t.name}</span>
                          <span
                            className="text-[11px]"
                            style={{ color: clash ? "#d23b34" : c.slotRostered ? "#b07d10" : "#1b7a43" }}
                          >
                            · {conflictLabel(c, r.time_slot)}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={saving === r.id} onClick={() => assign(r.id)}>
                {saving === r.id ? "Saving…" : "Assign"}
              </Button>
            </div>
            </div>
            {/* Repeat the clash once chosen — the dropdown closes over it. */}
            {picked[r.id] && conflictFor(picked[r.id], r).busyDays.length > 0 && (
              <p className="text-xs" style={{ color: "#d23b34" }}>
                {(trainersQ.data ?? []).find((t: any) => t.id === picked[r.id])?.name} already has a
                class at {r.time_slot} on{" "}
                {conflictFor(picked[r.id], r).busyDays.map((d: string) => d.slice(0, 3)).join(", ")}.
                Assigning them double-books that time.
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
