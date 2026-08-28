import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { daySetLabel, sortDays } from "@/lib/daySets";
import { batchName, batchTiming, type OnlineBatch } from "@/lib/onlineBatches";
import { STATUS_LABEL, trainerConflictAt, type BookingRequest, type BookingStatus } from "@/lib/bookingRequests";
import { syncPlanForOnlineBooking } from "@/lib/onlinePlanSync";

interface Props {
  request: BookingRequest | null;
  adminId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STATUSES: BookingStatus[] = [
  "pending_trainer_assignment", "trainer_assigned", "training_ongoing", "completed", "cancelled",
];

/**
 * Admin edit for an existing customer assignment. Only the fields that apply to
 * the booking's own mode/type are shown, options come from real admin-scoped
 * data, and dependent choices (society → trainer, batch → trainer/schedule) are
 * kept consistent so an invalid combination can't be saved.
 */
export function EditAssignmentDialog({ request, adminId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const isOnline = request?.training_mode === "online";
  // Money taken by Razorpay, verified server-side — not something an admin
  // toggles here.
  /** Money has been taken for this subscription. */
  const purchased = (request as any)?.payment_status === "success"
    || (request as any)?.payment_status === "paid"
    || String((request as any)?.id ?? "").startsWith("plan:");
  const gatewayPaid = (request as any)?.payment_status === "success"
    || (request as any)?.payment_status === "paid";
  const isPersonal = request?.training_type === "personal";
  // Online GROUP: the trainer, meeting room and schedule belong to the batch,
  // shared by every member, so they are not this person's to change.
  const batchBound = isOnline && !isPersonal;

  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState<BookingStatus>("pending_trainer_assignment");
  const [batchId, setBatchId] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [societyName, setSocietyName] = useState("");
  const [address, setAddress] = useState("");
  const [time, setTime] = useState("");
  const [payStatus, setPayStatus] = useState("pending_gateway");
  // Batch-level meeting config, editable here for convenience.
  const [platform, setPlatform] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // Load current values whenever a different request is opened.
  useEffect(() => {
    if (!request) return;
    setPlanId(request.plan_option_id ?? "");
    setStatus(request.status);
    setBatchId((request as any).batch_id ?? "");
    setTrainerId(request.trainer_id ?? "");
    setSocietyName(request.society_name ?? "");
    setAddress(request.address ?? "");
    setTime(request.preferred_time ?? "");
    // "success" is the payment service's word; this control speaks in
    // pending/paid/refunded, and an unmapped value left the box empty.
    const raw = request.payment_status ?? null;
    setPayStatus(raw === "success" ? "paid" : (raw ?? "pending_gateway"));
  }, [request?.id]);

  // Plans valid for this customer's mode + type only.
  const plansQ = useQuery({
    queryKey: ["edit-plans", request?.training_mode, request?.training_type],
    enabled: open && !!request,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("plan_options")
        .select("id, name, price, duration_months, total_sessions, class_mode, training_type, active")
        .eq("active", true).order("sort_order");
      return ((data ?? []) as any[]).filter(
        (p) =>
          (p.class_mode === "online" ? "online" : "offline") === request!.training_mode &&
          (p.training_type === "personal" ? "personal" : "group") === request!.training_type
      );
    },
  });
  const plans = plansQ.data ?? [];

  const societiesQ = useQuery({
    queryKey: ["edit-societies", adminId],
    enabled: open && !isOnline && !!adminId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("societies").select("id, name").eq("assigned_admin_id", adminId).order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const societies = societiesQ.data ?? [];
  const society = societies.find((s) => s.name === societyName) ?? null;

  const batchesQ = useQuery({
    queryKey: ["edit-batches", adminId, request?.training_type],
    enabled: open && isOnline && !!adminId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("online_batches").select("*")
        .eq("assigned_admin_id", adminId)
        .eq("training_type", request!.training_type)
        .eq("active", true).order("sort_order");
      return (data ?? []) as OnlineBatch[];
    },
  });
  const batches = batchesQ.data ?? [];
  // For online the schedule IS the batch's. `preferred_time` only exists on
  // rows that came through the older booking flow, so reading it alone left
  // "Timing: —" for every customer who bought through the gateway.
  const batch = batches.find((b) => b.id === batchId) ?? null;

  // Trainers: this admin's active ones, narrowed to the society for offline so
  // an admin can't pick someone who doesn't serve that society.
  const trainersQ = useQuery({
    queryKey: ["edit-trainers", adminId, society?.id, isOnline],
    enabled: open && !!adminId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainers").select("id, name, active, assigned_admin_id")
        .eq("assigned_admin_id", adminId);
      let list = ((data ?? []) as any[]).filter((t) => t.active !== false);
      if (!isOnline && society?.id) {
        const { data: links } = await (supabase as any)
          .from("trainer_societies").select("trainer_id").eq("society_id", society.id);
        const ids = new Set(((links ?? []) as any[]).map((l) => l.trainer_id));
        // Keep the currently assigned trainer visible even if unlinked.
        list = list.filter((t) => ids.has(t.id) || t.id === request?.trainer_id);
      }
      return list;
    },
  });
  const trainers = trainersQ.data ?? [];

  // Picking a batch carries its trainer and schedule — they're the batch's own.
  useEffect(() => {
    if (isOnline && batch) {
      setTrainerId(batch.trainer_id ?? "");
      setTime(batchTiming(batch));
      setPlatform((batch as any).meeting_platform ?? "");
      setMeetingUrl((batch as any).meeting_url ?? "");
    }
  }, [batchId]);

  // Also populate on first open, before the admin touches the batch field.
  useEffect(() => {
    if (isOnline && batch) {
      setPlatform((batch as any).meeting_platform ?? "");
      setMeetingUrl((batch as any).meeting_url ?? "");
    }
  }, [batch?.id]);

  const days = useMemo(
    () => (isOnline && batch ? sortDays(batch.days ?? []) : sortDays(request?.preferred_days ?? [])),
    [isOnline, batch, request?.preferred_days]
  );

  // For online the schedule IS the batch's. `preferred_time` only exists on
  // rows that came through the older booking flow, so reading it alone showed
  // "Timing: —" for every customer who bought through the gateway — even with
  // the batch and its time named in the dropdown directly above.
  // `batch` is null until the batch list loads — and stays null for an
  // offline row — so it must be guarded, not assumed.
  const shownTime = (isOnline ? ((batch ? batchTiming(batch) : "") || time) : time) || "";

  // Payments already recorded for this customer (same table the offline
  // billing tab uses — online customers are not a separate ledger).
  const billingQ = useQuery({
    queryKey: ["customer-billing", request?.user_id],
    enabled: open && !!request,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("billing_history").select("id, amount, payment_date, method, type")
        .eq("user_id", request!.user_id).order("payment_date", { ascending: false }).limit(20);
      return (data ?? []) as any[];
    },
  });
  const billing = billingQ.data ?? [];

