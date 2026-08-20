import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, User, Users, Home, Wifi } from "lucide-react";
import { toast } from "sonner";

type TrainingType = "personal" | "group";
type ClassMode = "online" | "offline";

interface PlanOption {
  id: string;
  name: string;
  duration_months: number;
  price: number;
  total_sessions: number | null;
  badge: string | null;
  active: boolean;
  sort_order: number;
  training_type?: TrainingType;
  class_mode?: ClassMode;
}

const blankForm = {
  name: "", duration_months: "1", price: "", total_sessions: "", badge: "", active: true, sort_order: "0",
};

export default function Plans() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlanOption | null>(null);
  const [form, setForm] = useState({ ...blankForm });
  const [trainingType, setTrainingType] = useState<TrainingType>("group");
  const [classMode, setClassMode] = useState<ClassMode>("offline");

  const { data: plans = [] } = useQuery({
    queryKey: ["plan-options-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_options").select("*").order("sort_order").order("duration_months");
      if (error) throw error;
      return data as PlanOption[];
    },
  });

  // training_type / class_mode only exist after their migrations — degrade gracefully.
  const hasTrainingType = plans.some((p) => "training_type" in (p as object));
  const hasClassMode = plans.some((p) => "class_mode" in (p as object));
  const visiblePlans = useMemo(
    () => plans.filter((p) =>
      (!hasTrainingType || (p.training_type ?? "personal") === trainingType) &&
      (!hasClassMode || (p.class_mode ?? "offline") === classMode)
    ),
    [plans, hasTrainingType, hasClassMode, trainingType, classMode]
  );

  // The 1-month plan is the canonical BASE for its training/mode combo. All
  // longer plans are "derived" and compared against it (never stored discounts).
  const inCombo = (p: PlanOption) =>
    (!hasTrainingType || (p.training_type ?? "personal") === (editing?.training_type ?? trainingType)) &&
    (!hasClassMode || (p.class_mode ?? "offline") === (editing?.class_mode ?? classMode));
  const isBase = (p: PlanOption) => p.duration_months === 1;
  const comboBase = plans.find((p) => inCombo(p) && isBase(p)) ?? null;

  // Live pricing preview for the Add/Edit form (derived plans only).
  const pricePreview = (() => {
    const dur = Number(form.duration_months);
    const price = Number(form.price);
    if (!comboBase || dur <= 1 || !(price > 0) || !(comboBase.duration_months > 0)) return null;
    const baseMonthly = Number(comboBase.price) / comboBase.duration_months;
    const baseEquiv = baseMonthly * dur;
    const effMonthly = price / dur;
    const savings = baseEquiv - price;
    const pct = baseEquiv > 0 ? Math.round((savings / baseEquiv) * 100) : 0;
    return { baseMonthly, baseEquiv, effMonthly, savings: Math.max(0, savings), pct: Math.max(0, pct) };
  })();
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  const startNew = () => { setEditing(null); setForm({ ...blankForm }); setOpen(true); };
  const startBase = () => { setEditing(null); setForm({ ...blankForm, duration_months: "1" }); setOpen(true); };
  const startEdit = (p: PlanOption) => {
    setEditing(p);
    setForm({
      name: p.name,
      duration_months: String(p.duration_months),
      price: String(p.price),
      total_sessions: p.total_sessions != null ? String(p.total_sessions) : "",
      badge: p.badge ?? "",
      active: p.active,
      sort_order: String(p.sort_order),
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Plan name is required");
      const price = Number(form.price);
      if (!(price > 0)) throw new Error("Price must be greater than 0");
      const months = Number(form.duration_months);
      if (!(months > 0)) throw new Error("Duration must be greater than 0");
      const sessions = Number(form.total_sessions);
      if (!(sessions > 0)) throw new Error("Sessions must be greater than 0");
      if (!Number.isInteger(sessions)) throw new Error("Sessions must be a whole number");
      // Exactly one base plan (1 month) per training/mode combo.
      if (months === 1 && comboBase && comboBase.id !== editing?.id) {
        throw new Error("A base plan (1 month) already exists here. Edit it instead.");
      }

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        duration_months: months,
        price,
        total_sessions: sessions,
        badge: form.badge.trim() || null,
        active: form.active,
        sort_order: Number(form.sort_order) || 0,
      };
      if (hasTrainingType) payload.training_type = editing?.training_type ?? trainingType;
      if (hasClassMode) payload.class_mode = editing?.class_mode ?? classMode;

      if (editing) {
        const { error } = await (supabase as any).from("plan_options").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("plan_options").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Plan updated" : "Plan created");
      qc.invalidateQueries({ queryKey: ["plan-options-admin"] });
      qc.invalidateQueries({ queryKey: ["plan-options"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async (p: PlanOption) => {
      const { error } = await supabase.from("plan_options").update({ active: !p.active }).eq("id", p.id);
      if (error) throw error;
      return !p.active;
    },
    onSuccess: (nowActive) => {
      toast.success(nowActive ? "Plan is now visible to customers" : "Plan hidden from customers");
      qc.invalidateQueries({ queryKey: ["plan-options-admin"] });
      qc.invalidateQueries({ queryKey: ["plan-options"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const askToggle = (p: PlanOption) => {
    const msg = p.active
      ? "Deactivate this plan? Customers will no longer see this plan."
      : "Activate this plan? Customers will be able to see and select it.";
    if (confirm(msg)) toggleActive.mutate(p);
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plan_options").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["plan-options-admin"] });
      qc.invalidateQueries({ queryKey: ["plan-options"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground">Plans</h1>
          <p className="mt-1 text-muted-foreground">
            Official pricing. Active plans are visible to customers; inactive plans stay here for later.
          </p>
        </div>
        <Button onClick={startNew} className="gap-2"><Plus className="h-4 w-4" /> Add plan</Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {hasClassMode && (
          <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
            {([["offline", "Offline", Home], ["online", "Online", Wifi]] as const).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => setClassMode(m)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  classMode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}
        {hasTrainingType && (
          <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
            {([["group", "Group Training", Users], ["personal", "Personal Training", User]] as const).map(([t, label, Icon]) => (
              <button
                key={t}
                onClick={() => setTrainingType(t)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  trainingType === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Card className="rounded-2xl shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="hidden md:table-cell">Duration</TableHead>
              <TableHead className="hidden md:table-cell">Sessions</TableHead>
              <TableHead>Badge</TableHead>
              <TableHead>Customer visibility</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Every combo always shows a Base plan row. If none exists yet it's an
                empty placeholder the admin clicks Edit to fill in. */}
            {!visiblePlans.some(isBase) && (
              <TableRow className="bg-muted/20">
                <TableCell className="font-medium text-muted-foreground">Base plan</TableCell>
                <TableCell><Badge className="bg-fv-navy text-white hover:bg-fv-navy">Base plan</Badge></TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">1 Month</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">—</TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
                <TableCell className="text-xs text-muted-foreground">Not set up yet</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={startBase}><Pencil className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            )}
            {visiblePlans.map((p) => (
              <TableRow key={p.id} className={p.active ? "" : "opacity-60"}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  {isBase(p)
                    ? <Badge className="bg-fv-navy text-white hover:bg-fv-navy">Base plan</Badge>
                    : <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Derived</span>}
                </TableCell>
                <TableCell>₹{Number(p.price).toLocaleString("en-IN")}</TableCell>
                <TableCell className="hidden md:table-cell">{p.duration_months} {p.duration_months === 1 ? "Month" : "Months"}</TableCell>
                <TableCell className="hidden md:table-cell font-semibold text-foreground">{p.total_sessions ?? "—"} <span className="font-normal text-muted-foreground">sessions</span></TableCell>
                <TableCell>{p.badge ? <Badge variant="secondary">{p.badge}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  <button onClick={() => askToggle(p)} className="inline-flex items-center gap-2 text-left">
                    <span className={`h-2.5 w-2.5 rounded-full ${p.active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                    <span>
                      <span className={`block text-sm font-semibold ${p.active ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {p.active ? "Active" : "Inactive"}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {p.active ? "Visible to customers" : "Hidden from customers"}
                      </span>
                    </span>
                  </button>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete ${p.name}?`)) remove.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit plan" : "Add plan"}
              {(hasClassMode || hasTrainingType) && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · {hasClassMode ? ((editing?.class_mode ?? classMode) === "online" ? "Online" : "Offline") : ""}
                  {hasClassMode && hasTrainingType ? " · " : ""}
                  {hasTrainingType ? `${(editing?.training_type ?? trainingType) === "group" ? "Group" : "Personal"} Training` : ""}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Plan name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 3 Months Plan" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price (₹) *</Label>
                <Input type="number" min={1} inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="9597" />
              </div>
              <div className="space-y-1.5">
                <Label>Duration (months) *</Label>
                <Input type="number" min={1} inputMode="numeric" value={form.duration_months} onChange={(e) => setForm({ ...form, duration_months: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Sessions *</Label>
                <Input type="number" min={1} step={1} inputMode="numeric" value={form.total_sessions} onChange={(e) => setForm({ ...form, total_sessions: e.target.value })} placeholder="36" />
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input type="number" inputMode="numeric" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Badge</Label>
              <Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder='e.g. "Most Popular" or "Super Value"' />
            </div>
            {pricePreview ? (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Pricing reference</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Base price</span><span className="text-right font-medium">{inr(pricePreview.baseMonthly)}/month</span>
                  <span className="text-muted-foreground">{form.duration_months}-month base value</span><span className="text-right font-medium">{inr(pricePreview.baseEquiv)}</span>
                  <span className="text-muted-foreground">Your price</span><span className="text-right font-medium">{inr(Number(form.price))}</span>
                  <span className="text-muted-foreground">Customer saves</span><span className="text-right font-semibold text-emerald-700">{inr(pricePreview.savings)}</span>
                  <span className="text-muted-foreground">Effective price</span><span className="text-right font-medium">{inr(pricePreview.effMonthly)}/month</span>
                  <span className="text-muted-foreground">Discount</span><span className="text-right font-semibold text-emerald-700">{pricePreview.pct}% OFF</span>
                </div>
              </div>
            ) : Number(form.duration_months) > 1 && !comboBase ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No base (1-month) plan exists here yet — add it first so savings can be calculated.
              </div>
            ) : null}

            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
              <div>
                <p className="font-medium text-sm">Customer visibility</p>
                <p className="text-xs text-muted-foreground">
                  {form.active ? "Active — visible and selectable by customers" : "Inactive — hidden from customers"}
                </p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
              {save.isPending ? "Saving…" : editing ? "Update" : "Save plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
