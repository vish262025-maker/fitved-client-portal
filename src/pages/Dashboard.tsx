import { useRef, useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight, Check, Gift, Flame,
  FileHeart, CalendarOff, UserCircle2,
  CalendarOff as CalendarOffIcon, CreditCard, Download, MapPin, Clock, UserRound, ArrowRight,
} from "lucide-react";
import { formatDate, daysBetween } from "@/lib/dates";
import { calculatePlanEndDate, countLostTrainingDays, extendEndDateBySessions, formatPlanName, isoDate } from "@/lib/sessionPlan";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { usePauseStore, recalculatePlanDates } from "@/stores/pauseStore";
import { toast } from "sonner";
import { latestAssignment, canSkipBooking, repurchase } from "@/lib/repurchase";
import { supportWhatsAppUrl, SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";
import { useCanPauseClasses } from "@/hooks/useCanPauseClasses";
import { SocietyBatches } from "@/components/dashboard/SocietyBatches";
import { TrainerPauses } from "@/components/dashboard/TrainerPauses";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ClassCalendar } from "@/components/dashboard/ClassCalendar";
import { MarketingFeed } from "@/components/dashboard/MarketingFeed";
import { AddEmailCard } from "@/components/dashboard/AddEmailCard";
import { ClassModeGate } from "@/components/dashboard/ClassModeGate";
import { OnlineSessionCard } from "@/components/dashboard/OnlineSessionCard";
import { useIsOnlineCustomer } from "@/hooks/useIsOnlineCustomer";
import { deriveSubscriptionStatus, isPaid } from "@/lib/subscription";
import { useSessions } from "@/hooks/useSessions";

