import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trackAdminActivity } from "@/lib/adminActivity";
import { BillingTab } from "@/components/admin/customer-tabs/BillingTab";
import { cn } from "@/lib/utils";

export function ManageAccountTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [newDob, setNewDob] = useState<Date | undefined>(undefined);

  const { data: profile } = useQuery({
    queryKey: ["customer-profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data;
    },
  });

  const [name] = [(profile as any)?.name ?? ""];

  const resetDob = useMutation({
    mutationFn: async (date: Date) => {
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      // DOB doubles as the customer's password — a plain profiles update is
      // all the custom phone+DOB login checks against.
      const { data, error } = await supabase.from("profiles")
        .update({ dob: iso }).eq("id", userId).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Customer profile not found — birthday was not changed.");
    },
    onSuccess: () => {
      toast.success("Birthday reset — customer's password is now their new birthday");
      setNewDob(undefined);
      qc.invalidateQueries({ queryKey: ["customer-profile", userId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reset failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // 1. List and delete files in storage
      try {
        const { data: files } = await supabase.storage.from("health-reports").list(userId);
        if (files && files.length > 0) {
          const filePaths = files.map((f) => `${userId}/${f.name}`);
          await supabase.storage.from("health-reports").remove(filePaths);
        }
      } catch (e) {
        console.warn("Storage cleanup failed:", e);
      }

      // 2. Delete linked DB records
      await supabase.from("user_roles").delete().eq("user_id", userId);
      // Paid, running plans are protected from deletion by a database trigger.
      // purge_customer() is the deliberate escape hatch for this flow.
      const { error: purgeErr } = await (supabase as any).rpc("purge_customer", { _user_id: userId });
      if (purgeErr) await supabase.from("plans").delete().eq("user_id", userId);
      await (supabase.from("pauses") as any).delete().eq("user_id", userId);
      await (supabase.from("pauses") as any).delete().eq("client_id", userId);
      await supabase.from("billing_history").delete().eq("user_id", userId);
      await supabase.from("tasks").delete().eq("client_id", userId);
      await supabase.from("health_reports").delete().eq("client_id", userId);
      // Bookings were missed here, which left orphan rows pointing at a
      // deleted profile — they kept showing up in admin as a nameless
      // customer with no plan. (training_sessions cascade from plans.)
      await (supabase as any).from("booking_requests").delete().eq("user_id", userId);

      // 3. Delete profile
      const { error } = await supabase.from("profiles").delete().eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer and all associated data deleted successfully");
      trackAdminActivity({ action: "customer.delete", entityType: "customer", entityId: userId, entityLabel: name });
      qc.invalidateQueries({ queryKey: ["admin-customer-list"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      navigate("/admin/customers");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Deletion failed");
    },
  });

  const handleDelete = () => {
    const confirm1 = window.confirm(
      "Are you absolutely sure you want to delete this customer? This will permanently delete their profile, plans, pauses, tasks, health reports, and entire billing history. This action cannot be undone!"
    );
    if (!confirm1) return;

    const confirm2 = window.confirm(
      "This is your last warning! Click OK to permanently delete the customer."
    );
    if (!confirm2) return;

    deleteMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <BillingTab userId={userId} />

      <div className="border-t pt-5 space-y-3 max-w-xl">
        <Label>Reset birthday (password)</Label>
        <p className="text-xs text-muted-foreground">
          Customer's birthday is their login password. Current:{" "}
          <span className="font-medium text-foreground">
            {profile?.dob ? format(new Date(profile.dob), "PPP") : "not set"}
          </span>
        </p>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn("justify-start text-left font-normal", !newDob && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {newDob ? format(newDob, "PPP") : <span>Pick new birthday</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={newDob}
                onSelect={setNewDob}
                captionLayout="dropdown"
                fromYear={1925}
                toYear={new Date().getFullYear()}
                defaultMonth={newDob ?? (profile?.dob ? new Date(profile.dob) : new Date(1980, 0, 1))}
                disabled={(d) => d > new Date() || d < new Date("1925-01-01")}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="destructive"
            disabled={!newDob || resetDob.isPending}
            onClick={() => newDob && resetDob.mutate(newDob)}
          >
            {resetDob.isPending ? "Resetting…" : "Reset"}
          </Button>
        </div>
      </div>

      {can("delete_customer") && (
        <div className="border-t pt-5 space-y-3 bg-red-500/[0.03] border-destructive/20 rounded-2xl p-4 max-w-xl">
          <h3 className="font-semibold text-destructive text-sm flex items-center gap-1.5">
            <AlertTriangle className="h-4.5 w-4.5" /> Danger Zone
          </h3>
          <p className="text-xs text-muted-foreground">
            Permanently delete this customer account, their active/paused plans, billing/payment history, health reports, and all other associated data.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete Customer Account"}
          </Button>
        </div>
      )}
    </div>
  );
}
