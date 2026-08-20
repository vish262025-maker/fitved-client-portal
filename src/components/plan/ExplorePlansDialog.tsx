import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, MessageCircle, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const GOLD   = "#f0a720";
const NAVY   = "#1E3A5F";
const MUTED  = "#8a8f9e";
const BORDER = "rgba(30,58,95,0.08)";
const GOLD_DEEP = "#b07d10";
const WHATSAPP = "#25D366";
const WA_NUMBER = "919606047293";

interface Props {
  userId: string;
  customerName: string;
  customerPhone?: string;
}

interface Option {
  id: string;
  name: string;
  duration_months: number;
  price: number;
  total_sessions: number | null;
  badge: string | null;
  training_type?: "personal" | "group";
  class_mode?: "online" | "offline";
}

/**
 * The plan cards themselves — rendered inline on the Plan page whenever the
 * customer has no active plan (so the catalog is always visible), and inside
 * the "Explore other plans" dialog for customers mid-plan.
 */
export function PlanOptionsList({ userId, customerName, customerPhone }: Props) {
  const [type, setType] = useState<"personal" | "group">("group");
  const { data: allOptions = [] } = useQuery({
    queryKey: ["plan-options"],
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_options").select("*").eq("active", true)
        .order("sort_order").order("duration_months");
      return (data ?? []) as Option[];
    },
  });

  // Customer's own class mode (online/offline) — plans are scoped to it so a
  // customer only sees the pricing for how they train.
  const { data: myMode } = useQuery({
    queryKey: ["profile-class-mode", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("class_mode").eq("id", userId).maybeSingle();
      return (data?.class_mode ?? null) as "online" | "offline" | null;
    },
  });

  // Independent Personal vs Group catalogs, scoped to the customer's class mode.
  // Missing columns (pre-migration) fall back so existing customers keep seeing plans.
  const modeScoped = allOptions.some((o) => "class_mode" in o) && myMode
    ? allOptions.filter((o) => (o.class_mode ?? "offline") === myMode)
    : allOptions;
  const hasTypes = modeScoped.some((o) => "training_type" in o);
  const options = hasTypes ? modeScoped.filter((o) => (o.training_type ?? "personal") === type) : modeScoped;

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

  const waLink = (o: Option) => {
    const label = /plan/i.test(o.name) ? o.name : `${o.name} plan`;
    const signOff = [customerName, customerPhone].filter(Boolean).join(", ");
    const text = `Hi FitVed, I'm interested in the ${label}.${signOff ? ` — ${signOff}` : ""}`;
    return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
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
    if (online) {
      const list = [
        { label: `${s} live online group sessions`, included: true },
        { label: `${p} pause classes`, included: true },
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

  const Toggle = hasTypes ? (
    <div className="flex justify-center">
      <div className="inline-flex rounded-full p-1.5" style={{ background: "rgba(30,58,95,0.06)" }}>
        {(["group", "personal"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
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
  ) : null;

  if (options.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {Toggle}
        <p className="text-center" style={{ fontSize: 14, color: MUTED, padding: 8 }}>No plans available right now.</p>
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

              <a
                href={waLink(o)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl font-semibold"
                style={{ background: WHATSAPP, color: "#fff", fontSize: 15, padding: "13px 0", textDecoration: "none" }}
              >
                <MessageCircle size={18} color="#fff" /> Chat on WhatsApp
              </a>
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
