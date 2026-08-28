import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { daySetLabel } from "@/lib/daySets";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Inbox, CalendarDays, Building2, MapPin, UserRound, CreditCard, Check, Loader2, XCircle, Pencil,
} from "lucide-react";
import {
  slotSummary, validateAssignment, trainerConflictAt, STATUS_LABEL,
  type BookingRequest,
} from "@/lib/bookingRequests";
import { PtSlotSetsDialog } from "@/components/admin/PtSlotSetsDialog";
import { EditAssignmentDialog } from "@/components/admin/EditAssignmentDialog";
import { CalendarDays as CalendarIcon } from "lucide-react";
import { AwaitingTrainer } from "@/components/admin/AwaitingTrainer";

/**
 * Admin → Booking Requests. Paid Offline Personal Training requests waiting for
 * a trainer. The dropdown only ever contains this admin's own trainers, and an
 * assignment is re-validated (ownership + slot conflict) before it is written.
 */
export default function BookingRequests() {
  const { user } = useAuth();
  const adminId = user?.id ?? null;
  const qc = useQueryClient();
  const [assignFor, setAssignFor] = useState<BookingRequest | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [availOpen, setAvailOpen] = useState(false);
  const [rejectFor, setRejectFor] = useState<BookingRequest | null>(null);
  const [editFor, setEditFor] = useState<BookingRequest | null>(null);

  /**
   * The offline personal bookings this page is named for.
   *
   * They live in `plans` — a personal purchase creates a subscription, not a
   * `booking_requests` row (that table is the ONLINE flow's). So the list
   * below was reading a table these bookings never touch, and the page
   * reported "no booking requests" no matter how many had come in.
   */
  const personalQ = useQuery({
    queryKey: ["admin-personal-bookings", adminId],
    enabled: !!adminId,
    queryFn: async () => {
      const { data: plans } = await (supabase as any)
        .from("plans")
        .select("id, user_id, training_mode, society_id, trainer_id, training_days, time_slot, start_date, end_date, amount, discount, total_sessions, duration_months, status, payment_status, created_at")
        // Offline only. Online personal customers live under Online Customers,
        // beside the group batches, so a customer is only ever in one place.
        .eq("training_type", "personal")
        .eq("training_mode", "offline")
        .order("created_at", { ascending: false });

      // Never bought = never booked. A pending row is an abandoned checkout.
      const paid = (plans ?? []).filter(
        (p: any) => p.payment_status == null || p.payment_status === "success",
      );
      if (!paid.length) return [];

      const uids = [...new Set(paid.map((p: any) => p.user_id))];
      const socIds = [...new Set(paid.map((p: any) => p.society_id).filter(Boolean))];
      const trIds = [...new Set(paid.map((p: any) => p.trainer_id).filter(Boolean))];
      const [{ data: profs }, { data: socs }, { data: trs }] = await Promise.all([
        (supabase as any).from("profiles").select("id, name, phone, assigned_admin_id").in("id", uids),
        socIds.length ? (supabase as any).from("societies").select("id, name").in("id", socIds)
                      : Promise.resolve({ data: [] }),
        trIds.length ? (supabase as any).from("trainers").select("id, name").in("id", trIds)
                     : Promise.resolve({ data: [] }),
      ]);
      const profById = Object.fromEntries(((profs ?? []) as any[]).map((x) => [x.id, x]));
      const socById = Object.fromEntries(((socs ?? []) as any[]).map((x) => [x.id, x]));
      const trById = Object.fromEntries(((trs ?? []) as any[]).map((x) => [x.id, x]));

      return paid
        .map((p: any) => ({
          ...p,
          profile: profById[p.user_id] ?? null,
          society: p.society_id ? socById[p.society_id] ?? null : null,
          trainer: p.trainer_id ? trById[p.trainer_id] ?? null : null,
        }))
        // Each admin sees only their own customers.
        .filter((r: any) => (adminId ? r.profile?.assigned_admin_id === adminId : true));
    },
  });
  const personal = personalQ.data ?? [];
  const assignedPersonal = personal.filter((r: any) => r.trainer_id);

  const q = useQuery({
    queryKey: ["admin-booking-requests", adminId],
    enabled: !!adminId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("booking_requests")
        .select("*")
        .eq("assigned_admin_id", adminId)          // scoped to this admin
        .eq("training_mode", "offline")            // online lives in Online Customers
        .order("created_at", { ascending: false });
      if (error) return { __notReady: true } as const;

      const reqs = (data ?? []) as BookingRequest[];
      const ids = [...new Set(reqs.map((r) => r.user_id))];
      const tids = [...new Set(reqs.map((r) => r.trainer_id).filter(Boolean))] as string[];

      const [{ data: profs }, { data: plans }, { data: trainers }] = await Promise.all([
        ids.length
          ? (supabase as any).from("profiles").select("id, name, phone").in("id", ids)
          : Promise.resolve({ data: [] }),
        (supabase as any).from("plan_options").select("id, name, duration_months, total_sessions, price"),
        tids.length
          ? (supabase as any).from("trainers").select("id, name").in("id", tids)
          : Promise.resolve({ data: [] }),
      ]);

      return {
        reqs,
        people: Object.fromEntries(((profs ?? []) as any[]).map((p) => [p.id, p])),
        plans: Object.fromEntries(((plans ?? []) as any[]).map((p) => [p.id, p])),
        trainers: Object.fromEntries(((trainers ?? []) as any[]).map((t) => [t.id, t])),
      };
    },
  });

  const notReady = (q.data as any)?.__notReady === true;
  const reqs: BookingRequest[] = (q.data as any)?.reqs ?? [];
  const people: Record<string, any> = (q.data as any)?.people ?? {};
  const plans: Record<string, any> = (q.data as any)?.plans ?? {};
  const trainerNames: Record<string, any> = (q.data as any)?.trainers ?? {};

  // Candidate trainers: this admin's active trainers, each annotated with a
  // conflict reason for the request's slot (busy ones stay visible but locked).
  const candidatesQ = useQuery({
    queryKey: ["assign-candidates", adminId, assignFor?.id],
    enabled: !!assignFor && !!adminId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainers")
        .select("id, name, specialization, active, assigned_admin_id")
        .eq("assigned_admin_id", adminId);
      const list = ((data ?? []) as any[]).filter((t) => t.active !== false);
      return Promise.all(
        list.map(async (t) => ({
          ...t,
          conflict: await trainerConflictAt(supabase as any, t.id, assignFor!.preferred_time, assignFor!.id),
        }))
      );
    },
  });
  const candidates = candidatesQ.data ?? [];

  // Many customers already train with someone (e.g. a group batch). Assigning
  // this request re-points their profile, so surface that rather than silently
  // moving them off their current trainer/slot.
  const currentQ = useQuery({
    queryKey: ["assign-current-linkage", assignFor?.user_id],
    enabled: !!assignFor,
    queryFn: async () => {
      const { data: prof } = await (supabase as any)
        .from("profiles").select("trainer_id, time_slot").eq("id", assignFor!.user_id).maybeSingle();
      if (!prof?.trainer_id) return null;
      const { data: t } = await (supabase as any)
        .from("trainers").select("name").eq("id", prof.trainer_id).maybeSingle();
      return { trainerId: prof.trainer_id, name: t?.name ?? "another trainer", slot: prof.time_slot as string | null };
    },
  });
  const current = currentQ.data;

  const assign = async () => {
    if (!assignFor || !picked) return;
    setBusy(true);
    try {
      // Re-validate server-side rules regardless of what the UI offered.
      const err = await validateAssignment(supabase as any, assignFor, picked);
      if (err) { toast.error(err); return; }

      const { error } = await (supabase as any)
        .from("booking_requests")
        .update({
          trainer_id: picked,
          assigned_by: adminId,
          assigned_at: new Date().toISOString(),
          status: "trainer_assigned",
          updated_at: new Date().toISOString(),
        })
        .eq("id", assignFor.id)
        .eq("assigned_admin_id", adminId)    // can't touch another admin's request
        .in("status", ["pending_trainer_assignment", "trainer_assigned"]);  // not a closed one
      if (error) throw error;

      // Link the customer to the trainer on their profile too — that's what the
      // trainer dashboard reads (profiles.trainer_id), so without this the
      // assigned trainer would never see this client. Society is only filled in
      // when the customer doesn't already have one set.
      const profilePatch: Record<string, unknown> = {
        trainer_id: picked,
        time_slot: assignFor.preferred_time ?? null,
      };
      if (assignFor.society_name) {
        const { data: prof } = await (supabase as any)
          .from("profiles").select("society, society_id").eq("id", assignFor.user_id).maybeSingle();
        if (!prof?.society) profilePatch.society = assignFor.society_name;

        // The trainer dashboard groups its roster by society_id, so resolve the
        // typed society name to a real society of this admin — otherwise the
        // client is linked but never renders for the trainer.
        if (!prof?.society_id) {
          const { data: socs } = await (supabase as any)
            .from("societies").select("id, name").eq("assigned_admin_id", adminId);
          const wanted = assignFor.society_name.trim().toLowerCase();
          const match = ((socs ?? []) as any[]).find(
            (x) => (x.name ?? "").trim().toLowerCase() === wanted
          );
          if (match) profilePatch.society_id = match.id;
        }

        // The trainer dashboard lists clients under the societies the trainer is
        // linked to (trainer_societies). Assigning them to a client in a society
        // they aren't linked to would leave that client invisible, so make the
        // link here if it's missing.
        const societyId = (profilePatch.society_id as string) ?? prof?.society_id ?? null;
        if (societyId) {
          const { data: link } = await (supabase as any)
            .from("trainer_societies").select("trainer_id")
            .eq("trainer_id", picked).eq("society_id", societyId).maybeSingle();
          if (!link) {
            await (supabase as any)
              .from("trainer_societies").insert({ trainer_id: picked, society_id: societyId });
          }
        }
      }
      const { error: linkErr } = await (supabase as any)
        .from("profiles").update(profilePatch).eq("id", assignFor.user_id);
      if (linkErr) {
        // The assignment itself succeeded; surface the linkage failure rather
        // than silently leaving the trainer without the client.
        toast.error("Assigned, but couldn't link the customer to the trainer: " + linkErr.message);
      }

      toast.success("Trainer assigned");
      qc.invalidateQueries({ queryKey: ["admin-booking-requests", adminId] });
      setAssignFor(null); setPicked("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  };

  /** Reject a request: it becomes `cancelled`, which also frees the customer's
   *  one-open-request slot so they can book again. Scoped to this admin. */
  const reject = async () => {
    if (!rejectFor) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any)
        .from("booking_requests")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", rejectFor.id)
        .eq("assigned_admin_id", adminId);   // can't reject another admin's request
      if (error) throw error;

      // If this request had already been assigned, undo the profile linkage so
      // the trainer stops seeing a client whose booking was cancelled.
      if (rejectFor.trainer_id) {
        await (supabase as any)
          .from("profiles")
          .update({ trainer_id: null })
          .eq("id", rejectFor.user_id)
          .eq("trainer_id", rejectFor.trainer_id);
      }

      toast.success("Request rejected");
      qc.invalidateQueries({ queryKey: ["admin-booking-requests", adminId] });
      setRejectFor(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reject");
    } finally {
      setBusy(false);
    }
  };

  const Line = ({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) => (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{children}</span>
    </p>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground">Personal Bookings</h1>
          <p className="mt-1 text-muted-foreground">
            Offline personal training bookings. Online customers — group and personal — are
            managed under Online Customers.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setAvailOpen(true)}>
          <CalendarIcon className="h-4 w-4" /> Manage availability
        </Button>
      </header>

      <AwaitingTrainer adminId={adminId} mode="offline" />

      {assignedPersonal.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl text-foreground">Assigned</h2>
            <Badge variant="secondary">{assignedPersonal.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Personal bookings already with a trainer.
          </p>
          <div className="mt-4 space-y-3">
            {assignedPersonal.map((r: any) => (
              <div key={r.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {r.profile?.name ?? "Customer"}
                      {/* The two kinds arrive in the same queue, so each row
                          says which it is rather than relying on the reader
                          noticing that one has a society and one does not. */}
                      <Badge variant={r.training_mode === "online" ? "default" : "secondary"}>
                        {r.training_mode === "online" ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    {r.profile?.phone && (
                      <p className="text-sm text-muted-foreground">{r.profile.phone}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {daySetLabel(r.training_days ?? [])}
                      {r.time_slot ? ` · ${r.time_slot}` : ""}
                      {r.society ? ` · ${r.society.name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.total_sessions ?? "—"} sessions
                      {r.duration_months ? ` · ${r.duration_months} month${r.duration_months === 1 ? "" : "s"}` : ""}
                      {" · paid ₹"}
                      {Math.max(0, Number(r.amount ?? 0) - Number(r.discount ?? 0)).toLocaleString("en-IN")}
                      {" · "}{r.start_date} → {r.end_date}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {r.trainer?.name ?? "Trainer assigned"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {adminId && (
        <PtSlotSetsDialog adminId={adminId} open={availOpen} onOpenChange={setAvailOpen} />
      )}

      {notReady ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          Booking requests aren't enabled yet — run the <code>booking_requests</code> migration in Supabase.
        </div>
      ) : q.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Loading…</div>
      ) : reqs.length === 0 && personal.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-fv-orange/10">
            <Inbox className="h-6 w-6 text-fv-orange" />
          </div>
          <p className="mt-4 font-display text-xl text-foreground">No personal bookings</p>
          <p className="mt-1 text-sm text-muted-foreground">New personal training bookings will appear here.</p>
        </div>
      ) : reqs.length === 0 ? null : (
        <div className="space-y-3">
          {reqs.map((r) => {
            const person = people[r.user_id];
            const plan = r.plan_option_id ? plans[r.plan_option_id] : null;
            const pending = r.status === "pending_trainer_assignment";
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{person?.name || "Customer"}</p>
                      <Badge variant={pending ? "outline" : "secondary"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                      <Badge variant="secondary" className="font-normal">
                        {r.training_mode === "online" ? "Online" : "Offline"} · {r.training_type === "group" ? "Group" : "Personal"}
                      </Badge>
                    </div>
                    {person?.phone && <p className="text-xs text-muted-foreground">{person.phone}</p>}

                    <div className="pt-1">
                      <Line icon={CreditCard}>
                        {plan ? `${plan.name} · ${plan.total_sessions} sessions · ₹${Number(plan.price).toLocaleString("en-IN")}` : "Plan —"}
                      </Line>
                      <Line icon={CalendarDays}>{slotSummary(r.preferred_days, r.preferred_time)}</Line>
                      <Line icon={Building2}>{r.society_name || "—"}</Line>
                      <Line icon={MapPin}>{r.address || "—"}</Line>
                      <Line icon={UserRound}>
                        Trainer: {r.trainer_id ? (trainerNames[r.trainer_id]?.name ?? "Assigned") : "Not assigned"}
                      </Line>
                      <Line icon={CreditCard}>
                        Payment: {r.payment_status === "paid" ? "Paid" : "Pending gateway"}
                      </Line>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="ghost" title="Edit assignment" onClick={() => setEditFor(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {r.status !== "cancelled" && r.status !== "completed" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setRejectFor(r)}
                        >
                          <XCircle className="h-4 w-4" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1.5 bg-fv-orange text-white hover:bg-fv-orange/90"
                          onClick={() => { setAssignFor(r); setPicked(r.trainer_id ?? ""); }}
                        >
                          <UserRound className="h-4 w-4" /> {r.trainer_id ? "Reassign trainer" : "Assign trainer"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EditAssignmentDialog
        request={editFor}
        adminId={adminId}
        open={!!editFor}
        onOpenChange={(v) => !v && setEditFor(null)}
      />

      {/* Reject confirmation */}
      <Dialog open={!!rejectFor} onOpenChange={(v) => !v && setRejectFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject this request?</DialogTitle>
            <DialogDescription>
              {rejectFor && (
                <>The customer will see that their request wasn't accepted, and can book again.
                Their slot ({slotSummary(rejectFor.preferred_days, rejectFor.preferred_time)}) will be released.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={busy}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rejecting…</> : "Reject request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={!!assignFor} onOpenChange={(v) => { if (!v) { setAssignFor(null); setPicked(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign trainer</DialogTitle>
            <DialogDescription>
              {assignFor && (
                <>Customer wants {slotSummary(assignFor.preferred_days, assignFor.preferred_time)}. Only your trainers are shown.</>
              )}
            </DialogDescription>
          </DialogHeader>

          {current && current.trainerId !== picked && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              This customer currently trains with <strong>{current.name}</strong>
              {current.slot ? <> at <strong>{current.slot}</strong></> : null}. Assigning here will move
              them to the trainer and slot you pick.
            </div>
          )}

          {candidatesQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Checking availability…</p>
          ) : candidates.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              You have no active trainers to assign. Add one under Trainers first.
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map((t: any) => {
                const blocked = !!t.conflict;
                const on = picked === t.id;
                return (
                  <button
                    key={t.id}
                    disabled={blocked}
                    onClick={() => setPicked(t.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      blocked ? "cursor-not-allowed opacity-60" : on ? "border-fv-orange bg-fv-orange/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">
                      {(t.name ?? "T").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{t.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {blocked ? t.conflict : (t.specialization || "Available for this slot")}
                      </span>
                    </span>
                    {on && !blocked && <Check className="h-4 w-4 shrink-0 text-fv-orange" />}
                  </button>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignFor(null); setPicked(""); }}>Cancel</Button>
            <Button onClick={assign} disabled={!picked || busy}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Assigning…</> : "Assign & confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
