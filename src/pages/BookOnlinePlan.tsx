import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, Clock, CreditCard, Loader2,
  UserRound, Users, Hourglass, Video,
} from "lucide-react";
import {
  batchDays, batchName, batchTiming, isJoinable, seatsLeft, validateBatchJoin,
  type OnlineBatch,
} from "@/lib/onlineBatches";
import { STATUS_LABEL, OPEN_STATUSES, slotSummary, type BookingRequest } from "@/lib/bookingRequests";
import { syncPlanForOnlineBooking } from "@/lib/onlinePlanSync";
import { gatewayConfig, payForPlan } from "@/lib/payments";

const GOLD = "#f0a720";
const NAVY = "#1E3A5F";
const MUTED = "#8a8f9e";
const BORDER = "rgba(30,58,95,0.08)";

type Step = 1 | 2 | 3;

/**
 * Online training booking (personal 1-to-1 slots and group batches).
 * Plan → slot/batch → payment placeholder → assignment created.
 *
 * Everything offered here is admin-configured (`online_batches`); nothing is
 * hardcoded. Bookings reuse `booking_requests` with training_mode = 'online'.
 */
export default function BookOnlinePlan() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const [step, setStep] = useState<Step>(2);
  const [batchId, setBatchId] = useState("");
  const [paying, setPaying] = useState(false);
  const [attemptRef] = useState(() => Date.now().toString(36));

  const adminId: string | null = (profile as any)?.assigned_admin_id ?? null;
  const gatewayQ = useQuery({ queryKey: ["gateway-config"], queryFn: gatewayConfig });

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
  const trainingType: "group" | "personal" =
    (plan?.training_type === "personal" ? "personal" : "group");
  const isPersonal = trainingType === "personal";
  const STEPS = ["Plan", isPersonal ? "Slot" : "Batch", "Payment"] as const;

  // Admin-configured offerings + how many seats are already taken.
  const batchesQ = useQuery({
    queryKey: ["online-batches", adminId, trainingType],
    enabled: !!adminId && !!plan,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("online_batches")
        .select("*")
        .eq("assigned_admin_id", adminId)
        .eq("training_type", trainingType)
        .eq("active", true)
        .order("sort_order");
      if (error) return { __notReady: true } as const;

      const list = (data ?? []) as OnlineBatch[];
      if (!list.length) return { list: [], taken: {}, trainers: {} };

      const [{ data: booked }, { data: trainers }] = await Promise.all([
        (supabase as any).from("booking_requests")
          .select("batch_id")
          .in("batch_id", list.map((b) => b.id))
          .in("status", ["pending_trainer_assignment", "trainer_assigned", "training_ongoing"]),
        (supabase as any).from("trainers")
          .select("id, name, specialization")
          .in("id", list.map((b) => b.trainer_id).filter(Boolean)),
      ]);

      const taken: Record<string, number> = {};
      for (const r of (booked ?? []) as any[]) taken[r.batch_id] = (taken[r.batch_id] ?? 0) + 1;
      return {
        list,
        taken,
        trainers: Object.fromEntries(((trainers ?? []) as any[]).map((t) => [t.id, t])),
      };
    },
  });
  const notReady = (batchesQ.data as any)?.__notReady === true;
  const batches: OnlineBatch[] = (batchesQ.data as any)?.list ?? [];
  const taken: Record<string, number> = (batchesQ.data as any)?.taken ?? {};
  const trainers: Record<string, any> = (batchesQ.data as any)?.trainers ?? {};
  const chosen = useMemo(() => batches.find((b) => b.id === batchId) ?? null, [batches, batchId]);

  // Existing booking — blocks a double purchase and survives a refresh.
  const existingQ = useQuery({
    queryKey: ["my-booking-request", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("booking_requests").select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (error) return null;
      return (data ?? null) as BookingRequest | null;
    },
  });
  const latest = existingQ.data as BookingRequest | null;
  const existing = latest && OPEN_STATUSES.includes(latest.status) ? latest : null;

  // The subscription behind this booking — used to offer "Complete payment"
  // when a customer cancelled the Razorpay window and came back.
  const subQ = useQuery({
    queryKey: ["my-subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("plans").select("*").eq("user_id", user!.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
  });

  const existingBatchQ = useQuery({
    queryKey: ["existing-batch", existing?.batch_id],
    enabled: !!(existing as any)?.batch_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("online_batches").select("*").eq("id", (existing as any).batch_id).maybeSingle();
      if (!data) return null;
      const { data: t } = data.trainer_id
        ? await (supabase as any).from("trainers").select("name, contact").eq("id", data.trainer_id).maybeSingle()
        : { data: null };
      return { batch: data as OnlineBatch, trainer: t };
    },
  });

  const back = () => (step === 2 ? navigate("/plan") : setStep((s) => (s - 1) as Step));

  /**
   * Payment placeholder + assignment creation.
   * When the gateway is wired up, only this call moves behind its callback —
   * the assignment shape, statuses and admin views stay the same.
   */
  const payAndCreate = async () => {
    if (!user || !chosen) return;
    setPaying(true);
    try {
      // Is the payment gateway live? When it isn't, this whole flow behaves
      // exactly as it did before — booking confirmed, money collected outside.
      const { enabled: gateway } = await gatewayConfig();

      const guard = await validateBatchJoin(supabase as any, chosen.id, adminId, trainingType);
      if (guard.error) { toast.error(guard.error); qc.invalidateQueries({ queryKey: ["online-batches"] }); return; }

      const payload = {
        user_id: user.id,
        plan_option_id: plan?.id ?? null,
        assigned_admin_id: adminId,
        training_mode: "online",
        training_type: trainingType,
        batch_id: chosen.id,
        trainer_id: chosen.trainer_id,       // known upfront online — no admin assignment needed
        preferred_days: chosen.days,
        preferred_time: batchTiming(chosen),
        payment_ref: `local-${user.id}-${plan?.id ?? "plan"}-${attemptRef}`,
        payment_status: gateway ? "pending" : "pending_gateway",
        status: chosen.trainer_id ? "trainer_assigned" : "pending_trainer_assignment",
        ...(chosen.trainer_id ? { assigned_at: new Date().toISOString() } : {}),
      };

      // Capture the new booking's id so the plan it creates can point back at
      // it — that link is what keeps one booking from producing two plans.
      const { data: inserted, error } = await (supabase as any)
        .from("booking_requests").insert(payload).select("id").maybeSingle();
      if (error) {
        if (/duplicate key|unique/i.test(error.message)) {
          await qc.invalidateQueries({ queryKey: ["my-booking-request", user.id] });
          toast.info("You already have a booking.");
          return;
        }
        throw error;
      }

      // Create the plans row this booking implies — the calendar, active-plan
      // card and session counts all derive from `plans`, exactly as offline.
      const planSync = await syncPlanForOnlineBooking(supabase as any, {
        user_id: user.id,
        plan_option_id: plan?.id ?? null,
        preferred_days: chosen.days,
        status: payload.status as any,
        training_mode: "online",
        training_type: trainingType,
        id: (inserted as any)?.id ?? undefined,
        // Unpaid until the server says otherwise. The client is forbidden by
        // database trigger from writing "success" itself.
      }, { paymentStatus: gateway ? "pending" : null });
      if (planSync.error) {
        toast.error("Booked, but your schedule couldn't be set up: " + planSync.error);
      }

      // Charge for it. Only /api/payments/verify can activate the plan, so a
      // cancelled or failed payment simply leaves the booking unpaid.
      let charged: "n/a" | "paid" | "unpaid" = "n/a";
      if (gateway && planSync.planId) {
        const paid = await payForPlan(planSync.planId);
        if (paid.status === "cancelled") {
          charged = "unpaid";
          toast.info("Payment cancelled — your booking is saved, but it isn't active yet.");
        } else if (paid.status === "failed") {
          charged = "unpaid";
          toast.error(paid.message);
        } else if (paid.status === "success") {
          charged = "paid";
        }
        // "unavailable" means the gateway went away between the two calls —
        // fall through to the old behaviour rather than blocking the booking.
      }

      // NOTE: deliberately no profiles.trainer_id / time_slot write here.
      // Those fields are the OFFLINE (society batch) linkage. An online
      // customer's trainer relationship lives on the booking itself
      // (booking_requests.trainer_id + training_mode='online'), which keeps
      // online clients out of the trainer's offline society roster.

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["my-booking-request", user.id] }),
        qc.invalidateQueries({ queryKey: ["plan", user.id] }),
        qc.invalidateQueries({ queryKey: ["all-plans-cal", user.id] }),
      ]);
      if (charged === "paid") toast.success("Payment received — you're all set!");
      else if (charged !== "unpaid") toast.success("You're booked in");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create your booking");
    } finally {
      setPaying(false);
    }
  };

  const Row = ({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) => (
    <li className="flex items-start gap-2 text-[14px]" style={{ color: NAVY }}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: MUTED }} /> <span>{children}</span>
    </li>
  );
  const Empty = ({ title, hint }: { title: string; hint: string }) => (
    <div className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: BORDER, background: "#fff" }}>
      <p className="font-display text-base sm:text-lg" style={{ color: NAVY }}>{title}</p>
      <p className="mt-1 text-[13px]" style={{ color: MUTED }}>{hint}</p>
    </div>
  );

  if (!user) return null;

  // ── Booked state ─────────────────────────────────────────────────────────
  if (existing) {
    const b = existingBatchQ.data?.batch;
    const t = existingBatchQ.data?.trainer;
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-1 sm:px-6">
        <h1 className="font-display text-2xl sm:text-3xl" style={{ color: NAVY }}>Your online training</h1>
        <div className="mt-5 rounded-2xl border p-5" style={{ borderColor: "#bfe6cd", background: "#f2fbf5" }}>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: "#e6f7ed", color: "#1b7a43" }}>
              {existing.trainer_id ? <Check className="h-5 w-5" /> : <Hourglass className="h-5 w-5" />}
            </span>
            <div>
              <p className="font-semibold" style={{ color: NAVY }}>
                {existing.trainer_id ? "You're all set" : "Booking received"}
              </p>
              <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
                {existing.trainer_id
                  ? "Your trainer will share the session link before your first class."
                  : "Our team will confirm your trainer shortly."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: BORDER, background: "#fff" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Booking details</p>
          <ul className="mt-3 space-y-2">
            <Row icon={CreditCard}>{plan?.name ?? "Online plan"}</Row>
            <Row icon={Video}>Online · {existing.training_type === "personal" ? "Personal" : "Group"} training</Row>
            {b && <Row icon={Users}>{batchName(b)}</Row>}
            <Row icon={CalendarDays}>{slotSummary(existing.preferred_days, existing.preferred_time)}</Row>
            <Row icon={UserRound}>Trainer: <strong>{t?.name ?? (existing.trainer_id ? "Assigned" : "Being assigned")}</strong>{t?.contact ? ` · ${t.contact}` : ""}</Row>
            <Row icon={Clock}>Status: <strong>{STATUS_LABEL[existing.status] ?? existing.status}</strong></Row>
          </ul>
          <PaymentLine plan={subQ.data} onPaid={() => {
            qc.invalidateQueries({ queryKey: ["my-subscription", user?.id] });
            qc.invalidateQueries({ queryKey: ["plan", user?.id] });
          }} />
        </div>

        <div className="pt-6 text-center sm:text-left">
          <Link to="/plan" className="text-xs font-semibold" style={{ color: MUTED }}>Back to plans</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-1 sm:px-6">
      <button onClick={back} className="mb-2 inline-flex items-center gap-1.5 py-1 text-sm font-semibold" style={{ color: MUTED }}>
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h1 className="font-display text-2xl sm:text-3xl" style={{ color: NAVY }}>Book your plan</h1>
      <p className="mt-1 text-[13px] sm:text-sm" style={{ color: MUTED }}>
        A few quick steps and your training is set up.
      </p>

      <div className="mt-5 flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          const done = n < step;
          const active = n === step;
          return (
            <div key={label} className="flex flex-1 items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={{ background: done ? "#e6f7ed" : active ? NAVY : "rgba(30,58,95,0.06)", color: done ? "#1b7a43" : active ? "#fff" : MUTED }}>
                  {done ? <Check className="h-3.5 w-3.5" /> : `0${n}`}
                </span>
                <span className="text-[11px] font-semibold sm:text-xs" style={{ color: active ? NAVY : MUTED }}>{label}</span>
              </div>
              {i < STEPS.length - 1 && <span className="h-px flex-1" style={{ background: BORDER }} />}
            </div>
          );
        })}
      </div>

      {plan && (
        <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: GOLD, background: "#fffdf6" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Selected plan</p>
              <p className="mt-0.5 truncate font-semibold" style={{ color: NAVY }}>{plan.name}</p>
              <p className="text-[12px]" style={{ color: MUTED }}>
                {plan.total_sessions} sessions · {plan.duration_months} {plan.duration_months === 1 ? "month" : "months"} · Online {isPersonal ? "personal" : "group"}
              </p>
            </div>
            <p className="shrink-0 text-xl font-bold sm:text-2xl" style={{ color: NAVY }}>
              ₹{Number(plan.price).toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      )}

      {/* ── Step 2: slot / batch ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="mt-6">
          <h2 className="font-display text-lg sm:text-xl" style={{ color: NAVY }}>
            {isPersonal ? "Choose your 1-to-1 slot" : "Choose your batch"}
          </h2>
          <p className="text-[12px]" style={{ color: MUTED }}>
            {isPersonal ? "Live online sessions with your own trainer." : "Live online sessions with a small group."}
          </p>

          <div className="mt-3">
            {batchesQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border p-8 text-sm" style={{ borderColor: BORDER, background: "#fff", color: MUTED }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : notReady ? (
              <Empty title="Online booking isn't enabled yet" hint="Run the online_batches migration in Supabase." />
            ) : batchesQ.isError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                Something went wrong loading this step.
                <Button variant="outline" size="sm" className="ml-3" onClick={() => batchesQ.refetch()}>Retry</Button>
              </div>
            ) : batches.length === 0 ? (
              <Empty
                title={isPersonal ? "No slots available currently." : "No batches available currently."}
                hint="Please check back soon or contact your admin."
              />
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                {batches.map((b) => {
                  const used = taken[b.id] ?? 0;
                  const left = seatsLeft(b, used);
                  const joinable = isJoinable(b, used);
                  const on = batchId === b.id;
                  const t = b.trainer_id ? trainers[b.trainer_id] : null;
                  return (
                    <button
                      key={b.id}
                      disabled={!joinable}
                      onClick={() => setBatchId(b.id)}
                      className="flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all sm:p-4"
                      style={{
                        borderColor: on ? GOLD : BORDER,
                        background: on ? "#fffdf6" : "#fff",
                        opacity: joinable ? 1 : 0.55,
                        cursor: joinable ? "pointer" : "not-allowed",
                      }}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(240,167,32,0.12)", color: GOLD }}>
                        {isPersonal ? <UserRound className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold" style={{ color: NAVY }}>{batchName(b)}</span>
                        <span className="mt-0.5 block text-[12px]" style={{ color: MUTED }}>
                          {batchDays(b)}{batchTiming(b) ? ` · ${batchTiming(b)}` : ""}
                        </span>
                        {t?.name && (
                          <span className="mt-0.5 block text-[12px]" style={{ color: MUTED }}>with {t.name}</span>
                        )}
                        <span className="mt-1 block text-[11px]" style={{ color: left === 0 ? "#a3312b" : MUTED }}>
                          {left == null ? "Open" : left === 0 ? "Full" : `${left} seat${left === 1 ? "" : "s"} left`}
                        </span>
                      </span>
                      {on && <Check className="h-5 w-5 shrink-0" style={{ color: GOLD }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Button disabled={!batchId} onClick={() => setStep(3)} className="mt-5 w-full gap-2 sm:ml-auto sm:w-auto sm:px-6">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ── Step 3: payment placeholder ──────────────────────────────────── */}
      {step === 3 && chosen && (
        <div className="mt-6">
          <h2 className="font-display text-lg sm:text-xl" style={{ color: NAVY }}>Review &amp; pay</h2>
          <div className="mt-3 rounded-2xl border p-5" style={{ borderColor: BORDER, background: "#fff" }}>
            <ul className="space-y-2">
              <Row icon={CreditCard}>{plan?.name} · ₹{Number(plan?.price ?? 0).toLocaleString("en-IN")}</Row>
              <Row icon={Video}>Online · {isPersonal ? "Personal" : "Group"} training</Row>
              <Row icon={Users}>{batchName(chosen)}</Row>
              <Row icon={CalendarDays}>{batchDays(chosen)}{batchTiming(chosen) ? ` · ${batchTiming(chosen)}` : ""}</Row>
              <Row icon={UserRound}>
                Trainer: <strong>{chosen.trainer_id ? (trainers[chosen.trainer_id]?.name ?? "Assigned") : "Assigned by our team"}</strong>
              </Row>
            </ul>
          </div>

          {gatewayQ.data?.enabled === false && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Online payment isn't live yet. Continuing confirms your booking and our team
              will collect payment with you.
            </div>
          )}

          <Button onClick={payAndCreate} disabled={paying} className="mt-5 w-full gap-2 sm:ml-auto sm:w-auto sm:px-6">
            {paying ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <>Proceed to payment <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </div>
      )}

      <div className="pt-6 text-center sm:text-left">
        <Link to="/plan" className="text-xs font-semibold" style={{ color: MUTED }}>Cancel and go back to plans</Link>
      </div>
    </div>
  );
}

