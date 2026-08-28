import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isValidPhone, isValidDob, normalizePhone } from "@/lib/phoneAuth";
import { useAuth } from "@/contexts/AuthContext";
import { BirthdayPicker } from "@/components/ui/birthday-picker";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: () => void;
}

export function AddCustomerDialog({ open, onOpenChange, onCreated }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState<Date | undefined>(undefined);
  const [societyId, setSocietyId] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [timeSlot, setTimeSlot] = useState("");

  const { data: societies = [] } = useQuery({
    queryKey: ["societies"],
    queryFn: async () => {
      const { data } = await supabase.from("societies").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers-active"],
    queryFn: async () => {
      const { data } = await supabase.from("trainers").select("id, name").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const reset = () => {
    setName(""); setPhone(""); setDob(undefined);
    setSocietyId(""); setTrainerId(""); setTimeSlot("");
  };

  const create = useMutation({
    mutationFn: async () => {
      const normalizedPhone = normalizePhone(phone);
      const dobString = `${dob!.getFullYear()}-${String(dob!.getMonth() + 1).padStart(2, "0")}-${String(dob!.getDate()).padStart(2, "0")}`;

      // Check if phone already exists
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone", normalizedPhone)
        .maybeSingle();

      if (existing) throw new Error("A customer with this phone number already exists.");

      // Get society name for the legacy text column
      const selectedSociety = societies.find((s) => s.id === societyId);

      // 1. Insert into profiles — auto-assign to the admin creating them so the
      //    customer immediately appears in that admin's scoped dashboard.
      const newId = crypto.randomUUID();
      const basePayload: Record<string, unknown> = {
        id: newId,
        name: name.trim(),
        phone: normalizedPhone,
        dob: dobString,
        society_id: societyId || null,
        society: selectedSociety?.name ?? null,
        trainer_id: trainerId || null,
        time_slot: timeSlot || null,
        assigned_admin_id: user?.id ?? null,
      };
      let ins = await (supabase as any).from("profiles").insert(basePayload).select("id").single();
      // If the assignment column isn't there yet, retry without it.
      if (ins.error && /assigned_admin_id/.test(ins.error.message || "")) {
        delete basePayload.assigned_admin_id;
        ins = await (supabase as any).from("profiles").insert(basePayload).select("id").single();
      }
      const profileData = ins.data;
      if (ins.error || !profileData) {
        throw new Error(ins.error?.message ?? "Failed to create customer profile.");
      }

      // 2. CRITICAL: Insert into user_roles so admin dashboard finds this customer
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: profileData.id, role: "client" });

      if (roleError) {
        throw new Error(`Profile created but role assignment failed: ${roleError.message}`);
      }

      return profileData;
    },
    onSuccess: () => {
      toast.success("Customer added — they can log in with their phone + birthday");
      qc.invalidateQueries({ queryKey: ["admin-customer-list"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      onCreated?.();
      reset();
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to create customer"),
  });

  const canSubmit = !!name.trim() && isValidPhone(phone) && isValidDob(dob);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add customer</DialogTitle>
          <DialogDescription>
            Customers log in with their phone number and date of birth.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone * (10 digits — used to log in)</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 10))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth * (used as password)</Label>
            <BirthdayPicker value={dob} onChange={setDob} placeholder="Pick a date" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Society</Label>
              <Select value={societyId || "none"} onValueChange={(v) => setSocietyId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select society" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  {societies.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Trainer</Label>
              <Select value={trainerId || "none"} onValueChange={(v) => setTrainerId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select trainer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  {trainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slot">Time slot</Label>
            <Input id="slot" placeholder="6–7 AM" value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
            {create.isPending ? "Creating…" : "Create customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
