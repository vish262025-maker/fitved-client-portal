import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Check, X, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { visiblePlanOptions } from "@/lib/serviceMode";
import { latestAssignment, canSkipBooking, repurchase } from "@/lib/repurchase";

const GOLD   = "#f0a720";
const NAVY   = "#1E3A5F";
const MUTED  = "#8a8f9e";
const BORDER = "rgba(30,58,95,0.08)";
const GOLD_DEEP = "#b07d10";

interface Props {
  userId: string;
  customerName: string;
  customerPhone?: string;
}

type ClassMode = "online" | "offline";
type TrainingType = "personal" | "group";

interface Option {
  id: string;
  name: string;
  duration_months: number;
  price: number;
  total_sessions: number | null;
  badge: string | null;
  training_type?: TrainingType;
  class_mode?: ClassMode;
}

/**
 * The plan cards themselves — rendered inline on the Plan page whenever the
 * customer has no active plan (so the catalog is always visible), and inside
 * the "Explore other plans" dialog for customers mid-plan.
 */
export function PlanOptionsList({ userId, customerName, customerPhone }: Props) {
  const [type, setType] = useState<TrainingType>("group");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [buying, setBuying] = useState<string | null>(null);

  // An existing customer already told us where and when they train. Changing
  // plan only changes the price, so we don't ask again — the same assignment
  // carries over and Proceed opens the gateway directly. A first-time buyer,
  // or someone switching between online/offline or group/personal, still goes
  // through the booking flow, because there is something real to ask.
  const { data: myPlans = [] } = useQuery({
    queryKey: ["plan-assignments", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("plans")
        .select("training_mode, training_type, society_id, day_set_id, training_days, time_slot, trainer_id, booking_request_id, payment_status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const assignment = latestAssignment(myPlans as any);

  const bookingRouteFor = (o: Option) =>
    (o.class_mode ?? "offline") === "online"
      ? `/plan/book-online/${o.id}`
      : `/plan/${(o.training_type ?? "group") === "personal" ? "book-personal" : "book"}/${o.id}`;

  const proceed = async (o: Option) => {
    if (buying) return;
    if (!canSkipBooking(assignment, o as any)) { navigate(bookingRouteFor(o)); return; }
    setBuying(o.id);
    try {
      const r = await repurchase(supabase as any, { userId, option: o as any, assignment });
      if (r.status === "success") {
        toast.success("Payment received — your plan is active.");
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["plan", userId] }),
          qc.invalidateQueries({ queryKey: ["sessions", userId] }),
          qc.invalidateQueries({ queryKey: ["plan-assignments", userId] }),
        ]);
        navigate("/dashboard");
        return;
      }
      if (r.status === "cancelled") toast.info("Payment cancelled. Nothing has been charged.");
      else if (r.status === "not_eligible" || r.status === "unavailable") navigate(bookingRouteFor(o));
      else toast.error((r as any).message ?? "Payment failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start your purchase");
    } finally {
      setBuying(null);
    }
  };

  const { data: allOptions = [] } = useQuery({
    queryKey: ["plan-options"],
    queryFn: async () => {
      // NOTE: every consumer of ["plan-options"] must fetch the SAME columns.
      // React Query caches by key, so a narrower select landing first leaves
      // the other screens reading rows with fields missing — which is exactly
      // how the plan cards lost their name, badge and per-month price when
      // navigating from the dashboard instead of loading /plan directly.
      const { data } = await (supabase as any)
        .from("plan_options")
        .select("*")
        .eq("active", true)
        .order("sort_order").order("duration_months");
      return (data ?? []) as Option[];
    },
  });

  // Training mode is NOT a customer choice — it comes from the customer's own
  // assignment (profiles.class_mode, managed by admin via mode-switch requests)
  // and is never rendered as a selector.
  const { data: myMode, isPending: modePending } = useQuery({
    queryKey: ["profile-class-mode", userId],
    // The customer's training mode can change under them — an admin approves a
    // mode-switch request in a different browser entirely, so nothing in this
    // session can invalidate it. The app disables refetch-on-focus globally,
    // which left the plan list showing the wrong mode's prices until a manual
    // reload. This one query opts back in: it is small, and being wrong about
    // it means showing someone the wrong catalogue.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,

    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("class_mode").eq("id", userId).maybeSingle();
      return (data?.class_mode ?? null) as ClassMode | null;
    },
  });
  /**
   * Which catalogue this customer sees.
   *
   * `myMode` is undefined until the query resolves, and this used to collapse
   * that to "offline" — a guess that is wrong for every online customer, so
   * they were shown offline plans and prices for a moment before the list
   * flipped under them. An unknown mode is not offline; it is unknown, and the
   * grid waits rather than showing someone the wrong prices.
   */
  const modeKnown = !modePending;
  const activeMode: ClassMode = myMode === "online" ? "online" : "offline";

  // A plan belongs to exactly one (mode × type) bucket. Rows created before the
  // category columns existed are treated as offline group, which is what they
  // were. Filtering is unconditional — a plan from another bucket can never
  // reach the grid.
  const options = modeKnown ? visiblePlanOptions(allOptions, activeMode, type) : [];

  const { data: overrides = [] } = useQuery({
    queryKey: ["plan-price-overrides", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_price_overrides").select("plan_option_id,price").eq("user_id", userId);
      return data ?? [];
    },
  });

  const overrideMap = new Map(overrides.map((o) => [o.plan_option_id, Number(o.price)]));

  // Per-month comparison against the 1-month plan (this customer's effective
  // prices, i.e. after any custom overrides). Recomputes automatically when
  // the admin changes catalog prices or per-customer prices.
  const effectivePrice = (o: Option) => overrideMap.get(o.id) ?? Number(o.price);
  const baselineMonthly = (() => {
    const oneMonth = options.find((o) => o.duration_months === 1);
    return oneMonth ? effectivePrice(oneMonth) / 1 : null;
  })();

  const monthlyInfo = (o: Option) => {
    if (!o.duration_months || o.duration_months < 1) return null;
    const perMonth = effectivePrice(o) / o.duration_months;
    if (o.duration_months === 1 || baselineMonthly == null) {
      return { perMonth, savePct: 0, saveAmt: 0 };
    }
    const saveAmt = Math.max(0, baselineMonthly - perMonth);
    const savePct = baselineMonthly > 0 ? Math.round((saveAmt / baselineMonthly) * 100) : 0;
    return { perMonth, savePct, saveAmt };
  };

  // Pause classes are one-third of total sessions — surfaced as an actual count,
  // never as a ratio. Diet plan is bundled from the 3-month plan upward.
  const pauseCount = (o: Option) => (o.total_sessions ? Math.round(o.total_sessions / 3) : 0);
  const hasDiet = (o: Option) => o.duration_months >= 3;
  const featured = (o: Option) => !!o.badge;

  // Progressive commitment framing, positional (shorter → longer plan).
  const MICRO = ["Start your journey", "Build consistency", "Commit & save"];
  const benefits = (o: Option): { label: string; included: boolean }[] => {
    const s = o.total_sessions ?? 0;
    const p = pauseCount(o);
    const long = o.duration_months >= 3;
    const online = (o.class_mode ?? "offline") === "online";
    const type = o.training_type ?? "group";

    // Personal training — full 1:1 core in every plan (incl. WhatsApp + Call
    // support), with premium extras stacking on longer plans to pull customers
    // toward higher-value commitments.
    if (type === "personal") {
      const core = [
        "Dedicated personal trainer",
        "1:1 personalised sessions",
        "Custom workout plan",
        "Personalised diet plan",
        "Progress tracking",
        "Goal-based training",
        "WhatsApp & Call support",
      ];
      if (o.duration_months >= 3) core.push(
        "Priority trainer support",
        "Monthly transformation review",
      );
      return core.map((label) => ({ label, included: true }));
    }

    // Online Group — live, join-from-anywhere framing (curated, concise).
    // Online plans deliberately have NO pause classes; that benefit is
    // offline-only, so it must never be inherited here.
    if (online) {
      const list = [
        { label: `${s} live online group sessions`, included: true },
        { label: "Live trainer guidance", included: true },
        { label: "Structured workout plan", included: true },
        { label: "Progress tracking", included: true },
        { label: "Diet plan included", included: long },
        { label: "WhatsApp & Call support", included: true },
      ];
      if (long) list.push({ label: "Personalised progress review", included: true });
      if (o.duration_months >= 6) list.push({ label: "Priority trainer support", included: true });
      return list;
    }

    // Offline Group — unchanged existing behaviour.
    return [
      { label: `${s} training sessions`, included: true },
      { label: `${p} pause classes`, included: true },
      { label: "Trainer guidance", included: true },
      { label: "Structured workout plan", included: long },
      { label: "Progress tracking", included: true },
      { label: "Diet plan included", included: hasDiet(o) },
      { label: long ? "Call support" : "WhatsApp support", included: true },
    ];
  };

  // The only customer-facing selector: training type. Mode stays internal.
  const Toggle = (
    <div className="flex justify-center">
      <div className="inline-flex rounded-full p-1.5" style={{ background: "rgba(30,58,95,0.06)" }}>
        {(["group", "personal"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className="rounded-full px-6 py-2.5 text-sm font-semibold transition-all"
            style={type === t
              ? { background: NAVY, color: "#fff", boxShadow: "0 2px 10px rgba(30,58,95,0.22)" }
              : { color: MUTED }}
          >
            {t === "group" ? "Group" : "Personal"} Training
          </button>
        ))}
      </div>
    </div>
  );

  // Waiting on the mode is not the same as having nothing to show — say so,
  // and hold the grid's shape so the page doesn't jump when the cards land.
  if (!modeKnown) {
    return (
      <div className="flex flex-col gap-6">
        {Toggle}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-[20px]"
              style={{ background: "#fff", border: `1px solid ${BORDER}`, height: 420 }} />
          ))}
        </div>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {Toggle}
        <p className="text-center" style={{ fontSize: 14, color: MUTED, padding: 8 }}>
          No plans available for this selection yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {Toggle}
      <p className="text-center" style={{ fontSize: 14, color: MUTED }}>
        Choose the plan that fits your fitness journey.
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o, i) => {
          const price = effectivePrice(o);
          const isOverride = overrideMap.has(o.id);
          const monthly = monthlyInfo(o);
          const feat = featured(o);
          return (
            <div
              key={o.id}
              className="relative flex flex-col rounded-2xl"
              style={{
                background: feat ? "#fffdf6" : "#fff",
                border: `${feat ? 2 : 1}px solid ${feat ? GOLD : BORDER}`,
                boxShadow: feat ? "0 14px 34px rgba(30,58,95,0.11)" : "0 4px 16px rgba(30,58,95,0.05)",
                padding: "28px 24px",
              }}
            >
              {o.badge && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full font-bold"
                  style={{ fontSize: 11, letterSpacing: 0.4, color: "#fff", background: GOLD, padding: "5px 14px", whiteSpace: "nowrap" }}
                >
                  {o.badge}
                </span>
              )}

              <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: GOLD_DEEP }}>
                {MICRO[i] ?? ""}
              </p>
              <p className="mt-1.5" style={{ fontSize: 19, fontWeight: 600, color: NAVY }}>{o.name}</p>

              <div className="mt-3 flex items-end gap-2">
                <span style={{ fontSize: 34, fontWeight: 700, color: NAVY, lineHeight: 1 }}>₹{price.toLocaleString("en-IN")}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2" style={{ minHeight: 22 }}>
                {monthly && o.duration_months > 1 && (
                  <span style={{ fontSize: 13, color: MUTED }}>₹{Math.round(monthly.perMonth).toLocaleString("en-IN")}/month</span>
                )}
                {monthly && monthly.savePct > 0 && (
                  <span className="rounded-full font-bold" style={{ fontSize: 11, color: "#1b7a43", background: "#e6f7ed", padding: "2px 9px" }}>
                    {monthly.savePct}% OFF
                  </span>
                )}
              </div>
              {isOverride && <p style={{ fontSize: 11, color: GOLD_DEEP, marginTop: 2 }}>Your price</p>}

              <p className="mt-3" style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>{o.total_sessions ?? "—"} sessions</p>

              <div className="my-4" style={{ height: 1, background: BORDER }} />

              <ul className="flex flex-col gap-2.5">
                {benefits(o).map((b) => (
                  <li key={b.label} className="flex items-start gap-2.5" style={{ fontSize: 13.5, color: b.included ? NAVY : MUTED }}>
                    <span
                      className="grid place-items-center rounded-full shrink-0"
                      style={{ width: 18, height: 18, marginTop: 1, background: b.included ? "#e6f7ed" : "rgba(210,59,52,0.12)" }}
                    >
                      {b.included ? <Check size={12} color="#1b7a43" /> : <X size={12} color="#d23b34" />}
                    </span>
                    <span style={{ textDecoration: b.included ? "none" : "line-through" }}>{b.label}</span>
                  </li>
                ))}
              </ul>

              {/* Flexible spacer pins the CTA to the bottom (equal across cards)
                  while guaranteeing a minimum gap above it. */}
              <div style={{ flexGrow: 1, minHeight: 20 }} />

              {/* Existing customers go straight to the gateway; first-timers
                  and mode switchers go through the flow that asks. */}
              <button
                type="button"
                onClick={() => proceed(o)}
                disabled={buying === o.id}
                className="flex items-center justify-center gap-2 rounded-xl font-semibold w-full"
                style={{ background: NAVY, color: "#fff", fontSize: 15, padding: "13px 0", textDecoration: "none", opacity: buying === o.id ? 0.7 : 1 }}
              >
                {buying === o.id ? "Opening payment…" : <>Proceed <ArrowRight size={18} color="#fff" /></>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ExplorePlansDialog({ userId, customerName, customerPhone }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full font-semibold"
        style={{ background: "rgba(240,167,32,0.14)", color: GOLD_DEEP, fontSize: 13, padding: "8px 14px" }}
      >
        <Sparkles size={15} color={GOLD_DEEP} /> Explore other plans
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>Explore other plans</DialogTitle>
            <p style={{ fontSize: 13, color: MUTED }}>Pick a duration and we'll take it forward on WhatsApp.</p>
          </DialogHeader>
          <div className="mt-1">
            <PlanOptionsList userId={userId} customerName={customerName} customerPhone={customerPhone} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
