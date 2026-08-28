import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Building2, Users, Clock, ChevronRight, ArrowLeft,
  CalendarOff, Plus, Trash2, UserCircle2, MapPin, X,
  Phone as PhoneIcon, Eye, ShieldAlert, LogOut, Lock,
  Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TrainerPauses } from "@/components/dashboard/TrainerPauses";
import { TrainerClientPauseModal } from "@/components/dashboard/TrainerClientPauseModal";
import { MarketingFeed } from "@/components/dashboard/MarketingFeed";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { firebaseAuth } from "@/integrations/firebase/client";
import {
  onAuthStateChanged, linkWithCredential, EmailAuthProvider,
  type User as FirebaseUser,
} from "firebase/auth";
import { recalculatePlanDates } from "@/stores/pauseStore";
import { trainerSessionsForMonth, trainerMonthActivity, monthLabel, recentMonthKeys, type DayActivity } from "@/lib/trainerSessions";
import { toast } from "sonner";
import { OnlineClients } from "@/components/trainer/OnlineClients";
import TrainerCompleteProfileDialog from "@/components/trainer/TrainerCompleteProfileDialog";
import { ServiceModeBoard } from "@/components/trainer/ServiceModeBoard";
import { usesSociety, isOnlineMode, type ServiceMode } from "@/lib/serviceMode";
import { sortDays } from "@/lib/daySets";

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY        = "#1E3A5F";
const NAVY_LIGHT  = "#2d5a8e";
const GOLD        = "#f0a720";
const MUTED       = "#8a8f9e";
const BORDER      = "rgba(30,58,95,0.08)";
const GREEN       = "#2e9e5b";
const GREEN_LIGHT = "#e6f7ed";
const RED         = "#ef4444";
const RED_LIGHT   = "#fee2e2";
const BG          = "#f4f2ee";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TrainerRow { id: string; name: string; specialization: string | null; active: boolean; contact: string | null; email: string | null; }
interface SocietyRow { id: string; name: string; address: string | null; }
interface BatchRow   { time_slot: string | null; client_count: number; }
interface ClientRow  { 
  id: string; 
  name: string | null; 
  phone: string | null; 
  society_id: string | null; 
  time_slot: string | null; 
  end_date: string | null;
  training_days: string[] | null;
  is_paused_today: boolean | null;
}

/** Build tel: / wa.me links from a stored phone number */
function phoneLinks(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return { tel: `tel:+${intl}`, wa: `https://wa.me/${intl}` };
}
interface OffTimeRow {
  id: string; from_date: string; to_date: string;
  time_slot: string | null; reason: string | null;
}

type MobileTab = "societies" | "offtime";
type OffMode   = "days" | "slot";

