import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock, CreditCard, Loader2, ShieldCheck, UserRound, Users, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { batchDays, batchName, batchTiming, seatsLeft, type OnlineBatch } from "@/lib/onlineBatches";
import { gatewayConfig, payForPlan, preloadCheckout } from "@/lib/payments";
import { Input } from "@/components/ui/input";
import { startCheckout } from "@/lib/repurchase";
import { composeSlot, plusOneHour } from "@/lib/slotTime";

const WEEKDAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const NAVY = "#1E3A5F";
const MUTED = "#8a8f9e";
const BORDER = "rgba(30,58,95,0.08)";

/**
 * Online plan purchase. Plan → schedule → Razorpay. No booking request:
 * a verified payment is what creates the subscription, and the server decides
 * that, not this page.
 *
 * Everything offered is admin-configured (`plan_options`, `online_batches`) —
 * nothing about pricing or schedules is hardcoded here.
 */
export default function BuyOnlinePlan() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const [batchId, setBatchId] = useState("");
  // Online PERSONAL has no batch to join — a one-to-one slot is arranged for
  // this customer alone, so they say when they want it and an admin confirms
  // the trainer against real availability afterwards.
  const [ptDays, setPtDays] = useState<string[]>([]);
  const [ptStart, setPtStart] = useState("");
  const [ptEnd, setPtEnd] = useState("");
  // Whether the customer has set the end themselves. Until they do, it simply
  // follows the start — a class is an hour, so asking for both is asking twice.
  const [endTouched, setEndTouched] = useState(false);
  const pickStart = (v: string) => {
    setPtStart(v);
    if (!endTouched) setPtEnd(plusOneHour(v));
  };
  const [paying, setPaying] = useState(false);

  const adminId: string | null = (profile as any)?.assigned_admin_id ?? null;

  const planQ = useQuery({
    queryKey: ["online-plan-option", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("plan_options").select("*").eq("id", planId).maybeSingle();
      return data;
    },
  });
  const plan = planQ.data;
  const trainingType: "group" | "personal" = plan?.training_type === "personal" ? "personal" : "group";
  const isPersonal = trainingType === "personal";

  // Warm the gateway script while they choose, so pressing Pay opens it at once.
  useEffect(() => { preloadCheckout(); }, []);

  const gatewayQ = useQuery({ queryKey: ["gateway-config"], queryFn: gatewayConfig });

  const batchesQ = useQuery({
    queryKey: ["online-batches", trainingType, adminId],
    enabled: !!plan,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("online_batches").select("*")
        .eq("training_type", trainingType).eq("active", true)
        .order("sort_order", { ascending: true });
      return (data ?? []) as OnlineBatch[];
    },
  });

  // Who teaches each batch. The card showed the days and the time but not the
  // person — the one detail a customer actually chooses between when two
  // batches run at similar hours.
  const trainerQ = useQuery({
    queryKey: ["batch-trainers", (batchesQ.data ?? []).map((b: any) => b.trainer_id).join(",")],
    enabled: (batchesQ.data ?? []).some((b: any) => b.trainer_id),
    queryFn: async () => {
      const ids = [...new Set((batchesQ.data ?? []).map((b: any) => b.trainer_id).filter(Boolean))];
      const { data } = await (supabase as any).from("trainers").select("id, name").in("id", ids);
      return Object.fromEntries(((data ?? []) as any[]).map((t) => [t.id, t.name])) as Record<string, string>;
    },
  });
  const trainerName = (b: any) => (b?.trainer_id ? trainerQ.data?.[b.trainer_id] ?? null : null);

  // Seats taken per batch, counted from live subscriptions rather than a
  // stored tally that could drift.
  const takenQ = useQuery({
    queryKey: ["online-batch-load"],
    queryFn: async () => {
      // Only paid subscriptions hold a seat — an abandoned checkout must not
      // make a batch look full.
      const { data } = await (supabase as any)
        .from("plans").select("batch_id")
        .eq("training_mode", "online").eq("status", "active")
        .eq("payment_status", "success");
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { batch_id: string | null }) => {
        if (r.batch_id) map[r.batch_id] = (map[r.batch_id] ?? 0) + 1;
      });
      return map;
    },
  });
  const taken = takenQ.data ?? {};

  const batches = batchesQ.data ?? [];
  const chosen = useMemo(() => batches.find((b) => b.id === batchId) ?? null, [batches, batchId]);

  // An existing online subscription — purchases are additive, never overwriting.
  const currentQ = useQuery({
    queryKey: ["active-online-subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("plans").select("*").eq("user_id", user!.id)
        .eq("training_mode", "online").eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
  });

  const price = Number(plan?.price ?? 0);

  const ptSlot = composeSlot(ptStart, ptEnd);
  const ptReady = isPersonal && ptDays.length === 3 && !!ptSlot && ptEnd > ptStart;

  const buy = async () => {
    if (!user || !plan) return;
    if (isPersonal ? !ptReady : !chosen) return;
    setPaying(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      // The subscription starts life unpaid. The database trigger forbids this
      // client from writing "success", so only a verified payment can activate it.
      const newPlanId = await startCheckout(supabase as any, {
        userId: user.id,
        planOptionId: plan.id,
        row: {
          user_id: user.id,
          plan_option_id: plan.id,
          training_mode: "online",
          training_type: trainingType,
          // Personal has no batch and no trainer yet — an admin assigns one
          // after payment, which is what puts it in their queue.
          batch_id: isPersonal ? null : chosen!.id,
          trainer_id: isPersonal ? null : chosen!.trainer_id,
          training_days: isPersonal ? ptDays : chosen!.days,
          time_slot: isPersonal ? ptSlot : null,
          total_sessions: plan.total_sessions ?? 0,
          duration_months: plan.duration_months ?? null,
          start_date: today,
          // Real dates are set server-side on activation from duration_months;
          // these are placeholders so the NOT NULL columns are satisfied.
          end_date: today,
          renewal_date: today,
          amount: price,
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
          qc.invalidateQueries({ queryKey: ["active-online-subscription", user.id] }),
          qc.invalidateQueries({ queryKey: ["plan", user.id] }),
          qc.invalidateQueries({ queryKey: ["online-sessions", user.id] }),
        ]);
        navigate("/dashboard");
        return;
      }

      // Nothing was activated — the unpaid row simply stays unpaid.
      if (paid.status === "cancelled") toast.info("Payment cancelled. Nothing has been charged.");
      else if (paid.status === "unavailable") toast.error("Payments aren't available right now.");
      else toast.error(paid.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start your purchase");
    } finally {
      setPaying(false);
    }
  };

  if (planQ.isLoading) {
    return <div className="p-6 text-sm" style={{ color: MUTED }}>Loading plan…</div>;
  }
  if (!plan) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: MUTED }}>That plan isn't available.</p>
        <Link to="/plan" className="mt-3 inline-block text-sm underline" style={{ color: NAVY }}>Back to plans</Link>
      </div>
    );
  }

  const gatewayReady = gatewayQ.data?.enabled === true;
  const current = currentQ.data;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl sm:text-3xl" style={{ color: NAVY }}>
        {plan.name}
      </h1>
      <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
        Online · {trainingType === "personal" ? "Personal" : "Group"} training
      </p>

      <div className="mt-5 rounded-2xl border p-5" style={{ borderColor: BORDER, background: "#fff" }}>
        <div className="flex items-baseline justify-between">
          <span className="font-display text-3xl" style={{ color: NAVY }}>₹{price.toLocaleString("en-IN")}</span>
          <span className="text-[13px]" style={{ color: MUTED }}>
            {plan.duration_months} {plan.duration_months === 1 ? "month" : "months"} · {plan.total_sessions} sessions
          </span>
        </div>
      </div>

      {current && (
        <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: BORDER, background: "#fff" }}>
          <p className="text-[13px]" style={{ color: NAVY }}>
            You already have an active plan running to <strong>{current.end_date}</strong>. Buying
            another starts a new subscription — your current one is kept in your history.
          </p>
        </div>
      )}

      <p className="mt-6 text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>
        Choose your schedule
      </p>

      {isPersonal ? (
        /*
         * One-to-one training is arranged around the customer, not around a
         * batch that already exists — so they pick the days and the time they
         * want. An admin confirms a trainer against real availability after
         * payment, and may adjust this; whatever they settle on flows straight
         * back to the customer's own screens.
         */
        <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: BORDER, background: "#fff" }}>
          <p className="text-[13px] font-semibold" style={{ color: NAVY }}>
            Pick 3 days that suit you
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = ptDays.includes(d);
              const full = ptDays.length >= 3 && !on;
              return (
                <button key={d} type="button" disabled={full}
                  onClick={() => setPtDays((p) => (on ? p.filter((x) => x !== d) : [...p, d]))}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40"
                  style={on
                    ? { background: NAVY, color: "#fff", borderColor: NAVY }
                    : { background: "#fff", color: MUTED, borderColor: BORDER }}>
                  {d.slice(0, 3)}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[12px]" style={{ color: MUTED }}>
            {ptDays.length}/3 selected
          </p>

          <p className="mt-4 text-[13px] font-semibold" style={{ color: NAVY }}>
            What time works for you?
          </p>
          <div className="mt-2 flex w-full min-w-0 items-center gap-2">
            <Input type="time" className="min-w-0 flex-1 px-2" value={ptStart}
              onChange={(e) => pickStart(e.target.value)} aria-label="Preferred start time" />
            <span className="shrink-0 text-[13px]" style={{ color: MUTED }}>–</span>
            <Input type="time" className="min-w-0 flex-1 px-2" value={ptEnd}
              onChange={(e) => { setEndTouched(true); setPtEnd(e.target.value); }} aria-label="Preferred end time" />
          </div>
          <p className="mt-2 text-[12px]" style={{ color: MUTED }}>
            We'll confirm your trainer for this time and message you on WhatsApp.
          </p>
        </div>
      ) : (
      <div className="mt-3 space-y-3">
        {batchesQ.isLoading && <p className="text-sm" style={{ color: MUTED }}>Loading schedules…</p>}
        {!batchesQ.isLoading && batches.length === 0 && (
          <div className="rounded-2xl border p-5 text-center" style={{ borderColor: BORDER, background: "#fff" }}>
            <p className="text-[14px]" style={{ color: NAVY }}>No {trainingType} schedules are open right now.</p>
            <p className="mt-1 text-[13px]" style={{ color: MUTED }}>Your coach will get in touch with the next available batch.</p>
          </div>
        )}
        {batches.map((b) => {
          const left = seatsLeft(b, taken[b.id] ?? 0);
          const full = left !== null && left <= 0;
          const active = batchId === b.id;
          return (
            <button
              key={b.id}
              type="button"
              disabled={full}
              onClick={() => setBatchId(b.id)}
              className="w-full rounded-2xl border p-4 text-left transition disabled:opacity-50"
              style={{ borderColor: active ? NAVY : BORDER, background: "#fff", borderWidth: active ? 2 : 1 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: NAVY }}>{batchName(b)}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[13px]" style={{ color: MUTED }}>
                    <CalendarDays className="h-3.5 w-3.5" />{batchDays(b)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13px]" style={{ color: MUTED }}>
                    <Clock className="h-3.5 w-3.5" />{batchTiming(b)}
                  </p>
                  {trainerName(b) && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px]" style={{ color: MUTED }}>
                      <UserRound className="h-3.5 w-3.5" />
                      <span style={{ color: NAVY, fontWeight: 600 }}>{trainerName(b)}</span>
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[12px]" style={{ color: MUTED }}>
                  {full ? "Full" : left !== null ? `${left} left` : ""}
                </span>
              </div>
              {active && <CheckCircle2 className="mt-2 h-4 w-4" style={{ color: NAVY }} />}
            </button>
          );
        })}
      </div>
      )}

      {!gatewayReady && (
        <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: BORDER, background: "#fff" }}>
          <p className="text-[13px]" style={{ color: NAVY }}>
            {gatewayQ.data?.reason === "no_api"
                    ? "Payments only run on the deployed site (or `vercel dev`) — the plain dev server doesn't serve /api."
                    : "Online payments aren't switched on yet. Please contact your coach to complete this purchase."}
          </p>
        </div>
      )}

      <Button
        className="mt-5 h-12 w-full text-[15px]"
        disabled={(isPersonal ? !ptReady : !chosen) || paying || !gatewayReady}
        onClick={buy}
      >
        {paying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening payment…</> : `Pay ₹${price.toLocaleString("en-IN")}`}
      </Button>

      {isPersonal && !ptReady && (
        <p className="mt-2 text-center text-[12px]" style={{ color: MUTED }}>
          {ptDays.length !== 3
            ? "Pick 3 training days to continue."
            : !ptSlot
              ? "Set the time you'd like to train."
              : "End time must be after the start time."}
        </p>
      )}

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px]" style={{ color: MUTED }}>
        <ShieldCheck className="h-3.5 w-3.5" />Secure payment via Razorpay
      </p>
    </div>
  );
}
