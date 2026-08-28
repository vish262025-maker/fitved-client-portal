import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Wifi, Home, ArrowLeftRight, Clock, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { MODE_LABEL, otherMode, SUPPORT_PHONE, type ClassMode } from "@/lib/classMode";

/**
 * Profile card: shows the customer's current class mode (Online/Offline) and
 * lets them raise an admin-approved switch request. Customers never change the
 * mode directly — the request goes to their assigned admin.
 */
export function ClassModeCard({ userId, profile }: { userId: string; profile: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const mode: ClassMode | null = profile?.class_mode ?? null;
  const columnMissing = profile && !("class_mode" in profile);

  // Pending switch request (if any) for this customer.
  const { data: pending } = useQuery({
    queryKey: ["mode-switch-request", userId],
    enabled: !!userId && !columnMissing,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("mode_switch_requests")
        .select("id, requested_mode, status, created_at")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null; // table not created yet — degrade silently
      return data;
    },
  });

  // The plan they are currently on — a running one pins the mode.
  const { data: activePlan } = useQuery({
    queryKey: ["mode-lock-plan", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("plans").select("end_date, status, payment_status")
        .eq("user_id", userId).eq("status", "active")
        .order("created_at", { ascending: false });
      return ((data ?? []) as any[]).find(
        (p) => p.payment_status == null || p.payment_status === "success",
      ) ?? null;
    },
  });

  // Assigned admin contact, so the customer can reach out directly.
  const { data: admin } = useQuery({
    queryKey: ["assigned-admin-contact", profile?.assigned_admin_id],
    enabled: !!profile?.assigned_admin_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("admins")
        .select("name, phone")
        .eq("id", profile.assigned_admin_id)
        .maybeSingle();
      return data;
    },
  });

  if (columnMissing) return null; // migration not run yet

  /**
   * A running plan pins the mode.
   *
   * Switching online↔offline mid-term would leave the plan they paid for with
   * no trainer, no society and no schedule that makes sense — an offline plan
   * cannot be delivered over a video call, and vice versa. The request goes in
   * once the current plan ends.
   */
  const lockedByPlan = !!activePlan;

  const target = mode ? otherMode(mode) : "online";
  const adminName = admin?.name || "your FitVed admin";
  const adminPhone = admin?.phone || SUPPORT_PHONE;

  const submit = async () => {
    if (!userId) return;
    if (lockedByPlan) {
      toast.error(`Your ${mode} plan runs to ${activePlan?.end_date}. You can switch once it ends.`);
      return;
    }
    setBusy(true);
    const { error } = await (supabase as any).from("mode_switch_requests").insert({
      user_id: userId,
      assigned_admin_id: profile?.assigned_admin_id ?? null,
      current_mode: mode,
      requested_mode: target,
      status: "pending",
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn't send your request. Please try again.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["mode-switch-request", userId] });
    setOpen(false);
    toast.success("Switch request sent to admin");
  };

  const ModeIcon = mode === "online" ? Wifi : Home;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-fv-orange/10 text-fv-orange">
            <ModeIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Class mode</p>
            <p className="font-semibold text-foreground">{mode ? MODE_LABEL[mode] : "Not set"}</p>
          </div>
        </div>
        {mode && !pending && (
          <Button variant="outline" size="sm" className="gap-1.5"
            disabled={lockedByPlan}
            title={lockedByPlan ? `Your ${mode} plan runs to ${activePlan?.end_date}` : undefined}
            onClick={() => setOpen(true)}>
            <ArrowLeftRight className="h-3.5 w-3.5" /> Request to switch
          </Button>
        )}
      </div>

      {pending && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <Clock className="h-4 w-4" /> Switch request pending
          </p>
          <p className="mt-1 text-[13px]">
            Your request to switch to <strong>{MODE_LABEL[pending.requested_mode as ClassMode]}</strong> has
            been sent to admin. For a faster change, reach out to <strong>{adminName}</strong>.
          </p>
          <a
            href={`tel:${adminPhone.replace(/\s/g, "")}`}
            className="mt-2 inline-flex items-center gap-1.5 font-semibold text-fv-navy hover:text-fv-orange"
          >
            <Phone className="h-3.5 w-3.5" /> {adminPhone}
          </a>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request to switch class mode</DialogTitle>
            <DialogDescription>
              You're currently <strong>{mode ? MODE_LABEL[mode] : "unset"}</strong>. This will ask admin to
              switch you to <strong>{MODE_LABEL[target]}</strong>. Admin will confirm the change.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Sending…" : `Request ${MODE_LABEL[target]}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