export default function TrainerDashboard() {
  const { user, role, signOut } = useAuth();
  const qc = useQueryClient();
  // The selected service track drives the whole page, not just the board.
  const [mode, setMode] = useState<ServiceMode>("offline_group");
  // `?tab=availability` is the third bottom-nav destination. Kept as a query
  // param on the same route so all the off-time state and mutations stay put
  // rather than being threaded through a second page.
  const [searchParams] = useSearchParams();
  const tabView = searchParams.get("tab") === "availability" ? "availability" : "dashboard";

  // Admin "view as trainer": /trainer?as=<trainer_id>. Read-only.
  const viewAsId = role === "admin" ? searchParams.get("as") : null;
  const isViewAs = !!viewAsId;

  // ── UI state ─────────────────────────────────────────────────────────────
  const [tab, setTab]                         = useState<MobileTab>("societies");
  const [selectedSociety, setSelectedSociety] = useState<SocietyRow | null>(null);
  const [offMode, setOffMode]                 = useState<OffMode>("days");
  const [dateRange, setDateRange]             = useState<DateRange | undefined>();
  const [singleDate, setSingleDate]           = useState<Date | undefined>();
  const [slotInput, setSlotInput]             = useState("");
  const [reason, setReason]                   = useState("");
  // Separate open-state per layout: the mobile and desktop off-time forms both
  // exist in the DOM, and Radix portals popover content to <body> regardless of
  // the trigger's visibility — sharing one state would open both calendars at
  // once and make them flicker fighting over position.
  const [calOpen, setCalOpen]                 = useState(false);
  const [singleCalOpen, setSingleCalOpen]     = useState(false);
  const [calOpenD, setCalOpenD]               = useState(false);
  const [singleCalOpenD, setSingleCalOpenD]   = useState(false);
  const [pauseClient, setPauseClient]         = useState<{ id: string; name: string } | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: trainer, isLoading: trainerLoading } = useQuery<TrainerRow | null>({
    queryKey: ["my-trainer", user?.id, viewAsId],
    enabled: !!user,
    queryFn: async () => {
      const q = supabase.from("trainers").select("id, name, specialization, active, contact, email");
      const { data } = viewAsId
        ? await q.eq("id", viewAsId).maybeSingle()
        : await q.or(`user_id.eq.${user!.id},id.eq.${user!.id}`).maybeSingle();
      return (data as TrainerRow | null) ?? null;
    },
  });

  // Profile-completion gate: pull the fields required to be listed & filterable.
  const [gateDone, setGateDone] = useState(false);
  const { data: profileComplete } = useQuery({
    queryKey: ["trainer-profile-complete", trainer?.id],
    enabled: !!trainer && !isViewAs,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainers")
        .select("photo_path, education, years_experience, clients_trained, gender, city, availability_online, availability_offline, languages, specializations")
        .eq("id", trainer!.id)
        .maybeSingle();
      if (!data) return true; // don't block if we can't read it
      return !!(
        data.photo_path && data.education && data.years_experience != null && data.clients_trained != null &&
        data.gender && data.city && (data.availability_online || data.availability_offline) &&
        Array.isArray(data.languages) && data.languages.length > 0 &&
        Array.isArray(data.specializations) && data.specializations.length > 0
      );
    },
  });

  const { data: societies = [] } = useQuery<SocietyRow[]>({
    queryKey: ["trainer-societies", trainer?.id],
    enabled: !!trainer,
    queryFn: async () => {
      const { data } = await supabase
        .from("trainer_societies")
        .select("societies(id, name, address)")
        .eq("trainer_id", trainer!.id);
      return (data ?? []).map((r: any) => r.societies).filter(Boolean) as SocietyRow[];
    },
  });

  // Roster via column-safe RPC — trainers can never read client DOB or plan data.
  const { data: allClients = [], isLoading: clientsLoading } = useQuery<ClientRow[]>({
    queryKey: ["trainer-clients", trainer?.id],
    enabled: !!trainer,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_trainer_clients",
        { _trainer_id: viewAsId || trainer!.id }
      );
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  // Batches per society, derived client-side from the roster
  const batchMap = useMemo<Record<string, BatchRow[]>>(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const c of allClients) {
      if (!c.society_id) continue;
      const slot = c.time_slot ?? "Unassigned";
      if (!map[c.society_id]) map[c.society_id] = {};
      map[c.society_id][slot] = (map[c.society_id][slot] ?? 0) + 1;
    }
    const result: Record<string, BatchRow[]> = {};
    for (const [sid, slots] of Object.entries(map)) {
      result[sid] = Object.entries(slots).map(([time_slot, client_count]) => ({ time_slot, client_count }));
    }
    return result;
  }, [allClients]);

  const clients = useMemo(
    () =>
      selectedSociety
        ? allClients
            .filter((c) => c.society_id === selectedSociety.id)
            .sort((a, b) => (a.time_slot ?? "").localeCompare(b.time_slot ?? "") || (a.name ?? "").localeCompare(b.name ?? ""))
        : [],
    [allClients, selectedSociety]
  );

  // The slots this trainer runs (set by the admin in Admin → Trainers),
  // grouped per society. Also drives the off-time slot picker.
  const { data: mySlots = [] } = useQuery<{ society_id: string; time_slot: string }[]>({
    queryKey: ["trainer-own-slots", trainer?.id],
    enabled: !!trainer,
    queryFn: async () => {
      const { data } = await supabase
        .from("trainer_slots")
        .select("society_id, time_slot")
        .eq("trainer_id", trainer!.id)
        .order("time_slot");
      return data ?? [];
    },
  });
  const slotsForSociety = (sid: string) => mySlots.filter((s) => s.society_id === sid).map((s) => s.time_slot);

  // Off-time slot options: admin-defined slots plus the batch slots their
  // clients are actually assigned to — so the picker is never empty while
  // the trainer has classes running.
  const uniqueSlotOptions = useMemo(() => {
    const set = new Set<string>(mySlots.map((s) => s.time_slot));
    for (const c of allClients) if (c.time_slot) set.add(c.time_slot);
    return [...set].sort();
  }, [mySlots, allClients]);

  const today = new Date().toISOString().slice(0, 10);
  const { data: offTimes = [] } = useQuery<OffTimeRow[]>({
    queryKey: ["trainer-off-times", trainer?.id],
    enabled: !!trainer,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainer_off_times")
        .select("*")
        .eq("trainer_id", trainer!.id)
        .gte("to_date", today)
        .order("from_date");
      return (data ?? []) as OffTimeRow[];
    },
  });

  // Off-days count as bonus classes for every affected client — push their
  // plan end dates out right away so schedules stay accurate.
  const recalcAffectedClients = async () => {
    if (!trainer) return;
    const { data: clients } = await supabase
      .from("profiles").select("id").eq("trainer_id", trainer.id);
    await Promise.all((clients ?? []).map((c) => recalculatePlanDates(c.id)));
    qc.invalidateQueries({ queryKey: ["trainer-clients"] });
  };

  // ── Extra (make-up) classes ───────────────────────────────────────────────
  // The trainer records an extra class they took to compensate an off-day.
  // It credits every customer in that society batch (optionally one slot) —
  // one off-day bonus consumed each. Admin manages/edits these from
  // Admin → Trainers → Off-Days.
  // Firebase credential state — used to offer Google-only trainers a way to
  // add a password without leaving the dashboard. onAuthStateChanged because
  // Firebase restores its session asynchronously after a reload.
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  useEffect(() => onAuthStateChanged(firebaseAuth, setFbUser), []);
  const [pwInput, setPwInput] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwLinked, setPwLinked] = useState(false);

  const savePassword = useMutation({
    mutationFn: async () => {
      if (pwInput.length < 6) throw new Error("Password must be at least 6 characters");
      if (pwInput !== pwConfirm) throw new Error("Passwords don't match");
      if (!fbUser?.email) throw new Error("Google session expired — sign in with Google again first");
      await linkWithCredential(fbUser, EmailAuthProvider.credential(fbUser.email, pwInput));
    },
    onSuccess: () => {
      setPwLinked(true);
      setPwInput(""); setPwConfirm("");
      toast.success("Password saved — you can now sign in with email + password too.");
    },
    onError: (e) => {
      const code = (e as { code?: string })?.code;
      if (code === "auth/provider-already-linked") { setPwLinked(true); return; }
      if (code === "auth/requires-recent-login") {
        toast.error("For security, sign out and sign in with Google again, then set your password.");
        return;
      }
      toast.error(e instanceof Error ? e.message : "Could not save password");
    },
  });

  // Profile-completion: collect a phone number when the trainer record has none
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSaved, setPhoneSaved] = useState(false); // deterministic modal close
  const savePhone = useMutation({
    mutationFn: async () => {
      const digits = phoneInput.replace(/\D/g, "");
      if (digits.length !== 10) throw new Error("Please enter a valid 10-digit mobile number");
      if (!trainer?.id) throw new Error("Trainer record not found");
      const { error } = await supabase.from("trainers").update({ contact: digits }).eq("id", trainer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Phone number saved");
      setPhoneSaved(true); // close immediately; refetch keeps it closed
      qc.invalidateQueries({ queryKey: ["my-trainer"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save number"),
  });

  const [mkDate, setMkDate] = useState("");
  const [mkSocietyId, setMkSocietyId] = useState("");
  const [mkSlot, setMkSlot] = useState("");
  const [mkNote, setMkNote] = useState("");

  const makeupTargets = useMemo(() => {
    if (!mkSocietyId) return [] as ClientRow[];
    return allClients.filter(
      (c) => c.society_id === mkSocietyId && (!mkSlot || c.time_slot === mkSlot)
    );
  }, [mkSocietyId, mkSlot, allClients]);

  const makeupSlotOptions = useMemo(() => {
    if (!mkSocietyId) return [] as string[];
    const set = new Set<string>(slotsForSociety(mkSocietyId));
    for (const c of allClients) if (c.society_id === mkSocietyId && c.time_slot) set.add(c.time_slot);
    return [...set].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mkSocietyId, mySlots, allClients]);

  const { data: myMakeups = [] } = useQuery({
    queryKey: ["trainer-makeups", trainer?.id],
    enabled: !!trainer,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("comp_classes")
        .select("id, client_id, class_date, notes")
        .eq("trainer_id", trainer!.id)
        .order("class_date", { ascending: false })
        .limit(20);
      return (data ?? []) as { id: string; client_id: string; class_date: string; notes: string | null }[];
    },
  });
  const clientName = (id: string) => allClients.find((c) => c.id === id)?.name ?? "Client";

  // ── Sessions taken this month ─────────────────────────────────────────────
  // Same computation the admin sees: one session per batch (society + slot)
  // per scheduled day, off-days excluded, extra classes and any admin
  // correction included. Read-only here — only the admin can adjust it.
  const currentMonthKey = today.slice(0, 7);
  const clientIdsKey = allClients.map((c) => c.id).sort().join(",");
  // Month the sessions count is shown for — defaults to the current month, but
  // the trainer can look back at previous months via the dropdown.
  const [sessionMonth, setSessionMonth] = useState(currentMonthKey);
  const monthOptions = useMemo(() => recentMonthKeys(12), []);
  const { data: sessionsThisMonth } = useQuery({
    queryKey: ["trainer-sessions-month", trainer?.id, sessionMonth, clientIdsKey],
    enabled: !!trainer && !clientsLoading,
    queryFn: async () => {
      const ids = allClients.map((c) => c.id);
      const [plansRes, pausesRes, offsRes, compsRes, adjRes] = await Promise.all([
        ids.length
          ? supabase.from("plans").select("user_id, start_date, end_date, training_days").in("user_id", ids)
          : Promise.resolve({ data: [] as any[] }),
        ids.length
          ? (supabase.from("pauses") as any).select("client_id, from_date, to_date").in("client_id", ids)
          : Promise.resolve({ data: [] as any[] }),
        (supabase as any).from("trainer_off_times").select("from_date, to_date, time_slot").eq("trainer_id", trainer!.id),
        // Comps for the selected month only — trainerSessionsForMonth still
        // filters by month, so an inclusive lower bound is enough.
        (supabase as any).from("comp_classes").select("client_id, class_date").eq("trainer_id", trainer!.id).gte("class_date", `${sessionMonth}-01`).lte("class_date", `${sessionMonth}-31`),
        (supabase as any).from("trainer_session_adjustments").select("delta").eq("trainer_id", trainer!.id).eq("month", sessionMonth),
      ]);
      const plansByUser = new Map<string, { user_id: string; start_date: string; end_date: string; training_days: string[] | null }[]>();
      for (const p of (plansRes.data ?? []) as any[]) {
        const list = plansByUser.get(p.user_id) ?? [];
        list.push(p);
        plansByUser.set(p.user_id, list);
      }
      return trainerSessionsForMonth(
        sessionMonth,
        today,
        allClients.map((c) => ({ id: c.id, society_id: c.society_id, time_slot: c.time_slot })),
        plansByUser,
        (pausesRes.data ?? []) as any[],
        (offsRes.data ?? []) as any[],
        (compsRes.data ?? []) as any[],
        ((adjRes.data ?? [])[0]?.delta as number | undefined) ?? 0,
      ).total;
    },
  });
  const isCurrentSessionMonth = sessionMonth === currentMonthKey;

  // ── Class activity calendar (taken / off / extra, any month) ─────────────
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  // Day the trainer tapped — shows who was present / absent / off that day.
  // Hoisted here (not inside ActivityCalendar) so it survives re-renders.
  const [selectedActivityDay, setSelectedActivityDay] = useState<string | null>(null);
  // Which society's calendar to show — null = all societies combined.
  const [calSociety, setCalSociety] = useState<string | null>(null);
  const activityClients = useMemo(
    () => (calSociety ? allClients.filter((c) => c.society_id === calSociety) : allClients),
    [allClients, calSociety],
  );
  const { data: activityRaw } = useQuery({
    queryKey: ["trainer-activity-data", trainer?.id, clientIdsKey],
    enabled: !!trainer && !clientsLoading,
    queryFn: async () => {
      const ids = allClients.map((c) => c.id);
      const [plansRes, pausesRes, offsRes, compsRes] = await Promise.all([
        ids.length
          ? supabase.from("plans").select("user_id, start_date, end_date, training_days").in("user_id", ids)
          : Promise.resolve({ data: [] as any[] }),
        ids.length
          ? (supabase.from("pauses") as any).select("client_id, from_date, to_date").in("client_id", ids)
          : Promise.resolve({ data: [] as any[] }),
        (supabase as any).from("trainer_off_times").select("from_date, to_date, time_slot").eq("trainer_id", trainer!.id),
        (supabase as any).from("comp_classes").select("client_id, class_date").eq("trainer_id", trainer!.id),
      ]);
      return {
        plans: (plansRes.data ?? []) as { user_id: string; start_date: string; end_date: string; training_days: string[] | null }[],
        pauses: (pausesRes.data ?? []) as { client_id: string; from_date: string; to_date: string }[],
        offs: (offsRes.data ?? []) as { from_date: string; to_date: string; time_slot: string | null }[],
        comps: (compsRes.data ?? []) as { client_id: string; class_date: string }[],
      };
    },
  });
  const activityDays = useMemo<DayActivity[]>(() => {
    if (!activityRaw) return [];
    const plansByUser = new Map<string, typeof activityRaw.plans>();
    for (const p of activityRaw.plans) {
      const list = plansByUser.get(p.user_id) ?? [];
      list.push(p);
      plansByUser.set(p.user_id, list);
    }
    return trainerMonthActivity(
      calMonth,
      today,
      activityClients.map((c) => ({ id: c.id, society_id: c.society_id, time_slot: c.time_slot })),
      plansByUser,
      activityRaw.pauses,
      activityRaw.offs,
      activityRaw.comps,
    );
  }, [activityRaw, calMonth, activityClients, today]);

  const addMakeup = useMutation({
    mutationFn: async () => {
      if (!trainer) throw new Error("Trainer not found");
      if (!trainer.active && !isViewAs) throw new Error("Recording classes unlocks after an admin verifies your account.");
      if (!mkDate) throw new Error("Pick the class date");
      if (mkDate < today) throw new Error("Extra classes can't be recorded for a past date");
      if (!mkSocietyId) throw new Error("Pick the society");
      if (makeupTargets.length === 0) throw new Error("No clients in this batch to credit");
      const rows = makeupTargets.map((c) => ({
        client_id: c.id,
        trainer_id: trainer.id,
        class_date: mkDate,
        notes: mkNote.trim() || null,
      }));
      const { error } = await (supabase as any).from("comp_classes").insert(rows);
      if (error) throw new Error(error.message);
      await Promise.all(makeupTargets.map((c) => recalculatePlanDates(c.id)));
    },
    onSuccess: () => {
      toast.success(`Extra class recorded for ${makeupTargets.length} client(s)`);
      setMkDate(""); setMkSocietyId(""); setMkSlot(""); setMkNote("");
      qc.invalidateQueries({ queryKey: ["trainer-makeups"] });
      qc.invalidateQueries({ queryKey: ["trainer-clients"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(/comp_classes|schema cache|does not exist|Could not find|relation/i.test(msg)
        ? "Extra-classes table isn't set up — ask admin to run the comp_classes migration."
        : msg);
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addOff = useMutation({
    mutationFn: async () => {
      if (!trainer) throw new Error("Trainer not found");
      if (!trainer.active && !isViewAs) throw new Error("Off-time scheduling unlocks after an admin verifies your account.");
      const localDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      if (offMode === "days") {
        if (!dateRange?.from || !dateRange?.to) throw new Error("Pick a date range");
        const { error } = await (supabase as any).from("trainer_off_times").insert({
          trainer_id: trainer.id,
          from_date:  localDate(dateRange.from),
          to_date:    localDate(dateRange.to),
          time_slot:  null,
          reason:     reason.trim() || null,
        });
        if (error) throw new Error(error.message);
      } else {
        if (!singleDate) throw new Error("Pick a date");
        if (!slotInput.trim()) throw new Error("Enter the time slot");

        // Validate if the slot is in the past for today
        const slot = slotInput.trim();
        const now = new Date();
        const isToday = 
          singleDate.getFullYear() === now.getFullYear() &&
          singleDate.getMonth() === now.getMonth() &&
          singleDate.getDate() === now.getDate();

        if (isToday) {
          const parts = slot.split(/\s*(?:–|-|to)\s*/i);
          if (parts.length >= 2) {
            const firstAmPmMatch = parts[0].match(/(AM|PM)/i);
            const secondAmPmMatch = parts[1].match(/(AM|PM)/i);
            const ampm = (secondAmPmMatch?.[0] || firstAmPmMatch?.[0] || "").toUpperCase();

            const parsePart = (part: string, defaultAmPm?: string) => {
              const m = part.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
              if (!m) return null;
              let h = parseInt(m[1], 10);
              const min = m[2] ? parseInt(m[2], 10) : 0;
              const partAmpm = (m[3] || defaultAmPm || "").toUpperCase();
              if (partAmpm === "PM" && h < 12) h += 12;
              if (partAmpm === "AM" && h === 12) h = 0;
              return { hour: h, minute: min };
            };

            const startTime = parsePart(parts[0], ampm);
            if (startTime) {
              const currentHour = now.getHours();
              const currentMinute = now.getMinutes();
              if (
                currentHour > startTime.hour || 
                (currentHour === startTime.hour && currentMinute >= startTime.minute)
              ) {
                throw new Error("This time slot has already started or passed today. You cannot select a past time slot.");
              }
            }
          }
        }

        const { error } = await (supabase as any).from("trainer_off_times").insert({
          trainer_id: trainer.id,
          from_date:  localDate(singleDate),
          to_date:    localDate(singleDate),
          time_slot:  slot,
          reason:     reason.trim() || null,
        });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Off time saved — affected clients get those classes back as bonus days");
      setDateRange(undefined); setSingleDate(undefined);
      setSlotInput(""); setReason("");
      qc.invalidateQueries({ queryKey: ["trainer-off-times"] });
      recalcAffectedClients();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const removeOff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("trainer_off_times").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["trainer-off-times"] });
      recalcAffectedClients();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  // ── Account states (orphan role / deactivated) ───────────────────────────
  if (trainerLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!trainer) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-6">
        <div className="max-w-sm w-full rounded-3xl bg-white p-8 text-center"
          style={{ border: `1px solid ${BORDER}`, boxShadow: "0 4px 16px rgba(30,58,95,0.07)" }}>
          <div className="mx-auto mb-4 grid place-items-center rounded-full"
            style={{ width: 64, height: 64, background: "rgba(240,167,32,0.15)" }}>
            <ShieldAlert size={28} color={GOLD} />
          </div>
          <p className="font-display" style={{ fontSize: 20, fontWeight: 600, color: NAVY }}>
            {isViewAs ? "Trainer not found" : role === "admin" ? "Pick a trainer to view" : "Account setup pending"}
          </p>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 8, lineHeight: 1.6 }}>
            {isViewAs
              ? "No trainer profile exists for this ID."
              : role === "admin"
              ? "Use the eye icon in Admin → Trainers to view the app as a specific trainer."
              : "Your trainer profile hasn't been set up yet. Please contact your admin to complete the setup."}
          </p>
        </div>
      </div>
    );
  }

  // Verification + profile-completion gating (real trainer, not admin view-as)
  const isPending = !trainer.active && !isViewAs;
  const needsPhone = !isViewAs && !(trainer.contact && trainer.contact.trim());
  // Google-only login for THIS trainer → offer to add a password in-app
  const needsPassword =
    !isViewAs && !pwLinked &&
    !!fbUser?.email && !!trainer.email &&
    fbUser.email.toLowerCase() === trainer.email.toLowerCase() &&
    !fbUser.providerData.some((p) => p.providerId === "password");

  // ── Helpers ───────────────────────────────────────────────────────────────
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (trainer?.name ?? "Trainer").split(" ")[0];

  // Group clients by time_slot for the drill-down view
  const clientsBySlot = clients.reduce<Record<string, ClientRow[]>>((acc, c) => {
    const key = c.time_slot ?? "Unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  // ─────────────────────────────────────────────────────────────────────────
  // Shared sub-components
  // ─────────────────────────────────────────────────────────────────────────

  // Month calendar of class activity: green = class taken, red = missed to an
  // off-day, gold dot = extra (make-up) class, outlined = upcoming scheduled.
  // Admins see the same thing via "view as trainer".
  const ActivityCalendar = () => {
    const yy = Number(calMonth.slice(0, 4));
    const mm = Number(calMonth.slice(5, 7));
    const firstDow = new Date(yy, mm - 1, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const byDate = new Map(activityDays.map((d) => [d.date, d]));
    const cells: (string | null)[] = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => `${calMonth}-${String(i + 1).padStart(2, "0")}`),
    ];
    const shift = (delta: number) => {
      const d = new Date(yy, mm - 1 + delta, 1);
      setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      setSelectedActivityDay(null);
    };
    const heldTotal = activityDays.reduce((s, d) => s + d.held + d.extra, 0);
    const missedTotal = activityDays.reduce((s, d) => s + d.missedOff, 0);
    const absentTotal = activityDays.reduce((s, d) => s + d.absentIds.length, 0);
    const nameOf = (id: string) => allClients.find((c) => c.id === id)?.name ?? "Client";
    const selected = selectedActivityDay ? byDate.get(selectedActivityDay) : null;
    const selectedLabel = selectedActivityDay
      ? new Date(selectedActivityDay + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
      : "";
    return (
      <div className="rounded-2xl p-4" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold" style={{ fontSize: 14, color: NAVY }}>Class activity</p>
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} aria-label="Previous month"
              className="grid h-7 w-7 place-items-center rounded-lg border-none cursor-pointer"
              style={{ background: "rgba(30,58,95,0.06)" }}>
              <ArrowLeft size={13} color={NAVY} />
            </button>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: NAVY, minWidth: 108, textAlign: "center" }}>
              {monthLabel(calMonth)}
            </span>
            <button onClick={() => shift(1)} aria-label="Next month"
              className="grid h-7 w-7 place-items-center rounded-lg border-none cursor-pointer"
              style={{ background: "rgba(30,58,95,0.06)" }}>
              <ChevronRight size={13} color={NAVY} />
            </button>
          </div>
        </div>

        {/* Per-society filter — tap a society to see only its members' classes. */}
        {societies.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[{ id: null as string | null, name: "All societies" }, ...societies].map((s) => {
              const on = calSociety === s.id;
              return (
                <button key={s.id ?? "all"} type="button"
                  onClick={() => { setCalSociety(s.id); setSelectedActivityDay(null); }}
                  className="rounded-full border cursor-pointer transition-colors"
                  style={{
                    fontSize: 11.5, fontWeight: 600, padding: "4px 11px",
                    background: on ? NAVY : "#fff",
                    color: on ? "#fff" : NAVY,
                    borderColor: on ? NAVY : "rgba(30,58,95,0.15)",
                  }}>
                  {s.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-7 gap-1 mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center" style={{ fontSize: 10, fontWeight: 700, color: MUTED }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((iso, i) => {
            if (!iso) return <div key={`e${i}`} />;
            const a = byDate.get(iso);
            const isToday = iso === today;
            const isSelected = iso === selectedActivityDay;
            const held = (a?.held ?? 0) > 0;
            const missed = (a?.missedOff ?? 0) > 0;
            const extra = (a?.extra ?? 0) > 0;
            const upcoming = (a?.upcoming ?? 0) > 0;
            const absent = (a?.absentIds.length ?? 0) > 0;
            const bg = held ? GREEN_LIGHT : missed ? RED_LIGHT : upcoming ? "rgba(30,58,95,0.05)" : "transparent";
            const fg = held ? GREEN : missed ? RED : upcoming ? NAVY : MUTED;
            return (
              <button key={iso}
                type="button"
                onClick={() => setSelectedActivityDay(isSelected ? null : iso)}
                title={a ? [
                  held ? `${a.held} class(es) taken` : null,
                  missed ? `${a.missedOff} missed (off-day)` : null,
                  absent ? `${a.absentIds.length} client(s) absent` : null,
                  extra ? `${a.extra} extra class(es)` : null,
                  upcoming ? `${a.upcoming} upcoming` : null,
                ].filter(Boolean).join(" · ") || "No classes" : ""}
                className="relative grid place-items-center rounded-lg cursor-pointer"
                style={{
                  height: 32, fontSize: 12, fontWeight: held || missed ? 700 : 500,
                  background: bg, color: fg, padding: 0,
                  border: isSelected ? `1.5px solid ${GOLD}` : isToday ? `1.5px solid ${NAVY}` : "1.5px solid transparent",
                  boxShadow: isSelected ? "0 0 0 2px rgba(240,167,32,0.25)" : "none",
                }}>
                {Number(iso.slice(8, 10))}
                {extra && <span className="absolute rounded-full" style={{ width: 5, height: 5, background: GOLD, top: 3, right: 3 }} />}
                {absent && <span className="absolute rounded-full" style={{ width: 5, height: 5, background: "#f97316", bottom: 3, left: 3 }} />}
                {held && missed && <span className="absolute rounded-full" style={{ width: 5, height: 5, background: RED, bottom: 3, right: 3 }} />}
              </button>
            );
          })}
        </div>

        {/* Tap-a-day detail: who was there, who was absent, off-day info */}
        {selected && (
          <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(30,58,95,0.04)", border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between">
              <p style={{ fontSize: 12.5, fontWeight: 700, color: NAVY }}>{selectedLabel}</p>
              <button onClick={() => setSelectedActivityDay(null)} aria-label="Close day details"
                className="grid h-6 w-6 place-items-center rounded-md border-none cursor-pointer"
                style={{ background: "rgba(30,58,95,0.06)" }}>
                <X size={12} color={MUTED} />
              </button>
            </div>
            {selected.presentIds.length === 0 && selected.absentIds.length === 0 && selected.offIds.length === 0 && selected.extra === 0 ? (
              <p className="mt-1.5" style={{ fontSize: 12, color: MUTED }}>No classes scheduled this day.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {selected.offIds.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      You were off — {selected.offIds.length} client(s) missed class
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selected.offIds.map((id) => (
                        <span key={id} className="rounded-full px-2 py-0.5" style={{ background: RED_LIGHT, color: RED, fontSize: 11, fontWeight: 600 }}>
                          {nameOf(id)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selected.presentIds.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {selected.date > today ? "Scheduled" : "Attended"} ({selected.presentIds.length})
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selected.presentIds.map((id) => (
                        <span key={id} className="rounded-full px-2 py-0.5" style={{ background: GREEN_LIGHT, color: GREEN, fontSize: 11, fontWeight: 600 }}>
                          {nameOf(id)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selected.absentIds.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10.5, fontWeight: 700, color: "#c2570a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Absent — on pause ({selected.absentIds.length})
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selected.absentIds.map((id) => (
                        <span key={id} className="rounded-full px-2 py-0.5" style={{ background: "rgba(249,115,22,0.12)", color: "#c2570a", fontSize: 11, fontWeight: 600 }}>
                          {nameOf(id)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selected.extra > 0 && (
                  <p style={{ fontSize: 11.5, color: "#a07010", fontWeight: 600 }}>
                    ★ {selected.extra} extra (make-up) class(es) recorded this day
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3" style={{ fontSize: 10.5, color: MUTED }}>
          <span className="inline-flex items-center gap-1"><span className="rounded" style={{ width: 10, height: 10, background: GREEN_LIGHT, border: `1px solid ${GREEN}` }} /> Class taken</span>
          <span className="inline-flex items-center gap-1"><span className="rounded" style={{ width: 10, height: 10, background: RED_LIGHT, border: `1px solid ${RED}` }} /> Off-day missed</span>
          <span className="inline-flex items-center gap-1"><span className="rounded-full" style={{ width: 8, height: 8, background: GOLD }} /> Extra class</span>
          <span className="inline-flex items-center gap-1"><span className="rounded-full" style={{ width: 8, height: 8, background: "#f97316" }} /> Client absent</span>
          <span className="inline-flex items-center gap-1"><span className="rounded" style={{ width: 10, height: 10, background: "rgba(30,58,95,0.08)" }} /> Upcoming</span>
        </div>
        <p className="mt-2" style={{ fontSize: 11.5, color: MUTED }}>
          {heldTotal} class(es) taken{missedTotal > 0 ? ` · ${missedTotal} missed to off-days` : ""}{absentTotal > 0 ? ` · ${absentTotal} client absence(s)` : ""} in {monthLabel(calMonth)} — tap a day for details
        </p>
      </div>
    );
  };

  const SocietiesList = () => (
    <div>
      {societies.length === 0 ? (
        <div className="mx-4 rounded-[20px] p-5 text-center"
          style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
          <Building2 size={32} color={MUTED} className="mx-auto mb-2" />
          <p style={{ color: MUTED, fontSize: 13 }}>No societies assigned yet.</p>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
            Ask your admin to link you to a society.
          </p>
        </div>
      ) : (
        <div className="mx-4 space-y-3">
          {societies.map((s) => {
            const batches = batchMap[s.id] ?? [];
            const totalClients = batches.reduce((sum, b) => sum + b.client_count, 0);
            return (
              <button
                key={s.id}
                onClick={() => setSelectedSociety(s)}
                className="w-full text-left rounded-[20px] p-4 cursor-pointer"
                style={{ background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 2px 8px rgba(30,58,95,0.05)" }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="rounded-xl flex items-center justify-center"
                        style={{ width: 36, height: 36, background: "rgba(30,58,95,0.06)", flexShrink: 0 }}>
                        <Building2 size={18} color={NAVY} />
                      </div>
                      <div>
                        <p className="font-semibold" style={{ fontSize: 15, color: NAVY }}>{s.name}</p>
                        {s.address && <p style={{ fontSize: 11, color: MUTED }}>{s.address}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-11">
                      {batches.length === 0
                        ? <span style={{ fontSize: 12, color: MUTED }}>No batches yet</span>
                        : batches.map((b) => (
                          <span key={b.time_slot}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                            style={{ background: "rgba(240,167,32,0.12)", fontSize: 11, color: "#a07010" }}>
                            <Clock size={10} /> {b.time_slot} · {b.client_count} clients
                          </span>
                        ))
                      }
                    </div>
                    {/* Only show admin-defined slots that aren't already listed as a batch above */}
                    {slotsForSociety(s.id).filter((slot) => !batches.some((b) => b.time_slot === slot)).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 ml-11">
                        <span style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
                          Your slots
                        </span>
                        {slotsForSociety(s.id).filter((slot) => !batches.some((b) => b.time_slot === slot)).map((slot) => (
                          <span key={slot}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                            style={{ background: "rgba(30,58,95,0.07)", fontSize: 11, color: NAVY, fontWeight: 600 }}>
                            <Clock size={10} /> {slot}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                    <span className="rounded-full font-bold"
                      style={{ fontSize: 11, background: GREEN_LIGHT, color: GREEN, padding: "3px 10px" }}>
                      {totalClients} clients
                    </span>
                    <ChevronRight size={16} color={MUTED} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const ClientList = ({ society }: { society: SocietyRow }) => (
    <div>
      <button
        onClick={() => setSelectedSociety(null)}
        className="flex items-center gap-2 mx-4 mb-4 cursor-pointer border-none bg-transparent"
        style={{ color: NAVY, fontSize: 14, fontWeight: 600 }}
      >
        <ArrowLeft size={18} /> Back to societies
      </button>

      <div className="mx-4 rounded-[20px] overflow-hidden"
        style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
        <div className="p-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2">
            <Building2 size={18} color={NAVY} />
            <p className="font-bold" style={{ fontSize: 15, color: NAVY }}>{society.name}</p>
          </div>
          <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            {clients.length} clients · {Object.keys(clientsBySlot).length} slots
          </p>
        </div>

        {clientsLoading ? (
          <div className="p-6 text-center" style={{ color: MUTED, fontSize: 13 }}>Loading clients…</div>
        ) : clients.length === 0 ? (
          <div className="p-6 text-center" style={{ color: MUTED, fontSize: 13 }}>No clients in this society yet.</div>
        ) : (
          Object.entries(clientsBySlot).map(([slot, slotClients]) => (
            <div key={slot}>
              <div className="px-4 py-2 flex items-center gap-2"
                style={{ background: "rgba(30,58,95,0.03)", borderBottom: `1px solid ${BORDER}` }}>
                <Clock size={12} color={MUTED} />
                <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {slot}
                </span>
                {(() => {
                  // Every client in a batch trains on the same days, so show
                  // them once here instead of repeating them per person.
                  const days = slotClients.find((c) => c.training_days?.length)?.training_days ?? [];
                  // Week order, not whatever order they were stored in.
                  return days.length ? (
                    <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>
                      · {sortDays(days).map((d: string) => d.slice(0, 3)).join(" · ")}
                    </span>
                  ) : null;
                })()}
                <span className="ml-auto rounded-full"
                  style={{ fontSize: 10, background: GREEN_LIGHT, color: GREEN, padding: "2px 8px", fontWeight: 600 }}>
                  {slotClients.length}
                </span>
              </div>
              {slotClients.map((c, i) => (
                <div key={c.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < slotClients.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <div className="rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ width: 36, height: 36, background: "rgba(30,58,95,0.07)" }}>
                    <UserCircle2 size={18} color={NAVY} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate" style={{ fontSize: 14, color: NAVY }}>
                        {c.name ?? "Unnamed"}
                      </p>
                      {c.is_paused_today && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-600">
                          Paused Today
                        </span>
                      )}
                    </div>
                    {c.phone && (
                      <p style={{ fontSize: 12, color: MUTED }}>{c.phone}</p>
                    )}
                    {(() => {
                      // Plan state, so a client whose plan has ended is still
                      // listed and labelled rather than looking plan-less.
                      const state = (c as any).plan_state
                        ?? (c.end_date ? (c.end_date >= new Date().toISOString().slice(0, 10) ? "active" : "expired") : "none");
                      const pill = state === "active"
                        ? ["Active", "#1b7a43", "rgba(27,122,67,0.10)"]
                        : state === "expired"
                          ? ["Plan ended", "#b07d10", "rgba(176,125,16,0.12)"]
                          : ["No plan", MUTED, "rgba(30,58,95,0.06)"];
                      return (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ color: pill[1], background: pill[2] }}>{pill[0]}</span>
                          {c.end_date && (
                            <span className="text-[11px]" style={{ color: MUTED }}>
                              {state === "expired" ? "Ended" : "Ends"}{" "}
                              {new Date(c.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setPauseClient({ id: c.id, name: c.name ?? "Client" })}
                      className="grid place-items-center rounded-full border-none cursor-pointer"
                      style={{ width: 32, height: 32, background: "rgba(240, 167, 32, 0.15)", color: "#f0a720" }}
                      title="Pause Classes"
                    >
                      <CalendarOff size={14} />
                    </button>
                    {c.phone && (
                      <>
                        <a href={phoneLinks(c.phone).tel}
                          className="grid place-items-center rounded-full"
                          style={{ width: 32, height: 32, background: "rgba(30,58,95,0.07)" }}>
                          <PhoneIcon size={14} color={NAVY} />
                        </a>
                        <a href={phoneLinks(c.phone).wa} target="_blank" rel="noopener noreferrer"
                          className="grid place-items-center rounded-full"
                          style={{ width: 32, height: 32, background: GREEN_LIGHT }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={GREEN}>
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const OffTimeForm = () => (
    <div className="mx-4 space-y-3">
      {/* Mode toggle */}
      <div className="rounded-[20px] p-4"
        style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
        <p className="font-bold mb-3" style={{ fontSize: 14, color: NAVY }}>Mark unavailability</p>

        <div className="flex rounded-xl overflow-hidden mb-4"
          style={{ border: `1px solid ${BORDER}`, background: "rgba(30,58,95,0.03)" }}>
          {([["days", "Full day(s)"], ["slot", "Single slot"]] as [OffMode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => setOffMode(m)}
              className="flex-1 py-2 text-sm font-semibold transition-all border-none cursor-pointer"
              style={{
                background: offMode === m ? NAVY : "transparent",
                color: offMode === m ? "#fff" : MUTED,
                borderRadius: 10,
              }}>
              {label}
            </button>
          ))}
        </div>

        {offMode === "days" ? (
          <>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
              All your slots will be marked off for this date range.
            </p>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left border-none cursor-pointer"
                  style={{
                    background: "#f8fafd",
                    border: `2px solid ${dateRange?.from ? NAVY : "#c8d4e3"}`,
                    fontSize: 13,
                    color: dateRange?.from ? NAVY : MUTED,
                    fontWeight: dateRange?.from ? 600 : 400,
                  }}>
                  <CalendarIcon size={15} color={NAVY} style={{ opacity: 0.7, flexShrink: 0 }} />
                  {dateRange?.from
                    ? dateRange.to
                      ? `${format(dateRange.from, "PP")} → ${format(dateRange.to, "PP")}`
                      : format(dateRange.from, "PP")
                    : "Select date range"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="range" selected={dateRange} onSelect={setDateRange}
                  numberOfMonths={1} initialFocus
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
              Only the specific slot on this date will be marked off.
            </p>
            <Popover open={singleCalOpen} onOpenChange={setSingleCalOpen}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left border-none cursor-pointer mb-3"
                  style={{
                    background: "#f8fafd",
                    border: `2px solid ${singleDate ? NAVY : "#c8d4e3"}`,
                    fontSize: 13,
                    color: singleDate ? NAVY : MUTED,
                    fontWeight: singleDate ? 600 : 400,
                  }}>
                  <CalendarIcon size={15} color={NAVY} style={{ opacity: 0.7, flexShrink: 0 }} />
                  {singleDate ? format(singleDate, "PPP") : "Select date"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" avoidCollisions={false}>
                <Calendar mode="single" selected={singleDate}
                  onSelect={(d) => { setSingleDate(d); setSingleCalOpen(false); }}
                  initialFocus numberOfMonths={1}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            {uniqueSlotOptions.length > 0 ? (
              <Select value={slotInput || undefined} onValueChange={setSlotInput}>
                <SelectTrigger className="w-full rounded-xl h-11"
                  style={{ border: `2px solid ${slotInput ? NAVY : "#c8d4e3"}`, background: "#f8fafd", color: slotInput ? NAVY : MUTED }}>
                  <SelectValue placeholder="Select your slot" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueSlotOptions.map((slot) => (
                    <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <input
                value={slotInput}
                onChange={(e) => setSlotInput(e.target.value)}
                placeholder="Time slot e.g. 6–7 AM"
                className="w-full rounded-xl px-3 py-2.5 text-sm"
                style={{
                  border: `2px solid ${slotInput ? NAVY : "#c8d4e3"}`,
                  background: "#f8fafd",
                  outline: "none",
                  color: NAVY,
                }}
              />
            )}
          </>
        )}

        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full rounded-xl px-3 py-2.5 text-sm mt-3"
          style={{
            border: "2px solid #c8d4e3",
            background: "#f8fafd",
            outline: "none",
            color: NAVY,
          }}
        />

        <button
          onClick={() => addOff.mutate()}
          disabled={addOff.isPending || isViewAs}
          className="mt-3 w-full rounded-2xl border-none cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: NAVY, padding: "13px", fontSize: 14, fontWeight: 700, color: "#fff" }}>
          <Plus size={16} /> {addOff.isPending ? "Saving…" : isViewAs ? "Read only" : "Save off time"}
        </button>
      </div>


      {/* Upcoming off times list */}
      {offTimes.length > 0 && (
        <div className="rounded-[20px] p-4"
          style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
          <p className="font-semibold mb-3" style={{ fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Upcoming off times
          </p>
          <ul className="space-y-0">
            {offTimes.map((o, i) => {
              const isSameDay = o.from_date === o.to_date;
              return (
                <li key={o.id}
                  className="flex items-start justify-between py-3"
                  style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ fontSize: 13, color: NAVY }}>
                      {isSameDay
                        ? format(new Date(o.from_date + "T12:00:00"), "PP")
                        : `${format(new Date(o.from_date + "T12:00:00"), "PP")} → ${format(new Date(o.to_date + "T12:00:00"), "PP")}`
                      }
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {o.time_slot
                        ? <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#a07010" }}>
                            <Clock size={10} /> {o.time_slot}
                          </span>
                        : <span className="text-xs" style={{ color: MUTED }}>All slots</span>
                      }
                      {o.reason && (
                        <span className="text-xs truncate" style={{ color: MUTED }}>· {o.reason}</span>
                      )}
                    </div>
                  </div>
                  {!isViewAs && (
                    o.from_date > today ? (
                      <button
                        onClick={() => removeOff.mutate(o.id)}
                        className="ml-2 flex-shrink-0 border-none bg-transparent cursor-pointer p-1 rounded-lg"
                        style={{ color: RED }}
                        title="Remove off-time"
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : (
                      <span
                        className="ml-2 flex-shrink-0 p-1 rounded-lg cursor-default"
                        style={{ color: MUTED }}
                        title="Off-time has started — contact admin to remove"
                      >
                        <Lock size={13} />
                      </span>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <MakeupSection />
    </div>
  );

  // Extra (make-up) class recorder — shared by mobile Off Time tab and the
  // desktop Off Time column. Trainers can only ADD; admin edits/removes from
  // Admin → Trainers → Off-Days.
  const MakeupSection = () => (
    <div className="rounded-[20px] p-4"
      style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
      <p className="font-bold" style={{ fontSize: 14, color: NAVY }}>Extra class taken</p>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 12 }}>
        Took an extra class to make up for an off-day? Record it — every client in that
        batch gets one bonus class marked as compensated.
      </p>

      <div className="space-y-3">
        <input
          type="date"
          value={mkDate}
          min={today}
          onChange={(e) => setMkDate(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm"
          style={{ border: `2px solid ${mkDate ? NAVY : "#c8d4e3"}`, background: "#f8fafd", outline: "none", color: NAVY }}
          aria-label="Extra class date"
        />

        <Select value={mkSocietyId || undefined} onValueChange={(v) => { setMkSocietyId(v); setMkSlot(""); }}>
          <SelectTrigger className="w-full rounded-xl h-11"
            style={{ border: `2px solid ${mkSocietyId ? NAVY : "#c8d4e3"}`, background: "#f8fafd", color: mkSocietyId ? NAVY : MUTED }}>
            <SelectValue placeholder="Which society?" />
          </SelectTrigger>
          <SelectContent>
            {societies.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mkSlot || "all"} onValueChange={(v) => setMkSlot(v === "all" ? "" : v)} disabled={!mkSocietyId}>
          <SelectTrigger className="w-full rounded-xl h-11"
            style={{ border: "2px solid #c8d4e3", background: "#f8fafd", color: mkSlot ? NAVY : MUTED }}>
            <SelectValue placeholder="All slots" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All slots in society</SelectItem>
            {makeupSlotOptions.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          value={mkNote}
          onChange={(e) => setMkNote(e.target.value)}
          placeholder="Note (optional) — e.g. make-up for 12 Jul"
          className="w-full rounded-xl px-3 py-2.5 text-sm"
          style={{ border: "2px solid #c8d4e3", background: "#f8fafd", outline: "none", color: NAVY }}
        />

        {mkSocietyId && (
          <p style={{ fontSize: 12, color: MUTED }}>
            Will credit <span style={{ fontWeight: 700, color: NAVY }}>{makeupTargets.length}</span> client(s)
            {mkSlot ? ` in ${mkSlot}` : ""}.
          </p>
        )}

        <button
          onClick={() => addMakeup.mutate()}
          disabled={addMakeup.isPending || isViewAs || !mkDate || !mkSocietyId || makeupTargets.length === 0}
          className="w-full rounded-2xl border-none cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: GOLD, padding: "13px", fontSize: 14, fontWeight: 700, color: "#5a3c05" }}>
          <Plus size={16} /> {addMakeup.isPending ? "Saving…" : isViewAs ? "Read only" : "Record extra class"}
        </button>
      </div>

      {myMakeups.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <p className="font-semibold mb-2" style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Recently recorded
          </p>
          <ul>
            {myMakeups.slice(0, 8).map((m, i) => (
              <li key={m.id} className="flex items-center justify-between py-2"
                style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
                <div className="min-w-0">
                  <p className="font-medium" style={{ fontSize: 13, color: NAVY }}>
                    {format(new Date(m.class_date + "T12:00:00"), "PP")}
                  </p>
                  <p className="truncate" style={{ fontSize: 11, color: MUTED }}>
                    {clientName(m.client_id)}{m.notes ? ` · ${m.notes}` : ""}
                  </p>
                </div>
                <span className="rounded-full flex-shrink-0"
                  style={{ fontSize: 10, fontWeight: 700, color: "#a07010", background: "rgba(240,167,32,0.15)", padding: "2px 8px" }}>
                  −1 bonus
                </span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
            Need to change one? Ask your admin.
          </p>
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mandatory profile-completion gate — blocks until every filterable
          field is filled so the trainer can actually be found in search. */}
      {!isViewAs && profileComplete === false && !gateDone && (
        <TrainerCompleteProfileDialog
          open
          trainerId={trainer.id}
          contact={trainer.contact ?? null}
          onSignOut={() => signOut()}
          onCompleted={() => setGateDone(true)}
        />
      )}

      {/* Admin view-as banner */}
      {isViewAs && (
        <div className="flex items-center gap-2 px-4 py-2.5"
          style={{ background: "rgba(240,167,32,0.15)", borderBottom: "1px solid rgba(240,167,32,0.3)" }}>
          <Eye size={15} color="#a07010" />
          <p style={{ fontSize: 13, color: "#a07010", fontWeight: 600 }}>
            Viewing as {trainer.name} — read only
          </p>
        </div>
      )}

      {/* Pending-verification banner */}
      {isPending && (
        <div className="flex items-start gap-3 px-4 sm:px-6 py-3"
          style={{ background: "rgba(240,167,32,0.12)", borderBottom: "1px solid rgba(240,167,32,0.35)" }}>
          <ShieldAlert size={18} color="#a07010" className="mt-0.5 shrink-0" />
          <p style={{ fontSize: 13, color: "#8a5e0a", lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700 }}>Your account is pending admin verification.</span>{" "}
            You can look around now — assigning clients and recording classes unlocks once an admin approves you.
          </p>
        </div>
      )}

      {/* Google-only trainers: set a password without leaving the dashboard */}
      {needsPassword && (
        <div className="mx-4 md:mx-6 mt-4 rounded-2xl border bg-white p-4"
          style={{ borderColor: "rgba(30,58,95,0.25)", boxShadow: "0 2px 10px rgba(30,58,95,0.06)" }}>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(30,58,95,0.08)" }}>
              <Lock size={16} color={NAVY} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: NAVY }}>Set a password for your account</p>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                You signed in with Google. Add a password so you can also log in with {trainer.email} directly.
              </p>
              <form
                onSubmit={(e) => { e.preventDefault(); savePassword.mutate(); }}
                className="mt-2.5 flex flex-col sm:flex-row gap-2"
              >
                <Input type="password" autoComplete="new-password" placeholder="New password (6+ chars)"
                  value={pwInput} onChange={(e) => setPwInput(e.target.value)} className="h-9 text-sm" />
                <Input type="password" autoComplete="new-password" placeholder="Confirm password"
                  value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} className="h-9 text-sm" />
                <Button type="submit" size="sm" className="h-9 shrink-0"
                  disabled={savePassword.isPending || pwInput.length < 6 || pwInput !== pwConfirm}>
                  {savePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save password"}
                </Button>
              </form>
              {pwInput && pwConfirm && pwInput !== pwConfirm && (
                <p className="mt-1 text-xs" style={{ color: RED }}>Passwords don't match yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profile completion: block the dashboard until a phone number is set */}
      <Dialog open={needsPhone && !phoneSaved} onOpenChange={() => { /* required — can't dismiss */ }}>
        <DialogContent className="sm:max-w-sm [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mx-auto mb-1 grid place-items-center rounded-full" style={{ width: 52, height: 52, background: "rgba(30,58,95,0.08)" }}>
              <PhoneIcon size={22} color={NAVY} />
            </div>
            <DialogTitle className="text-center">Complete your profile</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            Please enter your 10-digit mobile number so your clients and admin can reach you.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); savePhone.mutate(); }}
            className="mt-2 space-y-3"
          >
            <Input
              type="tel"
              inputMode="numeric"
              autoFocus
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile number"
              className="text-center text-lg tracking-wide"
            />
            <Button type="submit" className="w-full h-11" disabled={savePhone.isPending || phoneInput.replace(/\D/g, "").length !== 10}>
              {savePhone.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save & continue"}
            </Button>
            <button type="button" onClick={() => signOut()} className="w-full text-xs text-muted-foreground hover:underline">
              Sign out instead
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Mobile Layout ──────────────────────────────────────────── */}
      <div className="md:hidden" style={{ background: BG, minHeight: "100%" }}>

        {/* Hero */}
        <div style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_LIGHT} 100%)`,
          padding: "12px 16px 14px",
        }}>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>{greeting}</p>
          <h2 className="font-display" style={{ fontSize: 20, fontWeight: 600, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {firstName}
          </h2>
          {trainer?.specialization && (
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 }}>
              {trainer.specialization}
            </p>
          )}
        </div>

        {/* One scrolling page, same order as desktop. The old My Societies /
            Off Time tabs sat above the mode board, so switching them changed
            content far below the fold and looked like nothing happened. */}
        {tabView === "availability" ? (
          /* Own tab: marking off-days and recording make-up classes are
             occasional admin jobs, not part of the daily view. */
          <div className="mt-4">
            <p className="mx-4 mb-2 font-display text-lg" style={{ color: NAVY }}>Availability</p>
            <OffTimeForm />
          </div>
        ) : selectedSociety ? (
          <ClientList society={selectedSociety} />
        ) : (
          <>
            <div className="px-3 pt-3 pb-1">
              <ServiceModeBoard
                trainerId={trainer?.id}
                mode={mode}
                onModeChange={setMode}
                onOpenGroup={(g) => {
                  const soc = societies.find((x) => x.id === g.society_id);
                  if (soc) setSelectedSociety(soc);
                }}
              />
            </div>
            {!isViewAs && <div className="mx-4 mt-4"><TrainerPauses /></div>}
            <MarketingFeed className="mx-4 mt-4" />
          </>
        )}

        {/* bottom padding for nav */}
        <div style={{ height: 24 }} />
      </div>

      {/* ── Desktop Layout ─────────────────────────────────────────── */}
      <div className="mx-auto hidden w-full max-w-5xl space-y-6 md:block">
        {/* Header */}
        <header>
          <h1 className="font-display text-3xl text-foreground">
            {greeting}, {firstName} 👋
          </h1>
          {trainer?.specialization && (
            <p className="mt-1 text-muted-foreground">{trainer.specialization}</p>
          )}
        </header>

        {tabView === "dashboard" && (
          <ServiceModeBoard trainerId={trainer?.id} mode={mode} onModeChange={setMode} />
        )}


        {/* Online roster — only for the online tracks. */}
        {isOnlineMode(mode) && <OnlineClients trainerId={trainer?.id ?? null} />}

        {/* Batches / clients, then availability — stacked so the calendar
            above stays the primary surface. */}
        <div className="space-y-6">
          {/* My batches — societies are an OFFLINE concept only. */}
          
          {/* Availability + make-up classes: their own tab, not the daily view. */}
          {tabView === "availability" && (
          <div className="space-y-4">
            <h2 className="font-display text-xl">Availability</h2>

            {/* Form card */}
            <div className="rounded-2xl p-5"
              style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
              <p className="text-sm font-medium mb-4">Mark unavailability</p>

              {/* Mode toggle */}
              <div className="flex rounded-xl overflow-hidden mb-4"
                style={{ border: `1px solid ${BORDER}` }}>
                {([["days", "Full day(s)"], ["slot", "Single slot"]] as [OffMode, string][]).map(([m, label]) => (
                  <button key={m} onClick={() => setOffMode(m)}
                    className="flex-1 py-2 text-sm font-medium border-none cursor-pointer"
                    style={{ background: offMode === m ? NAVY : "transparent", color: offMode === m ? "#fff" : MUTED }}>
                    {label}
                  </button>
                ))}
              </div>

              {offMode === "days" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">All slots will be off for this date range.</p>
                  <Popover open={calOpenD} onOpenChange={setCalOpenD}>
                    <PopoverTrigger asChild>
                      <Button variant="outline"
                        className={cn("w-full justify-start text-left font-normal h-10", !dateRange?.from && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from
                          ? dateRange.to ? `${format(dateRange.from, "PP")} → ${format(dateRange.to, "PP")}` : format(dateRange.from, "PP")
                          : "Select date range"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="range" selected={dateRange} onSelect={setDateRange}
                        numberOfMonths={2} initialFocus
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Only this specific slot on this date will be off.</p>
                  <Popover open={singleCalOpenD} onOpenChange={setSingleCalOpenD}>
                    <PopoverTrigger asChild>
                      <Button variant="outline"
                        className={cn("w-full justify-start text-left font-normal h-10", !singleDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {singleDate ? format(singleDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" avoidCollisions={false}>
                      <Calendar mode="single" selected={singleDate}
                        onSelect={(d) => { setSingleDate(d); setSingleCalOpenD(false); }}
                        initialFocus numberOfMonths={1}
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                  {uniqueSlotOptions.length > 0 ? (
                    <Select value={slotInput || undefined} onValueChange={setSlotInput}>
                      <SelectTrigger><SelectValue placeholder="Select your slot" /></SelectTrigger>
                      <SelectContent>
                        {uniqueSlotOptions.map((slot) => (
                          <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <input value={slotInput} onChange={(e) => setSlotInput(e.target.value)}
                      placeholder="Time slot e.g. 6–7 AM"
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
                  )}
                </div>
              )}

              <input value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary mt-3" />

              <Button onClick={() => addOff.mutate()} disabled={addOff.isPending || isViewAs} className="w-full mt-4">
                <Plus className="mr-2 h-4 w-4" />
                {addOff.isPending ? "Saving…" : isViewAs ? "Read only" : "Save off time"}
              </Button>
            </div>

            {/* Upcoming list */}
            {offTimes.length > 0 && (
              <div className="rounded-2xl p-5"
                style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Upcoming off times
                </p>
                <ul className="divide-y divide-border">
                  {offTimes.map((o) => {
                    const isSameDay = o.from_date === o.to_date;
                    return (
                      <li key={o.id} className="flex items-start justify-between py-3">
                        <div>
                          <p className="font-medium text-sm">
                            {isSameDay
                              ? format(new Date(o.from_date + "T12:00:00"), "PPP")
                              : `${format(new Date(o.from_date + "T12:00:00"), "PP")} → ${format(new Date(o.to_date + "T12:00:00"), "PP")}`
                            }
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {o.time_slot
                              ? <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock size={10} /> {o.time_slot}
                                </span>
                              : <span className="text-xs text-muted-foreground">All slots</span>
                            }
                            {o.reason && <span className="text-xs text-muted-foreground">· {o.reason}</span>}
                          </div>
                        </div>
                        {!isViewAs && (
                          o.from_date > today ? (
                            <Button variant="ghost" size="sm"
                              onClick={() => removeOff.mutate(o.id)}
                              className="text-destructive hover:text-destructive h-8 w-8 p-0"
                              title="Remove off-time">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground cursor-default"
                              title="Off-time has started — contact admin to remove">
                              <Lock className="h-4 w-4" />
                            </span>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <MakeupSection />
          </div>
          )}
        </div>

        {tabView === "dashboard" && !isViewAs && <TrainerPauses />}
        {tabView === "dashboard" && <MarketingFeed />}
      </div>

      <TrainerClientPauseModal
        open={!!pauseClient}
        onOpenChange={(open) => !open && setPauseClient(null)}
        clientId={pauseClient?.id ?? ""}
        clientName={pauseClient?.name ?? ""}
      />
    </>
  );
}