/**
 * Payment state for a booked plan, in the customer's language.
 *
 * A cancelled or failed payment is recoverable: the subscription is still
 * there, unpaid, and this offers the way back to it. Activation itself is
 * always the server's decision — this only re-opens the checkout.
 */
function PaymentLine({ plan, onPaid }: { plan: any; onPaid: () => void }) {
  const [busy, setBusy] = useState(false);
  const state = plan?.payment_status as string | null | undefined;

  // NULL predates the gateway: those plans are settled outside the app.
  if (!plan || state == null || state === "success") {
    return (
      <p className="mt-4 text-[12px]" style={{ color: MUTED }}>
        Payment: <strong>{state === "success" ? "Paid" : "Confirmed with your coach"}</strong>
      </p>
    );
  }

  const retry = async () => {
    setBusy(true);
    try {
      const r = await payForPlan(plan.id);
      if (r.status === "success") { toast.success("Payment received — you're all set!"); onPaid(); }
      else if (r.status === "failed") toast.error(r.message);
      else if (r.status === "cancelled") toast.info("Payment cancelled.");
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-4">
      <p className="text-[12px]" style={{ color: MUTED }}>
        Payment: <strong>{state === "failed" ? "Payment failed" : "Not completed yet"}</strong>
      </p>
      <Button size="sm" className="mt-2" onClick={retry} disabled={busy}>
        {busy ? "Opening…" : "Complete payment"}
      </Button>
    </div>
  );
}
