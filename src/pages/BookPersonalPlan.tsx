import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Building2, CalendarDays, Check, Clock, CreditCard,
  Loader2, MapPin, UserRound, Hourglass,
} from "lucide-react";
import { WEEKDAYS, sortDays, daySetLabel } from "@/lib/daySets";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { slotSummary, STATUS_LABEL, OPEN_STATUSES, type BookingRequest } from "@/lib/bookingRequests";
import { gatewayConfig, payForPlan } from "@/lib/payments";

const GOLD = "#f0a720";
const NAVY = "#1E3A5F";
const MUTED = "#8a8f9e";
const BORDER = "rgba(30,58,95,0.08)";

type Step = 1 | 2 | 3 | 4;
const STEPS = ["Plan", "Slot", "Location", "Payment"] as const;

/**
 * Offline Personal Training booking.
 * Plan → preferred slot → location → payment → request created.
 *
 * The customer never picks a trainer: after payment the request sits at
 * `pending_trainer_assignment` until their admin assigns one.
 */
export default function BookPersonalPlan() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const [step, setStep] = useState<Step>(2);
  const [days, setDays] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [slotSetId, setSlotSetId] = useState("");
  const [society, setSociety] = useState("");
  const [address, setAddress] = useState("");
  const [paying, setPaying] = useState(false);
  // Stable for the lifetime of this booking attempt; a fresh visit (e.g. after
  // a rejection) gets a new one.
  const [attemptRef] = useState(() => Date.now().toString(36));
  const gatewayQ = useQuery({ queryKey: ["gateway-config"], queryFn: gatewayConfig });

  const adminId: string | null = (profile as any)?.assigned_admin_id ?? null;

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

  // Admin-defined availability: day combinations + their bookable times.
  const availQ = useQuery({
    queryKey: ["pt-availability", adminId],
    enabled: !!adminId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pt_slot_sets")
        .select("id, label, days, active, sort_order")
        .eq("assigned_admin_id", adminId)
        .eq("training_type", "personal")
        .eq("active", true)
        .order("sort_order");
      if (error || !(data ?? []).length) return [] as any[];

      const ids = (data as any[]).map((s: any) => s.id);
      const { data: t } = await (supabase as any)
        .from("pt_slot_set_times")
        .select("slot_set_id, time_slot, active, sort_order")
        .in("slot_set_id", ids)
        .order("sort_order");
      const byId: Record<string, string[]> = {};
      for (const r of (t ?? []) as any[]) {
        if (r.active === false) continue;
        (byId[r.slot_set_id] ??= []).push(r.time_slot);
      }
      // Only offer combinations that actually have a bookable time.
      return (data as any[])
        .map((s: any) => ({ ...s, times: byId[s.id] ?? [] }))
        .filter((s: any) => s.times.length > 0);
    },
  });
  const availability = availQ.data ?? [];
  const chosenSet = availability.find((s: any) => s.id === slotSetId) ?? null;

  // The admin's societies — offering these keeps the customer's answer matched
  // to a real society, which is what links them to a trainer's roster later.
  const societiesQ = useQuery({
    queryKey: ["pt-societies", adminId],
    enabled: !!adminId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("societies").select("id, name").eq("assigned_admin_id", adminId).order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const societies = societiesQ.data ?? [];

  // An existing open request means this customer already booked — show that
  // instead of letting them pay twice (also covers refresh-after-payment).
  const existingQ = useQuery({
    queryKey: ["my-booking-request", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Latest request whatever its status: an open one blocks re-booking, a
      // rejected one still needs to be shown to the customer.
      const { data, error } = await (supabase as any)
        .from("booking_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { __notReady: true } as const;
      return (data ?? null) as BookingRequest | null;
    },
  });
  const notReady = (existingQ.data as any)?.__notReady === true;
  const latest: BookingRequest | null =
    existingQ.data && !notReady ? (existingQ.data as BookingRequest) : null;
  // Only an open request takes over the page; a rejected one shows a notice
  // above the form so the customer can book again straight away.
  const existing = latest && OPEN_STATUSES.includes(latest.status) ? latest : null;
  const rejected = latest?.status === "cancelled" ? latest : null;

  const trainerQ = useQuery({
    queryKey: ["booking-trainer", existing?.trainer_id],
    enabled: !!existing?.trainer_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainers").select("name, contact, specialization")
        .eq("id", existing!.trainer_id).maybeSingle();
      return data;
    },
  });

  const toggleDay = (d: string) =>
    setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  const back = () => (step === 2 ? navigate("/plan") : setStep((s) => (s - 1) as Step));

  /**
   * Payment + request creation.
   *
   * NOTE: there is no payment gateway in this project yet, so this marks the
   * payment as pending-gateway and creates the request. When Razorpay is wired
   * up, only this call needs to move behind the gateway callback — the request
   * shape, statuses and admin flow stay exactly the same.
   */
  const payAndCreate = async () => {
    if (!user || !plan) return;
    setPaying(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      // The society dropdown carries names; the subscription stores the id so
      // the trainer/session layer has a real foreign key to work from.
      const { data: soc } = await (supabase as any)
        .from("societies").select("id").eq("name", society.trim()).limit(1).maybeSingle();

      const { data: created, error } = await (supabase as any)
        .from("plans")
        .insert({
          user_id: user.id,
          plan_option_id: plan.id,
          training_mode: "offline",
          training_type: "personal",
          society_id: soc?.id ?? null,
          training_days: sortDays(days),
          time_slot: time.trim(),
          total_sessions: plan.total_sessions ?? 0,
          duration_months: plan.duration_months ?? null,
          start_date: today,
          // Real term is set server-side from duration_months on activation.
          end_date: today,
          renewal_date: today,
          amount: Number(plan.price ?? 0),
          // NOT "active": the plan only becomes live when the payment service
          // verifies the payment and flips both fields.
          status: "stopped",
          payment_status: "pending",
        })
        .select("id").maybeSingle();
      if (error) throw error;
      if (!created?.id) throw new Error("Couldn't start your subscription. Please try again.");

      const paid = await payForPlan(created.id);
      if (paid.status === "success") {
        // Offline personal has no batch, so no trainer is resolved at payment
        // time. The subscription is active and its sessions are laid out; an
        // admin assigns the trainer, which is shown as "Trainer being assigned".
        toast.success("Payment received — we'll assign your trainer shortly.");
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

  const canContinueSlot = days.length > 0 && !!time.trim();
  const canContinueLocation = !!society.trim() && !!address.trim();

  const Row = ({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) => (
    <li className="flex items-start gap-2 text-[14px]" style={{ color: NAVY }}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: MUTED }} /> <span>{children}</span>
    </li>
  );

  if (!user) return null;

  // ── Post-payment state: waiting for / showing trainer assignment ──────────
  if (existing) {
    const assigned = existing.status === "trainer_assigned" && !!existing.trainer_id;
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-1 sm:px-6">
        <h1 className="font-display text-2xl sm:text-3xl" style={{ color: NAVY }}>Your training request</h1>

        <div
          className="mt-5 rounded-2xl border p-5"
          style={{ borderColor: assigned ? "#bfe6cd" : GOLD, background: assigned ? "#f2fbf5" : "#fffdf6" }}
        >
          <div className="flex items-start gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ background: assigned ? "#e6f7ed" : "rgba(240,167,32,0.15)", color: assigned ? "#1b7a43" : GOLD }}
            >
              {assigned ? <Check className="h-5 w-5" /> : <Hourglass className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="font-semibold" style={{ color: NAVY }}>
                {assigned ? "Your trainer has been assigned" : "Your training request has been received."}
              </p>
              <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
                {assigned
                  ? "You're all set — your trainer will reach out to confirm your first session."
                  : "Our team will assign your trainer shortly."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: BORDER, background: "#fff" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Booking details</p>
          <ul className="mt-3 space-y-2">
            <Row icon={CreditCard}>{plan?.name ?? "Personal Training plan"}</Row>
            <Row icon={CalendarDays}>{slotSummary(existing.preferred_days, existing.preferred_time)}</Row>
            <Row icon={Building2}>{existing.society_name || "—"}</Row>
            <Row icon={MapPin}>{existing.address || "—"}</Row>
            <Row icon={UserRound}>
              Trainer:{" "}
              <strong>
                {assigned ? (trainerQ.data?.name ?? "Assigned") : "Being assigned"}
              </strong>
              {assigned && trainerQ.data?.contact ? ` · ${trainerQ.data.contact}` : ""}
            </Row>
            <Row icon={Clock}>Status: <strong>{STATUS_LABEL[existing.status] ?? existing.status}</strong></Row>
          </ul>
          <p className="mt-4 text-[12px]" style={{ color: MUTED }}>
            Payment: {existing.payment_status === "paid" ? "Paid" : "Pending payment gateway"}
          </p>
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

      {plan && (
        <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: GOLD, background: "#fffdf6" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Selected plan</p>
              <p className="mt-0.5 truncate font-semibold" style={{ color: NAVY }}>{plan.name}</p>
              <p className="text-[12px]" style={{ color: MUTED }}>
                {plan.total_sessions} sessions · {plan.duration_months} {plan.duration_months === 1 ? "month" : "months"} · Personal training
              </p>
            </div>
            <p className="shrink-0 text-xl font-bold sm:text-2xl" style={{ color: NAVY }}>
              ₹{Number(plan.price).toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      )}

      {rejected && (
        <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "#f3c9c7", background: "#fdf3f2" }}>
          <p className="font-semibold" style={{ color: "#a3312b" }}>Your previous request wasn't accepted</p>
          <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
            {slotSummary(rejected.preferred_days, rejected.preferred_time)} couldn't be confirmed.
            Please pick another slot below, or contact your admin.
          </p>
        </div>
      )}

      {notReady && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Booking requests aren't enabled yet — run the <code>booking_requests</code> migration in Supabase.
        </div>
      )}

      {/* ── Step 2: preferred slot ──────────────────────────────────────── */}
      {step === 2 && (
        <div className="mt-6">
          <h2 className="font-display text-lg sm:text-xl" style={{ color: NAVY }}>Choose your preferred slot</h2>
          <p className="text-[12px]" style={{ color: MUTED }}>Your trainer will be matched to this timing.</p>

          {availability.length > 0 ? (
            <>
              <div className="mt-4 space-y-2">
                <Label>Training days</Label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {availability.map((s: any) => {
                    const on = slotSetId === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => { setSlotSetId(s.id); setDays(sortDays(s.days)); setTime(""); }}
                        className="flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all"
                        style={{ borderColor: on ? GOLD : BORDER, background: on ? "#fffdf6" : "#fff" }}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(240,167,32,0.12)", color: GOLD }}>
                          <CalendarDays className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold" style={{ color: NAVY }}>
                            {s.label || daySetLabel(s.days)}
                          </span>
                          <span className="block text-[12px]" style={{ color: MUTED }}>
                            {s.days.length} day{s.days.length === 1 ? "" : "s"} / week · {s.times.length} timing{s.times.length === 1 ? "" : "s"}
                          </span>
                        </span>
                        {on && <Check className="h-5 w-5 shrink-0" style={{ color: GOLD }} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {chosenSet && (
                <div className="mt-4 space-y-2">
                  <Label htmlFor="pt-time">Preferred time</Label>
                  <Select value={time} onValueChange={setTime}>
                    <SelectTrigger id="pt-time"><SelectValue placeholder="Select a time" /></SelectTrigger>
                    <SelectContent>
                      {chosenSet.times.map((t: string) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          ) : (
            /* No availability configured by this admin — fall back to a free
               request so the customer is never blocked from booking. */
            <>
              <div className="mt-4 space-y-2">
                <Label>Preferred days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const on = days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className="rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors"
                        style={on
                          ? { borderColor: GOLD, background: GOLD, color: "#fff" }
                          : { borderColor: BORDER, background: "#fff", color: MUTED }}
                      >
                        {d.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
                {days.length > 0 && <p className="text-[11px]" style={{ color: MUTED }}>{daySetLabel(days)}</p>}
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="pt-time-free">Preferred time</Label>
                <Input id="pt-time-free" value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 7:00 PM" />
              </div>
            </>
          )}

          <Button disabled={!canContinueSlot} onClick={() => setStep(3)} className="mt-5 w-full gap-2 sm:ml-auto sm:w-auto sm:px-6">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ── Step 3: location ────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="mt-6">
          <h2 className="font-display text-lg sm:text-xl" style={{ color: NAVY }}>Where should we train you?</h2>
          <p className="text-[12px]" style={{ color: MUTED }}>Your trainer comes to you.</p>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pt-society">Society name</Label>
              {societies.length > 0 ? (
                <>
                  <Select
                    value={societies.some((s) => s.name === society) ? society : (society === "" ? "" : "__other__")}
                    onValueChange={(v) => setSociety(v === "__other__" ? " " : v)}
                  >
                    <SelectTrigger id="pt-society"><SelectValue placeholder="Select your society" /></SelectTrigger>
                    <SelectContent>
                      {societies.map((s) => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))}
                      <SelectItem value="__other__">Other / not listed</SelectItem>
                    </SelectContent>
                  </Select>
                  {!societies.some((s) => s.name === society) && society !== "" && (
                    <Input
                      value={society.trim()}
                      onChange={(e) => setSociety(e.target.value)}
                      placeholder="Type your society or area"
                    />
                  )}
                </>
              ) : (
                <Input id="pt-society" value={society} onChange={(e) => setSociety(e.target.value)} placeholder="e.g. Astro Rosewood" />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-address">Full address</Label>
              <Input id="pt-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat / block, street, landmark, pincode" />
            </div>
          </div>

          <Button disabled={!canContinueLocation} onClick={() => setStep(4)} className="mt-5 w-full gap-2 sm:ml-auto sm:w-auto sm:px-6">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ── Step 4: payment ─────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="mt-6">
          <h2 className="font-display text-lg sm:text-xl" style={{ color: NAVY }}>Review &amp; pay</h2>

          <div className="mt-3 rounded-2xl border p-5" style={{ borderColor: BORDER, background: "#fff" }}>
            <ul className="space-y-2">
              <Row icon={CreditCard}>{plan?.name} · ₹{Number(plan?.price ?? 0).toLocaleString("en-IN")}</Row>
              <Row icon={CalendarDays}>{slotSummary(sortDays(days), time)}</Row>
              <Row icon={Building2}>{society}</Row>
              <Row icon={MapPin}>{address}</Row>
              <Row icon={UserRound}>Trainer: <strong>Assigned by our team after payment</strong></Row>
            </ul>
          </div>

          {gatewayQ.data?.enabled === false && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Online payment isn't live yet. Continuing creates your booking request and our team
              will confirm payment with you.
            </div>
          )}

          <Button onClick={payAndCreate} disabled={paying || notReady} className="mt-5 w-full gap-2 sm:ml-auto sm:w-auto sm:px-6">
            {paying
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              : <>{gatewayQ.data?.enabled === false ? "Confirm booking" : `Pay ₹${Number(plan?.price ?? 0).toLocaleString("en-IN")}`} <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </div>
      )}

      <div className="pt-6 text-center sm:text-left">
        <Link to="/plan" className="text-xs font-semibold" style={{ color: MUTED }}>Cancel and go back to plans</Link>
      </div>
    </div>
  );
}