// ── Design tokens ──────────────────────────────────────────────────────────────
const GOLD       = "#f0a720";
const GOLD_LIGHT = "#fef3d0";
const NAVY       = "#1E3A5F";
const NAVY_LIGHT = "#2d5a8e";
const MUTED      = "#8a8f9e";
const BORDER     = "rgba(30,58,95,0.08)";
const GREEN      = "#2e9e5b";
const GREEN_LIGHT = "#e6f7ed";
const BLUE_SOFT  = "#4d9dff";  // base classes (sessions left)
const RED        = "#d23b34";  // expiring / expired urgency
const GOLD_DARK  = "#5a3c05";  // text on gold buttons

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Today as a local YYYY-MM-DD string (avoids the UTC off-by-one). */
function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Returns 0=Mon … 6=Sun */
function getTodayIdx() {
  const d = new Date().getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1;
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const { data: profile } = useProfile();
  const { activePause, history } = usePauseStore();
  // Pause classes are offline-only, so online customers never see them.
  const { isOnline: isOnlineCustomer } = useIsOnlineCustomer();
  const { canPause } = useCanPauseClasses();
  const navigate = useNavigate();

  // Class-calendar expand state — controllable from the calendar and the next-session card.
  const [calExpanded, setCalExpanded] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);
  const expandCalendar = () => {
    setCalExpanded(true);
    requestAnimationFrame(() => calRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const firstName = (profile?.name ?? user?.email?.split("@")[0] ?? "there").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ── Data queries (unchanged from original) ──────────────────────────────────
  /**
   * "Your plan" means the plan they bought.
   *
   * This took the newest row of any kind, so abandoning a checkout replaced a
   * real, completed subscription with the unpaid shell of one — the dashboard
   * then said "this plan was never activated" to a customer who had in fact
   * paid, trained, and finished a plan. A never-paid row is only the answer
   * when there is no purchase to show at all.
   */
  const { data: plan } = useQuery({
    queryKey: ["plan", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("plans").select("*").eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      const rows = data ?? [];
      // NULL payment_status = collected outside the app, which counts as paid.
      const paid = rows.find((p: any) => p.payment_status == null || p.payment_status === "success");
      return paid ?? rows[0] ?? null;
    },
  });

  // Real session records for this customer — the calendar prefers these over
  // deriving days from the plan's date range.
  const { data: mySessions = [] } = useSessions(user?.id);

  const { data: allPlans = [] } = useQuery({
    queryKey: ["all-plans-cal", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("plans").select("start_date, end_date, training_days, status, payment_status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      return (data ?? []) as { start_date: string; end_date: string; training_days: string[] | null; status: string }[];
    },
  });

  const calRange = useMemo(() => {
    // A checkout that was never paid still has a start/end date. Including it
    // painted classes across months the customer never bought — her calendar
    // ran to November off the back of three abandoned attempts.
    const paidPlans = allPlans.filter(
      (p: any) => p.payment_status == null || p.payment_status === "success",
    );
    if (!paidPlans.length) return null;
    const starts = paidPlans.map((p) => p.start_date).sort();
    const ends = paidPlans.map((p) => p.end_date).sort();
    const allDays = new Set<string>();
    paidPlans.forEach((p: any) => (p.training_days ?? []).forEach((d: string) => allDays.add(d)));
    return {
      startDate: starts[0],
      endDate: ends[ends.length - 1],
      trainingDays: [...allDays],
      ranges: paidPlans.map((p: any) => ({ start: p.start_date, end: p.end_date })),
    };
  }, [allPlans]);

  const { data: latestReport } = useQuery({
    queryKey: ["latest-report", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("health_reports").select("*").eq("client_id", user!.id)
        .order("report_date", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  // profiles.trainer_id references trainers.id — look the name up there.
  const { data: trainerName } = useQuery({
    queryKey: ["trainer-name", profile?.trainer_id],
    enabled: !!profile?.trainer_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("trainers").select("name").eq("id", profile!.trainer_id!).maybeSingle();
      return data?.name ?? null;
    },
  });

  // Online customers' trainer/schedule come from their booking, not from the
  // society-based profile fields.
  const { data: onlineBooking } = useQuery({
    queryKey: ["dash-online-booking", user?.id],
    enabled: !!user && isOnlineCustomer,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("booking_requests")
        .select("trainer_id, preferred_time")
        .eq("user_id", user!.id).eq("training_mode", "online")
        .in("status", ["pending_trainer_assignment", "trainer_assigned", "training_ongoing"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
  });

  const { data: onlineTrainerName } = useQuery({
    queryKey: ["dash-online-trainer", onlineBooking?.trainer_id],
    enabled: !!onlineBooking?.trainer_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainers").select("name").eq("id", onlineBooking.trainer_id).maybeSingle();
      return (data?.name ?? null) as string | null;
    },
  });

  // Trainer off-days for this client's trainer — surfaced on the class calendar.
  const { data: offTimes = [] } = useQuery({
    queryKey: ["trainer-off-times", profile?.trainer_id],
    enabled: !!profile?.trainer_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("trainer_off_times")
        .select("from_date,to_date,time_slot,reason")
        .eq("trainer_id", profile!.trainer_id!);
      return data ?? [];
    },
  });

  // Extra classes the trainer took to compensate off-days — they consume the
  // customer's off-day bonus. (Empty until the comp_classes migration runs.)
  const { data: compClasses = [] } = useQuery({
    queryKey: ["comp-classes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("comp_classes").select("id, class_date").eq("client_id", user!.id);
      return (data ?? []) as { id: string; class_date: string }[];
    },
  });

  // Renewal price comes from the plan catalog (matched by session count),
  // with this customer's custom price taking priority — not from whatever
  // the old plan happened to cost.
  // Static catalog + per-user overrides — fetched in parallel with the plan
  // query instead of waiting for it (they don't depend on its result).
  const { data: planOptions = [] } = useQuery({
    queryKey: ["plan-options"],
    queryFn: async () => {
      // `as any`: the generated types predate the category columns, which
      // exist in the live database.
      const { data } = await (supabase as any)
        .from("plan_options").select("id,price,total_sessions,class_mode,training_type").eq("active", true);
      return (data ?? []) as { id: string; price: number; total_sessions: number;
        class_mode: string | null; training_type: string | null }[];
    },
  });

  const { data: priceOverrides = [] } = useQuery({
    queryKey: ["plan-price-overrides", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_price_overrides").select("plan_option_id,price").eq("user_id", user!.id);
      return data ?? [];
    },
  });

  // The catalogue row they are renewing into — the same plan they bought.
  const renewOption = (() => {
    const optId = (plan as any)?.plan_option_id;
    if (!optId) return null;
    return planOptions.find((o: any) => o.id === optId) ?? null;
  })();

  /**
   * What Renew costs: the listed price of the plan they are renewing.
   *
   * Not what the old plan happened to cost. A discount an admin gave on one
   * term is a one-off for that term — carrying it forward would quietly make
   * every future renewal cheaper than the plan is sold for. Where a customer
   * has their own listed price, that is what their plan cards already show,
   * so that is what they are charged. /api/payments/create-order resolves the
   * identical figure server-side before charging it.
   */
  const renewalPrice = (() => {
    if (renewOption) {
      const own = priceOverrides.find((o) => o.plan_option_id === (renewOption as any).id);
      return Math.round(Number(own?.price ?? (renewOption as any).price ?? 0));
    }
    // No catalogue row to price against — fall back to what the plan records.
    return plan ? Math.round(Number(plan.amount ?? 0)) : 0;
  })();

  // ── Derived values ──────────────────────────────────────────────────────────
  const totalDays   = plan ? daysBetween(plan.start_date, plan.end_date) : 0;
  const elapsedDays = plan ? daysBetween(plan.start_date, new Date().toISOString()) : 0;
  // Clamped at both ends: a plan that starts tomorrow has negative elapsed
  // days, which drove the progress bar and "sessions used" below zero.
  const progress    = totalDays > 0
    ? Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)))
    : 0;
  const sessionsUsed  = plan ? Math.round((plan.total_sessions * progress) / 100) : 0;
  const sessionsLeft  = plan ? Math.max(0, plan.total_sessions - sessionsUsed) : 0;

  // Carry-forward = training days lost DURING the current plan period, both to
  // the customer's own pauses (capped at 1/3 of the plan) and to trainer
  // off-days (bonus classes — never capped), matching recalculatePlanDates.
  // Extra classes the trainer already took to compensate reduce the bonus.
  const allPauses = [...history, ...(activePause ? [activePause] : [])];
  const planBaseEnd = plan
    ? isoDate(calculatePlanEndDate(plan.start_date, plan.total_sessions, plan.training_days ?? []))
    : "";
  const lostDays = plan
    ? countLostTrainingDays(
        plan.start_date, planBaseEnd, plan.training_days ?? [],
        allPauses, offTimes, profile?.time_slot ?? null,
      )
    : { pausedLost: 0, offLost: 0 };
  const compTaken = plan
    ? compClasses.filter((c) => c.class_date >= plan.start_date).length
    : 0;
  const carryForward = plan
    ? Math.min(lostDays.pausedLost, Math.floor(plan.total_sessions / 3)) +
      Math.max(0, lostDays.offLost - compTaken)
    : 0;
  const baseTotal  = plan?.total_sessions ?? 0;
  const capacity   = baseTotal + carryForward;            // all classes incl. carried
  // Bar segment widths (track scaled to full capacity; attended portion stays empty)
  const blueW   = capacity > 0 ? (sessionsLeft / capacity) * 100 : 0;
  const orangeW = capacity > 0 ? (carryForward / capacity) * 100 : 0;

  // Self-heal: if the stored end date drifts from what pauses + trainer
  // off-days − extra classes say it should be (e.g. data edited outside the
  // app), recalculate once so every surface shows the same accurate dates.
  useEffect(() => {
    if (!plan || plan.status !== "active" || !user) return;
    if (!(plan.training_days ?? []).length) return;
    const expectedEnd = isoDate(
      extendEndDateBySessions(
        calculatePlanEndDate(plan.start_date, plan.total_sessions, plan.training_days),
        carryForward,
        plan.training_days,
      ),
    );
    if (expectedEnd !== plan.end_date) {
      recalculatePlanDates(user.id).then(() => {
        qc.invalidateQueries({ queryKey: ["plan", user.id] });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, plan?.end_date, carryForward]);

  // Expired plans complete automatically (legacy "paused" rows migrate too).
  // Renewal is always a manual admin action.
  useEffect(() => {
    // An unpaid plan is not "running", so it must never auto-complete —
    // that would quietly retire a subscription that was never activated.
    if (plan && isPaid(plan) && (plan.status === "active" || plan.status === "paused")) {
      const todayISO = todayLocalISO();
      if (plan.end_date < todayISO) {
        supabase
          .from("plans")
          .update({ status: "completed" })
          .eq("id", plan.id)
          .then(({ error }) => {
            if (!error) {
              qc.invalidateQueries({ queryKey: ["plan", user?.id] });
            }
          });
      }
    }
  }, [plan, user?.id, qc]);

  // ── Renewal urgency ───────────────────────────────────────────────────────
  const todayISO    = todayLocalISO();
  const planEnded   = plan?.status === "cancelled" || plan?.status === "completed" || plan?.status === "paused" || (plan as any)?.status === "stopped";
  // Derived, not read off the row: a plan past its end date or awaiting
  // payment is not active no matter what `status` still says.
  /**
   * A plan the customer can actually train on.
   *
   * A personal plan waiting on its trainer is paid for but has not begun —
   * showing it as running gave a progress ring, a "sessions left" count and a
   * renewal date for a term that has not started, next to a card saying we are
   * still arranging their trainer. It counts as active only once someone is
   * assigned to teach it. (`awaitingTrainer` is defined just below.)
   */
  const hasActivePlan =
    deriveSubscriptionStatus(plan) === "active" &&
    !(!!plan && isPaid(plan) && (plan as any).training_type === "personal" && !(plan as any).trainer_id);
  const expired     = !!plan && (plan.end_date < todayISO || planEnded);
  const daysToEnd   = plan ? Math.max(0, daysBetween(todayISO, plan.end_date) - 1) : 0;
  const daysSinceRenewal = plan ? Math.max(0, daysBetween(plan.renewal_date, todayISO) - 1) : 0;
  /** The plan is under way — its first day has arrived. */
  const planStarted = !!plan && !!plan.start_date && plan.start_date <= todayISO;

  /**
   * Renewal urgency means running out. It requires having started.
   *
   * `sessionsLeft <= 1` alone was true from the moment a one-session plan was
   * bought, so a customer who had just paid — and whose first class was still
   * a day away — was told "final session coming up, renew now". Nothing had
   * been used yet. Time-based expiry still stands on its own, because a plan
   * genuinely near its end date is worth flagging however few classes ran.
   */
  const expiring    = !!plan && !expired && planStarted &&
    (daysToEnd <= 3 || (sessionsLeft <= 1 && sessionsUsed > 0));
  /**
   * Paid, but nobody is teaching them yet.
   *
   * Offline personal training has no batch to join, so the trainer is picked
   * by an admin after payment. Until that happens the customer is waiting on
   * us — pressing them to renew in the meantime reads as being asked to pay
   * twice for a plan that hasn't started, so this state replaces the renewal
   * nudge entirely.
   */
  const awaitingTrainer =
    !!plan && isPaid(plan) &&
    // Personal training has no batch to join, online or offline: a trainer is
    // arranged for this customer specifically, after payment.
    (plan as any).training_type === "personal" &&
    !(plan as any).trainer_id &&
    !expired;

  const renewUrgent = (expiring || expired) && !awaitingTrainer;
  const upiAmount   = renewalPrice;

  // UPI deep link — opens the customer's UPI app prefilled with FitVed's VPA,
  // the renewal amount, and a note naming the customer + the plan they're
  // renewing. Works on mobile; on desktop it depends on a UPI handler.
  const UPI_VPA  = "Vish26nov@okicici";
  const UPI_NAME = "FitVed";
  const planLabelForNote =
    baseTotal === 12 ? "1 Month plan" :
    baseTotal === 36 ? "3 Month plan" :
    baseTotal === 72 ? "6 Month plan" :
    baseTotal === 8  ? "Trial plan" :
    `${baseTotal} sessions plan`;
  const upiNote  = `${profile?.name ?? firstName} - renew ${planLabelForNote}`;

  /**
   * Where "Renew" goes.
   *
   * It used to be a `upi://` deep link straight to a fixed VPA — the OS handed
   * that to whatever claimed the scheme (WhatsApp), and money paid that way
   * created no order, passed no signature check and activated nothing.
   * Renewal is a new purchase, so it goes through the normal booking + Razorpay
   * flow. Deep-links to the same plan when we know which one it was.
   */
  // Where the customer already trains. Sourced from their own plan rows, so a
  // renewal keeps the same society, day pattern, slot and trainer.
  const { data: assignmentPlans = [] } = useQuery({
    queryKey: ["plan-assignments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("plans")
        .select("training_mode, training_type, society_id, day_set_id, training_days, time_slot, trainer_id, booking_request_id, payment_status, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const assignment = latestAssignment(assignmentPlans as any);

  const [renewing, setRenewing] = useState(false);

  /**
   * Renew. Nothing to ask — the society, days and slot are unchanged and the
   * plan is the one they already had — so this opens the gateway directly.
   * Only if we somehow can't reconstruct the assignment does it fall back to
   * the booking flow, which asks.
   */
  const renewNow = async () => {
    if (renewing) return;
    if (!renewOption || !canSkipBooking(assignment, renewOption as any)) { navigate(renewTo); return; }
    setRenewing(true);
    try {
      const r = await repurchase(supabase as any, { userId: user!.id, option: renewOption as any, assignment });
      if (r.status === "success") {
        toast.success("Payment received — your plan is active.");
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["plan", user!.id] }),
          qc.invalidateQueries({ queryKey: ["sessions", user!.id] }),
          qc.invalidateQueries({ queryKey: ["plan-assignments", user!.id] }),
        ]);
        return;
      }
      if (r.status === "cancelled") toast.info("Payment cancelled. Nothing has been charged.");
      else if (r.status === "not_eligible" || r.status === "unavailable") navigate(renewTo);
      else toast.error((r as any).message ?? "Payment failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start your renewal");
    } finally {
      setRenewing(false);
    }
  };

  const renewTo = (() => {
    const opt = (plan as any)?.plan_option_id;
    if (!opt) return "/plan";
    const online = (plan as any)?.training_mode === "online";
    const personal = (plan as any)?.training_type === "personal";
    if (online) return `/plan/book-online/${opt}`;
    return personal ? `/plan/book-personal/${opt}` : `/plan/book/${opt}`;
  })();

  const trainingDays: string[] = (plan?.training_days ?? []).map((d: string) => d.slice(0, 3));
  const todayIdx     = getTodayIdx();
  // The booking flow records the slot/society on the plan; the profile is only
  // mirrored at activation. Fall back to the plan so nothing renders as "—".
  const slotLabel = (isOnlineCustomer ? onlineBooking?.preferred_time : (profile?.time_slot ?? (plan as any)?.time_slot)) ?? null;
  const societyLabel = profile?.society ?? null;

  const nextTrainingDay = WEEK_DAYS.find((d, i) => i >= todayIdx && trainingDays.includes(d))
    ?? trainingDays[0]
    ?? null;

  const handleDownload = async () => {
    if (!latestReport?.file_path) { toast.error("No file attached"); return; }
    const { data, error } = await supabase.storage
      .from("health-reports").createSignedUrl(latestReport.file_path, 60);
    if (error || !data) { toast.error("Could not generate download link"); return; }
    window.open(data.signedUrl, "_blank");
  };

  // ── Mobile layout ───────────────────────────────────────────────────────────
  /** Shown while a paid personal plan is waiting on us to assign a trainer. */
  const AwaitingTrainerCard = ({ compact = false }: { compact?: boolean }) => (
    <div
      className={compact ? "mt-4 rounded-xl p-4" : "mx-4 mt-3 rounded-[24px] p-5"}
      style={{ background: "rgba(240,167,32,0.09)", border: `1px solid ${GOLD}` }}
    >
      <div className="flex items-start gap-2.5">
        <span className="grid place-items-center rounded-xl shrink-0"
          style={{ width: 32, height: 32, background: "rgba(240,167,32,0.2)" }}>
          <Clock size={16} color={GOLD_DARK} />
        </span>
        <div className="min-w-0">
          <p className="font-display" style={{ fontSize: 17, color: NAVY }}>
            Your request has been sent
          </p>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
            Payment received. We're assigning your personal trainer — your classes begin the day
            after they're assigned, so no days are lost while you wait.
          </p>
        </div>
      </div>
      <a
        href={supportWhatsAppUrl("Hi FitVed, I've paid for my personal training plan and I'd like an update on my trainer.")}
        target="_blank" rel="noopener noreferrer"
        className="mt-3.5 flex items-center justify-center gap-2 rounded-xl font-semibold"
        style={{ background: NAVY, color: "#fff", fontSize: 14, padding: "11px 0", textDecoration: "none" }}
      >
        Chat with support on WhatsApp
      </a>
      <p className="text-center" style={{ fontSize: 12, color: MUTED, marginTop: 7 }}>
        {SUPPORT_WHATSAPP_DISPLAY}
      </p>
    </div>
  );

  const MobileLayout = () => (
    <div style={{ background: "#f4f2ee", minHeight: "100%" }}>

      {awaitingTrainer && <AwaitingTrainerCard />}

      {/* Renewal urgency card (expiring / expired) */}
      {renewUrgent && plan && (
        <div
          onClick={() => navigate("/plan")}
          role="button"
          tabIndex={0}
          className="mx-4 mt-3 rounded-[28px] overflow-hidden relative cursor-pointer"
          style={{ background: RED, padding: "22px 24px 22px" }}
        >
          <div className="pointer-events-none absolute rounded-full"
            style={{ top: -40, right: -40, width: 140, height: 140, background: "rgba(255,255,255,0.08)" }} />

          {expired ? (
            <>
              <div className="flex items-center gap-2 mb-2 relative">
                <Clock size={16} color="#fff" />
                <span className="text-[12px] font-bold text-white">
                  {`Plan to be renewed on ${formatDate(plan.renewal_date).replace(/,?\s*\d{4}$/, "")}${daysSinceRenewal > 0 ? ` · ${daysSinceRenewal} day${daysSinceRenewal === 1 ? "" : "s"} ago` : " · today"}`}
                </span>
              </div>
              <h1 className="font-display text-white relative" style={{ fontSize: 23, fontWeight: 600, lineHeight: 1.25 }}>
                {isPaid(plan) ? "Your momentum is waiting" : "Finish setting up your plan"}
              </h1>
              <p className="text-[13px] leading-relaxed text-white/85 mt-2">
                {/* A plan can end without a single session — an abandoned
                    checkout, or one stopped early. Claiming they completed
                    every session would simply be untrue. */}
                {isPaid(plan)
                  ? `You completed all ${baseTotal} sessions — real consistency. Pick up right where you left off before the habit fades.`
                  : "This plan was never activated because the payment didn't go through. Pick it up again whenever you're ready."}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3 relative">
                <Flame size={17} color="#fff" />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Final session coming up</span>
              </div>
              <h3 className="font-display font-semibold text-white relative" style={{ fontSize: 20 }}>
                {formatPlanName(baseTotal)}
              </h3>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 6, lineHeight: 1.4 }} className="relative">
                {trainingDays.length > 0 ? trainingDays.join(", ") : "No days set"}
                {profile?.time_slot ? ` · ${profile.time_slot}` : ""}
              </p>
              <div className="relative" style={{ marginTop: 12 }}>
                <div className="rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "#fff" }} />
                </div>
              </div>
              <p className="relative" style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 12, lineHeight: 1.5 }}>
                {sessionsUsed} of {baseTotal} done — you've shown up week after week. Don't lose the rhythm now.
              </p>
            </>
          )}

          <a
            href={renewTo}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); renewNow(); }}
            className="relative w-full flex items-center justify-center gap-1.5 rounded-2xl cursor-pointer"
            style={{ background: GOLD, padding: "13px", marginTop: 16, fontSize: 14, fontWeight: 700, color: GOLD_DARK, textDecoration: "none" }}
          >
            {renewing ? "Opening payment…" : `${expired ? "Renew now" : "Renew & keep it going"} · ₹${upiAmount.toLocaleString("en-IN")}`}
            <ArrowRight size={16} color={GOLD_DARK} />
          </a>
        </div>
      )}

      {/* Hero gradient card — tap to view plan */}
      {!renewUrgent && (
      <div
        onClick={() => navigate("/plan")}
        role="button"
        tabIndex={0}
        className="mx-4 mt-3 rounded-[28px] overflow-hidden relative cursor-pointer"
        style={{
          background: `linear-gradient(145deg, ${NAVY} 0%, ${NAVY_LIGHT} 100%)`,
          padding: "22px 24px 28px",
        }}
      >
        {/* Decorative circles */}
        <div className="pointer-events-none absolute rounded-full"
          style={{ top: -40, right: -40, width: 140, height: 140, background: "rgba(240,167,32,0.15)" }} />
        <div className="pointer-events-none absolute rounded-full"
          style={{ bottom: -20, right: 60, width: 80, height: 80, background: "rgba(255,255,255,0.05)" }} />

        {/* Greeting row */}
        <div className="mb-5 relative">
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{greeting}</p>
          <h1 className="font-display text-white mt-0.5" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
            {firstName}
          </h1>
        </div>

        {/* Sessions + progress ring */}
        <div className="flex items-center justify-between relative">
          <div className="flex flex-col gap-1">
            <span className="font-display font-bold text-white" style={{ fontSize: 32, lineHeight: 1.1 }}>
              {plan ? formatPlanName(baseTotal) : "—"}
            </span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>total sessions</span>
            <div className="flex flex-col items-start gap-1 mt-2.5">
              <span className="rounded-full font-semibold"
                style={{ fontSize: 12, color: BLUE_SOFT, background: "rgba(77,157,255,0.18)", padding: "3px 10px" }}>
                {plan ? sessionsLeft : 0} sessions left
              </span>
              {carryForward > 0 && (
                <Link to="/plan" onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-full font-bold mt-0.5"
                  style={{ fontSize: 11, color: GOLD, background: "rgba(240,167,32,0.2)", padding: "4px 10px" }}>
                  <Gift size={12} /> {carryForward} bonus <ChevronRight size={12} />
                </Link>
              )}
            </div>
          </div>
          <ProgressRing progress={progress} size={110} strokeWidth={9} color={BLUE_SOFT} trackColor="rgba(255,255,255,0.12)">
            <span className="font-bold text-white" style={{ fontSize: 18 }}>{progress}%</span>
          </ProgressRing>
        </div>

        {/* Sessions bar — blue = base classes left, orange = carried forward */}
        <div className="mt-5 relative">
          <div className="flex rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.12)" }}>
            <div className="h-full" style={{ width: `${blueW}%`, background: BLUE_SOFT, transition: "width 1s ease" }} />
            <div className="h-full" style={{ width: `${orangeW}%`, background: GOLD, transition: "width 1s ease" }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{sessionsUsed} used</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {plan ? `Renews ${formatDate(plan.renewal_date).replace(/,?\s*\d{4}$/, "")}` : "—"}
            </span>
          </div>
        </div>
      </div>
      )}

      {/* My classes calendar */}
      {plan && (
        <div ref={calRef}>
          {!hasActivePlan && (
            <div className="mx-4 mt-3 rounded-2xl flex items-center gap-3"
              style={{ background: "#fff4e6", border: "1px solid #f0a720", padding: "14px 18px" }}>
              <Clock size={18} color="#b37400" />
              <div>
                <p className="font-semibold" style={{ fontSize: 14, color: "#b37400" }}>
                  {plan.end_date >= todayISO ? "Your plan has been stopped" : "Your plan has expired"}
                </p>
                <p style={{ fontSize: 12, color: "#8a6c1a" }}>Renew to resume classes. Your past schedule is shown below.</p>
              </div>
            </div>
          )}
          <ClassCalendar
              showPause={!isOnlineCustomer}
            startDate={calRange?.startDate ?? plan.start_date}
            endDate={calRange?.endDate ?? plan.end_date}
            trainingDays={calRange?.trainingDays ?? plan.training_days ?? []}
            pauses={allPauses}
            offTimes={offTimes}
            customerSlot={profile?.time_slot ?? null}
            expanded={calExpanded}
            onExpandedChange={setCalExpanded}
            planActive={!!hasActivePlan}
            planRanges={calRange?.ranges}
            sessions={mySessions}
          />
        </div>
      )}

      {/* Next session banner */}
      {hasActivePlan && (
        <div className="mx-4 my-3 rounded-[20px] flex items-center justify-between"
          style={{
            background: "#fff", border: `1px solid ${BORDER}`,
            padding: "16px 18px", boxShadow: "0 2px 12px rgba(30,58,95,0.06)",
          }}>
          <div onClick={expandCalendar} role="button" className="cursor-pointer flex-1">
          <p className="uppercase font-semibold"
            style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em" }}>
            Next session
          </p>
          <p className="font-bold mt-1" style={{ fontSize: 17, color: NAVY }}>
            {nextTrainingDay
              ? (slotLabel ? `${nextTrainingDay} · ${slotLabel}` : nextTrainingDay)
              : "No sessions scheduled"}
          </p>
          <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            {(isOnlineCustomer ? onlineTrainerName : trainerName) ?? "Your trainer"}
            {" · "}
            {isOnlineCustomer ? "Online" : (societyLabel ?? "Society being assigned")}
          </p>
        </div>
          <Link to="/plan">
            <div className="flex items-center justify-center rounded-full"
              style={{ width: 44, height: 44, background: GOLD_LIGHT, flexShrink: 0 }}>
              <ChevronRight size={18} color={GOLD} />
            </div>
          </Link>
        </div>
      )}

      {/* Quick cards */}
      <div className="flex gap-2.5 px-4 pb-4 pt-1">
        <button onClick={() => navigate("/health")} className="flex-1 rounded-[20px] p-4 text-left border-none cursor-pointer"
          style={{ background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 2px 12px rgba(30,58,95,0.05)" }}>
          <div className="flex items-center justify-center rounded-xl mb-2.5"
            style={{ width: 36, height: 36, background: "#eef2ff" }}>
            <FileHeart size={18} color="#5b6cf8" />
          </div>
          <p className="font-bold" style={{ fontSize: 13, color: NAVY }}>Health</p>
          <p style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
            {latestReport ? "Latest report" : "No reports yet"}
          </p>
        </button>

        {canPause && (
        <button onClick={() => navigate("/pause")} className="flex-1 rounded-[20px] p-4 text-left border-none cursor-pointer"
          style={{ background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 2px 12px rgba(30,58,95,0.05)" }}>
          <div className="flex items-center justify-center rounded-xl mb-2.5"
            style={{ width: 36, height: 36, background: activePause ? "#fee2e2" : GREEN_LIGHT }}>
            <CalendarOff size={18} color={activePause ? "#ef4444" : GREEN} />
          </div>
          <p className="font-bold" style={{ fontSize: 13, color: NAVY }}>Pause</p>
          <p style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{activePause ? "Paused" : "Running"}</p>
        </button>
        )}

        <button onClick={() => navigate("/profile")} className="flex-1 rounded-[20px] p-4 text-left border-none cursor-pointer"
          style={{ background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 2px 12px rgba(30,58,95,0.05)" }}>
          <div className="flex items-center justify-center rounded-xl mb-2.5"
            style={{ width: 36, height: 36, background: "#fdf4dc" }}>
            <UserCircle2 size={18} color={GOLD} />
          </div>
          <p className="font-bold" style={{ fontSize: 13, color: NAVY }}>Profile</p>
          <p style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{profile?.society ?? "My profile"}</p>
        </button>
      </div>

      {/* Trainer / Society sections */}
      <div className="px-4 pb-4 space-y-4">
        {role === "trainer" && <TrainerPauses />}
        {/* Society batches are an offline concept. */}
        {role !== "trainer" && !isOnlineCustomer && <SocietyBatches />}
      </div>

      {/* Marketing feed */}
      <MarketingFeed className="px-4 pb-6" />
    </div>
  );

  // ── Desktop layout (original) ───────────────────────────────────────────────
  const DesktopLayout = () => (
    <div className="space-y-6 py-0">
      <header>
        <h1 className="font-display text-3xl md:text-4xl text-foreground">Hi {firstName}, here's your overview</h1>
        <p className="mt-1 text-muted-foreground">A calm look at your fitness program today.</p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Plan card */}
        <Card className="p-6 rounded-2xl shadow-card hover:shadow-elevated transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <CreditCard className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Your plan</p>
                <p className="font-display text-xl">{hasActivePlan ? formatPlanName(plan.total_sessions) : plan ? "Plan ended" : "—"}</p>
              </div>
            </div>
            {hasActivePlan && (
              <div className="flex flex-col items-end gap-1">
                <Badge variant="secondary">{sessionsLeft} sessions left</Badge>
                {carryForward > 0 && (
                  <Link to="/plan" className="inline-flex items-center gap-1 text-xs font-semibold rounded-full"
                    style={{ color: GOLD, background: "rgba(240,167,32,0.18)", padding: "2px 8px" }}>
                    <Gift className="h-3 w-3" /> {carryForward} bonus
                  </Link>
                )}
              </div>
            )}
          </div>
          {hasActivePlan ? (
            <>
              {awaitingTrainer && <AwaitingTrainerCard compact />}
              {renewUrgent && (
                <div className="mt-4 rounded-xl p-4 flex items-center justify-between gap-3"
                  style={{ background: "rgba(210,59,52,0.08)", border: `1px solid ${RED}` }}>
                  <div>
                    <p className="font-semibold" style={{ color: RED }}>
                      {expired ? `Plan to be renewed on ${formatDate(plan.renewal_date)}` : "Final session coming up"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {expired ? "Renew to pick up your momentum where you left off." : "Renew now so you don't break your rhythm."}
                    </p>
                  </div>
                  <a href={renewTo}
                    onClick={(e) => { e.preventDefault(); renewNow(); }}
                    className="inline-flex items-center gap-1.5 rounded-xl shrink-0"
                    style={{ background: GOLD, color: GOLD_DARK, fontWeight: 700, padding: "10px 14px", fontSize: 14, textDecoration: "none" }}>
                    Renew · ₹{upiAmount.toLocaleString("en-IN")} <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              )}
              <div className="mt-5 space-y-3">
                <div className="flex rounded-full overflow-hidden h-2 bg-muted">
                  <div className="h-full" style={{ width: `${blueW}%`, background: BLUE_SOFT }} />
                  <div className="h-full" style={{ width: `${orangeW}%`, background: GOLD }} />
                </div>
                <div className="flex justify-between text-sm">
                  <div>
                    <p className="text-muted-foreground">{planStarted ? "Started" : "Starts"}</p>
                    <p className="font-medium">{formatDate(plan.start_date)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Schedule</p>
                    <p className="font-medium text-foreground">
                      {trainingDays.length > 0 ? trainingDays.join(", ") : "None"}
                      {profile?.time_slot ? ` · ${profile.time_slot}` : ""}
                    </p>
                  </div>
                </div>
              </div>
              <Button asChild variant="ghost" className="mt-4 px-0 text-primary hover:text-primary hover:bg-transparent">
                <Link to="/plan">View plan details <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </>
          ) : plan ? (
            <>
              {/* Expired/Ended Plan renewal alert */}
              <div className="mt-4 rounded-xl p-4 flex items-center justify-between gap-3"
                style={{ background: "rgba(210,59,52,0.08)", border: `1px solid ${RED}` }}>
                <div>
                  <p className="font-semibold" style={{ color: RED }}>
                    Your plan has completed
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Renew now to continue your fitness journey and get back on track.
                  </p>
                </div>
                <a href={renewTo}
                  onClick={(e) => { e.preventDefault(); renewNow(); }}
                  className="inline-flex items-center gap-1.5 rounded-xl shrink-0"
                  style={{ background: GOLD, color: GOLD_DARK, fontWeight: 700, padding: "10px 14px", fontSize: 14, textDecoration: "none" }}>
                  Renew · ₹{upiAmount.toLocaleString("en-IN")} <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              <Button asChild variant="ghost" className="mt-4 px-0 text-primary hover:text-primary hover:bg-transparent">
                <Link to="/plan">View plan details <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">No plan assigned yet — your trainer will set this up.</p>
          )}
        </Card>

        {/* Pause is a group-training benefit — see useCanPauseClasses. */}
        {canPause && (
        <Card className="p-6 rounded-2xl shadow-card hover:shadow-elevated transition-shadow">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
              <CalendarOffIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Pause status</p>
              <p className="font-display text-xl">{planEnded ? "Plan ended" : activePause ? "Paused" : "Active"}</p>
            </div>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            {planEnded
              ? "Your plan has ended. Renew to continue your classes."
              : activePause
              ? `Your classes are paused from ${formatDate(activePause.from)} to ${formatDate(activePause.to)}.`
              : "Your classes are running as scheduled. Need a break? Pause anytime."}
          </p>
          {!planEnded && (
            <Button asChild className="mt-4">
              <Link to="/pause">Manage pause <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          )}
        </Card>
        )}

        {/* My classes calendar — includes trainer off-day indicators */}
        {plan && (
          <Card className="p-2 rounded-2xl shadow-card md:col-span-2">
            {!hasActivePlan && (
              <div className="mx-3 mt-3 rounded-xl flex items-center gap-3"
                style={{ background: "#fff4e6", border: "1px solid #f0a720", padding: "14px 18px" }}>
                <Clock size={18} color="#b37400" />
                <div>
                  <p className="font-semibold" style={{ fontSize: 14, color: "#b37400" }}>
                    {plan.end_date >= todayISO ? "Your plan has been stopped" : "Your plan has expired"}
                  </p>
                  <p style={{ fontSize: 12, color: "#8a6c1a" }}>Renew to resume classes. Your past schedule is shown below.</p>
                </div>
              </div>
            )}
            <ClassCalendar
              showPause={!isOnlineCustomer}
              startDate={calRange?.startDate ?? plan.start_date}
              endDate={calRange?.endDate ?? plan.end_date}
              trainingDays={calRange?.trainingDays ?? plan.training_days ?? []}
              pauses={allPauses}
              offTimes={offTimes}
              customerSlot={profile?.time_slot ?? null}
              expanded={calExpanded}
              onExpandedChange={setCalExpanded}
              planActive={!!hasActivePlan}
              planRanges={calRange?.ranges}
              sessions={mySessions}
            />
          </Card>
        )}

        {/* Health report */}
        <Card className="p-6 rounded-2xl shadow-card hover:shadow-elevated transition-shadow">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <FileHeart className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Latest health report</p>
              <p className="font-display text-xl">{latestReport?.title ?? "No reports yet"}</p>
            </div>
          </div>
          {latestReport ? (
            <>
              <p className="mt-5 text-sm text-muted-foreground">Updated {formatDate(latestReport.report_date)}</p>
              <div className="mt-4 flex gap-2">
                <Button onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" /> Download PDF
                </Button>
                <Button asChild variant="outline">
                  <Link to="/health">View all</Link>
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">Your trainer will share your first report soon.</p>
          )}
        </Card>

        {/* Profile snapshot */}
        <Card className="p-6 rounded-2xl shadow-card hover:shadow-elevated transition-shadow">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Your details</p>
              <p className="font-display text-xl">Profile snapshot</p>
            </div>
          </div>
          <ul className="mt-5 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>{profile?.society || "Add your society in Profile"}</span>
            </li>
            <li className="flex items-start gap-3">
              <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>{profile?.time_slot || "No time slot set"}</span>
            </li>
            <li className="flex items-start gap-3">
              <UserRound className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>Trainer: <span className="font-medium">{trainerName ?? "Not assigned"}</span></span>
            </li>
          </ul>
          <Button asChild variant="ghost" className="mt-4 px-0 text-primary hover:text-primary hover:bg-transparent">
            <Link to="/profile">Manage profile <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </Card>

        {role === "trainer" && (
          <div className="md:col-span-2"><TrainerPauses /></div>
        )}
        {role !== "trainer" && !isOnlineCustomer && (
          <div className="md:col-span-2"><SocietyBatches /></div>
        )}

        <MarketingFeed className="md:col-span-2" />
      </div>
    </div>
  );

  return (
    <>
      {/* First-time class-mode selection (Online/Offline) for new clients. */}
      <ClassModeGate />
      {/* Today's live session — online customers only. */}
      {isOnlineCustomer && (
        <div className="px-4 pt-2 md:px-0 md:pt-0 md:pb-4">
          <OnlineSessionCard />
        </div>
      )}
      {/* Existing customers pre-date the email step — offer to add one.
          Rendered once above both layouts so the link-completion effect
          only ever runs a single time. Clients only. */}
      {role === "client" && profile && (
        <AddEmailCard profileId={profile.id} profileEmail={profile.email} />
      )}
      <div className="md:hidden"><MobileLayout /></div>
      <div className="hidden md:block"><DesktopLayout /></div>
    </>
  );
}
