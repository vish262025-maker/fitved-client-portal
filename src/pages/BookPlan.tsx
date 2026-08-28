import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Building2, Check, Clock, MapPin, Loader2, CalendarDays } from "lucide-react";
import { sortDays, daySetLabel, validateDaySet, deriveDaySetsFromPlans, type DaySet } from "@/lib/daySets";
import { toast } from "sonner";
import { gatewayConfig, payForPlan, preloadCheckout } from "@/lib/payments";
import { startCheckout } from "@/lib/repurchase";

const GOLD = "#f0a720";
const NAVY = "#1E3A5F";
const MUTED = "#8a8f9e";
const BORDER = "rgba(30,58,95,0.08)";

type Step = 1 | 2 | 3 | 4;
const STEPS = ["Plan", "Society", "Days & time"] as const;

/**
 * Offline + Group Training purchase flow.
 * Plan → Society → Day set → Time slot. Trainers are never shown to the customer:
 * once a society is picked we list its 3-day training patterns, then every slot
 * running there (across all its trainers).
 * The admin always comes from the customer's own assignment
 * (profiles.assigned_admin_id) — never from user input.
 */
export default function BookPlan() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const [step, setStep] = useState<Step>(2);
  const [societyId, setSocietyId] = useState("");
  const [daySetId, setDaySetId] = useState("");
  const [slot, setSlot] = useState("");
  const [paying, setPaying] = useState(false);
  const qc = useQueryClient();
  // Warm the gateway script while they choose, so Pay opens at once.
  useEffect(() => { preloadCheckout(); }, []);

  const gatewayQ = useQuery({ queryKey: ["gateway-config"], queryFn: gatewayConfig });

  const adminId: string | null = (profile as any)?.assigned_admin_id ?? null;

  // ── Selected plan ─────────────────────────────────────────────────────────
  const planQ = useQuery({
    queryKey: ["book-plan", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("plan_options").select("*").eq("id", planId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const plan = planQ.data;

  // ── Societies of the customer's own admin ─────────────────────────────────
  const societiesQ = useQuery({
    queryKey: ["book-societies", adminId],
    enabled: !!adminId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("societies").select("id, name, address")
        .eq("assigned_admin_id", adminId).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; address: string | null }[];
    },
  });
  const societies = societiesQ.data ?? [];

  // Single eligible society — preselect it, but still show it as chosen.
  useEffect(() => {
    if (!societyId && societies.length === 1) setSocietyId(societies[0].id);
  }, [societies, societyId]);

  // ── Day sets (fixed 3-day patterns) configured for that society ───────────
  const daySetsQ = useQuery({
    queryKey: ["book-day-sets", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("society_day_sets")
        .select("id, society_id, label, days, active, sort_order")
        .eq("society_id", societyId)
        .eq("active", true)
        .order("sort_order");

      // Admin-managed sets are the source of truth once the table exists and is
      // populated. Until then (or for a society an admin hasn't configured yet)
      // fall back to the patterns this society's members already train on, so
      // day selection works from real data rather than showing nothing.
      const managed = error
        ? []
        : ((data ?? []) as DaySet[]).filter(
            // Defence in depth: only keep sets that really belong to this
            // society and hold exactly three valid days.
            (d) => d.society_id === societyId && d.active && !validateDaySet(d.days ?? [])
          );
      if (managed.length) return managed;
      return await deriveDaySetsFromPlans(supabase as any, societyId);
    },
  });
  const daySets: DaySet[] = Array.isArray(daySetsQ.data) ? daySetsQ.data : [];

  // ── Times for the chosen day set ──────────────────────────────────────────
  // The day set is the schedule the customer picked, so its own timings are the
  // source of truth. Societies configured before day-set timings existed fall
  // back to the slots their trainers run, so no society is left with no times.
  const slotsQ = useQuery({
    queryKey: ["book-slots", societyId, daySetId, adminId],
    enabled: !!societyId && !!daySetId && !!adminId,
    queryFn: async () => {
      const { data: dayTimes } = await (supabase as any)
        .from("society_day_set_times")
        .select("day, time_slot")
        .eq("day_set_id", daySetId);

      const fromDaySet = [...new Set(
        ((dayTimes ?? []) as { time_slot: string | null }[])
          .map((r) => r.time_slot).filter(Boolean) as string[]
      )];
      if (fromDaySet.length) return fromDaySet.map((time) => ({ time }));

      // Fallback: slots run in this society by this admin's active trainers.
      const { data: rows } = await (supabase as any)
        .from("trainer_slots").select("time_slot, trainer_id")
        .eq("society_id", societyId).order("time_slot");
      const list = ((rows ?? []) as any[]).filter((r) => r.time_slot);
      if (!list.length) return [] as { time: string }[];

      const ids = [...new Set(list.map((r) => r.trainer_id))];
      const { data: trainers } = await (supabase as any)
        .from("trainers").select("id, active, assigned_admin_id").in("id", ids);
      const ok = new Set(
        ((trainers ?? []) as any[])
          .filter((t) => t.active !== false && t.assigned_admin_id === adminId)
          .map((t) => t.id)
      );
      return [...new Set(list.filter((r) => ok.has(r.trainer_id)).map((r) => r.time_slot))]
        .map((time) => ({ time: time as string }));
    },
  });
  const slots = slotsQ.data ?? [];

  const society = useMemo(() => societies.find((s) => s.id === societyId), [societies, societyId]);
  const daySet = useMemo(() => daySets.find((d) => d.id === daySetId), [daySets, daySetId]);

  const pickSociety = (id: string) => { setSocietyId(id); setDaySetId(""); setSlot(""); };
  const pickDaySet = (id: string) => { setDaySetId(id); setSlot(""); };

  /**
   * Offline group purchase. A verified Razorpay payment is what creates the
   * subscription — this only opens an unpaid one and hands it to the gateway.
   * The trainer is resolved server-side from the society + slot on activation.
   */
  const buy = async () => {
    if (!user || !plan || !society || !daySet || !slot) return;
    setPaying(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const newPlanId = await startCheckout(supabase as any, {
        userId: user.id,
        planOptionId: plan.id,
        row: {
          user_id: user.id,
          plan_option_id: plan.id,
          training_mode: "offline",
          training_type: "group",
          society_id: society.id,
          day_set_id: daySet.id,
          training_days: daySet.days,
          time_slot: slot,
          total_sessions: plan.total_sessions ?? 0,
          duration_months: plan.duration_months ?? null,
          start_date: today,
          // Real term is set server-side from duration_months on activation.
          end_date: today,
          renewal_date: today,
          amount: Number(plan.price ?? 0),
          // NOT "active": the plan only becomes live when the payment
          // service verifies the payment and flips both fields. Born active,
          // an abandoned checkout looked like a running plan and unlocked
          // pause classes.
          status: "stopped",
          payment_status: "pending",
        },
      });
      const paid = await payForPlan(newPlanId);
      if (paid.status === "success") {
        toast.success("Payment received — your plan is active.");
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["plan", user.id] }),
          qc.invalidateQueries({ queryKey: ["sessions", user.id] }),
        ]);
        navigate("/dashboard");
        return;
      }
      if (paid.status === "cancelled") toast.info("Payment cancelled. Nothing has been charged.");
      else if (paid.status === "unavailable") toast.error("Payments aren't available right now.");
      else toast.error(paid.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start your purchase");
    } finally {
      setPaying(false);
    }
  };

  const back = () => {
    if (step === 2) navigate("/plan");
    else setStep((s) => (s - 1) as Step);
  };

  const Empty = ({ title, hint }: { title: string; hint: string }) => (
    <div className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: BORDER, background: "#fff" }}>
      <p className="font-display text-base sm:text-lg" style={{ color: NAVY }}>{title}</p>
      <p className="mt-1 text-[13px]" style={{ color: MUTED }}>{hint}</p>
    </div>
  );
  const Loading = () => (
    <div className="flex items-center justify-center gap-2 rounded-2xl border p-8 text-sm" style={{ borderColor: BORDER, background: "#fff", color: MUTED }}>
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
  const ErrorBox = ({ onRetry }: { onRetry: () => void }) => (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      Something went wrong loading this step.
      <Button variant="outline" size="sm" className="ml-3" onClick={onRetry}>Retry</Button>
    </div>
  );

  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-1 sm:px-6">
      <button onClick={back} className="mb-2 inline-flex items-center gap-1.5 py-1 text-sm font-semibold" style={{ color: MUTED }}>
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h1 className="font-display text-2xl sm:text-3xl" style={{ color: NAVY }}>Book your plan</h1>
      <p className="mt-1 text-[13px] sm:text-sm" style={{ color: MUTED }}>
        A few quick steps and your training is set up.
      </p>

      {/* Step indicator */}
      <div className="mt-5 flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          const done = n < step;
          const active = n === step;
          return (
            <div key={label} className="flex flex-1 items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={{
                    background: done ? "#e6f7ed" : active ? NAVY : "rgba(30,58,95,0.06)",
                    color: done ? "#1b7a43" : active ? "#fff" : MUTED,
                  }}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : `0${n}`}
                </span>
                <span className="text-[11px] font-semibold sm:text-xs" style={{ color: active ? NAVY : MUTED }}>{label}</span>
              </div>
              {i < STEPS.length - 1 && <span className="h-px flex-1" style={{ background: BORDER }} />}
            </div>
          );
        })}
      </div>

      {/* Selected plan summary */}
      {plan && (
        <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: GOLD, background: "#fffdf6" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Selected plan</p>
              <p className="mt-0.5 truncate font-semibold" style={{ color: NAVY }}>{plan.name}</p>
              <p className="text-[12px]" style={{ color: MUTED }}>
                {plan.total_sessions} sessions · {plan.duration_months} {plan.duration_months === 1 ? "month" : "months"}
              </p>
            </div>
            <p className="shrink-0 text-xl font-bold sm:text-2xl" style={{ color: NAVY }}>
              ₹{Number(plan.price).toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      )}

      {/* ── Step 2: Society ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="mt-6">
          <h2 className="font-display text-lg sm:text-xl" style={{ color: NAVY }}>Choose your society</h2>

          <div className="mt-3">
            {societiesQ.isLoading ? <Loading />
              : societiesQ.isError ? <ErrorBox onRetry={() => societiesQ.refetch()} />
              : societies.length === 0 ? <Empty title="No societies available yet" hint="Your admin hasn't added any societies. Please reach out to them." />
              : (
                <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                  {societies.map((s) => {
                    const on = societyId === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => pickSociety(s.id)}
                        className="flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all sm:p-4"
                        style={{ borderColor: on ? GOLD : BORDER, background: on ? "#fffdf6" : "#fff", boxShadow: on ? "0 6px 18px rgba(30,58,95,0.08)" : "none" }}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(240,167,32,0.12)", color: GOLD }}>
                          <Building2 className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold" style={{ color: NAVY }}>{s.name}</span>
                          {s.address && (
                            <span className="mt-0.5 flex items-center gap-1 text-[12px]" style={{ color: MUTED }}>
                              <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{s.address}</span>
                            </span>
                          )}
                        </span>
                        {on && <Check className="h-5 w-5 shrink-0" style={{ color: GOLD }} />}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>

          <Button disabled={!societyId} onClick={() => setStep(3)} className="mt-5 w-full gap-2 sm:ml-auto sm:w-auto sm:px-6">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ── Step 3: Day set ─────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="mt-6">
          <h2 className="font-display text-lg sm:text-xl" style={{ color: NAVY }}>Choose your training days</h2>
          <p className="text-[12px]" style={{ color: MUTED }}>Schedules running at {society?.name}</p>

          <div className="mt-3">
            {daySetsQ.isLoading ? <Loading />
              : daySetsQ.isError ? <ErrorBox onRetry={() => daySetsQ.refetch()} />
              : daySets.length === 0 ? <Empty title="No schedules available" hint="This society has no training day sets yet. Try another society or contact your admin." />
              : (
                <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                  {daySets.map((d, i) => {
                    const on = daySetId === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => pickDaySet(d.id)}
                        className="flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all sm:p-4"
                        style={{ borderColor: on ? GOLD : BORDER, background: on ? "#fffdf6" : "#fff", boxShadow: on ? "0 6px 18px rgba(30,58,95,0.08)" : "none" }}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(240,167,32,0.12)", color: GOLD }}>
                          <CalendarDays className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>
                            Option {i + 1}
                          </span>
                          <span className="mt-0.5 block text-[15px] font-semibold" style={{ color: NAVY }}>
                            {d.label || daySetLabel(d.days)}
                          </span>
                          <span className="block text-[12px]" style={{ color: MUTED }}>
                            {sortDays(d.days).length} sessions / week
                          </span>
                        </span>
                        {on && <Check className="h-5 w-5 shrink-0" style={{ color: GOLD }} />}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>

          {/* Times for the chosen pattern, inline — a separate step made
              customers lose sight of the days they had just picked. */}
          {daySetId && (
            <div className="mt-6">
              <h3 className="font-display text-base sm:text-lg" style={{ color: NAVY }}>
                Pick your time
              </h3>
              <p className="text-[12px]" style={{ color: MUTED }}>
                Available on {daySet ? (daySet.label || daySetLabel(daySet.days)) : "these days"}
              </p>
              <div className="mt-3">
                {slotsQ.isLoading ? <Loading />
                  : slotsQ.isError ? <ErrorBox onRetry={() => slotsQ.refetch()} />
                  : slots.length === 0 ? <Empty title="No timings available" hint="This society has no class timings set up for these days yet. Try another option or contact your admin." />
                  : (
                    <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                      {slots.map((s2) => {
                        const on = slot === s2.time;
                        return (
                          <button
                            key={s2.time}
                            onClick={() => setSlot(s2.time)}
                            className="flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all sm:p-4"
                            style={{ borderColor: on ? GOLD : BORDER, background: on ? "#fffdf6" : "#fff", boxShadow: on ? "0 6px 18px rgba(30,58,95,0.08)" : "none" }}
                          >
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(240,167,32,0.12)", color: GOLD }}>
                              <Clock className="h-5 w-5" />
                            </span>
                            <span className="flex-1 text-[15px] font-semibold" style={{ color: NAVY }}>{s2.time}</span>
                            {on && <Check className="h-5 w-5 shrink-0" style={{ color: GOLD }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
              </div>
            </div>
          )}

          {slot && (
            <div className="mt-5 rounded-2xl border p-4 sm:p-5" style={{ borderColor: BORDER, background: "#fff" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Your selection</p>
              <ul className="mt-3 space-y-2 text-[14px]" style={{ color: NAVY }}>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: "#1b7a43" }} /> {plan?.name}</li>
                <li className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0" style={{ color: MUTED }} /> {society?.name}</li>
                <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" style={{ color: MUTED }} /> {daySet ? (daySet.label || daySetLabel(daySet.days)) : "—"}</li>
                <li className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0" style={{ color: MUTED }} /> {slot}</li>
              </ul>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-[12px]" style={{ color: MUTED }}>Total</span>
                <span className="font-display text-2xl" style={{ color: NAVY }}>
                  ₹{Number(plan?.price ?? 0).toLocaleString("en-IN")}
                </span>
              </div>
              {gatewayQ.data?.enabled === false && (
                <p className="mt-3 text-[12px]" style={{ color: MUTED }}>
                  {gatewayQ.data?.reason === "no_api"
                    ? "Payments only run on the deployed site (or `vercel dev`) — the plain dev server doesn't serve /api."
                    : "Online payments aren't switched on yet. Please contact your coach to complete this purchase."}
                </p>
              )}
              <Button
                className="mt-3 h-12 w-full text-[15px]"
                disabled={paying || gatewayQ.data?.enabled !== true}
                onClick={buy}
              >
                {paying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening payment…</>
                        : `Pay ₹${Number(plan?.price ?? 0).toLocaleString("en-IN")}`}
              </Button>
              <p className="mt-2 text-center text-[12px]" style={{ color: MUTED }}>
                Secure payment via Razorpay
              </p>
            </div>
          )}
        </div>
      )}



      <div className="pt-6 text-center sm:text-left">
        <Link to="/plan" className="text-xs font-semibold" style={{ color: MUTED }}>Cancel and go back to plans</Link>
      </div>
    </div>
  );
}
