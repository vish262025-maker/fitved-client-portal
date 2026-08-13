import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trackAdminActivity } from "@/lib/adminActivity";
import { format } from "date-fns";
import {
  WEEKDAYS,
  calculatePlanEndDate, calculatePlanRenewalDate,
  countLostTrainingDays, extendEndDateBySessions, isoDate,
} from "@/lib/sessionPlan";
import { CustomPlanPrices } from "./CustomPlanPrices";

// Plan lifecycle: "active" (running), "completed" (ran its course and ended),
// or "stopped" (customer stopped buying plans / churned — admin-set). Pauses
// are tracked in the pauses table and never change the plan status; legacy
// "paused"/"cancelled" rows are shown as completed.
type PlanStatus = "active" | "completed" | "stopped";

const normalizeStatus = (s: string | null | undefined): PlanStatus =>
  s === "active" ? "active" : s === "stopped" ? "stopped" : "completed";

const isValidDate = (dStr: string) => {
  if (!dStr) return false;
  const d = new Date(dStr);
  return !isNaN(d.getTime());
};

export function PlanTab({ userId }: { userId: string }) {
  const qc = useQueryClient();

  const { data: plan } = useQuery({
    queryKey: ["customer-plan", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("plans").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: pauses = [] } = useQuery({
    queryKey: ["customer-pauses-for-plan", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("pauses").select("from_date,to_date,status").eq("user_id", userId);
      return data ?? [];
    },
  });

  // Trainer off-days also extend the plan (uncapped) — fetch this customer's
  // trainer + slot and the trainer's off times.
  const { data: customerProfile } = useQuery({
    queryKey: ["customer-profile-for-plan", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles").select("trainer_id, time_slot").eq("id", userId).maybeSingle();
      return data;
    },
  });

  const { data: trainerOffTimes = [] } = useQuery({
    queryKey: ["trainer-offs-for-plan", customerProfile?.trainer_id],
    enabled: !!customerProfile?.trainer_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("trainer_off_times")
        .select("from_date,to_date,time_slot")
        .eq("trainer_id", customerProfile!.trainer_id!);
      return data ?? [];
    },
  });

  const [totalSessions, setTotalSessions] = useState<number>(12);
  const [trainingDays, setTrainingDays] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [amount, setAmount] = useState<number>(3499);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [status, setStatus] = useState<PlanStatus>("active");
  // "Custom plan" mode: a one-off personal plan for this customer — any
  // session count and price, without touching the Plans catalog.
  const [customPlan, setCustomPlan] = useState(false);
  useEffect(() => {
    // Load the latest plan whatever its status, so the Status dropdown always
    // reflects reality (a completed/stopped plan must not show as "Active" here
    // while the customer list shows "completed"). The next cycle is started via
    // the "Renew / extend" section below, not by blanking this form.
    if (plan) {
      setTotalSessions(plan.total_sessions);
      setTrainingDays(plan.training_days ?? []);
      setStartDate(plan.start_date);
      setEndDate(plan.end_date);
      setRenewalDate(plan.renewal_date);
      setAmount(Number(plan.amount));
      setDiscount(Number(plan.discount ?? 0));
      setPaymentMethod(plan.payment_method ?? "");
      setAutoRenew(plan.auto_renew);
      setStatus(normalizeStatus(plan.status));
    } else {
      // Clear inputs for new plan creation when no plan exists at all
      setTotalSessions(12);
      setTrainingDays([]);
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate("");
      setRenewalDate("");
      setAmount(3499);
      setDiscount(0);
      setPaymentMethod("");
      setAutoRenew(true);
      setStatus("active");
    }
  }, [plan]);

  // Training days lost inside this plan's window (start → base end) —
  // customer pauses (capped at 1/3) and trainer off-days (never capped).
  // A day that is both paused and trainer-off counts once, as paused.
  const lostDays = useMemo(() => {
    if (!trainingDays.length || !startDate || !totalSessions) return { pausedLost: 0, offLost: 0 };
    const baseEnd = isoDate(calculatePlanEndDate(startDate, totalSessions, trainingDays));
    return countLostTrainingDays(
      startDate,
      baseEnd,
      trainingDays,
      pauses.map((p) => ({ from: p.from_date, to: p.to_date })),
      trainerOffTimes,
      customerProfile?.time_slot ?? null,
    );
  }, [pauses, trainerOffTimes, customerProfile?.time_slot, trainingDays, startDate, totalSessions]);

  const lostFromPauses = lostDays.pausedLost;
  const lostFromTrainerOffs = lostDays.offLost;

  // Extra classes already taken to compensate trainer off-days — each one
  // consumes an off-day bonus (recorded in the Extra classes tab).
  const { data: compClasses = [] } = useQuery({
    queryKey: ["comp-classes", userId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("comp_classes").select("id, class_date").eq("client_id", userId);
      return data ?? [];
    },
  });
  const compTaken = useMemo(
    () => (startDate ? compClasses.filter((c: any) => c.class_date >= startDate).length : 0),
    [compClasses, startDate],
  );
  const netOffBonus = Math.max(0, lostFromTrainerOffs - compTaken);

  // Capped pause extension (max 1/3 of plan total sessions)
  const allowedPauseExtension = useMemo(() => {
    if (!totalSessions) return 0;
    const maxCarryForward = Math.floor(totalSessions / 3);
    return Math.min(lostFromPauses, maxCarryForward);
  }, [lostFromPauses, totalSessions]);

  const totalExtension = allowedPauseExtension + netOffBonus;

  // Auto-recompute end + renewal whenever start/sessions/days/extension change
  useEffect(() => {
    if (!startDate || !trainingDays.length || !totalSessions) return;
    const base = calculatePlanEndDate(startDate, totalSessions, trainingDays);
    const end = totalExtension > 0 ? extendEndDateBySessions(base, totalExtension, trainingDays) : base;
    const renewal = calculatePlanRenewalDate(end, trainingDays);
    setEndDate(isoDate(end));
    setRenewalDate(isoDate(renewal));
  }, [startDate, totalSessions, trainingDays, totalExtension]);

  const toggleDay = (day: string, on: boolean) => {
    setTrainingDays((prev) =>
      on ? [...prev, day] : prev.filter((d) => d !== day)
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!trainingDays.length) throw new Error("Select at least one training day");
      // `any` payload: the generated types don't yet include the "stopped"
      // status enum value (added by migration 20260807120000).
      const payload: any = {
        user_id: userId,
        total_sessions: totalSessions,
        training_days: trainingDays,
        start_date: startDate,
        end_date: endDate,
        renewal_date: renewalDate,
        amount,
        discount,
        payment_method: paymentMethod || null,
        auto_renew: autoRenew,
        status,
      };
      if (plan) {
        const { data, error } = await supabase.from("plans").update(payload).eq("id", plan.id).select();
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("Nothing was updated — the plan row wasn't found or you don't have permission to change it.");
        }
        return data[0];
      } else {
        // A brand-new plan can't be "completed" while its end date is still in
        // the future — that's a mis-set status dropdown, and it corrupts the
        // Not-renewed queue on the dashboard.
        const todayStr = new Date().toISOString().slice(0, 10);
        if (status !== "active" && endDate > todayStr) {
          throw new Error(
            "This plan ends in the future — keep status Active, or use past dates to record an old plan.",
          );
        }
        // Re-saving while the customer's latest plan isn't active used to
        // insert a duplicate row on every click. Reuse the row for the same
        // plan window instead.
        const { data: dupe } = await supabase
          .from("plans")
          .select("id")
          .eq("user_id", userId)
          .eq("start_date", startDate)
          .eq("total_sessions", totalSessions)
          .limit(1)
          .maybeSingle();
        if (dupe?.id) {
          const { data, error } = await supabase.from("plans").update(payload).eq("id", dupe.id).select();
          if (error) throw error;
          return data?.[0] ?? null;
        }
        const { data, error } = await supabase.from("plans").insert(payload).select();
        if (error) throw error;
        return data?.[0] ?? null;
      }
    },
    onSuccess: async (saved) => {
      toast.success(plan ? "Plan updated" : "Plan created");
      trackAdminActivity({ action: plan ? "plan.update" : "plan.create", entityType: "customer", entityId: userId, details: { totalSessions, amount, status } });
      // Write the saved row straight into the cache so the Plan tab shows the
      // new values immediately on remount — invalidate alone left it stale.
      if (saved) qc.setQueryData(["customer-plan", userId], saved);

      // Auto-record/sync billing entry when plan is created or updated
      if (saved && amount > 0) {
        const desc = `Plan: ${totalSessions} sessions (starts ${startDate})`;

        if (status === "active") {
          const netAmt = amount - discount;
          if (netAmt > 0) {
            // One payment row per plan: match by plan_id first so edits to the
            // plan (dates, sessions, price) UPDATE the same row instead of
            // inserting a duplicate. Fall back to the note text for legacy
            // rows created before plan_id existed.
            let existing: { id: string } | null = null;
            if (saved?.id) {
              const { data } = await (supabase as any)
                .from("billing_history")
                .select("id")
                .eq("plan_id", saved.id)
                .eq("type", "payment")
                .limit(1)
                .maybeSingle();
              existing = data ?? null;
            }
            if (!existing) {
              const { data } = await supabase
                .from("billing_history")
                .select("id")
                .eq("user_id", userId)
                .eq("notes", desc)
                .limit(1)
                .maybeSingle();
              existing = data ?? null;
            }

            const billingPayload: any = {
              user_id: userId,
              payment_date: startDate || new Date().toISOString().slice(0, 10),
              amount: netAmt,
              method: paymentMethod || null,
              type: "payment",
              notes: desc,
              // Link to the plan so income can be prorated across its months
              plan_id: saved?.id ?? null,
            };

            if (existing?.id) {
              // Update existing transaction
              const { error: updateErr } = await supabase
                .from("billing_history")
                .update(billingPayload)
                .eq("id", existing.id);
              if (updateErr) {
                console.warn("Auto-billing update failed:", updateErr);
              } else {
                toast.info(`Billing record updated: ₹${netAmt.toLocaleString("en-IN")}`);
              }
            } else {
              // Insert new transaction
              const { error: insertErr } = await supabase
                .from("billing_history")
                .insert(billingPayload);
              if (insertErr) {
                console.warn("Auto-billing insert failed:", insertErr);
              } else {
                toast.success(`₹${netAmt.toLocaleString("en-IN")} payment auto-recorded in billing`);
              }
            }
          }
        }
      }

      qc.invalidateQueries({ queryKey: ["customer-plan", userId] });
      qc.invalidateQueries({ queryKey: ["customer-billing", userId] });
      qc.invalidateQueries({ queryKey: ["billing", userId] });
      qc.invalidateQueries({ queryKey: ["admin-customer-list"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e) => {
      console.error("Plan save error:", e);
      const raw = e instanceof Error ? e.message : (e as any)?.message || JSON.stringify(e) || "Save failed";
      // The old plans table capped total_sessions to IN (8,12,36,72). Custom
      // plans use any count, so surface the migration to run instead of the
      // raw Postgres constraint error.
      if (/plans_total_sessions_check/i.test(raw)) {
        toast.error(
          "Custom session counts aren't enabled on the database yet. Run migration 20260805120000_plans_allow_custom_sessions.sql in Supabase.",
        );
        return;
      }
      // The "stopped" status needs the plan_status enum widened in the live DB.
      if (/invalid input value for enum plan_status|plan_status/i.test(raw)) {
        toast.error(
          "The 'Stopped' status isn't enabled on the database yet. Run migration 20260807120000_plan_status_add_stopped.sql in Supabase.",
        );
        return;
      }
      toast.error(raw);
    },
  });

  // ── Manual renewal / extension ──────────────────────────────────────
  // Nothing renews automatically. The admin picks what the next cycle is —
  // the same plan again (renew) or any package from the catalog (extend) —
  // and it starts on the current plan's renewal date (already pushed forward
  // by any pause extensions), or the next training day from today if that
  // date has passed. The old cycle is closed as "completed" and the payment
  // is recorded in billing automatically.
  const { data: planOptions = [] } = useQuery({
    queryKey: ["plan-options-admin"],
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_options").select("*").eq("active", true)
        .order("sort_order").order("duration_months");
      return data ?? [];
    },
  });

  const { data: priceOverrides = [] } = useQuery({
    queryKey: ["plan-price-overrides-admin", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_price_overrides").select("plan_option_id,price").eq("user_id", userId);
      return data ?? [];
    },
  });

  const overrideMap = useMemo(
    () => new Map(priceOverrides.map((o) => [o.plan_option_id, Number(o.price)])),
    [priceOverrides],
  );

  // Effective price for a session count, straight from the Plans catalog with
  // this customer's override applied — the single source of truth for pricing.
  const priceForSessions = (sessions: number): number | null => {
    const opt = planOptions.find((o) => o.total_sessions === sessions);
    if (!opt) return null;
    return overrideMap.get(opt.id) ?? Number(opt.price);
  };

  // Sessions dropdown, built from the live Plans catalog — a plan added in
  // Admin → Plans shows up here automatically. Trial (8) is kept as a
  // built-in when the catalog doesn't define it.
  const sessionDropdownOptions = useMemo(() => {
    const opts: { sessions: number; label: string }[] = [];
    for (const o of planOptions) {
      if (o.total_sessions == null) continue;
      if (opts.some((x) => x.sessions === o.total_sessions)) continue;
      const price = overrideMap.get(o.id) ?? Number(o.price);
      opts.push({
        sessions: o.total_sessions,
        label: `${o.total_sessions} sessions · ${o.name} · ₹${price.toLocaleString("en-IN")}${overrideMap.has(o.id) ? " (custom price)" : ""}`,
      });
    }
    if (!opts.some((x) => x.sessions === 8)) {
      opts.push({ sessions: 8, label: "8 sessions · trial / recovery" });
    }
    return opts.sort((a, b) => a.sessions - b.sessions);
  }, [planOptions, overrideMap]);

  // A loaded plan whose session count isn't in the catalog is a custom plan.
  useEffect(() => {
    if (plan && planOptions.length > 0) {
      const inCatalog =
        plan.total_sessions === 8 ||
        planOptions.some((o) => o.total_sessions === plan.total_sessions);
      setCustomPlan(!inCatalog);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, plan?.total_sessions, planOptions.length]);

  // Duration of the custom plan, derived from the computed schedule
  const customDurationMonths = useMemo(() => {
    if (!startDate || !endDate) return null;
    const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000 + 1;
    if (!Number.isFinite(days) || days <= 0) return null;
    return Math.max(1, Math.round(days / 30));
  }, [startDate, endDate]);

  // "same" = renew the current plan as-is; otherwise a plan_options id.
  const [nextCyclePkg, setNextCyclePkg] = useState("same");

  const nextCycle = useMemo(() => {
    if (!plan) return null;
    if (nextCyclePkg !== "same") {
      const opt = planOptions.find((o) => o.id === nextCyclePkg && o.total_sessions != null);
      if (opt) {
        return {
          label: opt.name,
          sessions: opt.total_sessions as number,
          amount: overrideMap.get(opt.id) ?? Number(opt.price),
          discount: 0,
        };
      }
    }
    return {
      label: "Same plan again",
      sessions: plan.total_sessions,
      amount: Number(plan.amount),
      discount: Number(plan.discount ?? 0),
    };
  }, [plan, nextCyclePkg, planOptions, overrideMap]);
  const suggestedRenewStart = useMemo(() => {
    if (!plan) return "";
    const days: string[] = plan.training_days ?? [];
    const todayISO = new Date().toISOString().slice(0, 10);
    let start = plan.renewal_date
      ?? isoDate(calculatePlanRenewalDate(plan.end_date, days));
    if (start < todayISO) {
      // renewal date already passed — resume from the next training day
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      start = isoDate(calculatePlanRenewalDate(yesterday, days));
    }
    return start;
  }, [plan]);

  // The admin can override the renewal start date — e.g. backdate it when a
  // customer started training before the payment came through.
  const [renewStartOverride, setRenewStartOverride] = useState("");
  const renewStartISO = renewStartOverride || suggestedRenewStart;

  const renew = useMutation({
    mutationFn: async () => {
      if (!plan || !nextCycle) throw new Error("No plan to renew");
      const days: string[] = plan.training_days ?? [];
      if (!days.length) throw new Error("The current plan has no training days set");
      const newEnd = calculatePlanEndDate(renewStartISO, nextCycle.sessions, days);
      const newRenewal = calculatePlanRenewalDate(newEnd, days);

      // Close the old cycle (no-op if it already completed)
      const { error: closeErr } = await supabase
        .from("plans").update({ status: "completed" }).eq("id", plan.id);
      if (closeErr) throw closeErr;

      // Start the new cycle with the selected package
      const { data: created, error } = await supabase.from("plans").insert({
        user_id: userId,
        total_sessions: nextCycle.sessions,
        training_days: days,
        start_date: renewStartISO,
        end_date: isoDate(newEnd),
        renewal_date: isoDate(newRenewal),
        amount: nextCycle.amount,
        discount: nextCycle.discount,
        payment_method: plan.payment_method,
        auto_renew: plan.auto_renew,
        status: "active",
      }).select().single();
      if (error) throw error;

      // Record the renewal payment
      const netAmt = nextCycle.amount - nextCycle.discount;
      if (netAmt > 0) {
        const { error: billErr } = await (supabase as any).from("billing_history").insert({
          user_id: userId,
          payment_date: renewStartISO,
          amount: netAmt,
          method: plan.payment_method ?? null,
          type: "payment",
          notes: `Plan: ${nextCycle.sessions} sessions (starts ${renewStartISO})`,
          // Link to new plan so income is prorated across its months
          plan_id: created?.id ?? null,
        });
        if (billErr) console.warn("Renewal billing insert failed:", billErr);
      }
      return created;
    },
    onSuccess: (created) => {
      toast.success(`Plan ${nextCyclePkg === "same" ? "renewed" : "extended"} — next cycle starts ${format(new Date(renewStartISO), "EEE, MMM d")}`);
      setNextCyclePkg("same");
      setRenewStartOverride("");
      if (created) qc.setQueryData(["customer-plan", userId], created);
      qc.invalidateQueries({ queryKey: ["customer-plan", userId] });
      qc.invalidateQueries({ queryKey: ["customer-billing", userId] });
      qc.invalidateQueries({ queryKey: ["billing", userId] });
      qc.invalidateQueries({ queryKey: ["plan", userId] });
      qc.invalidateQueries({ queryKey: ["admin-customer-list"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Renewal failed"),
  });

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Plan / sessions</Label>
          <Select
            value={customPlan ? "custom" : String(totalSessions)}
            onValueChange={(v) => {
              if (v === "custom") {
                setCustomPlan(true);
                return;
              }
              setCustomPlan(false);
              const val = Number(v);
              setTotalSessions(val);
              // Price comes from the Plans catalog (per-customer override first),
              // so it always matches whatever the admin has set there.
              const catalogPrice = priceForSessions(val);
              if (catalogPrice != null) setAmount(catalogPrice);
              else if (val === 8) setAmount(0); // trial — not in the catalog
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {sessionDropdownOptions.map((o) => (
                <SelectItem key={o.sessions} value={String(o.sessions)}>{o.label}</SelectItem>
              ))}
              <SelectItem value="custom">Custom plan — set sessions &amp; price manually</SelectItem>
            </SelectContent>
          </Select>
          {customPlan && (
            <div className="rounded-lg border p-3 mt-1 space-y-2" style={{ borderColor: "rgba(240,167,32,0.5)", background: "rgba(240,167,32,0.06)" }}>
              <div className="flex items-center gap-2">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Sessions</Label>
                  <Input
                    type="number"
                    min={1}
                    value={totalSessions || ""}
                    onChange={(e) => setTotalSessions(Math.max(0, Number(e.target.value)))}
                    placeholder="e.g. 20"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Duration</Label>
                  <div className="h-10 flex items-center px-3 rounded-md border bg-muted/40 text-sm">
                    {customDurationMonths != null ? `≈ ${customDurationMonths} month${customDurationMonths === 1 ? "" : "s"}` : "—"}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Personal plan for this customer only — not added to the catalog. Duration follows the
                schedule ({trainingDays.length || "?"} day(s)/week), and income splits across those months.
                Set the price on the right.
              </p>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Pricing (₹)</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                placeholder="Base amount"
              />
              <span className="text-[11px] text-muted-foreground">Base amount</span>
            </div>
            <div className="space-y-1">
              <Input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                placeholder="Discount"
              />
              <span className="text-[11px] text-muted-foreground">Discount</span>
            </div>
          </div>
          {discount > 0 && (
            <p className="text-xs text-muted-foreground">
              Net payable:{" "}
              <span className="font-medium text-foreground">
                ₹{Math.max(0, amount - discount).toLocaleString("en-IN")}
              </span>
              {discount > amount && <span className="text-destructive"> (discount exceeds amount)</span>}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Training days (weekly pattern)</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {WEEKDAYS.map((day) => (
            <label key={day} className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer hover:bg-accent">
              <Checkbox
                checked={trainingDays.includes(day)}
                onCheckedChange={(c) => toggleDay(day, !!c)}
              />
              <span className="text-sm">{day.slice(0, 3)}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {trainingDays.length} day(s)/week selected. Sessions repeat this pattern weekly.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Start date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Plan end (last session)</Label>
          <Input type="date" value={endDate} readOnly className="bg-muted/40" />
        </div>
        <div className="space-y-1.5">
          <Label>Next plan starts (renewal)</Label>
          <Input type="date" value={renewalDate} readOnly className="bg-muted/40" />
        </div>
      </div>

      <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
        <p className="font-medium">Schedule summary</p>
        <p className="text-muted-foreground">
          {isValidDate(endDate) && isValidDate(renewalDate) ? (
            <>
              Plan ends <span className="font-medium text-foreground">{format(new Date(endDate), "EEE, MMM d, yyyy")}</span>
              {" · "}Next plan starts <span className="font-medium text-foreground">{format(new Date(renewalDate), "EEE, MMM d, yyyy")}</span>
            </>
          ) : "Pick start date and training days to compute."}
        </p>
        <p className="text-xs text-muted-foreground pt-2">
          Pause days lost: <span className="font-medium text-foreground">{lostFromPauses}</span>
          {allowedPauseExtension > 0 && (
            <> (extends by {allowedPauseExtension}, capped at 1/3 of the plan)</>
          )}
          {" "}· Trainer off-days hit: <span className="font-medium text-foreground">{lostFromTrainerOffs}</span>
          {compTaken > 0 && (
            <> − <span className="font-medium text-foreground">{compTaken}</span> compensated by extra classes = <span className="font-medium text-foreground">{netOffBonus}</span> bonus left</>
          )}
          {compTaken === 0 && lostFromTrainerOffs > 0 && <> (bonus classes, no cap)</>}
          {totalExtension > 0 && (
            <> · end date pushed by <span className="font-medium text-foreground">{totalExtension}</span> training day(s) total</>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Payment method</Label>
          <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="UPI / Card / Cash" />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as PlanStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active — plan is running</SelectItem>
              <SelectItem value="completed">Completed — plan has ended</SelectItem>
              <SelectItem value="stopped">Stopped — customer stopped buying plans</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pauses don't change this — manage breaks in the Pauses tab. Expired plans complete automatically.
            {status === "stopped" && " Marking Stopped keeps existing records but won't add any new billing."}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3 gap-3">
        <div>
          <Label>Expected to renew</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Just a marker for the renewals list — nothing renews on its own. Use "Renew plan" below when payment is collected.
          </p>
        </div>
        <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Saving…" : plan ? "Update plan" : "Create plan"}
      </Button>

      {/* Manual renewal / extension — the only way a plan rolls into its next cycle */}
      {plan && nextCycle && (
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "rgba(240,167,32,0.5)", background: "rgba(240,167,32,0.06)" }}>
          <div>
            <p className="font-medium text-sm">Renew / extend plan (next cycle)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick what comes next — the same plan again, or a different package. It starts right after the
              current plan ends (pause extensions included).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Next cycle package</Label>
              <Select value={nextCyclePkg} onValueChange={setNextCyclePkg}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="same">
                    Same plan again · {plan.total_sessions} sessions · ₹{Math.max(0, Number(plan.amount) - Number(plan.discount ?? 0)).toLocaleString("en-IN")}
                  </SelectItem>
                  {planOptions.filter((o) => o.total_sessions != null).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} · {o.total_sessions} sessions · ₹{(overrideMap.get(o.id) ?? Number(o.price)).toLocaleString("en-IN")}
                      {overrideMap.has(o.id) ? " (custom price)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Renewal start date</Label>
              <Input
                type="date"
                value={renewStartISO}
                onChange={(e) => setRenewStartOverride(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Backdate this if the customer started before paying{renewStartOverride && renewStartOverride !== suggestedRenewStart ? (
                  <> · <button type="button" className="text-primary hover:underline" onClick={() => setRenewStartOverride("")}>reset to {suggestedRenewStart}</button></>
                ) : null}
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{nextCycle.sessions} sessions</span>
            {" "}starting <span className="font-medium text-foreground">{renewStartISO && isValidDate(renewStartISO) ? format(new Date(renewStartISO), "EEE, MMM d, yyyy") : "—"}</span>
            {renewStartISO && (plan.training_days ?? []).length > 0 && (
              <>
                {" "}· runs till{" "}
                <span className="font-medium text-foreground">
                  {format(calculatePlanEndDate(renewStartISO, nextCycle.sessions, plan.training_days ?? []), "EEE, MMM d, yyyy")}
                </span>
              </>
            )}
            {" "}· <span className="font-medium text-foreground">₹{Math.max(0, nextCycle.amount - nextCycle.discount).toLocaleString("en-IN")}</span>.
            The current cycle is marked completed and the payment is recorded in Billing automatically.
          </p>

          <Button
            size="sm"
            disabled={renew.isPending}
            onClick={() => {
              if (confirm(`${nextCyclePkg === "same" ? "Renew" : `Extend with ${nextCycle.label}`}? New cycle: ${nextCycle.sessions} sessions starting ${renewStartISO}. A ₹${Math.max(0, nextCycle.amount - nextCycle.discount).toLocaleString("en-IN")} payment will be recorded.`)) {
                renew.mutate();
              }
            }}
          >
            {renew.isPending ? "Working…" : nextCyclePkg === "same" ? "Renew plan now" : "Extend plan now"}
          </Button>
        </div>
      )}

      <CustomPlanPrices userId={userId} />
    </div>
  );
}