  // This customer's own subscription — the part of the screen that really is
  // about them rather than about the batch.
  const subQ = useQuery({
    queryKey: ["assignment-subscription", request?.user_id],
    enabled: open && !!request,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("plans")
        .select("id, plan_option_id, amount, discount, total_sessions, start_date, end_date, status, payment_status, created_at, training_mode, training_type")
        .eq("user_id", request!.user_id)
        .order("created_at", { ascending: false });
      const rows = ((data ?? []) as any[])
        // Never bought = not their plan.
        .filter((p) => p.payment_status == null || p.payment_status === "success");
      return { current: rows[0] ?? null, history: rows };
    },
  });
  const sub = subQ.data?.current ?? null;
  const subHistory = subQ.data?.history ?? [];

  const save = async () => {
    if (!request) return;
    setBusy(true);
    try {
      // Guard the combination before writing.
      if (isOnline && batchId) {
        const b = batches.find((x) => x.id === batchId);
        if (!b) throw new Error("That batch is no longer available.");
        if (b.assigned_admin_id !== adminId) throw new Error("That batch belongs to a different admin.");
      }
      if (trainerId) {
        const t = trainers.find((x: any) => x.id === trainerId);
        if (!t) throw new Error("That trainer isn't available for this assignment.");
        // Only check for clashes when actually moving the customer to a
        // different trainer. Re-saving the same trainer would otherwise trip
        // over their own batch at this time and block unrelated edits.
        if (trainerId !== request.trainer_id) {
          const clash = await trainerConflictAt(supabase as any, trainerId, time || null, request.id);
          if (clash) throw new Error(`${t.name}: ${clash}`);
        }
      }
      if (status === "trainer_assigned" && !trainerId) {
        throw new Error("Pick a trainer before setting the status to Trainer assigned.");
      }

      /**
       * Rows on this screen come from two places: a real `booking_requests`
       * row (the older self-service flow) and one synthesised from a paid
       * subscription, whose id is "plan:<uuid>". Saving used to always write
       * to booking_requests by id — for a gateway customer that matched
       * nothing, so "Save changes" reported success and changed nothing.
       */
      const planId2 = String(request.id).startsWith("plan:")
        ? String(request.id).slice(5)
        : null;

      if (planId2) {
        // This row IS a subscription, so the status control sets the
        // subscription's own lifecycle rather than a booking's workflow step.
        const planStatus =
          status === "completed" ? "completed"
          : status === "cancelled" ? "stopped"
          : "active";
        const { error: pErr } = await (supabase as any)
          .from("plans")
          .update({
            batch_id: isOnline ? (batchId || null) : null,
            trainer_id: trainerId || null,
            // Not plan_option_id: see the Plan field — a purchase is not
            // re-pointed at a different product after the money is taken.
            training_days: days.length ? days : null,
            status: planStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", planId2);
        if (pErr) throw pErr;

        // The customer's own profile mirrors where and when they train.
        await (supabase as any).from("profiles").update({
          trainer_id: trainerId || null,
          time_slot: time || null,
        }).eq("id", request.user_id);
      }

      const patch: Record<string, unknown> = {
        ...(purchased ? {} : { plan_option_id: planId || null }),
        status,
        trainer_id: trainerId || null,
        preferred_time: shownTime || null,
        preferred_days: days.length ? days : null,
        updated_at: new Date().toISOString(),
      };
      patch.payment_status = payStatus;
      if (isOnline) patch.batch_id = batchId || null;
      else {
        patch.society_name = societyName || null;
        patch.address = address || null;
      }
      if (trainerId && !request.trainer_id) patch.assigned_at = new Date().toISOString();

      if (!planId2) {
        const { error } = await (supabase as any)
          .from("booking_requests").update(patch)
          .eq("id", request.id)
          .eq("assigned_admin_id", adminId);     // never another admin's record
        if (error) throw error;
      }

      // Offline only: profiles.trainer_id / time_slot / society drive the
      // society-based trainer roster. Online assignments stay on the booking,
      // so an online client never appears in a trainer's offline lists.
      if (!isOnline) {
        const profilePatch: Record<string, unknown> = {
          trainer_id: status === "cancelled" ? null : (trainerId || null),
          time_slot: time || null,
        };
        if (society) { profilePatch.society = society.name; profilePatch.society_id = society.id; }
        await (supabase as any).from("profiles").update(profilePatch).eq("id", request.user_id);
      }

      // A trainer only sees clients in societies they're linked to.
      if (!isOnline && society && trainerId) {
        const { data: link } = await (supabase as any)
          .from("trainer_societies").select("trainer_id")
          .eq("trainer_id", trainerId).eq("society_id", society.id).maybeSingle();
        if (!link) {
          await (supabase as any).from("trainer_societies")
            .insert({ trainer_id: trainerId, society_id: society.id });
        }
      }

      // Meeting config belongs to the batch (everyone in it joins the same
      // room), so it is written there rather than onto this one booking.
      if (isOnline && batchId && (platform || meetingUrl)) {
        const { error: mErr } = await (supabase as any)
          .from("online_batches")
          .update({
            meeting_platform: platform || null,
            meeting_url: meetingUrl.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", batchId)
          .eq("assigned_admin_id", adminId);
        if (mErr) {
          toast.error(
            /column .* does not exist/i.test(mErr.message)
              ? "Saved, but the meeting link needs the online_session_join migration."
              : "Saved, but the meeting link didn't update: " + mErr.message
          );
        }
      }

      // Plan / schedule / status changes must reach the customer's calendar,
      // which is derived from their `plans` row.
      if (isOnline) {
        const sync = await syncPlanForOnlineBooking(supabase as any, {
          user_id: request.user_id,
          plan_option_id: planId || null,
          preferred_days: days,
          status: status as any,
          training_mode: "online",
          training_type: request.training_type,
          id: request.id,
        });
        if (sync.error) toast.error("Saved, but the schedule didn't update: " + sync.error);
        qc.invalidateQueries({ queryKey: ["plan", request.user_id] });
        qc.invalidateQueries({ queryKey: ["all-plans-cal", request.user_id] });
      }

      toast.success("Assignment updated");
      qc.invalidateQueries({ queryKey: ["admin-booking-requests", adminId] });
      qc.invalidateQueries({ queryKey: ["admin-online-customers", adminId] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  if (!request) return null;
  const loading = plansQ.isLoading || trainersQ.isLoading || (isOnline ? batchesQ.isLoading : societiesQ.isLoading);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit assignment</DialogTitle>
          <DialogDescription>
            {isOnline ? "Online" : "Offline"} · {isPersonal ? "Personal" : "Group"} training
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              {/*
                What they bought is a fact of the purchase, not a setting.
                Changing it here would rewrite the plan behind a payment that
                has already been taken — a different price, a different session
                count and a different term against money that was collected for
                something else. It is shown, not offered.
                Still selectable on an unpaid booking, where nothing has been
                charged and the plan has yet to be decided.
              */}
              {purchased ? (
                <>
                  <div className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm">
                    {plans.find((p: any) => p.id === planId)?.name ?? "—"}
                    {sub ? ` · ₹${Math.max(0, Number(sub.amount ?? 0) - Number(sub.discount ?? 0)).toLocaleString("en-IN")}` : ""}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Already purchased — change it by selling them a new plan, not by editing this one.
                  </p>
                </>
              ) : (
                <>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger><SelectValue placeholder="Select a plan" /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · ₹{Number(p.price).toLocaleString("en-IN")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Only {isOnline ? "online" : "offline"} {isPersonal ? "personal" : "group"} plans are listed.</p>
                </>
              )}
            </div>

            {/* Offline-only location fields */}
            {!isOnline && (
              <>
                <div className="space-y-1.5">
                  <Label>Society</Label>
                  <Select value={societyName} onValueChange={(v) => { setSocietyName(v); setTrainerId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select a society" /></SelectTrigger>
                    <SelectContent>
                      {societies.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {isPersonal && (
                  <div className="space-y-1.5">
                    <Label>Address</Label>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat / block, street, landmark" />
                  </div>
                )}
              </>
            )}

            {/* Online-only batch/slot */}
            {/* Group joins a batch. Online PERSONAL does not: it is one-to-one,
                scheduled on the plan itself, so there is nothing to pick and an
                empty "Select a slot" was offering a choice that no longer
                exists. */}
            {batchBound && (
              <div className="space-y-1.5">
                <Label>Batch</Label>
                <Select value={batchId} onValueChange={setBatchId}>
                  <SelectTrigger><SelectValue placeholder="Select a batch" /></SelectTrigger>
                  <SelectContent>
                    {batches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {batchName(b)}{batchTiming(b) ? ` · ${batchTiming(b)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Picking a batch sets its trainer and timing for this customer.
                </p>
              </div>
            )}

            {/* Live session — stored on the batch/slot, so it applies to
                everyone in it. Never shown to customers. Editing it from one
                member's row invites the idea that it is theirs; it is set in
                Manage batches instead. */}
            {isOnline && batchId && !batchBound && (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Live session (admin only)
                </p>
                <div className="space-y-1.5">
                  <Label>Meeting platform</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google_meet">Google Meet</SelectItem>
                      <SelectItem value="zoom">Zoom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Meeting URL</Label>
                  <Input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://…" />
                  <p className="text-[11px] text-muted-foreground">
                    Applies to this whole {isPersonal ? "slot" : "batch"}. Customers only ever see a
                    "Join Session" button, 5 minutes before the session starts.
                  </p>
                </div>
              </div>
            )}

            {/*
              A group batch has ONE trainer, ONE meeting room and ONE schedule —
              they cannot differ for a single member, so offering them here
              implied a per-person override that does not exist. For an online
              group member they are shown as read-only facts about the batch
              they are in; changing them means changing the batch, in Manage
              batches. Moving this person to a DIFFERENT batch is still a
              per-person decision, which is why Batch stays editable above.
            */}
            {batchBound ? (
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Set by the batch
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Trainer:</span> {trainers.find((t: any) => t.id === trainerId)?.name ?? "Not assigned"}</p>
                  <p><span className="text-muted-foreground">Days:</span> {daySetLabel(days) || "—"}</p>
                  <p><span className="text-muted-foreground">Timing:</span> {shownTime || "—"}</p>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Same for everyone in this batch. Change it in Manage batches.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Trainer</Label>
                  <Select value={trainerId} onValueChange={setTrainerId}>
                    <SelectTrigger><SelectValue placeholder="Not assigned" /></SelectTrigger>
                    <SelectContent>
                      {trainers.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!isOnline && !societyName && (
                    <p className="text-[11px] text-muted-foreground">Pick a society to narrow trainers to that society.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Days</Label>
                    <Input value={daySetLabel(days) || "—"} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Timing</Label>
                    <Input
                      value={shownTime || time}
                      onChange={(e) => setTime(e.target.value)}
                      placeholder="e.g. 7:00 AM – 8:00 AM"
                    />
                  </div>
                </div>
              </>
            )}

            {/* What is genuinely this person's: what they bought, when it ends,
                and what they have paid. */}
            {sub && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Their subscription
                </p>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">
                    {plans.find((o: any) => o.id === sub.plan_option_id)?.name ?? `${sub.total_sessions ?? "—"} sessions`}
                    {sub.total_sessions ? ` · ${sub.total_sessions} sessions` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Runs</span>
                  <span className="font-medium">{sub.start_date} → {sub.end_date}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-medium">
                    ₹{Math.max(0, Number(sub.amount ?? 0) - Number(sub.discount ?? 0)).toLocaleString("en-IN")}
                  </span>
                </div>

                {/* Every plan they have bought and when it ran — a renewal
                    history, not just the current cycle. */}
                {subHistory.length > 1 && (
                  <div className="pt-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">Plans taken</p>
                    <ul className="mt-1 space-y-0.5">
                      {subHistory.map((h: any) => (
                        <li key={h.id} className="flex justify-between gap-3 text-[13px]">
                          <span className="text-muted-foreground">
                            {plans.find((o: any) => o.id === h.plan_option_id)?.name ?? `${h.total_sessions ?? "—"} sessions`}
                            {" · "}{h.start_date} → {h.end_date}
                          </span>
                          <span className="shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
                            ₹{Math.max(0, Number(h.amount ?? 0) - Number(h.discount ?? 0)).toLocaleString("en-IN")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {billing.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">Payments</p>
                    <ul className="mt-1 space-y-0.5">
                      {billing.map((b: any) => (
                        <li key={b.id} className="flex justify-between gap-3 text-[13px]">
                          <span className="text-muted-foreground">
                            {b.payment_date}{b.method ? ` · ${b.method}` : ""}
                            {b.type === "refund" ? " · refund" : ""}
                          </span>
                          <span className={`shrink-0 ${b.type === "refund" ? "text-red-600" : ""}`}
                            style={{ fontVariantNumeric: "tabular-nums" }}>
                            {b.type === "refund" ? "−" : ""}₹{Number(b.amount ?? 0).toLocaleString("en-IN")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {billing.length === 0 && (
                  <p className="pt-1 text-[12px] text-muted-foreground">
                    No payments recorded against this customer yet.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Status</Label>
              {/* Money is collected by the payment service and recorded in the
                  ledger automatically, so there is nothing to key in here. What
                  is left worth setting is where the subscription itself is up
                  to — running, finished, or stopped. */}
              <Select value={status} onValueChange={(v) => setStatus(v as BookingStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || loading}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
