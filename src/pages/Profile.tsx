import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Mail, MapPin, Phone, Clock, UserRound, Pencil, ChevronDown, Receipt } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import TrainerProfile from "./TrainerProfile";
import { ClassModeCard } from "@/components/dashboard/ClassModeCard";
import { useIsOnlineCustomer } from "@/hooks/useIsOnlineCustomer";
import { deriveSubscriptionStatus, isPaid } from "@/lib/subscription";
import { useCurrentPlan } from "@/hooks/useCurrentPlan";

const GOLD       = "#f0a720";
const GOLD_LIGHT = "#fef3d0";
const NAVY       = "#1E3A5F";
const MUTED      = "#8a8f9e";
const BORDER     = "rgba(30,58,95,0.08)";

export default function Profile() {
  const { user, role } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName]         = useState("");
  const [phone, setPhone]       = useState("");
  const [email, setEmail]       = useState("");
  const [society, setSociety]   = useState("");
  const [societyId, setSocietyId] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  // Society/time-slot are offline concepts; online customers train from home.
  const { isOnline: isOnlineCustomer } = useIsOnlineCustomer();

  // profiles.trainer_id references trainers.id — look the name up there.
  const { data: trainer } = useQuery({
    queryKey: ["trainer", profile?.trainer_id],
    enabled: !!profile?.trainer_id,
    queryFn: async () => {
      const { data } = await supabase.from("trainers").select("name").eq("id", profile!.trainer_id!).maybeSingle();
      return data;
    },
  });

  /**
   * An online customer's trainer and schedule.
   *
   * This read `booking_requests` only. That table belongs to the older
   * self-service flow; buying through the payment gateway creates a `plans`
   * row carrying the batch and writes no booking — so a customer who had paid,
   * been placed in a batch and had a trainer still saw "Schedule —" and
   * "Trainer: Not assigned". The subscription is the source of truth, so the
   * batch on it answers first; a booking row is the fallback for customers
   * who came through the older flow.
   */
  const { data: onlineBooking } = useQuery({
    queryKey: ["profile-online-booking", user?.id],
    enabled: !!user && isOnlineCustomer,
    queryFn: async () => {
      const { data: plan } = await (supabase as any)
        .from("plans")
        .select("batch_id, trainer_id, payment_status, status, created_at")
        .eq("user_id", user!.id).eq("training_mode", "online")
        .order("created_at", { ascending: false });
      // Never bought = nothing to show.
      const live = ((plan ?? []) as any[]).find(
        (p) => p.payment_status == null || p.payment_status === "success",
      );
      if (live?.batch_id) {
        const { data: b } = await (supabase as any)
          .from("online_batches").select("trainer_id, start_time, end_time")
          .eq("id", live.batch_id).maybeSingle();
        if (b) {
          return {
            trainer_id: live.trainer_id ?? b.trainer_id ?? null,
            preferred_time: b.start_time && b.end_time ? `${b.start_time} – ${b.end_time}` : null,
            training_type: null,
          };
        }
      }

      const { data } = await (supabase as any)
        .from("booking_requests")
        .select("trainer_id, preferred_time, training_type")
        .eq("user_id", user!.id).eq("training_mode", "online")
        .in("status", ["pending_trainer_assignment", "trainer_assigned", "training_ongoing"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
  });

  const { data: onlineTrainer } = useQuery({
    queryKey: ["profile-online-trainer", onlineBooking?.trainer_id],
    enabled: !!onlineBooking?.trainer_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainers").select("name").eq("id", onlineBooking.trainer_id).maybeSingle();
      return data ?? null;
    },
  });

  // Fetch societies list for dropdown
  // Online training happens over a video call — there is no society, so the
  // field is not merely empty for those customers, it does not apply.
  const showSociety = !isOnlineCustomer;

  const { data: societiesList = [] } = useQuery({
    queryKey: ["profile-societies-list"],
    queryFn: async () => {
      const { data } = await supabase.from("societies").select("id, name").order("name");
      return data ?? [];
    },
  });

  // Fetch active plan to restrict society changes
  // One definition of "your plan" — an abandoned checkout is not one.
  const { data: activePlan } = useCurrentPlan(user?.id);

  const hasActivePlan = deriveSubscriptionStatus(activePlan) === "active";

  // Trainers get their own profile view (no society/plan/trainer fields)
  if (role === "trainer") return <TrainerProfile />;

  const openDialog = () => {
    setName(profile?.name ?? "");
    setPhone(profile?.phone ?? "");
    setEmail((profile as any)?.email ?? "");
    setSociety(profile?.society ?? "");
    setSocietyId(profile?.society_id ?? "");
    setTimeSlot(profile?.time_slot ?? "");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (role === "admin") {
      const { error } = await supabase.from("admins")
        .update({ name, phone }).eq("id", user.id);
      if (error) { toast.error(error.message); return; }
    } else {
      // A client may change only their email. Society, time slot, trainer and
      // name all follow from the plan they bought and the admin's assignment,
      // so the form no longer offers them and the write no longer sends them.
      const { error } = await supabase.from("profiles")
        .update({ email: email || null })
        .eq("id", user.id);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    setOpen(false);
  };

  const displayName = profile?.name ?? user?.email?.split("@")[0] ?? "";
  const initials    = displayName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "U";
  const trainerInitials = (trainer?.name ?? "").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const infoRows = [
    ...(isOnlineCustomer
      ? [{ icon: Clock, label: "Schedule", value: onlineBooking?.preferred_time || profile?.time_slot || "—" }]
      : [
          { icon: MapPin, label: "Society",   value: profile?.society   || "—" },
          { icon: Clock,  label: "Time slot", value: profile?.time_slot || "—" },
        ]),
    { icon: UserRound, label: "Trainer",   value: (isOnlineCustomer ? (onlineTrainer?.name ?? trainer?.name) : trainer?.name) || "Not assigned" },
    { icon: Phone,     label: "Phone",     value: profile?.phone     || "—" },
    { icon: Mail,      label: "Email",     value: (profile as any)?.email || "—" },
  ];

  return (
    <>
      {/* ── Mobile Layout ──────────────────────────────────────────── */}
      <div className="md:hidden" style={{ background: "#f4f2ee", minHeight: "100%" }}>

        {/* Page header */}
        <div style={{ padding: "8px 20px 16px" }}>
          <p style={{ color: MUTED, fontSize: 13 }}>Account details</p>
          <h2 className="font-display" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: NAVY }}>
            Profile
          </h2>
        </div>

        {/* Profile card */}
        <div className="mx-4 mb-4 rounded-3xl p-6"
          style={{ background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 4px 16px rgba(30,58,95,0.07)" }}>

          {/* Avatar + name */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{ width: 64, height: 64, background: GOLD_LIGHT, border: `2px solid ${GOLD}` }}>
              <span className="font-display font-bold" style={{ fontSize: 24, color: GOLD }}>{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="font-bold truncate" style={{ fontSize: 19, color: NAVY }}>
                {displayName || (isLoading ? "Loading…" : "Add your name")}
              </p>
              <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{profile?.email ?? user?.email}</p>
            </div>
          </div>

          {/* Info rows */}
          {infoRows.map(({ icon: Icon, label, value }, i) => (
            <div key={label}>
              {i > 0 && <div style={{ height: 1, background: BORDER, margin: "0 0 12px" }} />}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{ width: 32, height: 32, background: "#f4f2ee" }}>
                  <Icon size={14} color={MUTED} />
                </div>
                <div>
                  <p className="uppercase" style={{ fontSize: 11, color: MUTED, letterSpacing: "0.06em" }}>{label}</p>
                  <p className="font-semibold" style={{ fontSize: 14, color: NAVY, marginTop: 1 }}>{value}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Edit button */}
          <div style={{ marginTop: 4, borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button
                  onClick={openDialog}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border-none cursor-pointer"
                  style={{ background: NAVY, padding: "12px", fontSize: 14, fontWeight: 700, color: "#fff" }}
                >
                  <Pencil size={15} color="#fff" /> Edit profile
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit profile</DialogTitle>
                  <DialogDescription>Update your contact details.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" value={name} disabled={role !== "admin"} onChange={(e) => setName(e.target.value)} />
                    {role !== "admin" && <p className="text-[11px] text-muted-foreground">Name cannot be changed.</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={phone} disabled={role !== "admin"} onChange={(e) => setPhone(e.target.value)} />
                    {role !== "admin" && <p className="text-[11px] text-muted-foreground">Phone number cannot be changed.</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
                    <p className="text-[11px] text-muted-foreground">Visible to your trainer and admin.</p>
                  </div>
                  {/* Society is not the customer's to choose: it comes from the
                      plan they buy and the admin's assignment. Online training
                      has no society at all, so the field is absent there
                      entirely rather than shown empty. */}
                  {showSociety && (
                    <div className="space-y-2">
                      <Label>Society</Label>
                      <Input value={profile?.society ?? "Set when your plan starts"} disabled />
                      <p className="text-[11px] text-muted-foreground">Set by your plan — ask your admin to change it.</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="time">Time slot</Label>
                    <Input id="time" value={timeSlot} disabled={role === "client"} onChange={(e) => setTimeSlot(e.target.value)} placeholder="e.g. 7:30 – 8:30 AM" />
                    {role === "client" && <p className="text-[11px] text-muted-foreground">Time slot is set by your trainer or admin.</p>}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={handleSave}>Save changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Class mode + switch request */}
        {role === "client" && user && (
          <div className="mx-4 mb-4">
            <ClassModeCard userId={user.id} profile={profile} />
          </div>
        )}

        {/* Payment history — tucked away, collapsed by default */}
        {role === "client" && user && (
          <div className="mx-4 mb-4">
            <PaymentHistory userId={user.id} />
          </div>
        )}
      </div>

      {/* ── Desktop Layout (original) ──────────────────────────────── */}
      <div className="hidden md:block space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl text-foreground">Your profile</h1>
            <p className="mt-1 text-muted-foreground">The details we use to deliver your fitness program.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={openDialog}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit profile</DialogTitle>
                <DialogDescription>Update your contact details.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="name-d">Name</Label>
                  <Input id="name-d" value={name} disabled={role !== "admin"} onChange={(e) => setName(e.target.value)} />
                  {role !== "admin" && <p className="text-[11px] text-muted-foreground">Name cannot be changed.</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone-d">Phone</Label>
                  <Input id="phone-d" value={phone} disabled={role !== "admin"} onChange={(e) => setPhone(e.target.value)} />
                  {role !== "admin" && <p className="text-[11px] text-muted-foreground">Phone number cannot be changed.</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-d">Email</Label>
                  <Input id="email-d" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
                  <p className="text-[11px] text-muted-foreground">Visible to your trainer and admin.</p>
                </div>
                {showSociety && (
                  <div className="space-y-2">
                    <Label>Society</Label>
                    <Input value={profile?.society ?? "Set when your plan starts"} disabled />
                    <p className="text-[11px] text-muted-foreground">Set by your plan — ask your admin to change it.</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="time-d">Time slot</Label>
                  <Input id="time-d" value={timeSlot} disabled={role === "client"} onChange={(e) => setTimeSlot(e.target.value)} placeholder="e.g. 7:30 – 8:30 AM" />
                  {role === "client" && <p className="text-[11px] text-muted-foreground">Time slot is set by your trainer or admin.</p>}
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSave}>Save changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </header>

        <Card className="p-6 md:p-8 rounded-2xl shadow-card">
          <div className="flex items-center gap-5">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary-soft text-primary text-xl font-medium">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-display text-2xl">{displayName || (isLoading ? "Loading…" : "Add your name")}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <InfoRow icon={Mail}      label="Email"     value={profile?.email ?? user?.email ?? ""} />
            <InfoRow icon={Phone}     label="Phone"     value={profile?.phone     || "—"} />
            <InfoRow icon={MapPin}    label="Society"   value={profile?.society   || "—"} />
            <InfoRow icon={Clock}     label="Time slot" value={profile?.time_slot || "—"} />
          </div>
        </Card>

        <Card className="p-6 rounded-2xl shadow-card">
          <h2 className="font-display text-xl">Your trainer</h2>
          {trainer?.name ? (
            <div className="mt-4 flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="bg-accent text-accent-foreground font-medium">{trainerInitials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-lg">{trainer.name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5" /> Your assigned trainer
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No trainer assigned yet.</p>
          )}
        </Card>

        {/* Class mode + switch request */}
        {role === "client" && user && <ClassModeCard userId={user.id} profile={profile} />}

        {/* Payment history — tucked away, collapsed by default */}
        {role === "client" && user && <PaymentHistory userId={user.id} />}
      </div>
    </>
  );
}

/**
 * Payment history, tucked away and collapsed by default — deliberately not on
 * the Plan page so customers aren't confronted with what they've paid.
 */
function PaymentHistory({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);

  const { data: billing = [] } = useQuery({
    queryKey: ["billing", userId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_history").select("*").eq("user_id", userId)
        .order("payment_date", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="rounded-[20px]" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 cursor-pointer border-none bg-transparent"
      >
        <span className="flex items-center gap-2.5">
          <Receipt size={15} color={MUTED} />
          <span className="font-medium" style={{ fontSize: 13, color: MUTED }}>Payment history</span>
        </span>
        <ChevronDown size={15} color={MUTED}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          {billing.length === 0 ? (
            <p style={{ fontSize: 12, color: MUTED }}>No payments recorded yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: BORDER }}>
              {billing.map((b) => {
                const isRefund = Number(b.amount) < 0 || b.type === "refund";
                const displayAmount = Math.abs(Number(b.amount));
                return (
                  <li key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium" style={{ fontSize: 13, color: NAVY }}>
                        {new Date(b.payment_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {isRefund && (
                          <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded align-middle"
                            style={{ background: "rgba(210,59,52,0.1)", color: "#d23b34" }}>
                            Refund
                          </span>
                        )}
                      </p>
                      {b.notes && <p className="truncate" style={{ fontSize: 11, color: MUTED }}>{b.notes}</p>}
                    </div>
                    <span className="font-semibold shrink-0" style={{ fontSize: 13, color: isRefund ? "#d23b34" : NAVY }}>
                      {isRefund ? "−" : ""}₹{displayAmount.toLocaleString("en-IN")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}
