import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Plus, Pencil, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { WEEKDAYS, sortDays, daySetLabel } from "@/lib/daySets";
import { batchName, batchTiming, type OnlineBatch } from "@/lib/onlineBatches";
import { findConflict, conflictLabel } from "@/lib/trainerAvailability";

interface Props {
  adminId: string;
  trainingType: "group" | "personal";
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** "19:00" → "7:00 PM" */
const to12h = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
};

/**
 * Admin → Online Customers → Manage batches / slots.
 * Group batches seat several customers; personal slots are the same shape with
 * capacity 1. Customers only ever see the active ones.
 */
export function OnlineBatchesDialog({ adminId, trainingType, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const isPersonal = trainingType === "personal";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OnlineBatch | null>(null);
  const [name, setName] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [startT, setStartT] = useState("");
  const [endT, setEndT] = useState("");
  const [capacity, setCapacity] = useState("");
  const [active, setActive] = useState(true);
  const [platform, setPlatform] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");

  const listQ = useQuery({
    queryKey: ["online-batches-admin", adminId, trainingType],
    enabled: open && !!adminId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("online_batches").select("*")
        .eq("assigned_admin_id", adminId)
        .eq("training_type", trainingType)
        .order("sort_order");
      if (error) return { __notReady: true } as const;
      return (data ?? []) as OnlineBatch[];
    },
  });
  const notReady = (listQ.data as any)?.__notReady === true;
  const list: OnlineBatch[] = Array.isArray(listQ.data) ? listQ.data : [];

  const trainersQ = useQuery({
    queryKey: ["admin-trainers", adminId],
    enabled: open && !!adminId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainers").select("id, name, active")
        .eq("assigned_admin_id", adminId);
      return ((data ?? []) as any[]).filter((t) => t.active !== false);
    },
  });
  const trainers = trainersQ.data ?? [];

  /**
   * What else the trainer is running at the time being set up.
   *
   * The dialog asked for a trainer before it knew the day or the time, so
   * there was nothing to check against and a trainer could be put on two
   * classes at once. Times and days are collected first now, and each name
   * carries what it clashes with.
   */
  // When editing, the times are left blank to mean "keep the current ones", so
  // fall back to the batch's own times — otherwise availability went silent on
  // exactly the screen where a clash is most likely: moving an existing batch
  // onto a trainer who already teaches then.
  const effStart = startT ? to12h(startT) : (editing?.start_time ?? null);
  const effEnd   = endT ? to12h(endT) : (editing?.end_time ?? null);
  const wantSlot = effStart && effEnd ? `${effStart} – ${effEnd}` : null;
  const commitmentsQ = useQuery({
    queryKey: ["batch-trainer-commitments", trainers.map((t: any) => t.id).join(",")],
    enabled: trainers.length > 0,
    queryFn: async () => {
      const ids = trainers.map((t: any) => t.id);
      const [{ data: batches }, { data: plans }, { data: slots }] = await Promise.all([
        (supabase as any).from("online_batches")
          .select("id, trainer_id, days, start_time, end_time").in("trainer_id", ids),
        (supabase as any).from("plans")
          .select("id, batch_id, trainer_id, time_slot, training_days, status, payment_status")
          .in("trainer_id", ids).eq("status", "active"),
        (supabase as any).from("trainer_slots").select("trainer_id, time_slot").in("trainer_id", ids),
      ]);
      // An online batch is a commitment in exactly the same sense as a plan:
      // a trainer running it cannot also run something else then.
      const asPlans = ((batches ?? []) as any[])
        .filter((b) => b.start_time && b.end_time)
        .map((b) => ({
          id: b.id, trainer_id: b.trainer_id,
          time_slot: `${b.start_time} – ${b.end_time}`,
          training_days: b.days ?? [],
        }));
      const live = ((plans ?? []) as any[])
        .filter((p) => p.payment_status == null || p.payment_status === "success");
      return { plans: [...asPlans, ...live], slots: (slots ?? []) as any[] };
    },
  });

  const conflictFor = (id: string) =>
    findConflict({
      trainerId: id, slot: wantSlot, days,
      // This batch cannot clash with itself — nor with the subscriptions of
      // its own members, which inherit its trainer and its time and would
      // otherwise make every batch look like a conflict with itself.
      plans: (commitmentsQ.data?.plans ?? []).filter(
        (p: any) => p.id !== editing?.id && (!editing || p.batch_id !== editing.id),
      ),
      slots: commitmentsQ.data?.slots ?? [],
    });
  const trainerName = (id: string | null) => trainers.find((t: any) => t.id === id)?.name ?? "Not set";

  const startNew = () => {
    setEditing(null); setName(""); setTrainerId(""); setDays([]);
    setStartT(""); setEndT(""); setCapacity(isPersonal ? "1" : ""); setActive(true); setFormOpen(true);
  };
  const startEdit = (b: OnlineBatch) => {
    setEditing(b); setName(b.name ?? ""); setTrainerId(b.trainer_id ?? "");
    setDays(sortDays(b.days ?? [])); setStartT(""); setEndT("");
    setCapacity(b.capacity != null ? String(b.capacity) : ""); setActive(b.active);
    setPlatform((b as any).meeting_platform ?? ""); setMeetingUrl((b as any).meeting_url ?? "");
    setFormOpen(true);
  };

  const toggleDay = (d: string) =>
    setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  const save = useMutation({
    mutationFn: async () => {
      const ordered = sortDays(days);
      if (!ordered.length) throw new Error("Pick at least one day");
      if (startT && endT && endT <= startT) throw new Error("End time must be after the start time");
      const cap = capacity.trim() ? Number(capacity) : null;
      if (cap != null && (!Number.isInteger(cap) || cap < 1)) throw new Error("Capacity must be a whole number above 0");

      const payload: Record<string, unknown> = {
        assigned_admin_id: adminId,
        training_type: trainingType,
        name: name.trim() || null,
        trainer_id: trainerId || null,
        days: ordered,
        capacity: isPersonal ? 1 : cap,
        active,
        // Admin-only: never sent to the customer UI. The join flow resolves
        // this server-side when the customer clicks Join Session.
        meeting_platform: platform || null,
        meeting_url: meetingUrl.trim() || null,
        updated_at: new Date().toISOString(),
      };
      // Only overwrite times when the admin actually picked new ones.
      if (startT) payload.start_time = to12h(startT);
      if (endT) payload.end_time = to12h(endT);

      if (editing) {
        const { error } = await (supabase as any)
          .from("online_batches").update(payload).eq("id", editing.id).eq("assigned_admin_id", adminId);
        if (error) throw error;

        /**
         * A batch's trainer IS its customers' trainer.
         *
         * Their subscriptions carry trainer_id independently — that is what
         * the trainer dashboard, the calendar and the session rows all read.
         * Changing it here updated the batch alone, so the new trainer saw
         * none of the customers they had just been given, and the old trainer
         * kept them. Move the subscriptions, then relay the schedule so every
         * session row carries the right trainer too.
         */
        const trainerChanged = (editing.trainer_id ?? null) !== (trainerId || null);
        const scheduleChanged =
          !!payload.start_time || !!payload.end_time ||
          sortDays(editing.days ?? []).join() !== ordered.join();

        if (trainerChanged || scheduleChanged) {
          const { data: affected } = await (supabase as any)
            .from("plans")
            .select("id, payment_status")
            .eq("batch_id", editing.id);
          const live = ((affected ?? []) as any[])
            .filter((p) => p.payment_status == null || p.payment_status === "success");

          if (trainerChanged && live.length) {
            await (supabase as any).from("plans")
              .update({ trainer_id: trainerId || null, updated_at: new Date().toISOString() })
              .in("id", live.map((p) => p.id));
            // The roster a trainer sees is built from profiles too.
            const { data: rows } = await (supabase as any)
              .from("plans").select("user_id").in("id", live.map((p) => p.id));
            const uids = [...new Set(((rows ?? []) as any[]).map((r) => r.user_id))];
            if (uids.length) {
              await (supabase as any).from("profiles")
                .update({ trainer_id: trainerId || null }).in("id", uids);
            }
          }

          // Idempotent: re-stamps trainer, days and time onto the sessions.
          for (const pl of live) {
            await (supabase as any).rpc("generate_sessions", { _plan_id: pl.id });
          }
        }
      } else {
        if (!startT || !endT) throw new Error("Set a start and end time");
        const { error } = await (supabase as any)
          .from("online_batches").insert({ ...payload, sort_order: list.length + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Updated" : (isPersonal ? "Slot added" : "Batch added"));
      qc.invalidateQueries({ queryKey: ["online-batches-admin", adminId, trainingType] });
      qc.invalidateQueries({ queryKey: ["online-batches"] });
      qc.invalidateQueries({ queryKey: ["admin-online-customers"] });
      qc.invalidateQueries({ queryKey: ["trainer-mode-data"] });
      setFormOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async (b: OnlineBatch) => {
      const { error } = await (supabase as any)
        .from("online_batches").update({ active: !b.active }).eq("id", b.id).eq("assigned_admin_id", adminId);
      if (error) throw error;
      return !b.active;
    },
    onSuccess: (on) => {
      toast.success(on ? "Visible to customers" : "Hidden from customers");
      qc.invalidateQueries({ queryKey: ["online-batches-admin", adminId, trainingType] });
      qc.invalidateQueries({ queryKey: ["online-batches"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("online_batches").delete().eq("id", id).eq("assigned_admin_id", adminId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["online-batches-admin", adminId, trainingType] });
      qc.invalidateQueries({ queryKey: ["online-batches"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const noun = isPersonal ? "slot" : "batch";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Online {isPersonal ? "1-to-1 slots" : "group batches"}
            </DialogTitle>
          </DialogHeader>

          {notReady ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Online batches aren't enabled yet — run the <code>online_batches</code> migration in Supabase.
            </div>
          ) : listQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Customers booking online {isPersonal ? "personal" : "group"} training choose from the active ones here.
              </p>

              {list.length === 0 && (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No {noun}s yet. Add the {noun}s you run online.
                </div>
              )}

              {list.map((b) => (
                <div key={b.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{batchName(b)}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {daySetLabel(b.days ?? [])}
                        {batchTiming(b) ? ` · ${batchTiming(b)}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Trainer: {trainerName(b.trainer_id)}
                        {b.capacity != null && ` · ${b.capacity} seat${b.capacity === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant={b.active ? "secondary" : "outline"} className="cursor-pointer"
                        onClick={() => toggleActive.mutate(b)}>
                        {b.active ? "Active" : "Hidden"}
                      </Badge>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(b)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => { if (confirm(`Delete "${batchName(b)}"?`)) remove.mutate(b.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              <Button onClick={startNew} variant="outline" className="w-full gap-2">
                <Plus className="h-4 w-4" /> Add {noun}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{isPersonal ? "Slot name" : "Batch name"}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                placeholder={days.length ? daySetLabel(days) : "e.g. Morning Batch"} />
            </div>

            <div className="space-y-2">
              <Label>Training days *</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = days.includes(d);
                  return (
                    <button key={d} type="button" onClick={() => toggleDay(d)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}>
                      {d.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[120px] flex-1 space-y-1">
                <Label className="text-[11px] text-muted-foreground">Start time {editing ? "" : "*"}</Label>
                <Input type="time" value={startT} onChange={(e) => setStartT(e.target.value)} />
              </div>
              <div className="min-w-[120px] flex-1 space-y-1">
                <Label className="text-[11px] text-muted-foreground">End time {editing ? "" : "*"}</Label>
                <Input type="time" value={endT} onChange={(e) => setEndT(e.target.value)} />
              </div>
            </div>
            {editing && <p className="text-[11px] text-muted-foreground">Leave times blank to keep {batchTiming(editing) || "the current timing"}.</p>}

            <div className="space-y-1.5">
              <Label>Trainer</Label>
              <Select value={trainerId} onValueChange={setTrainerId}>
                <SelectTrigger>
                  <SelectValue placeholder={wantSlot ? "Select a trainer" : "Set the days and time first"} />
                </SelectTrigger>
                <SelectContent>
                  {trainers.map((t: any) => {
                    const c = conflictFor(t.id);
                    // Busy is busy. A named day clash and a class rostered at
                    // this time both mean the trainer is already teaching then,
                    // so neither can be picked — the difference is only how
                    // precisely we can describe it.
                    // ...except whoever already runs this batch: they are not
                    // double-booked by the class they are already teaching, and
                    // blocking them would strand an admin who changed the
                    // trainer and wanted to change it back.
                    const isCurrent = !!editing && editing.trainer_id === t.id;
                    const clash = !isCurrent && (c.busyDays.length > 0 || c.slotRostered);
                    return (
                      // A trainer already teaching then cannot be picked — the
                      // clash is stated rather than left for the day itself.
                      <SelectItem key={t.id} value={t.id} disabled={clash}>
                        <span className="flex items-center gap-2">
                          <span>{t.name}</span>
                          {wantSlot && (
                            <span className="text-[11px]"
                              style={{ color: clash ? "#d23b34" : c.slotRostered ? "#b07d10" : "#1b7a43" }}>
                              · {conflictLabel(c, wantSlot)}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {!wantSlot && (
                <p className="text-[11px] text-muted-foreground">
                  Pick the days and times above and each trainer will show whether they're free then.
                </p>
              )}
            </div>


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
                <Input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://…" />
                <p className="text-[11px] text-muted-foreground">
                  Customers never see this — they only get a "Join Session" button, 5 minutes before the session starts.
                </p>
              </div>
            </div>

            {!isPersonal && (
              <div className="space-y-1.5">
                <Label>Capacity</Label>
                <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 12 (blank = unlimited)" />
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Show to customers</p>
                <p className="text-xs text-muted-foreground">
                  {active ? `Selectable when booking online ${isPersonal ? "personal" : "group"} training` : "Hidden from booking"}
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || days.length === 0}>
              {save.isPending ? "Saving…" : editing ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
