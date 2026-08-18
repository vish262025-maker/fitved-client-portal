import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { firebaseAuth } from "@/integrations/firebase/client";
import { createUserWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { recalculatePlanDates } from "@/stores/pauseStore";
import { trainerSessionsForMonth, recentMonthKeys, monthLabel } from "@/lib/trainerSessions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/dates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Eye, CalendarOff, Clock, Info, AlertTriangle, Loader2, Dumbbell, BadgeCheck, Mail, Phone, ClipboardList, X } from "lucide-react";
import { toast } from "sonner";
import TrainerReviewDialog from "@/components/admin/TrainerReviewDialog";
import { SPECIALIZATIONS } from "@/lib/specializations";
import { useAuth } from "@/contexts/AuthContext";
import { scopeByAdmin } from "@/lib/adminScope";
import { buildTrainerSlug } from "@/lib/trainerSlug";
import { trackAdminActivity } from "@/lib/adminActivity";
import { useAdminsList } from "@/hooks/useAdminsList";

interface Trainer {
  id: string;
  user_id: string | null;
  name: string;
  contact: string | null;
  specialization: string | null;
  specializations: string[] | null;
  active: boolean;
  email: string | null;
}

interface OffTimeRow {
  id: string;
  trainer_id: string;
  from_date: string;
  to_date: string;
  time_slot: string | null;
  reason: string | null;
}

// Native <input type="time"> gives 24h "HH:MM"; slots are stored as friendly
// "7:00 AM – 8:00 AM" strings (same format the customer profile uses).
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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localDate(d: string): string {
  // Display a YYYY-MM-DD date string in a friendly format without timezone shift
  return format(parseISO(d + "T12:00:00"), "PP");
}

export default function Trainers() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const adminId = user?.id ?? null;
  const canDeleteTrainer = can("delete_trainer");
  const { data: adminsList = [] } = useAdminsList();
  const today = todayISO();

  // ── Trainer add/edit dialog ────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trainer | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [societyIds, setSocietyIds] = useState<string[]>([]);
  const [assignedAdminId, setAssignedAdminId] = useState<string>("");
  const [createLogin, setCreateLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [slotsBySociety, setSlotsBySociety] = useState<Record<string, string[]>>({});
  const [slotDraft, setSlotDraft] = useState<Record<string, { start: string; end: string }>>({});

  // ── Off-time management dialog ─────────────────────────────────────────────
  const [offDialog, setOffDialog] = useState<{ open: boolean; trainer: Trainer | null }>({
    open: false,
    trainer: null,
  });
  // Add off-time form state inside dialog
  const [offMode, setOffMode] = useState<"days" | "slot">("days");
  const [offFromDate, setOffFromDate] = useState("");
  const [offToDate, setOffToDate] = useState("");
  const [offSingleDate, setOffSingleDate] = useState("");
  const [offTimeSlot, setOffTimeSlot] = useState("");
  const [offReason, setOffReason] = useState("");

  const resetOffForm = () => {
    setOffMode("days");
    setOffFromDate("");
    setOffToDate("");
    setOffSingleDate("");
    setOffTimeSlot("");
    setOffReason("");
  };

  // Make-up (extra) class form state inside the dialog
  const [mkDate, setMkDate] = useState("");
  const [mkSociety, setMkSociety] = useState("");
  const [mkSlot, setMkSlot] = useState("");
  const [mkNotes, setMkNotes] = useState("");
  const resetMkForm = () => { setMkDate(""); setMkSociety(""); setMkSlot(""); setMkNotes(""); };

  // ── Data queries ───────────────────────────────────────────────────────────
  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers", adminId],
    queryFn: async () => {
      const { data, error } = await supabase.from("trainers").select("*").order("name");
      if (error) throw error;
      // `specializations` (text[]) exists at runtime but isn't in the generated types yet.
      // Each admin sees only their own trainers (impersonating SA uses the viewed
      // admin's id); a new admin starts with none.
      return scopeByAdmin((data ?? []) as any[], adminId) as unknown as Trainer[];
    },
  });

  // Self-signed-up trainers awaiting admin approval (active === false).
  const pendingTrainers = useMemo(() => trainers.filter((t) => !t.active), [trainers]);
  const [reviewTrainer, setReviewTrainer] = useState<Trainer | null>(null);

  // Trainers still holding a stored password = not yet moved to Firebase.
  const trainersNotInFirebase = useMemo(
    () => trainers.filter((t) => { const pw = (t as { password?: string }).password; return !!pw && pw.length >= 6; }).length,
    [trainers],
  );

  // ALL upcoming off-times — used for coverage widget + off-time dialog
  const { data: allOffTimes = [] } = useQuery({
    queryKey: ["admin-trainer-off-times"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainer_off_times")
        .select("id, trainer_id, from_date, to_date, time_slot, reason")
        .gte("to_date", today)
        .order("from_date");
      return (data ?? []) as OffTimeRow[];
    },
  });

  // All off-times for the selected trainer (both past + upcoming) for the dialog
  const { data: trainerOffTimes = [], isFetching: offLoading } = useQuery({
    queryKey: ["admin-trainer-off-times-detail", offDialog.trainer?.id],
    enabled: !!offDialog.trainer,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainer_off_times")
        .select("id, trainer_id, from_date, to_date, time_slot, reason")
        .eq("trainer_id", offDialog.trainer!.id)
        .order("from_date");
      return (data ?? []) as OffTimeRow[];
    },
  });

  // Trainer's known slots (for slot picker autocomplete)
  const { data: trainerSlots = [] } = useQuery({
    queryKey: ["admin-trainer-slots-for-off", offDialog.trainer?.id],
    enabled: !!offDialog.trainer,
    queryFn: async () => {
      const { data } = await supabase
        .from("trainer_slots")
        .select("time_slot")
        .eq("trainer_id", offDialog.trainer!.id);
      return [...new Set((data ?? []).map((r) => r.time_slot))].sort();
    },
  });

  // The selected trainer's customers (for make-up class targeting)
  const { data: trainerClients = [] } = useQuery({
    queryKey: ["admin-trainer-clients-for-makeup", offDialog.trainer?.id],
    enabled: !!offDialog.trainer,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, society_id, time_slot")
        .eq("trainer_id", offDialog.trainer!.id);
      return (data ?? []) as { id: string; name: string | null; society_id: string | null; time_slot: string | null }[];
    },
  });

  // ── Sessions taken per month (selected trainer) ─────────────────────
  // scheduled batches − off-days + extra classes ± admin adjustment
  const trainerClientIdsKey = trainerClients.map((c) => c.id).sort().join(",");
  const { data: sessionData } = useQuery({
    queryKey: ["admin-trainer-sessions-data", offDialog.trainer?.id, trainerClientIdsKey],
    enabled: !!offDialog.trainer,
    queryFn: async () => {
      const clientIds = trainerClients.map((c) => c.id);
      const [plansRes, pausesRes, offsRes, compsRes, adjRes] = await Promise.all([
        clientIds.length
          ? supabase.from("plans").select("user_id, start_date, end_date, training_days").in("user_id", clientIds)
          : Promise.resolve({ data: [] as any[] }),
        clientIds.length
          ? (supabase.from("pauses") as any).select("client_id, from_date, to_date").in("client_id", clientIds)
          : Promise.resolve({ data: [] as any[] }),
        (supabase as any).from("trainer_off_times").select("from_date, to_date, time_slot").eq("trainer_id", offDialog.trainer!.id),
        (supabase as any).from("comp_classes").select("client_id, class_date").eq("trainer_id", offDialog.trainer!.id),
        (supabase as any).from("trainer_session_adjustments").select("month, delta, notes").eq("trainer_id", offDialog.trainer!.id),
      ]);
      return {
        plans: (plansRes.data ?? []) as { user_id: string; start_date: string; end_date: string; training_days: string[] | null }[],
        pauses: (pausesRes.data ?? []) as { client_id: string; from_date: string; to_date: string }[],
        offs: (offsRes.data ?? []) as { from_date: string; to_date: string; time_slot: string | null }[],
        comps: (compsRes.data ?? []) as { client_id: string; class_date: string }[],
        adjustments: (adjRes.data ?? []) as { month: string; delta: number; notes: string | null }[],
      };
    },
  });

  const monthlySessions = useMemo(() => {
    if (!sessionData) return [];
    const plansByUser = new Map<string, typeof sessionData.plans>();
    for (const p of sessionData.plans) {
      const list = plansByUser.get(p.user_id) ?? [];
      list.push(p);
      plansByUser.set(p.user_id, list);
    }
    const adjByMonth = new Map(sessionData.adjustments.map((a) => [a.month, a.delta]));
    return recentMonthKeys(6).map((mk) =>
      trainerSessionsForMonth(
        mk, today, trainerClients, plansByUser,
        sessionData.pauses, sessionData.offs, sessionData.comps,
        adjByMonth.get(mk) ?? 0,
      ),
    );
  }, [sessionData, trainerClients, today]);

  // Admin adjustment editor state
  const [adjMonth, setAdjMonth] = useState<string | null>(null);
  const [adjValue, setAdjValue] = useState("");

  const saveAdjustment = useMutation({
    mutationFn: async () => {
      if (!offDialog.trainer || !adjMonth) throw new Error("No month selected");
      const delta = Number(adjValue);
      if (!Number.isInteger(delta)) throw new Error("Enter a whole number (e.g. 2 or -1)");
      const { error } = await (supabase as any)
        .from("trainer_session_adjustments")
        .upsert(
          { trainer_id: offDialog.trainer.id, month: adjMonth, delta },
          { onConflict: "trainer_id,month" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Adjustment saved");
      setAdjMonth(null);
      setAdjValue("");
      qc.invalidateQueries({ queryKey: ["admin-trainer-sessions-data", offDialog.trainer?.id] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(/trainer_session_adjustments|schema cache|does not exist|Could not find|relation/i.test(msg)
        ? "Adjustments table isn't set up — run the trainer_session_adjustments migration in Supabase."
        : msg);
    },
  });

  // Current-month session counts for ALL trainers (table column)
  const currentMonthKey = today.slice(0, 7);
  const { data: allSessionsRaw } = useQuery({
    queryKey: ["admin-all-trainer-sessions", currentMonthKey],
    queryFn: async () => {
      const [profilesRes, plansRes, pausesRes, offsRes, compsRes, adjRes] = await Promise.all([
        supabase.from("profiles").select("id, trainer_id, society_id, time_slot").not("trainer_id", "is", null),
        supabase.from("plans").select("user_id, start_date, end_date, training_days"),
        (supabase.from("pauses") as any).select("client_id, from_date, to_date"),
        (supabase as any).from("trainer_off_times").select("trainer_id, from_date, to_date, time_slot"),
        (supabase as any).from("comp_classes").select("trainer_id, client_id, class_date").gte("class_date", `${currentMonthKey}-01`),
        (supabase as any).from("trainer_session_adjustments").select("trainer_id, month, delta").eq("month", currentMonthKey),
      ]);
      return {
        profiles: (profilesRes.data ?? []) as { id: string; trainer_id: string | null; society_id: string | null; time_slot: string | null }[],
        plans: (plansRes.data ?? []) as { user_id: string; start_date: string; end_date: string; training_days: string[] | null }[],
        pauses: (pausesRes.data ?? []) as { client_id: string; from_date: string; to_date: string }[],
        offs: (offsRes.data ?? []) as { trainer_id: string; from_date: string; to_date: string; time_slot: string | null }[],
        comps: (compsRes.data ?? []) as { trainer_id: string | null; client_id: string; class_date: string }[],
        adjustments: (adjRes.data ?? []) as { trainer_id: string; month: string; delta: number }[],
      };
    },
  });

  const sessionsThisMonthByTrainer = useMemo(() => {
    const map: Record<string, number> = {};
    if (!allSessionsRaw) return map;
    const plansByUser = new Map<string, typeof allSessionsRaw.plans>();
    for (const p of allSessionsRaw.plans) {
      const list = plansByUser.get(p.user_id) ?? [];
      list.push(p);
      plansByUser.set(p.user_id, list);
    }
    for (const t of trainers) {
      const clients = allSessionsRaw.profiles.filter((c) => c.trainer_id === t.id);
      const adj = allSessionsRaw.adjustments.find((a) => a.trainer_id === t.id)?.delta ?? 0;
      map[t.id] = trainerSessionsForMonth(
        currentMonthKey, today, clients, plansByUser,
        allSessionsRaw.pauses.filter((p) => clients.some((c) => c.id === p.client_id)),
        allSessionsRaw.offs.filter((o) => o.trainer_id === t.id),
        allSessionsRaw.comps.filter((c) => c.trainer_id === t.id),
        adj,
      ).total;
    }
    return map;
  }, [allSessionsRaw, trainers, currentMonthKey, today]);

  const { data: societies = [] } = useQuery({
    queryKey: ["societies"],
    queryFn: async () => {
      const { data } = await supabase.from("societies").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: links = [] } = useQuery({
    queryKey: ["trainer_societies"],
    queryFn: async () => {
      const { data } = await supabase.from("trainer_societies").select("trainer_id, society_id");
      return data ?? [];
    },
  });

  const { data: allSlots = [] } = useQuery({
    queryKey: ["trainer-slots-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("trainer_slots").select("trainer_id, society_id, time_slot").order("time_slot");
      return data ?? [];
    },
  });

  // Upcoming off-times count per trainer (for badge)
  const offCountByTrainer = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of allOffTimes) {
      map[o.trainer_id] = (map[o.trainer_id] ?? 0) + 1;
    }
    return map;
  }, [allOffTimes]);

  // ── Trainer add/edit helpers ───────────────────────────────────────────────
  const startNew = () => {
    setEditing(null); setName(""); setContact(""); setSpecializations([]);
    setActive(true); setSocietyIds([]); setCreateLogin(false);
    setAssignedAdminId("");
    setLoginEmail("");
    setSlotsBySociety({}); setSlotDraft({});
    setOpen(true);
  };

  const startEdit = (t: Trainer) => {
    setEditing(t);
    setName(t.name); setContact(t.contact ?? "");
    // Prefer the shared multi-select array; fall back to migrating a legacy
    // single free-text specialization into the array on first edit.
    setSpecializations(
      Array.isArray(t.specializations) && t.specializations.length > 0
        ? t.specializations
        : t.specialization
          ? t.specialization.split(",").map((s) => s.trim()).filter(Boolean)
          : []
    );
   
    setActive(t.active);
    setAssignedAdminId((t as any).assigned_admin_id ?? "");
    setSocietyIds(links.filter((l) => l.trainer_id === t.id).map((l) => l.society_id));
    setCreateLogin(false); setLoginEmail("");
    const seeded: Record<string, string[]> = {};
    for (const s of allSlots.filter((s) => s.trainer_id === t.id)) {
      (seeded[s.society_id] ??= []).push(s.time_slot);
    }
    setSlotsBySociety(seeded); setSlotDraft({});
    setOpen(true);
  };

  const addSlot = (sid: string) => {
    const d = slotDraft[sid];
    if (!d?.start || !d?.end) return;
    const slot = `${to12h(d.start)} – ${to12h(d.end)}`;
    setSlotsBySociety((prev) => {
      const cur = prev[sid] ?? [];
      if (cur.includes(slot)) return prev;
      return { ...prev, [sid]: [...cur, slot] };
    });
    setSlotDraft((prev) => ({ ...prev, [sid]: { start: "", end: "" } }));
  };

  const removeSlot = (sid: string, slot: string) => {
    setSlotsBySociety((prev) => ({ ...prev, [sid]: (prev[sid] ?? []).filter((s) => s !== slot) }));
  };

  // ── Off-time management helpers ────────────────────────────────────────────
  const openOffDialog = (t: Trainer) => {
    resetOffForm();
    setOffDialog({ open: true, trainer: t });
  };

  // Recalculate plan dates for ALL clients of this trainer
  const recalcClientsForTrainer = async (trainerId: string) => {
    const { data: clients } = await supabase
      .from("profiles").select("id").eq("trainer_id", trainerId);
    await Promise.all((clients ?? []).map((c) => recalculatePlanDates(c.id)));
    qc.invalidateQueries({ queryKey: ["trainer-clients"] });
  };

  // ── Mutations ──────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      let trainerId = editing?.id;
      let userId = editing?.user_id ?? null;

      if (createLogin && !editing) {
        if (!loginEmail) throw new Error("Email required to create a login account");

        const { data: existing } = await supabase
          .from("trainers").select("id").eq("email", loginEmail).maybeSingle();
        if (existing) throw new Error("A trainer with this email already exists.");

        const newUserId = crypto.randomUUID();
        const { data: created, error } = await supabase.from("trainers").insert({
          user_id: newUserId,
          name, contact: contact || null, specialization: specializations.join(", ") || null, specializations, active,
          // No plaintext password stored in Supabase — the trainer sets their
          // own password in Firebase on first sign-in (or uses Google).
          email: loginEmail, password: "",
        } as any).select("id").single();
        if (error) throw error;

        const { error: roleErr } = await supabase
          .from("user_roles").insert({ user_id: newUserId, role: "trainer" });
        if (roleErr) console.warn("user_roles insert failed:", roleErr.message);

        trainerId = created?.id;
      } else if (editing) {
        const { error } = await supabase.from("trainers").update({
          name, contact: contact || null, specialization: specializations.join(", ") || null, specializations, active,
        } as any).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("trainers").insert({
          name, contact: contact || null, specialization: specializations.join(", ") || null, specializations, active,
        } as any).select("id").single();
        if (error) throw error;
        trainerId = data.id;
      }

      // Assign managing admin — default to the admin creating this trainer so
      // it lands in their dashboard (best-effort; column may not exist pre-migration).
      if (trainerId) {
        await (supabase as any).from("trainers")
          .update({ assigned_admin_id: assignedAdminId || adminId || null }).eq("id", trainerId);
      }

      // Refresh the shareable public slug from the current name + specialization.
      if (trainerId) {
        await (supabase as any).from("trainers")
          .update({ slug: buildTrainerSlug(name, specializations, trainerId) }).eq("id", trainerId);
      }

      // sync trainer_societies
      if (trainerId) {
        await supabase.from("trainer_societies").delete().eq("trainer_id", trainerId);
        if (societyIds.length) {
          const rows = societyIds.map((sid) => ({ trainer_id: trainerId!, society_id: sid }));
          const { error } = await supabase.from("trainer_societies").insert(rows);
          if (error) throw error;
        }

        // sync trainer_slots (only for societies still assigned)
        const { error: delErr } = await supabase.from("trainer_slots").delete().eq("trainer_id", trainerId);
        const slotRows = societyIds.flatMap((sid) =>
          (slotsBySociety[sid] ?? []).map((slot) => ({
            trainer_id: trainerId!, society_id: sid, time_slot: slot,
          }))
        );
        const { error: slotErr } = slotRows.length
          ? await supabase.from("trainer_slots").insert(slotRows)
          : { error: null as any };
        if (delErr || slotErr) {
          console.warn("trainer_slots sync failed:", delErr ?? slotErr);
          toast.info("Trainer saved, but time slots weren't stored — run the trainer_slots migration in Supabase first.");
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Trainer updated" : "Trainer created");
      trackAdminActivity({
        action: editing ? "trainer.update" : "trainer.create",
        entityType: "trainer",
        entityId: editing?.id ?? null,
        entityLabel: name,
      });
      qc.invalidateQueries({ queryKey: ["trainers"] });
      qc.invalidateQueries({ queryKey: ["trainer_societies"] });
      qc.invalidateQueries({ queryKey: ["trainer-slots-all"] });
      qc.invalidateQueries({ queryKey: ["trainer-slots"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  // One-click onboarding of existing trainers into Firebase Auth. Runs
  // entirely client-side: the admin's app session lives in localStorage (not
  // Firebase), so temporarily creating trainer credentials here never logs the
  // admin out. Trainers that still have a stored password are created in
  // Firebase with it (so their password keeps working); that plaintext copy is
  // then wiped from Supabase. Trainers with no stored password are left to set
  // one on their own first login. Idempotent — already-onboarded ones are skipped.
  const onboardFirebase = useMutation({
    mutationFn: async () => {
      const { data: rows } = await supabase
        .from("trainers")
        .select("id, name, email, password");
      const list = (rows ?? []) as { id: string; name: string; email: string | null; password: string | null }[];

      let created = 0, already = 0, deferred = 0, failed = 0;
      for (const t of list) {
        const email = (t.email ?? "").trim().toLowerCase();
        if (!email) { deferred++; continue; }
        if (!t.password || t.password.length < 6) {
          // No usable password to migrate — they'll set one on first login.
          deferred++;
          continue;
        }
        try {
          await createUserWithEmailAndPassword(firebaseAuth, email, t.password);
          // Firebase is now the credential store → remove the plaintext copy.
          await supabase.from("trainers").update({ password: "" }).eq("id", t.id);
          created++;
        } catch (e) {
          const code = (e as { code?: string })?.code;
          if (code === "auth/email-already-in-use") {
            // Already in Firebase — just clear the leftover stored copy.
            await supabase.from("trainers").update({ password: "" }).eq("id", t.id);
            already++;
          } else if (code === "auth/operation-not-allowed") {
            throw new Error("Enable Email/Password in Firebase console → Authentication → Sign-in method first.");
          } else {
            console.warn(`Onboard failed for ${email}:`, e);
            failed++;
          }
        }
      }
      // Drop the ephemeral Firebase session created during the loop; the admin's
      // own app session (localStorage) is untouched.
      await firebaseSignOut(firebaseAuth).catch(() => {});
      return { created, already, deferred, failed };
    },
    onSuccess: ({ created, already, deferred, failed }) => {
      qc.invalidateQueries({ queryKey: ["trainers"] });
      const parts = [
        created ? `${created} added to Firebase` : null,
        already ? `${already} already there` : null,
        deferred ? `${deferred} will onboard on first login` : null,
        failed ? `${failed} failed` : null,
      ].filter(Boolean).join(" · ");
      toast.success(`Firebase sync done — ${parts || "nothing to do"}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Firebase sync failed"),
  });

  // Approve a self-signed-up trainer (active=false → true), unlocking their app.
  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trainers").update({ active: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      toast.success("Trainer verified — they now have full access.");
      trackAdminActivity({
        action: "trainer.approve",
        entityType: "trainer",
        entityId: id,
        entityLabel: trainers.find((t) => t.id === id)?.name ?? null,
      });
      qc.invalidateQueries({ queryKey: ["trainers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Approve failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Look up the session key so we can also clear their role mapping.
      const { data: t } = await supabase.from("trainers").select("user_id").eq("id", id).maybeSingle();

      // Unlink any customers pointing at this trainer so they don't dangle.
      await supabase.from("profiles").update({ trainer_id: null }).eq("trainer_id", id);

      // Clean up all rows that reference this trainer (no DB cascade exists).
      await Promise.all([
        supabase.from("trainer_societies").delete().eq("trainer_id", id),
        supabase.from("trainer_slots").delete().eq("trainer_id", id),
        (supabase as any).from("trainer_off_times").delete().eq("trainer_id", id),
        (supabase as any).from("comp_classes").delete().eq("trainer_id", id),
        (supabase as any).from("trainer_session_adjustments").delete().eq("trainer_id", id),
      ]);
      if (t?.user_id) {
        await supabase.from("user_roles").delete().eq("user_id", t.user_id);
      }

      const { error } = await supabase.from("trainers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, deletedId) => {
      // Note: their Firebase login (if any) is NOT removed — the client SDK
      // can't delete other users. It's harmless: with no trainers row, sign-in
      // is refused. To also purge the Firebase account, delete it in the
      // Firebase console or deploy the onDelete Cloud Function (see README).
      toast.success("Trainer and all their data deleted.");
      trackAdminActivity({
        action: "trainer.delete",
        entityType: "trainer",
        entityId: deletedId,
        entityLabel: trainers.find((t) => t.id === deletedId)?.name ?? null,
      });
      qc.invalidateQueries({ queryKey: ["trainers"] });
      qc.invalidateQueries({ queryKey: ["trainer_societies"] });
      qc.invalidateQueries({ queryKey: ["admin-customer-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  // Add off-time (admin)
  const addOffTime = useMutation({
    mutationFn: async () => {
      if (!offDialog.trainer) throw new Error("No trainer selected");
      if (offMode === "days") {
        if (!offFromDate || !offToDate) throw new Error("Select a date range");
        if (offToDate < offFromDate) throw new Error("End date must be on or after start date");
        const { error } = await (supabase as any).from("trainer_off_times").insert({
          trainer_id: offDialog.trainer.id,
          from_date: offFromDate,
          to_date: offToDate,
          time_slot: null,
          reason: offReason.trim() || null,
        });
        if (error) throw new Error(error.message);
      } else {
        if (!offSingleDate) throw new Error("Pick a date");
        const slot = offTimeSlot.trim();
        const { error } = await (supabase as any).from("trainer_off_times").insert({
          trainer_id: offDialog.trainer.id,
          from_date: offSingleDate,
          to_date: offSingleDate,
          time_slot: slot || null,
          reason: offReason.trim() || null,
        });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      toast.success("Off-time added — affected clients' plan dates recalculated");
      resetOffForm();
      qc.invalidateQueries({ queryKey: ["admin-trainer-off-times"] });
      qc.invalidateQueries({ queryKey: ["admin-trainer-off-times-detail", offDialog.trainer?.id] });
      if (offDialog.trainer) await recalcClientsForTrainer(offDialog.trainer.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add off-time"),
  });

  // Delete off-time (admin — no midnight restriction)
  const deleteOffTime = useMutation({
    mutationFn: async ({ id, trainerId }: { id: string; trainerId: string }) => {
      const { error } = await (supabase as any).from("trainer_off_times").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return trainerId;
    },
    onSuccess: async (trainerId) => {
      toast.success("Off-time removed — affected clients' plan dates recalculated");
      qc.invalidateQueries({ queryKey: ["admin-trainer-off-times"] });
      qc.invalidateQueries({ queryKey: ["admin-trainer-off-times-detail", offDialog.trainer?.id] });
      await recalcClientsForTrainer(trainerId);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove off-time"),
  });

  // Societies this trainer is assigned to (for the make-up society picker)
  const trainerSocieties = useMemo(() => {
    if (!offDialog.trainer) return [] as { id: string; name: string }[];
    const ids = new Set(links.filter((l) => l.trainer_id === offDialog.trainer!.id).map((l) => l.society_id));
    return societies.filter((s) => ids.has(s.id));
  }, [offDialog.trainer, links, societies]);

  // Slots to offer for the chosen society: the trainer's defined slots there,
  // plus any slot their customers in that society actually use.
  const makeupSlotOptions = useMemo(() => {
    if (!mkSociety) return [] as string[];
    const set = new Set<string>();
    for (const s of allSlots) if (s.trainer_id === offDialog.trainer?.id && s.society_id === mkSociety) set.add(s.time_slot);
    for (const c of trainerClients) if (c.society_id === mkSociety && c.time_slot) set.add(c.time_slot);
    return [...set].sort();
  }, [mkSociety, allSlots, trainerClients, offDialog.trainer]);

  // Which customers a trainer's make-up class applies to: everyone in the
  // chosen society, optionally narrowed to the chosen slot.
  const makeupTargets = useMemo(() => {
    if (!offDialog.trainer || !mkSociety) return [] as { id: string; name: string | null }[];
    return trainerClients.filter(
      (c) => c.society_id === mkSociety && (!mkSlot || c.time_slot === mkSlot)
    );
  }, [offDialog.trainer, mkSociety, mkSlot, trainerClients]);

  const makeupName = (clientId: string) =>
    trainerClients.find((c) => c.id === clientId)?.name ?? "Client";

  // Record an extra class the trainer took to compensate an off-day — consumes
  // one off-day bonus from every customer in that batch.
  const addMakeup = useMutation({
    mutationFn: async () => {
      if (!offDialog.trainer) throw new Error("No trainer selected");
      if (!mkDate) throw new Error("Pick the class date");
      if (!mkSociety) throw new Error("Pick the society");
      if (makeupTargets.length === 0) throw new Error("No customers in this batch to credit");
      const rows = makeupTargets.map((c) => ({
        client_id: c.id,
        trainer_id: offDialog.trainer!.id,
        class_date: mkDate,
        notes: mkNotes.trim() || null,
      }));
      const { error } = await (supabase as any).from("comp_classes").insert(rows);
      if (error) throw new Error(error.message);
      await Promise.all(makeupTargets.map((c) => recalculatePlanDates(c.id)));
    },
    onSuccess: () => {
      toast.success(`Extra class recorded for ${makeupTargets.length} customer(s) — one bonus consumed each`);
      resetMkForm();
      qc.invalidateQueries({ queryKey: ["admin-trainer-makeups", offDialog.trainer?.id] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(/comp_classes|schema cache|does not exist|Could not find|relation/i.test(msg)
        ? "Extra-classes table isn't set up — run the comp_classes migration in Supabase."
        : msg);
    },
  });

  // Make-up classes already recorded for the selected trainer
  const { data: trainerMakeups = [] } = useQuery({
    queryKey: ["admin-trainer-makeups", offDialog.trainer?.id],
    enabled: !!offDialog.trainer,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("comp_classes")
        .select("id, client_id, class_date, notes")
        .eq("trainer_id", offDialog.trainer!.id)
        .order("class_date", { ascending: false });
      return (data ?? []) as { id: string; client_id: string; class_date: string; notes: string | null }[];
    },
  });

  const deleteMakeup = useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await (supabase as any).from("comp_classes").delete().eq("id", id);
      if (error) throw new Error(error.message);
      await recalculatePlanDates(clientId);
    },
    onSuccess: () => {
      toast.success("Extra class removed — bonus restored");
      qc.invalidateQueries({ queryKey: ["admin-trainer-makeups", offDialog.trainer?.id] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const toggleSociety = (id: string, on: boolean) => {
    setSocietyIds((prev) => (on ? [...prev, id] : prev.filter((s) => s !== id)));
  };

  // Auto-fill default email when toggling create login
  useEffect(() => {
    if (createLogin && !loginEmail && name) {
      setLoginEmail(`${name.toLowerCase().replace(/[^a-z0-9]/g, "")}@trainer.fitved.local`);
    }
  }, [createLogin, name, loginEmail]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground">Trainers</h1>
          <p className="mt-1 text-muted-foreground">{trainers.length} trainer(s)</p>
        </div>
        <Button onClick={startNew} className="gap-2"><Plus className="h-4 w-4" /> Add trainer</Button>
      </header>

      {/* One-click Firebase onboarding — offered while any trainer still has a
          stored password (i.e. hasn't been moved to Firebase yet). */}
      {trainersNotInFirebase > 0 && (
        <Card className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ border: "1px solid rgba(30,58,95,0.15)", background: "rgba(30,58,95,0.03)" }}>
          <div className="flex items-start gap-2.5 min-w-0">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{trainersNotInFirebase} trainer login(s)</span> aren't in
              Firebase yet. Onboard them now (keeps their current password) — after this, passwords live only in Firebase.
            </p>
          </div>
          <Button variant="outline" className="gap-2 shrink-0" disabled={onboardFirebase.isPending}
            onClick={() => onboardFirebase.mutate()}>
            {onboardFirebase.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</>
              : <><BadgeCheck className="h-4 w-4" /> Onboard to Firebase</>}
          </Button>
        </Card>
      )}

      {/* ── Pending verification ─────────────────────────────────────────── */}
      {pendingTrainers.length > 0 && (
        <Card className="rounded-2xl overflow-hidden border-2" style={{ borderColor: "rgba(240,167,32,0.5)", background: "rgba(240,167,32,0.05)" }}>
          <div className="flex items-center gap-2.5 px-5 pt-4 pb-1">
            <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "rgba(240,167,32,0.18)" }}>
              <AlertTriangle className="h-4 w-4" style={{ color: "#b07d10" }} />
            </span>
            <div>
              <h2 className="font-display text-lg leading-tight">Pending verification</h2>
              <p className="text-xs text-muted-foreground">New trainers who signed up and are waiting for your approval.</p>
            </div>
            <Badge variant="secondary" className="ml-auto">{pendingTrainers.length}</Badge>
          </div>
          <div className="p-3 sm:p-4 space-y-2.5">
            {pendingTrainers.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{t.name}</p>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" />{t.email ?? "—"}</span>
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{t.contact ?? "not provided yet"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" className="gap-1.5" onClick={() => setReviewTrainer(t)}>
                    <ClipboardList className="h-4 w-4" /> Review
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={approve.isPending} onClick={() => approve.mutate(t.id)}>
                    <BadgeCheck className="h-4 w-4" /> Approve
                  </Button>
                  {canDeleteTrainer && (
                    <Button size="sm" variant="ghost" className="text-destructive" title="Reject & delete"
                      onClick={() => { if (confirm(`Reject and delete ${t.name}'s request?`)) remove.mutate(t.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <TrainerReviewDialog
        trainer={reviewTrainer}
        onOpenChange={(o) => { if (!o) setReviewTrainer(null); }}
        approving={approve.isPending}
        onApprove={(id) => { approve.mutate(id); setReviewTrainer(null); }}
        onReject={(id) => { remove.mutate(id); setReviewTrainer(null); }}
      />

      <Card className="rounded-2xl shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Specialization</TableHead>
              <TableHead className="hidden md:table-cell">Contact</TableHead>
              <TableHead>Societies</TableHead>
              <TableHead>Password</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell" title="Sessions taken this month so far — open Off-Days for the full monthly breakdown">
                Sessions ({format(new Date(), "MMM")})
              </TableHead>
              <TableHead>Off-Days</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trainers.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No trainers yet</TableCell></TableRow>
            ) : trainers.map((t) => {
              const count = links.filter((l) => l.trainer_id === t.id).length;
              const offCount = offCountByTrainer[t.id] ?? 0;
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {t.name}
                    {t.user_id && <Badge variant="outline" className="ml-2 text-[10px]">login</Badge>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell max-w-[220px]">
                    {(t.specializations && t.specializations.length > 0)
                      ? t.specializations.join(", ")
                      : (t.specialization ?? "—")}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{t.contact ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{count}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{(t as any).password ?? "—"}</TableCell>
                  <TableCell><Badge variant={t.active ? "secondary" : "outline"}>{t.active ? "active" : "inactive"}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" title="Sessions taken this month (off-days excluded, extra classes included)">
                      {sessionsThisMonthByTrainer[t.id] ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => openOffDialog(t)}
                      title="Manage off-days for this trainer"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      <CalendarOff className="h-3.5 w-3.5 text-muted-foreground" />
                      {offCount > 0
                        ? <span className="inline-flex items-center justify-center rounded-full bg-warning/20 text-warning-foreground px-1.5 py-0.5 text-[10px] font-semibold">{offCount}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" title="View as this trainer"
                      onClick={() => navigate(`/trainer?as=${t.id}`)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    {canDeleteTrainer && (
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (confirm(`Delete ${t.name}?`)) remove.mutate(t.id);
                      }}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* ── Off-time Management Dialog ──────────────────────────────────────── */}
      <Dialog open={offDialog.open} onOpenChange={(v) => setOffDialog((s) => ({ ...s, open: v }))}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff className="h-5 w-5 text-warning-foreground" />
              Off-Days — {offDialog.trainer?.name}
            </DialogTitle>
            <DialogDescription>
              Add or remove off-times for this trainer. Affected clients' plan end dates are automatically recalculated.
            </DialogDescription>
          </DialogHeader>

          {/* Midnight lock info */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 p-3 flex gap-2 text-sm">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
            <p className="text-blue-800 dark:text-blue-300 leading-relaxed">
              <strong>Midnight lock:</strong> Once an off-time's start date has passed, trainers can no longer delete it. Only admins (you) can remove past or in-progress off-times.
            </p>
          </div>

          {/* Existing off-times list */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Scheduled off-times</p>
            {offLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : trainerOffTimes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No off-times scheduled.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border overflow-hidden">
                {trainerOffTimes.map((o) => {
                  const sameDay = o.from_date === o.to_date;
                  const isPast = o.to_date < today;
                  const isActive = o.from_date <= today && o.to_date >= today;
                  return (
                    <li key={o.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${isPast ? "bg-muted/30" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">
                            {sameDay
                              ? localDate(o.from_date)
                              : `${localDate(o.from_date)} → ${localDate(o.to_date)}`}
                          </p>
                          {isPast && <Badge variant="outline" className="text-[10px]">Past</Badge>}
                          {isActive && <Badge className="text-[10px] bg-orange-500 hover:bg-orange-500">Active now</Badge>}
                          {!isPast && !isActive && <Badge variant="secondary" className="text-[10px]">Upcoming</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          {o.time_slot
                            ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {o.time_slot}</span>
                            : <span>All slots</span>}
                          {o.reason && <span className="truncate">· {o.reason}</span>}
                        </div>
                        {(isPast || isActive) && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {isPast ? "Past — only admin can delete" : "In-progress — only admin can delete"}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={deleteOffTime.isPending}
                        onClick={() => {
                          if (confirm("Remove this off-time? Affected clients' plan dates will be recalculated.")) {
                            deleteOffTime.mutate({ id: o.id, trainerId: offDialog.trainer!.id });
                          }
                        }}
                      >
                        {deleteOffTime.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Add new off-time form */}
          <div className="rounded-xl border p-4 space-y-4 bg-muted/20">
            <p className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Add Off-Time</p>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOffMode("days")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${offMode === "days" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
              >
                Full day(s) off
              </button>
              <button
                type="button"
                onClick={() => setOffMode("slot")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${offMode === "slot" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
              >
                Specific slot only
              </button>
            </div>

            {offMode === "days" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>From date</Label>
                  {/* Admin can backdate off-times (retroactive reconciliation) —
                      only trainers are limited to today-onward in their own dashboard. */}
                  <Input
                    type="date"
                    value={offFromDate}
                    onChange={(e) => {
                      setOffFromDate(e.target.value);
                      if (!offToDate || e.target.value > offToDate) setOffToDate(e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>To date</Label>
                  <Input
                    type="date"
                    value={offToDate}
                    min={offFromDate || undefined}
                    onChange={(e) => setOffToDate(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  {/* Admin can backdate (no today floor) — see note above. */}
                  <Input
                    type="date"
                    value={offSingleDate}
                    onChange={(e) => setOffSingleDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Time slot <span className="text-muted-foreground font-normal">(optional — leave blank = all slots)</span></Label>
                  {trainerSlots.length > 0 ? (
                    <Select value={offTimeSlot || "all"} onValueChange={(v) => setOffTimeSlot(v === "all" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a time slot…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All slots</SelectItem>
                        {trainerSlots.filter(Boolean).map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="e.g. 7:00 AM – 8:00 AM"
                      value={offTimeSlot}
                      onChange={(e) => setOffTimeSlot(e.target.value)}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. Personal leave, medical appointment…"
                value={offReason}
                onChange={(e) => setOffReason(e.target.value)}
              />
            </div>

            <Button
              className="w-full gap-2"
              disabled={addOffTime.isPending || (offMode === "days" ? !offFromDate || !offToDate : !offSingleDate)}
              onClick={() => addOffTime.mutate()}
            >
              {addOffTime.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>
                : <><Plus className="h-4 w-4" /> Add Off-Time</>}
            </Button>
          </div>

          {/* ── Extra / make-up classes ─────────────────────────────── */}
          <div className="mt-6 border-t pt-5 space-y-3">
            <div>
              <p className="font-medium flex items-center gap-2">
                <Dumbbell className="h-4 w-4" /> Extra classes taken (make-up for off-days)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Record an extra class this trainer took to make up an off-day. It credits every
                customer in that batch — one off-day bonus consumed each, pulling their plan dates back in.
              </p>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Class date</Label>
                  {/* Admin can backdate — only trainers are limited to today onward */}
                  <Input type="date" value={mkDate} onChange={(e) => setMkDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Society</Label>
                  <Select value={mkSociety || undefined} onValueChange={(v) => { setMkSociety(v); setMkSlot(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {trainerSocieties.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Slot <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Select value={mkSlot || "all"} onValueChange={(v) => setMkSlot(v === "all" ? "" : v)} disabled={!mkSociety}>
                    <SelectTrigger><SelectValue placeholder="All slots" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All slots in society</SelectItem>
                      {makeupSlotOptions.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input placeholder="e.g. Make-up for 12 Jul off-day" value={mkNotes} onChange={(e) => setMkNotes(e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {mkSociety
                    ? <>Will credit <span className="font-semibold text-foreground">{makeupTargets.length}</span> customer(s){mkSlot ? ` in ${mkSlot}` : ""}.</>
                    : "Pick a society to see who gets credited."}
                </p>
                <Button size="sm" className="gap-2 shrink-0"
                  disabled={addMakeup.isPending || !mkDate || !mkSociety || makeupTargets.length === 0}
                  onClick={() => addMakeup.mutate()}>
                  {addMakeup.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Plus className="h-4 w-4" /> Record</>}
                </Button>
              </div>
            </div>

            {trainerMakeups.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recorded ({trainerMakeups.length})</p>
                {trainerMakeups.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border p-2.5 group">
                    <div className="text-sm">
                      <span className="font-medium">{formatDate(m.class_date)}</span>
                      <span className="text-muted-foreground"> · {makeupName(m.client_id)}{m.notes ? ` · ${m.notes}` : ""}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { if (confirm("Delete this extra class? The customer's bonus will be restored.")) deleteMakeup.mutate({ id: m.id, clientId: m.client_id }); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Sessions taken ──────────────────────────────────────────── */}
          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-primary" /> Sessions taken
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Counted per batch (society + slot) from client schedules — off-days excluded, extra classes and your corrections included.
              </p>
            </div>
            <div className="space-y-1.5">
              {monthlySessions.map((ms) => (
                <div key={ms.monthKey} className="rounded-lg border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm">
                      <span className="font-medium">{monthLabel(ms.monthKey)}</span>
                      <span className="ml-2 font-semibold text-primary">{ms.total} session{ms.total === 1 ? "" : "s"}</span>
                      {ms.monthKey === currentMonthKey && <span className="ml-1 text-xs text-muted-foreground">so far</span>}
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
                      onClick={() => {
                        if (adjMonth === ms.monthKey) { setAdjMonth(null); }
                        else { setAdjMonth(ms.monthKey); setAdjValue(String(ms.adjustment || "")); }
                      }}>
                      <Pencil className="h-3 w-3" /> Adjust
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ms.scheduled} scheduled
                    {ms.missedToOffDays > 0 && <> · {ms.missedToOffDays} missed to off-days</>}
                    {ms.extra > 0 && <> · +{ms.extra} extra class{ms.extra === 1 ? "" : "es"}</>}
                    {ms.adjustment !== 0 && <> · {ms.adjustment > 0 ? "+" : ""}{ms.adjustment} admin adjustment</>}
                  </p>
                  {adjMonth === ms.monthKey && (
                    <div className="mt-2 flex items-end gap-2 rounded-md bg-muted/50 p-2">
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs">Correction (+/− sessions)</Label>
                        <Input type="number" step="1" placeholder="e.g. 2 or -1" value={adjValue}
                          onChange={(e) => setAdjValue(e.target.value)} className="h-8" />
                      </div>
                      <Button size="sm" className="h-8" disabled={saveAdjustment.isPending || adjValue.trim() === ""}
                        onClick={() => saveAdjustment.mutate()}>
                        {saveAdjustment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOffDialog({ open: false, trainer: null })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Trainer Add/Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit trainer" : "Add trainer"}</DialogTitle>
            <DialogDescription>
              Trainers can be assigned to one or many societies.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Managing admin</Label>
              <Select value={assignedAdminId || "none"} onValueChange={(v) => setAssignedAdminId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {adminsList.map((ad) => (
                    <SelectItem key={ad.id} value={ad.id}>{ad.name || ad.phone || "Admin"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Specializations</Label>
              <p className="text-xs text-muted-foreground">Pick as many as apply — same list the trainer sees on their own profile.</p>
              <Select
                value=""
                onValueChange={(v) => { if (v && !specializations.includes(v)) setSpecializations((s) => [...s, v]); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Add a specialization…" />
                </SelectTrigger>
                <SelectContent>
                  {SPECIALIZATIONS.filter((s) => !specializations.includes(s)).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {specializations.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {specializations.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1.5 py-1 text-xs font-semibold"
                      style={{ background: "rgba(240,167,32,0.14)", color: "#a07010" }}>
                      {s}
                      <button type="button" onClick={() => setSpecializations((prev) => prev.filter((x) => x !== s))}
                        className="rounded-full hover:bg-black/10 p-0.5" aria-label={`Remove ${s}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Active</Label>
              <Checkbox checked={active} onCheckedChange={(c) => setActive(!!c)} />
            </div>

            <div className="space-y-2">
              <Label>Assigned societies</Label>
              {societies.length === 0 ? (
                <p className="text-xs text-muted-foreground">No societies yet — create one first.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {societies.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer hover:bg-accent">
                      <Checkbox
                        checked={societyIds.includes(s.id)}
                        onCheckedChange={(c) => toggleSociety(s.id, !!c)}
                      />
                      <span className="text-sm truncate">{s.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Time slots per society — the batches this trainer runs there */}
            {societyIds.length > 0 && (
              <div className="space-y-2">
                <Label>Time slots per society</Label>
                <p className="text-xs text-muted-foreground">
                  Add the slot timings this trainer takes in each society — customers are assigned one of these on their profile.
                </p>
                <div className="space-y-2.5">
                  {societyIds.map((sid) => {
                    const soc = societies.find((s) => s.id === sid);
                    const slots = slotsBySociety[sid] ?? [];
                    const draft = slotDraft[sid] ?? { start: "", end: "" };
                    return (
                      <div key={sid} className="rounded-lg border p-3 space-y-2">
                        <p className="text-sm font-medium">{soc?.name ?? "Society"}</p>
                        {slots.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {slots.map((slot) => (
                              <span key={slot}
                                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                                {slot}
                                <button
                                  type="button"
                                  onClick={() => removeSlot(sid, slot)}
                                  className="text-muted-foreground hover:text-destructive leading-none"
                                  aria-label={`Remove ${slot}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input
                            type="time"
                            className="w-auto"
                            value={draft.start}
                            onChange={(e) => setSlotDraft((p) => ({ ...p, [sid]: { ...draft, start: e.target.value } }))}
                            aria-label="Slot start time"
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            className="w-auto"
                            value={draft.end}
                            onChange={(e) => setSlotDraft((p) => ({ ...p, [sid]: { ...draft, end: e.target.value } }))}
                            aria-label="Slot end time"
                          />
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => addSlot(sid)} disabled={!draft.start || !draft.end}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add slot
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!editing && (
              <div className="rounded-lg border p-3 space-y-3">
                <label className="flex items-center gap-2">
                  <Checkbox checked={createLogin} onCheckedChange={(c) => setCreateLogin(!!c)} />
                  <span className="text-sm font-medium">Create a login account for this trainer</span>
                </label>
                {createLogin && (
                  <div className="space-y-3 pl-6">
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                      <p className="text-xs text-muted-foreground">
                        No password needed here — the trainer opens the Staff tab and signs in with
                        this email (their first password is set right then in Firebase), or uses Google.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
              {save.isPending ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
