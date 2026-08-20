import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { CreditCard, CheckCircle2, CalendarDays, Gift, ArrowRight } from "lucide-react";
import { formatDate, daysBetween } from "@/lib/dates";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { usePlansTabVisible } from "@/hooks/usePlansTabVisible";
import { usePauseStore } from "@/stores/pauseStore";
import { ExplorePlansDialog, PlanOptionsList } from "@/components/plan/ExplorePlansDialog";
import { calculatePlanEndDate, calculatePlanRenewalDate, extendEndDateBySessions, countLostTrainingDays, isoDate, formatPlanName } from "@/lib/sessionPlan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const GOLD       = "#f0a720";
const NAVY       = "#1E3A5F";
const MUTED      = "#8a8f9e";
const BORDER     = "rgba(30,58,95,0.08)";
const GREEN      = "#2e9e5b";
const GREEN_LIGHT = "#e6f7ed";
const GOLD_LIGHT = "#fef3d0";
const GOLD_TEXT  = "#7a5200";
const GOLD_SUB   = "#9a7423";
const GOLD_DEEP  = "#b07d10";
const WEEK_DAYS  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Plan() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { visible: plansTabVisible, isLoading: plansTabLoading } = usePlansTabVisible();
  // If admin has hidden the Plan tab for this customer, they can't reach it by URL.
  useEffect(() => {
    if (role === "client" && !plansTabLoading && !plansTabVisible) {
      navigate("/dashboard", { replace: true });
    }
  }, [role, plansTabLoading, plansTabVisible, navigate]);
  const { data: profile } = useProfile();
  const { history, activePause } = usePauseStore();
  const customerName = profile?.name ?? "";

  const { data: plan, refetch } = useQuery({
    queryKey: ["plan", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("plans").select("*").eq("user_id", user!.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  // Trainer off-days — they earn the customer uncapped bonus classes.
  const { data: offTimes = [] } = useQuery({
    queryKey: ["trainer-off-times", profile?.trainer_id],
    enabled: !!profile?.trainer_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("trainer_off_times")
        .select("from_date,to_date,time_slot")
        .eq("trainer_id", profile!.trainer_id!);
      return data ?? [];
    },
  });

  // Extra classes taken by the trainer to compensate off-days — each one
  // consumes a bonus class.
  const { data: compClasses = [] } = useQuery({
    queryKey: ["comp-classes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("comp_classes").select("id, class_date").eq("client_id", user!.id);
      return (data ?? []) as { id: string; class_date: string }[];
    },
  });

  // Plan catalog — used to compute per-month savings on the active plan card
  const { data: planOptions = [] } = useQuery({
    queryKey: ["plan-options"],
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_options").select("*").eq("active", true)
        .order("sort_order").order("duration_months");
      return (data ?? []) as { id: string; duration_months: number; price: number; total_sessions: number | null }[];
    },
  });

  const { data: priceOverrides = [] } = useQuery({
    queryKey: ["plan-price-overrides", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_price_overrides").select("plan_option_id,price").eq("user_id", user!.id);
      return data ?? [];
    },
  });

  // Local toggle state for optimistic update
  const [autoRenewLocal, setAutoRenewLocal] = useState<boolean | null>(null);
  const autoRenew = autoRenewLocal !== null ? autoRenewLocal : (plan?.auto_renew ?? false);

  const handleAutoRenew = async (v: boolean) => {
    setAutoRenewLocal(v);
    const { error } = await supabase.from("plans").update({ auto_renew: v }).eq("id", plan!.id);
    if (error) {
      toast.error(error.message);
      setAutoRenewLocal(null);
    } else {
      toast.success(v ? "Auto-renew enabled" : "Auto-renew disabled");
      refetch();
    }
  };

  const isActive = plan && plan.status === "active";

  if (!isActive) {
    return (
      <>
        {/* Mobile empty state */}
        <div className="md:hidden" style={{ background: "#f4f2ee", minHeight: "100%" }}>
          <div style={{ padding: "8px 20px 16px" }}>
            <p style={{ color: MUTED, fontSize: 13 }}>Subscription status</p>
            <h2 className="font-display" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: NAVY }}>Your plan</h2>
          </div>
          <div className="mx-4 rounded-[20px] p-6 text-center"
            style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
            <p style={{ color: MUTED, fontSize: 14 }}>
              {plan ? "Your plan has ended. Please renew to continue your classes." : "No plan assigned yet — pick one below to get started."}
            </p>
          </div>
          {/* Plans shown right on the page — no tap needed to see them */}
          {user && (
            <div className="mx-4 mt-5 mb-6">
              <p className="font-semibold uppercase mb-3 px-1" style={{ fontSize: 12, color: MUTED, letterSpacing: "0.08em" }}>
                Choose your plan
              </p>
              <PlanOptionsList userId={user.id} customerName={customerName} customerPhone={profile?.phone ?? ""} />
            </div>
          )}
        </div>
        {/* Desktop empty state */}
        <div className="hidden md:block space-y-6">
          <header>
            <h1 className="font-display text-3xl text-foreground">Your plan</h1>
            <p className="mt-1 text-muted-foreground">All the details about your current Fitved plan.</p>
          </header>
          <Card className="p-8 rounded-2xl shadow-card text-center">
            <p className="text-muted-foreground">
              {plan ? "Your plan has ended. Please renew to continue your classes." : "No plan assigned yet — pick one below to get started."}
            </p>
          </Card>
          {user && (
            <div className="max-w-[1120px]">
              <h2 className="font-display text-2xl mb-5">Choose your plan</h2>
              <PlanOptionsList userId={user.id} customerName={customerName} customerPhone={profile?.phone ?? ""} />
            </div>
          )}
        </div>
      </>
    );
  }

  const discount    = Number(plan.discount ?? 0);
  const netAmount   = Math.max(0, Number(plan.amount) - discount);
  const hasDiscount = discount > 0;

  // ── Per-month savings computation (mirrors PlanOptionsList logic exactly) ─
  // 1. Try to find how many months this plan covers from the catalog.
  //    Match by total_sessions so any custom plan duration works.
  const catalogOption = planOptions.find(
    (o) => o.total_sessions != null && o.total_sessions === plan.total_sessions,
  );
  // Fallback hardcoded map covers standard plans even before catalog loads.
  const FALLBACK_MONTHS: Record<number, number> = { 8: 1, 12: 1, 36: 3, 48: 4, 72: 6 };
  const durationMonths =
    catalogOption?.duration_months ??
    FALLBACK_MONTHS[plan.total_sessions] ??
    1;

  // 2. Baseline = this customer's effective 1-month price.
  //    Use the catalog 1-month option → apply per-customer override → fallback ₹3,499.
  const overrideMap = new Map(priceOverrides.map((o) => [o.plan_option_id, Number(o.price)]));
  const baselineOption = planOptions.find((o) => o.duration_months === 1);
  const baselineMonthly: number =
    baselineOption
      ? (overrideMap.get(baselineOption.id) ?? Number(baselineOption.price))
      : 3499; // absolute fallback = standard 1-month price

  // 3. Per-month cost for this plan.
  const perMonth = durationMonths > 1 ? netAmount / durationMonths : netAmount;

  // 4. Savings vs 1-month baseline.
  const saveAmt = durationMonths > 1 ? Math.max(0, baselineMonthly - perMonth) : 0;
  const savePct =
    baselineMonthly > 0 && saveAmt > 0
      ? Math.round((saveAmt / baselineMonthly) * 100)
      : 0;
  const showSavings = durationMonths > 1 && savePct > 0;

  const totalDays   = daysBetween(plan.start_date, plan.end_date);
  const elapsedDays = daysBetween(plan.start_date, new Date().toISOString());
  const progress    = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;
  const sessionsUsed  = Math.round((plan.total_sessions * progress) / 100);
  const sessionsLeft  = plan.total_sessions - sessionsUsed;
  const trainingDays: string[] = (plan.training_days ?? []).map((d: string) => d.slice(0, 3));

  // ── Carry-forward reward ─────────────────────────────────────────────
  // Classes carried forward = training days lost to pauses within the plan
  // period. The plan only stores the current end date, so we compute the
  // "original" (no-pause) end and compare it to the (extended) end.
  const planDaysFull: string[] = plan.training_days ?? [];
  const allPauses = [...history, ...(activePause ? [activePause] : [])];
  const baseEnd        = calculatePlanEndDate(plan.start_date, plan.total_sessions, planDaysFull);
  const baseEndISO     = isoDate(baseEnd);
  // Pause carry-forward is capped at 1/3 of the plan; trainer off-day bonuses
  // are never capped — matching recalculatePlanDates. Extra classes already
  // taken to compensate off-days reduce the bonus.
  const lostDays = countLostTrainingDays(
    plan.start_date, baseEndISO, planDaysFull, allPauses, offTimes, profile?.time_slot ?? null,
  );
  const compTaken = compClasses.filter((c) => c.class_date >= plan.start_date).length;
  const carriedClasses =
    Math.min(lostDays.pausedLost, Math.floor(plan.total_sessions / 3)) +
    Math.max(0, lostDays.offLost - compTaken);
  const projectedEndISO = isoDate(extendEndDateBySessions(baseEnd, carriedClasses, planDaysFull));
  const newEndISO      = plan.end_date >= projectedEndISO ? plan.end_date : projectedEndISO;
  const oldRenewalISO  = isoDate(calculatePlanRenewalDate(baseEnd, planDaysFull));
  const newRenewalISO  = isoDate(calculatePlanRenewalDate(newEndISO, planDaysFull));
  // Show the card whenever there is a bonus OR classes were compensated — the
  // customer should always see that missed classes were made up.
  const showReward     = carriedClasses > 0 || compTaken > 0;
  const compDates      = compClasses
    .filter((c) => c.class_date >= plan.start_date)
    .sort((a, b) => b.class_date.localeCompare(a.class_date));

  const dateCards = [
    { label: "Started", val: formatDate(plan.start_date).replace(/,?\s*\d{4}$/, ""), accent: false },
    { label: "Renews",  val: formatDate(plan.renewal_date).replace(/,?\s*\d{4}$/, ""), accent: false },
  ];

  return (
    <>
      {/* ── Mobile Layout ─────────────────────────────────────────── */}
      <div className="md:hidden" style={{ background: "#f4f2ee", minHeight: "100%" }}>

        {/* Page header */}
        <div style={{ padding: "8px 20px 16px" }}>
          <p style={{ color: MUTED, fontSize: 13 }}>Active subscription</p>
          <h2 className="font-display" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: NAVY }}>
            Your plan
          </h2>
        </div>

        {/* Hero plan card */}
        <div className="mx-4 mb-3.5 rounded-3xl overflow-hidden relative"
          style={{ background: NAVY, padding: "22px 22px 20px" }}>
          <div className="pointer-events-none absolute rounded-full"
            style={{ top: -20, right: -20, width: 100, height: 100, background: "rgba(240,167,32,0.15)" }} />

          <div className="flex items-start justify-between relative">
            <div>
              {hasDiscount && (
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", textDecoration: "line-through", lineHeight: 1 }}>
                  ₹{Number(plan.amount).toLocaleString("en-IN")}
                </p>
              )}
              <p className="font-display font-bold text-white" style={{ fontSize: 34, lineHeight: 1, marginTop: hasDiscount ? 3 : 0 }}>
                ₹{netAmount.toLocaleString("en-IN")}
              </p>
              {/* Per-month line — always shown for multi-month plans */}
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
                {durationMonths > 1
                  ? `₹${Math.round(perMonth).toLocaleString("en-IN")}/month · ${formatPlanName(plan.total_sessions)}`
                  : `${formatPlanName(plan.total_sessions)} plan`
                }
              </p>
              {/* Savings badge — shown when there's a multi-month discount */}
              {showSavings && (
                <span className="inline-block rounded-full font-bold mt-2"
                  style={{ fontSize: 11, color: "#1b7a43", background: "#e6f7ed", padding: "3px 10px" }}>
                  {savePct}% off · save ₹{Math.round(saveAmt).toLocaleString("en-IN")}/month
                </span>
              )}
              {/* Legacy per-plan discount (admin manually set a discount amount) */}
              {hasDiscount && !showSavings && (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                  ₹{discount.toLocaleString("en-IN")} off · per cycle
                </p>
              )}
            </div>
            <span className="rounded-full font-bold" style={{ background: GREEN_LIGHT, color: GREEN, fontSize: 12, padding: "4px 12px" }}>
              Active
            </span>
          </div>

          <div className="mt-4 relative">
            <div className="flex justify-between mb-1.5">
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                {sessionsUsed} of {plan.total_sessions} used
              </span>
              <span className="font-semibold" style={{ fontSize: 12, color: GOLD }}>{sessionsLeft} left</span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.1)" }}>
              <div className="h-full rounded-full"
                style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${GOLD}, #e8920a)` }} />
            </div>
          </div>
        </div>

        {/* Carry-forward reward */}
        {showReward && (
          <div className="mx-4 mb-3.5 rounded-3xl"
            style={{ background: GOLD_LIGHT, border: `1px solid ${GOLD}`, padding: 16 }}>
            <div className="flex gap-3 items-start">
              <div className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: 38, height: 38, background: GOLD }}>
                <Gift size={20} color="#fff" />
              </div>
              <div className="min-w-0">
                <p className="font-bold" style={{ fontSize: 15, color: GOLD_TEXT }}>
                  {carriedClasses > 0
                    ? `You earned ${carriedClasses} bonus ${carriedClasses === 1 ? "class" : "classes"}`
                    : "Your missed classes were made up"}
                </p>
                <p style={{ fontSize: 12, color: GOLD_SUB, marginTop: 3, lineHeight: 1.45 }}>
                  for classes missed during your pauses or your trainer's days off — FitVed added every one back to your plan.
                </p>
                {compTaken > 0 && (
                  <p style={{ fontSize: 12, color: GOLD_DEEP, marginTop: 4, fontWeight: 600 }}>
                    ✓ {compTaken} already made up with extra {compTaken === 1 ? "class" : "classes"} by your trainer
                  </p>
                )}
              </div>
            </div>
            {compDates.length > 0 && (
              <div className="rounded-xl mt-3" style={{ background: "#fff", padding: "10px 14px" }}>
                <p style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 6 }}>
                  Extra classes taken
                </p>
                {compDates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-1">
                    <span style={{ fontSize: 13, color: NAVY, fontWeight: 500 }}>
                      ✓ {formatDate(c.class_date).replace(/,?\s*\d{4}$/, "")}
                    </span>
                    <span style={{ fontSize: 11, color: GOLD_DEEP, fontWeight: 700 }}>1 bonus class used</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl mt-3" style={{ background: "#fff", padding: "11px 14px" }}>
              <div>
                <p style={{ fontSize: 11, color: MUTED }}>Old renewal date</p>
                <p style={{ fontSize: 15, color: MUTED, textDecoration: "line-through", marginTop: 2 }}>
                  {formatDate(oldRenewalISO).replace(/,?\s*\d{4}$/, "")}
                </p>
              </div>
              <ArrowRight size={18} color={GOLD} />
              <div className="text-right">
                <p style={{ fontSize: 11, color: GOLD_DEEP }}>New renewal date</p>
                <p className="font-bold" style={{ fontSize: 15, color: NAVY, marginTop: 2 }}>
                  {formatDate(newRenewalISO).replace(/,?\s*\d{4}$/, "")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Date trio */}
        <div className="flex gap-2.5 mx-4 mb-3.5">
          {dateCards.map(({ label, val, accent }) => (
            <div key={label} className="flex-1 rounded-[18px] text-center"
              style={{ background: "#fff", padding: "14px 12px", border: `1px solid ${accent ? GOLD : BORDER}`, boxShadow: "0 2px 8px rgba(30,58,95,0.05)" }}>
              <p className="font-bold" style={{ fontSize: 15, color: NAVY }}>{val}</p>
              <p style={{ fontSize: 11, color: accent ? GOLD_DEEP : MUTED, marginTop: 3 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Explore other plans */}
        {user && (
          <div className="mx-4 mb-3.5">
            <ExplorePlansDialog userId={user.id} customerName={customerName} customerPhone={profile?.phone ?? ""} />
          </div>
        )}

        {/* Training days */}
        <div className="mx-4 mb-3.5 rounded-[20px] p-4"
          style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
          <p className="font-semibold uppercase mb-3" style={{ fontSize: 12, color: MUTED, letterSpacing: "0.08em" }}>
            Training days
          </p>
          <div className="flex gap-2">
            {WEEK_DAYS.map((d) => {
              const active = trainingDays.includes(d);
              return (
                <div key={d} className="flex-1 flex items-center justify-center rounded-xl"
                  style={{
                    height: 38,
                    background: active ? NAVY : "rgba(30,58,95,0.04)",
                    border: `1px solid ${active ? "transparent" : BORDER}`,
                  }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: active ? "#fff" : MUTED }}>{d[0]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Auto-renew */}
        <div className="mx-4 mb-4 rounded-[20px] p-4 flex items-center justify-between"
          style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
          <div>
            <p className="font-bold" style={{ fontSize: 14, color: NAVY }}>Auto-renew</p>
            <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Renews {formatDate(plan.renewal_date)}</p>
          </div>
          {/* Custom toggle */}
          <div
            onClick={() => handleAutoRenew(!autoRenew)}
            className="cursor-pointer relative flex-shrink-0"
            style={{
              width: 46, height: 26, borderRadius: 13,
              background: autoRenew ? NAVY : "rgba(30,58,95,0.15)",
              transition: "background 0.2s",
            }}
          >
            <div className="absolute rounded-full"
              style={{
                width: 20, height: 20, background: "#fff",
                top: 3, left: autoRenew ? 23 : 3,
                transition: "left 0.2s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }} />
          </div>
        </div>

      </div>

      {/* ── Desktop Layout (original) ──────────────────────────────── */}
      <div className="hidden md:block space-y-6">
        <header>
          <h1 className="font-display text-3xl text-foreground">Your plan</h1>
          <p className="mt-1 text-muted-foreground">All the details about your current Fitved plan.</p>
        </header>

        <Card className="p-6 md:p-8 rounded-2xl shadow-card overflow-hidden relative">
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-soft">
                <CreditCard className="h-6 w-6" />
              </span>
              <div>
                <Badge className="mb-2 bg-primary-soft text-primary hover:bg-primary-soft">
                  {formatPlanName(plan.total_sessions)}
                </Badge>
                {hasDiscount && (
                  <p className="text-sm text-muted-foreground line-through">₹{Number(plan.amount).toLocaleString("en-IN")}</p>
                )}
                <p className="font-display text-2xl">₹{netAmount.toLocaleString("en-IN")}</p>
                <p className="text-sm text-muted-foreground">
                  {durationMonths > 1
                    ? `₹${Math.round(perMonth).toLocaleString("en-IN")}/month`
                    : hasDiscount ? `₹${discount.toLocaleString("en-IN")} off · per cycle` : "per cycle"
                  }
                </p>
                {/* Savings badge for multi-month plans */}
                {showSavings && (
                  <span className="inline-block rounded-full font-bold mt-1.5"
                    style={{ fontSize: 11, color: "#1b7a43", background: "#e6f7ed", padding: "3px 10px" }}>
                    {savePct}% off · save ₹{Math.round(saveAmt).toLocaleString("en-IN")}/month
                  </span>
                )}
              </div>
            </div>
            <Badge variant="secondary" className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {plan.status}
            </Badge>
          </div>

          <Separator className="my-6" />

          <dl className="grid gap-5 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">Plan started</dt>
              <dd className="mt-1 font-medium">{formatDate(plan.start_date)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Next plan starts</dt>
              <dd className="mt-1 font-medium text-primary">{formatDate(plan.renewal_date)}</dd>
            </div>
            {user && (
              <div className="sm:col-span-3">
                <ExplorePlansDialog userId={user.id} customerName={customerName} customerPhone={profile?.phone ?? ""} />
              </div>
            )}
            <div className="sm:col-span-3">
              <dt className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Training days
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {(plan.training_days ?? []).map((d: string) => (
                  <Badge key={d} variant="outline">{d.slice(0, 3)}</Badge>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Payment method</dt>
              <dd className="mt-1 font-medium">{plan.payment_method ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
              <div>
                <p className="font-medium">Auto-renewal</p>
                <p className="text-xs text-muted-foreground">Renew automatically at the end of each cycle.</p>
              </div>
              <Switch checked={autoRenew} onCheckedChange={handleAutoRenew} />
            </div>
          </dl>
        </Card>

        {showReward && (
          <Card className="p-6 rounded-2xl shadow-card" style={{ background: GOLD_LIGHT, border: `1px solid ${GOLD}` }}>
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl flex-shrink-0" style={{ background: GOLD }}>
                <Gift className="h-6 w-6 text-white" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-display text-xl" style={{ color: GOLD_TEXT }}>
                  {carriedClasses > 0
                    ? `You earned ${carriedClasses} bonus ${carriedClasses === 1 ? "class" : "classes"}`
                    : "Your missed classes were made up"}
                </p>
                <p className="text-sm mt-1" style={{ color: GOLD_SUB }}>
                  for classes missed during your pauses or your trainer's days off — FitVed added every one back to your plan.
                </p>
                {compTaken > 0 && (
                  <p className="text-sm mt-1.5 font-semibold" style={{ color: GOLD_DEEP }}>
                    ✓ {compTaken} already made up with extra {compTaken === 1 ? "class" : "classes"} by your trainer
                  </p>
                )}
                {compDates.length > 0 && (
                  <div className="mt-3 rounded-xl bg-white px-4 py-2.5 inline-block">
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: MUTED }}>
                      Extra classes taken
                    </p>
                    {compDates.map((c) => (
                      <div key={c.id} className="flex items-center gap-6 justify-between py-0.5">
                        <span className="text-sm font-medium" style={{ color: NAVY }}>✓ {formatDate(c.class_date)}</span>
                        <span className="text-xs font-bold" style={{ color: GOLD_DEEP }}>1 bonus class used</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center gap-4 flex-wrap">
                  <div>
                    <p className="text-xs" style={{ color: MUTED }}>Old renewal date</p>
                    <p className="font-medium line-through" style={{ color: MUTED }}>{formatDate(oldRenewalISO)}</p>
                  </div>
                  <ArrowRight className="h-5 w-5" style={{ color: GOLD }} />
                  <div>
                    <p className="text-xs" style={{ color: GOLD_DEEP }}>New renewal date</p>
                    <p className="font-medium" style={{ color: NAVY }}>{formatDate(newRenewalISO)}</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

      </div>
    </>
  );
}
