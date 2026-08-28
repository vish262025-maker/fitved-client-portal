import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClassCalendar } from "@/components/dashboard/ClassCalendar";
import { useSessions } from "@/hooks/useSessions";
import { toast } from "sonner";
import { trackAdminActivity } from "@/lib/adminActivity";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminsList } from "@/hooks/useAdminsList";

type AppRole = "client" | "trainer" | "admin";

// ── Time-slot helpers ───────────────────────────────────────────────
// Native <input type="time"> uses 24h "HH:MM"; we store a friendly
// "7:00 AM – 8:00 AM" string in profiles.time_slot.

function to12h(hhmm: string): string {
  if (!hhmm) return "";
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return "";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${(mStr ?? "00").padStart(2, "0")} ${ampm}`;
}

function to24h(label: string): string {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function parseSlot(slot: string): { start: string; end: string } {
  if (!slot) return { start: "", end: "" };
  const parts = slot.split(/[–—-]/).map((s) => s.trim());
  if (parts.length < 2) return { start: "", end: "" };
  let [a, b] = parts;
  // Shared meridiem, e.g. "7:00 – 8:00 AM" → borrow AM/PM for the start.
  if (!/AM|PM/i.test(a)) {
    const mer = b.match(/AM|PM/i)?.[0];
    if (mer) a = `${a} ${mer}`;
  }
  return { start: to24h(a), end: to24h(b) };
}

export function ProfileTab({ userId }: { userId: string }) {
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["customer-profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data;
    },
  });

  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers-active-with-societies"],
    queryFn: async () => {
      const { data } = await supabase.from("trainers")
        .select("id, name, active, trainer_societies(society_id)")
        .eq("active", true)
        .order("name");
      
      // Deduplicate by name to fix any accidental duplicate rows
      const unique = [];
      const seen = new Set();
      for (const t of (data || [])) {
        if (!seen.has(t.name)) {
          seen.add(t.name);
          unique.push(t);
        }
      }
      return unique;
    },
  });

  const { data: societies = [] } = useQuery({
    queryKey: ["societies"],
    queryFn: async () => {
      const { data } = await supabase.from("societies").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["customer-roles", userId],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });

  // ── Class-calendar data (the same view the customer sees) ──────────────
  const { data: allCalPlans = [] } = useQuery({
    queryKey: ["customer-plans-cal", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("plans")
        .select("start_date, end_date, training_days, status, payment_status")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      // A checkout the customer abandoned is not a plan. Including them
      // stretched the calendar across date ranges nobody ever bought — and
      // whichever was created last decided what "their plan" was.
      // NULL payment_status = collected outside the app, which counts as paid.
      return ((data ?? []) as any[]).filter(
        (p) => p.payment_status == null || p.payment_status === "success",
      ) as { start_date: string; end_date: string; training_days: string[] | null; status: string }[];
    },
  });
  const calPlan = allCalPlans.length ? allCalPlans[allCalPlans.length - 1] : null;

  // The customer's real session rows. Without them ClassCalendar falls back to
  // deriving days from the plan's date range, which marks every training day
  // in that range as a class — so a plan that has not started yet showed
  // classes already attended, and months of classes that do not exist.
  const { data: customerSessions = [] } = useSessions(userId);
  const calRange = useMemo(() => {
    if (!allCalPlans.length) return null;
    const starts = allCalPlans.map((p) => p.start_date).sort();
    const ends = allCalPlans.map((p) => p.end_date).sort();
    const allDays = new Set<string>();
    allCalPlans.forEach((p) => (p.training_days ?? []).forEach((d) => allDays.add(d)));
    return {
      startDate: starts[0],
      endDate: ends[ends.length - 1],
      trainingDays: [...allDays],
      ranges: allCalPlans.map((p) => ({ start: p.start_date, end: p.end_date })),
    };
  }, [allCalPlans]);
  const { data: calPauses = [] } = useQuery({
    queryKey: ["customer-pauses-cal", userId],
    queryFn: async () => {
      const { data } = await (supabase.from("pauses") as any)
        .select("from_date, to_date").eq("client_id", userId);
      return ((data ?? []) as { from_date: string; to_date: string }[]).map((p) => ({ from: p.from_date, to: p.to_date }));
    },
  });
  const { data: calOffTimes = [] } = useQuery({
    queryKey: ["customer-offtimes-cal", profile?.trainer_id],
    enabled: !!profile?.trainer_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainer_off_times")
        .select("from_date, to_date, time_slot, reason")
        .eq("trainer_id", profile!.trainer_id!);
      return (data ?? []) as { from_date: string; to_date: string; time_slot: string | null; reason: string | null }[];
    },
  });
  const [calExpanded, setCalExpanded] = useState(true);
  const { impersonating } = useAuth();
  const { data: admins = [] } = useAdminsList();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [rawSlot, setRawSlot] = useState("");
  const [trainerId, setTrainerId] = useState<string>("");
  const [societyId, setSocietyId] = useState<string>("");
  const [assignedAdminId, setAssignedAdminId] = useState<string>("");

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setPhone(profile.phone ?? "");
      setEmail((profile as any).email ?? "");
      const slot = profile.time_slot ?? "";
      setRawSlot(slot);
      const parsed = parseSlot(slot);
      setStartTime(parsed.start);
      setEndTime(parsed.end);
      setTrainerId(profile.trainer_id ?? "");
      setSocietyId(profile.society_id ?? "");
      setAssignedAdminId((profile as any).assigned_admin_id ?? "");
    }
  }, [profile]);


  const availableTrainers = useMemo(() => {
    if (!societyId) return [];
    return trainers.filter((t: any) =>
      t.trainer_societies?.some((ts: any) => ts.society_id === societyId)
    );
  }, [trainers, societyId]);

  // Slots the selected trainer runs in the selected society — strictly the
  // admin-defined slots (Admin → Trainers → Time slots per society).
  const { data: trainerSlots = [] } = useQuery({
    queryKey: ["trainer-slots", trainerId, societyId],
    enabled: !!trainerId && !!societyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("trainer_slots").select("time_slot")
        .eq("trainer_id", trainerId).eq("society_id", societyId)
        .order("time_slot");
      return (data ?? []).map((r) => r.time_slot);
    },
  });

  // Manual time entry is the fallback when the trainer has no slots here.
  const [customTime, setCustomTime] = useState(false);

  useEffect(() => {
    // If society changes and the current trainer is not in the new society's list, clear the trainer
    if (societyId && trainerId && availableTrainers.length > 0) {
      if (!availableTrainers.some(t => t.id === trainerId)) {
        setTrainerId("");
      }
    } else if (!societyId && trainerId) {
      setTrainerId("");
    }
  }, [societyId, availableTrainers, trainerId]);

  const composedSlot = startTime && endTime ? `${to12h(startTime)} – ${to12h(endTime)}` : "";

  const save = useMutation({
    mutationFn: async () => {
      // Keep the legacy society text column in sync with the selected society
      const societyName = societyId
        ? (societies.find((s) => s.id === societyId)?.name ?? null)
        : null;
      const payload: Record<string, unknown> = {
        name: name || null,
        phone: phone || null,
        email: email || null,
        society: societyName,
        time_slot: composedSlot || null,
        trainer_id: trainerId || null,
        society_id: societyId || null,
        assigned_admin_id: assignedAdminId || null,
      };
      let { error } = await (supabase as any).from("profiles").update(payload).eq("id", userId);
      // If the assignment column isn't there yet, retry without it.
      if (error && /assigned_admin_id/.test(error.message || "")) {
        delete payload.assigned_admin_id;
        ({ error } = await (supabase as any).from("profiles").update(payload).eq("id", userId));
      }
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved");
      trackAdminActivity({ action: "customer.update", entityType: "customer", entityId: userId, entityLabel: name });
      qc.invalidateQueries({ queryKey: ["customer-profile", userId] });
      qc.invalidateQueries({ queryKey: ["admin-customer-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const toggleRole = useMutation({
    mutationFn: async ({ role, add }: { role: AppRole; add: boolean }) => {
      if (add) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;

        // Auto-create trainer profile when granting trainer role
        if (role === "trainer") {
          const { data: existing } = await supabase
            .from("trainers").select("id").eq("user_id", userId).maybeSingle();
          if (!existing) {
            const { error: tErr } = await supabase.from("trainers").insert({
              user_id: userId,
              name: profile?.name ?? name ?? "Unnamed Trainer",
              contact: profile?.phone ?? phone ?? null,
              active: true,
            });
            if (tErr) throw new Error(`Role granted but trainer profile failed: ${tErr.message}`);
          }
        }
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
        if (error) throw error;
      }
    },
    onSuccess: (_, { role, add }) => {
      toast.success(
        role === "trainer" && add
          ? "Trainer role granted — trainer profile created automatically"
          : "Roles updated"
      );
      qc.invalidateQueries({ queryKey: ["customer-roles", userId] });
      qc.invalidateQueries({ queryKey: ["trainers"] });
      qc.invalidateQueries({ queryKey: ["trainers-active"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Role change failed"),
  });

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] items-start">
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@email.com" />
            <p className="text-xs text-muted-foreground">Customer's email — set by the customer from their profile.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="min-w-0 space-y-1.5">
              <Label>Society</Label>
              <Select value={societyId || "none"} onValueChange={(v) => setSocietyId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select society first" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No society</SelectItem>
                  {societies.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>Assigned trainer</Label>
              <Select disabled={!societyId} value={trainerId || "none"} onValueChange={(v) => { setTrainerId(v === "none" ? "" : v); setCustomTime(false); }}>
                <SelectTrigger><SelectValue placeholder={societyId ? "Select trainer" : "Select society first"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No trainer</SelectItem>
                  {availableTrainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name ?? "Unnamed"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>Time slot</Label>
              {trainerId && trainerSlots.length > 0 && !customTime ? (
                <Select
                  value={trainerSlots.includes(composedSlot || rawSlot) ? (composedSlot || rawSlot) : undefined}
                  onValueChange={(v) => {
                    const parsed = parseSlot(v);
                    setStartTime(parsed.start);
                    setEndTime(parsed.end);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={rawSlot ? rawSlot : "Pick the trainer's slot"} />
                  </SelectTrigger>
                  <SelectContent>
                    {trainerSlots.map((slot) => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex w-full min-w-0 items-center gap-1.5">
                  <Input
                    type="time"
                    className="min-w-0 flex-1 px-2"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    aria-label="Slot start time"
                  />
                  <span className="shrink-0 text-muted-foreground">–</span>
                  <Input
                    type="time"
                    className="min-w-0 flex-1 px-2"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    aria-label="Slot end time"
                  />
                </div>
              )}
              {trainerId && trainerSlots.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setCustomTime((v) => !v)}
                >
                  {customTime ? "Back to trainer's slots" : "Set a custom time instead"}
                </button>
              )}
            </div>
          </div>

          {composedSlot && (
            <p className="text-xs text-muted-foreground -mt-3">
              Saves as <span className="font-medium text-foreground">{composedSlot}</span>
              {trainerId && trainerSlots.length === 0 && " · this trainer has no slots defined yet — add them in Admin → Trainers"}
            </p>
          )}

          {/* Managing admin — assignment is the Super Admin's job only, so this
              control is shown solely while the Super Admin is viewing an admin's
              dashboard (impersonating). Regular admins never see or change it. */}
          {impersonating && (
            <div className="space-y-1.5 max-w-sm">
              <Label>Managing admin</Label>
              <Select value={assignedAdminId || "none"} onValueChange={(v) => setAssignedAdminId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {admins.map((ad) => (
                    <SelectItem key={ad.id} value={ad.id}>{ad.name || ad.phone || "Admin"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Which admin's dashboard this customer appears in.</p>
            </div>
          )}

          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>

        </div>

        {/* ── Class calendar (same view the customer sees) ─────────────────── */}
        <div className="lg:pt-1">
          <div className="mb-3">
            <h3 className="font-display text-lg text-foreground">Class calendar</h3>
            <p className="text-xs text-muted-foreground">Classes taken, upcoming, paused &amp; off-days — tap a day for details.</p>
          </div>
          {calPlan && (calPlan.training_days?.length ?? 0) > 0 ? (
            <div className="space-y-3">
              {(() => {
                const todayISO = new Date().toISOString().slice(0, 10);
                const ended = calPlan.status !== "active" || calPlan.end_date < todayISO;
                if (!ended) return null;
                const stoppedEarly = calPlan.end_date >= todayISO && calPlan.status !== "active";
                return (
                  <div className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(210,59,52,0.08)", border: "1px solid rgba(210,59,52,0.3)" }}>
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#d23b34" }} />
                    <p className="text-xs leading-relaxed" style={{ color: "#a02c26" }}>
                      <span className="font-semibold">
                        {stoppedEarly ? "This customer's plan has been stopped" : "This customer's plan has ended"}
                      </span>
                      {!stoppedEarly && (
                        <> on {format(new Date(calPlan.end_date + "T12:00:00"), "d MMM yyyy")}</>
                      )}
                      . Their past classes are shown below{!stoppedEarly ? ", with the end date ringed in red" : ""}.
                    </p>
                  </div>
                );
              })()}
              <ClassCalendar
                startDate={calRange?.startDate ?? calPlan.start_date}
                endDate={calRange?.endDate ?? calPlan.end_date}
                trainingDays={calRange?.trainingDays ?? calPlan.training_days ?? []}
                pauses={calPauses}
                offTimes={calOffTimes}
                customerSlot={profile?.time_slot ?? null}
                expanded={calExpanded}
                onExpandedChange={setCalExpanded}
                highlightDate={calPlan.end_date}
                planActive={calPlan.status === "active"}
                planRanges={calRange?.ranges}
                sessions={customerSessions}
              />
            </div>
          ) : (
            <div className="rounded-2xl border p-6 text-sm text-muted-foreground text-center">
              No plan yet — the calendar appears once this customer has had a plan with training days.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
