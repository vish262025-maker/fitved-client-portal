import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminsList } from "@/hooks/useAdminsList";
import { trackAdminActivity } from "@/lib/adminActivity";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dumbbell, Users, BadgeCheck, X, Inbox } from "lucide-react";
import { toast } from "sonner";

export default function SuperAdminRequests() {
  const qc = useQueryClient();
  const { data: admins = [] } = useAdminsList();
  const [pick, setPick] = useState<Record<string, string>>({});

  // Pending trainers = access requests awaiting approval (active = false).
  const { data: pendingTrainers = [] } = useQuery({
    queryKey: ["sa-pending-trainers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .select("id, name, contact, email, active")
        .eq("active", false)
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as { id: string; name: string; contact: string | null; email: string | null }[];
    },
  });

  // Customers not yet assigned to a managing admin.
  const { data: customerData } = useQuery({
    queryKey: ["sa-unassigned-customers"],
    queryFn: async () => {
      const res = await (supabase as any)
        .from("profiles")
        .select("id, name, phone, assigned_admin_id")
        .is("assigned_admin_id", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (res.error) return { rows: [], ready: false };
      return { rows: (res.data ?? []) as { id: string; name: string | null; phone: string | null }[], ready: true };
    },
  });
  const unassignedCustomers = customerData?.rows ?? [];
  const customersReady = customerData?.ready ?? false;

  const adminName = (id: string) => admins.find((a) => a.id === id)?.name || "admin";

  const approveTrainer = useMutation({
    mutationFn: async ({ trainerId, adminId }: { trainerId: string; adminId: string }) => {
      const { error } = await supabase.from("trainers").update({ active: true }).eq("id", trainerId);
      if (error) throw error;
      if (adminId) {
        await (supabase as any).from("trainers").update({ assigned_admin_id: adminId }).eq("id", trainerId);
      }
    },
    onSuccess: (_d, { trainerId, adminId }) => {
      const t = pendingTrainers.find((x) => x.id === trainerId);
      toast.success(adminId ? `Approved & assigned to ${adminName(adminId)}` : "Trainer approved");
      trackAdminActivity({ action: "trainer.approve", entityType: "trainer", entityId: trainerId, entityLabel: t?.name ?? null, details: adminId ? { assigned_admin_id: adminId } : null });
      qc.invalidateQueries({ queryKey: ["sa-pending-trainers"] });
      qc.invalidateQueries({ queryKey: ["trainers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Approve failed"),
  });

  const declineTrainer = useMutation({
    mutationFn: async (trainerId: string) => {
      const { data: t } = await supabase.from("trainers").select("user_id").eq("id", trainerId).maybeSingle();
      await supabase.from("trainer_societies").delete().eq("trainer_id", trainerId);
      if (t?.user_id) await supabase.from("user_roles").delete().eq("user_id", t.user_id);
      const { error } = await supabase.from("trainers").delete().eq("id", trainerId);
      if (error) throw error;
    },
    onSuccess: (_d, trainerId) => {
      const t = pendingTrainers.find((x) => x.id === trainerId);
      toast.success("Request declined");
      trackAdminActivity({ action: "trainer.delete", entityType: "trainer", entityId: trainerId, entityLabel: t?.name ?? null, details: { declined: true } });
      qc.invalidateQueries({ queryKey: ["sa-pending-trainers"] });
      qc.invalidateQueries({ queryKey: ["trainers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Decline failed"),
  });

  const assignCustomer = useMutation({
    mutationFn: async ({ customerId, adminId }: { customerId: string; adminId: string }) => {
      const { error } = await (supabase as any).from("profiles").update({ assigned_admin_id: adminId }).eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: (_d, { customerId, adminId }) => {
      const c = unassignedCustomers.find((x) => x.id === customerId);
      toast.success(`Assigned to ${adminName(adminId)}`);
      trackAdminActivity({ action: "customer.update", entityType: "customer", entityId: customerId, entityLabel: c?.name ?? null, details: { assigned_admin_id: adminId } });
      qc.invalidateQueries({ queryKey: ["sa-unassigned-customers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Assign failed"),
  });

  const AdminPicker = ({ id }: { id: string }) => (
    <Select value={pick[id] || ""} onValueChange={(v) => setPick((p) => ({ ...p, [id]: v }))}>
      <SelectTrigger className="w-[190px]"><SelectValue placeholder="Choose admin…" /></SelectTrigger>
      <SelectContent>
        {admins.length === 0 ? (
          <SelectItem value="none" disabled>No admins yet</SelectItem>
        ) : admins.map((a) => (
          <SelectItem key={a.id} value={a.id}>{a.name || a.phone || "Admin"}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-foreground flex items-center gap-2">
          <Inbox className="h-7 w-7 text-fv-orange" /> Requests
        </h1>
        <p className="mt-1 text-muted-foreground">Approve trainers and assign a managing admin to new customers.</p>
      </header>

      {/* Trainer requests */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-fv-orange" />
          <h2 className="font-semibold text-lg text-foreground">Trainer requests</h2>
          <Badge variant="secondary">{pendingTrainers.length}</Badge>
        </div>
        <Card className="rounded-2xl shadow-card divide-y divide-border overflow-hidden">
          {pendingTrainers.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No pending trainer requests.</div>
          ) : pendingTrainers.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-foreground">{t.name || "Unnamed trainer"}</p>
                <p className="text-xs text-muted-foreground">{t.email || t.contact || "No contact"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AdminPicker id={t.id} />
                <Button size="sm" className="gap-1.5"
                  disabled={approveTrainer.isPending}
                  onClick={() => approveTrainer.mutate({ trainerId: t.id, adminId: pick[t.id] || "" })}>
                  <BadgeCheck className="h-4 w-4" /> Accept
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 text-destructive"
                  disabled={declineTrainer.isPending}
                  onClick={() => { if (confirm(`Decline ${t.name}'s request?`)) declineTrainer.mutate(t.id); }}>
                  <X className="h-4 w-4" /> Decline
                </Button>
              </div>
            </div>
          ))}
        </Card>
      </section>

      {/* Customer requests */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-fv-orange" />
          <h2 className="font-semibold text-lg text-foreground">Customer requests</h2>
          <Badge variant="secondary">{unassignedCustomers.length}</Badge>
        </div>
        <Card className="rounded-2xl shadow-card divide-y divide-border overflow-hidden">
          {!customersReady ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Run the admin-assignments migration (20260813120000) to manage customer assignments.
            </div>
          ) : unassignedCustomers.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Every customer has a managing admin.</div>
          ) : unassignedCustomers.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-foreground">{c.name || "Unnamed customer"}</p>
                <p className="text-xs text-muted-foreground">{c.phone || "No phone"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AdminPicker id={c.id} />
                <Button size="sm" className="gap-1.5"
                  disabled={assignCustomer.isPending || !pick[c.id]}
                  onClick={() => assignCustomer.mutate({ customerId: c.id, adminId: pick[c.id] })}>
                  <BadgeCheck className="h-4 w-4" /> Assign
                </Button>
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
