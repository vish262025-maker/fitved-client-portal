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
import { CalendarDays, Plus, Pencil, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { WEEKDAYS, DAYS_PER_SET, sortDays, daySetLabel, validateDaySet, deriveDaySetsFromPlans, type DaySet } from "@/lib/daySets";

interface Props {
  societyId: string;
  societyName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type DayTime = { day: string; time_slot: string; trainer_id: string | null };

/**
 * Admin → Societies → Schedule. Manages the fixed 3-day training patterns a
 * society runs, plus the timing (and optional trainer) for each day.
 */
export function SocietyDaySetsDialog({ societyId, societyName, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<DaySet | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [days, setDays] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [active, setActive] = useState(true);
  const [times, setTimes] = useState<Record<string, string>>({});

  const setsQ = useQuery({
    queryKey: ["society-day-sets", societyId],
    enabled: open && !!societyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("society_day_sets")
        .select("id, society_id, label, days, active, sort_order")
        .eq("society_id", societyId)
        .order("sort_order");
      // Table not created yet — still show what this society actually trains on,
      // derived from existing plans, so the schedule is visible (read-only)
      // until the migration is run.
      if (error) {
        const derived = await deriveDaySetsFromPlans(supabase as any, societyId);
        return { __derived: true, sets: derived } as const;
      }
      const saved = (data ?? []) as DaySet[];
      if (saved.length) return saved;
      return { __derived: true, sets: await deriveDaySetsFromPlans(supabase as any, societyId) } as const;
    },
  });
  const derivedMode = (setsQ.data as any)?.__derived === true;
  const sets: DaySet[] = Array.isArray(setsQ.data)
    ? setsQ.data
    : ((setsQ.data as any)?.sets ?? []);

  const timesQ = useQuery({
    queryKey: ["society-day-set-times", societyId, sets.map((s) => s.id).join(",")],
    enabled: open && sets.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("society_day_set_times")
        .select("day_set_id, day, time_slot, trainer_id")
        .in("day_set_id", sets.map((s) => s.id));
      const bySet: Record<string, DayTime[]> = {};
      for (const r of (data ?? []) as any[]) {
        (bySet[r.day_set_id] ??= []).push({ day: r.day, time_slot: r.time_slot, trainer_id: r.trainer_id });
      }
      return bySet;
    },
  });
  const timesBySet = timesQ.data ?? {};

  const startNew = () => {
    setEditing(null); setDays([]); setLabel(""); setActive(true); setTimes({}); setFormOpen(true);
  };
  const startEdit = (s: DaySet) => {
    setEditing(s);
    setDays(sortDays(s.days));
    setLabel(s.label ?? "");
    setActive(s.active);
    const existing = timesBySet[s.id] ?? [];
    setTimes(Object.fromEntries(existing.map((t) => [t.day, t.time_slot ?? ""])));
    setFormOpen(true);
  };

  const toggleDay = (d: string) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const save = useMutation({
    mutationFn: async () => {
      const ordered = sortDays(days);
      const err = validateDaySet(ordered);
      if (err) throw new Error(err);

      const payload = {
        society_id: societyId,
        days: ordered,
        label: label.trim() || daySetLabel(ordered),
        active,
      };

      let id = editing?.id;
      if (editing) {
        const { error } = await (supabase as any)
          .from("society_day_sets").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("society_day_sets").insert({ ...payload, sort_order: sets.length + 1 })
          .select("id").single();
        if (error) throw error;
        id = data?.id;
      }

      // Per-day timings: rewrite this set's rows so removed days don't linger.
      if (id) {
        await (supabase as any).from("society_day_set_times").delete().eq("day_set_id", id);
        const rows = ordered
          .map((d) => ({ day_set_id: id, day: d, time_slot: (times[d] ?? "").trim() || null }))
          .filter((r) => r.time_slot);
        if (rows.length) {
          const { error } = await (supabase as any).from("society_day_set_times").insert(rows);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Day set updated" : "Day set created");
      qc.invalidateQueries({ queryKey: ["society-day-sets", societyId] });
      qc.invalidateQueries({ queryKey: ["society-day-set-times"] });
      setFormOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async (s: DaySet) => {
      const { error } = await (supabase as any)
        .from("society_day_sets").update({ active: !s.active }).eq("id", s.id);
      if (error) throw error;
      return !s.active;
    },
    onSuccess: (nowActive) => {
      toast.success(nowActive ? "Day set enabled" : "Day set disabled");
      qc.invalidateQueries({ queryKey: ["society-day-sets", societyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("society_day_sets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Day set deleted");
      qc.invalidateQueries({ queryKey: ["society-day-sets", societyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" /> Society schedule
              <span className="text-sm font-normal text-muted-foreground">· {societyName}</span>
            </DialogTitle>
          </DialogHeader>

          {setsQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-3">
              {derivedMode && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  Showing the schedules this society already trains on, derived from existing plans.
                  Run the <code>society_day_sets</code> migration to save, edit and add day sets.
                </div>
              )}
              {sets.length === 0 && (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No day sets yet. Add the 3-day pattern this society trains on.
                </div>
              )}

              {sets.map((s, i) => {
                const t = timesBySet[s.id] ?? [];
                return (
                  <div key={s.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Day set {i + 1}
                        </p>
                        <p className="mt-0.5 font-semibold text-foreground">
                          {s.label || daySetLabel(s.days)}
                        </p>
                        <div className="mt-2 space-y-0.5">
                          {sortDays(s.days).map((d) => {
                            const time = t.find((x) => x.day === d)?.time_slot;
                            return (
                              <p key={d} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" /> {d} → {time || "time not set"}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge
                          variant={s.active ? "secondary" : "outline"}
                          className={derivedMode ? "" : "cursor-pointer"}
                          onClick={() => !derivedMode && toggleActive.mutate(s)}
                        >
                          {s.active ? "Active" : "Disabled"}
                        </Badge>
                        {!derivedMode && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => { if (confirm(`Delete "${s.label || daySetLabel(s.days)}"?`)) remove.mutate(s.id); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!derivedMode && (
                <Button onClick={startNew} variant="outline" className="w-full gap-2">
                  <Plus className="h-4 w-4" /> Add day set
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit day set" : "Add day set"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Training days * <span className="font-normal text-muted-foreground">(pick {DAYS_PER_SET})</span></Label>
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
              <p className="text-[11px] text-muted-foreground">{days.length}/{DAYS_PER_SET} selected</p>
            </div>

            {days.length > 0 && (
              <div className="space-y-2">
                <Label>Timings</Label>
                {sortDays(days).map((d) => (
                  <div key={d} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-sm text-muted-foreground">{d}</span>
                    <Input
                      value={times[d] ?? ""}
                      onChange={(e) => setTimes({ ...times, [d]: e.target.value })}
                      placeholder="e.g. 7:00 AM – 8:00 AM"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={days.length ? daySetLabel(days) : "Tue · Thu · Sat"}
              />
              <p className="text-[11px] text-muted-foreground">Leave blank to use {days.length ? daySetLabel(days) : "the day names"}.</p>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Available to customers</p>
                <p className="text-xs text-muted-foreground">
                  {active ? "Shown when booking this society" : "Hidden from booking"}
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || days.length !== DAYS_PER_SET}>
              {save.isPending ? "Saving…" : editing ? "Update" : "Save day set"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
