import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CalendarDays, Plus, Pencil, Trash2, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { WEEKDAYS, sortDays, daySetLabel } from "@/lib/daySets";

interface Props {
  adminId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface SlotSet {
  id: string;
  assigned_admin_id: string;
  label: string | null;
  days: string[];
  active: boolean;
  sort_order: number;
}

/**
 * Admin → Bookings → Manage availability.
 * Define the day combinations offered for personal training (2 days, 3 days —
 * whatever the admin runs) and the times available for each. Customers pick a
 * combination and then a time from these, instead of typing a free-text slot.
 */
export function PtSlotSetsDialog({ adminId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SlotSet | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [active, setActive] = useState(true);
  const [times, setTimes] = useState<string[]>([]);
  const [startT, setStartT] = useState("");
  const [endT, setEndT] = useState("");

  const setsQ = useQuery({
    queryKey: ["pt-slot-sets", adminId],
    enabled: open && !!adminId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pt_slot_sets")
        .select("id, assigned_admin_id, label, days, active, sort_order")
        .eq("assigned_admin_id", adminId)
        .eq("training_type", "personal")
        .order("sort_order");
      if (error) return { __notReady: true } as const;
      return (data ?? []) as SlotSet[];
    },
  });
  const notReady = (setsQ.data as any)?.__notReady === true;
  const sets: SlotSet[] = Array.isArray(setsQ.data) ? setsQ.data : [];

  const timesQ = useQuery({
    queryKey: ["pt-slot-set-times", sets.map((s) => s.id).join(",")],
    enabled: open && sets.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pt_slot_set_times")
        .select("slot_set_id, time_slot, active, sort_order")
        .in("slot_set_id", sets.map((s) => s.id))
        .order("sort_order");
      const bySet: Record<string, string[]> = {};
      for (const r of (data ?? []) as any[]) {
        if (r.active === false) continue;
        (bySet[r.slot_set_id] ??= []).push(r.time_slot);
      }
      return bySet;
    },
  });
  const timesBySet = timesQ.data ?? {};

  const startNew = () => {
    setEditing(null); setDays([]); setLabel(""); setActive(true); setTimes([]); setStartT(""); setEndT(""); setFormOpen(true);
  };
  const startEdit = (s: SlotSet) => {
    setEditing(s);
    setDays(sortDays(s.days));
    setLabel(s.label ?? "");
    setActive(s.active);
    setTimes(timesBySet[s.id] ?? []);
    setStartT(""); setEndT("");
    setFormOpen(true);
  };

  const toggleDay = (d: string) =>
    setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  /** "19:00" → "7:00 PM" */
  const to12h = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(m).padStart(2, "0")} ${period}`;
  };

  const addTime = () => {
    if (!startT || !endT) return;
    if (endT <= startT) { toast.error("End time must be after the start time"); return; }
    const slot = `${to12h(startT)} – ${to12h(endT)}`;
    if (times.includes(slot)) { toast.info("That time is already added"); return; }
    setTimes([...times, slot]);
    setStartT(""); setEndT("");
  };

  const save = useMutation({
    mutationFn: async () => {
      const ordered = sortDays(days);
      if (ordered.length === 0) throw new Error("Pick at least one day");
      if (times.length === 0) throw new Error("Add at least one time slot");

      const payload = {
        assigned_admin_id: adminId,
        training_type: "personal",
        days: ordered,
        label: label.trim() || daySetLabel(ordered),
        active,
      };

      let id = editing?.id;
      if (editing) {
        const { error } = await (supabase as any)
          .from("pt_slot_sets").update(payload).eq("id", editing.id).eq("assigned_admin_id", adminId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("pt_slot_sets").insert({ ...payload, sort_order: sets.length + 1 })
          .select("id").single();
        if (error) throw error;
        id = data?.id;
      }

      if (id) {
        await (supabase as any).from("pt_slot_set_times").delete().eq("slot_set_id", id);
        const rows = times.map((t, i) => ({ slot_set_id: id, time_slot: t, sort_order: i + 1 }));
        const { error } = await (supabase as any).from("pt_slot_set_times").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Availability updated" : "Availability added");
      qc.invalidateQueries({ queryKey: ["pt-slot-sets", adminId] });
      qc.invalidateQueries({ queryKey: ["pt-slot-set-times"] });
      setFormOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async (s: SlotSet) => {
      const { error } = await (supabase as any)
        .from("pt_slot_sets").update({ active: !s.active }).eq("id", s.id).eq("assigned_admin_id", adminId);
      if (error) throw error;
      return !s.active;
    },
    onSuccess: (on) => {
      toast.success(on ? "Shown to customers" : "Hidden from customers");
      qc.invalidateQueries({ queryKey: ["pt-slot-sets", adminId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("pt_slot_sets").delete().eq("id", id).eq("assigned_admin_id", adminId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["pt-slot-sets", adminId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" /> Personal training availability
            </DialogTitle>
          </DialogHeader>

          {notReady ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Availability isn't enabled yet — run the <code>pt_slot_sets</code> migration in Supabase.
            </div>
          ) : setsQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Customers choose one of these day combinations, then a time from its list.
              </p>

              {sets.length === 0 && (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No availability yet. Add the day combinations you offer.
                </div>
              )}

              {sets.map((s) => {
                const t = timesBySet[s.id] ?? [];
                return (
                  <div key={s.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{s.label || daySetLabel(s.days)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {sortDays(s.days).length} day{sortDays(s.days).length === 1 ? "" : "s"} / week
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {t.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No times added</span>
                          ) : t.map((x) => (
                            <span key={x} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                              <Clock className="h-3 w-3" /> {x}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge
                          variant={s.active ? "secondary" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleActive.mutate(s)}
                        >
                          {s.active ? "Active" : "Hidden"}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => { if (confirm(`Delete "${s.label || daySetLabel(s.days)}"?`)) remove.mutate(s.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <Button onClick={startNew} variant="outline" className="w-full gap-2">
                <Plus className="h-4 w-4" /> Add day combination
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit availability" : "Add availability"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Days *</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
              {days.length > 0 && (
                <p className="text-[11px] text-muted-foreground">{daySetLabel(days)} · {days.length} day(s)</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Available times *</Label>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[120px] flex-1 space-y-1">
                  <span className="text-[11px] text-muted-foreground">From</span>
                  <Input type="time" value={startT} onChange={(e) => setStartT(e.target.value)} />
                </div>
                <div className="min-w-[120px] flex-1 space-y-1">
                  <span className="text-[11px] text-muted-foreground">To</span>
                  <Input type="time" value={endT} onChange={(e) => setEndT(e.target.value)} />
                </div>
                <Button type="button" variant="outline" onClick={addTime} disabled={!startT || !endT}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {times.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">No times added yet</span>
                ) : times.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">
                    {t}
                    <button type="button" onClick={() => setTimes(times.filter((x) => x !== t))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={days.length ? daySetLabel(days) : "Mon · Wed · Fri"}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Show to customers</p>
                <p className="text-xs text-muted-foreground">
                  {active ? "Selectable when booking personal training" : "Hidden from booking"}
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || days.length === 0 || times.length === 0}>
              {save.isPending ? "Saving…" : editing ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
