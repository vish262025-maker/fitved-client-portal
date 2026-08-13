import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, subDays, startOfDay, isAfter } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phoneAuth";
import { trackAdminActivity } from "@/lib/adminActivity";
import {
  ADMIN_PERMISSIONS,
  fullPermissions,
  type AdminPermissions,
} from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Eye, EyeOff, KeyRound, Trash2, ShieldCheck, Activity, Clock, Save,
} from "lucide-react";
import { toast } from "sonner";

interface AdminRow {
  id: string;
  name: string | null;
  phone: string | null;
  password?: string | null;
  active?: boolean | null;
  notes?: string | null;
  permissions?: AdminPermissions | null;
  created_at?: string | null;
  last_login_at?: string | null;
}

interface ActivityRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface LoginRow { id: string; created_at: string; }

const ACTION_LABELS: Record<string, string> = {
  "trainer.create": "Created trainer",
  "trainer.update": "Updated trainer",
  "trainer.delete": "Deleted trainer",
  "trainer.approve": "Approved trainer",
  "society.create": "Created society",
  "society.update": "Updated society",
  "society.delete": "Deleted society",
  "customer.update": "Updated customer",
  "customer.delete": "Deleted customer",
  "plan.create": "Created plan",
  "plan.update": "Updated plan",
  "billing.payment": "Recorded payment",
  "billing.refund": "Recorded refund",
  "admin.create": "Created admin",
  "admin.update": "Edited admin details",
  "admin.reset_password": "Reset a password",
  "admin.permissions": "Changed permissions",
  "admin.suspend": "Suspended an admin",
  "admin.activate": "Activated an admin",
  "admin.notes": "Updated notes",
  "admin.delete": "Removed an admin",
};

function fmt(dt?: string | null) {
  if (!dt) return "—";
  try { return format(new Date(dt), "MMM d, yyyy · h:mm a"); } catch { return dt; }
}

export default function AdminProfile() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [reveal, setReveal] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [permDraft, setPermDraft] = useState<AdminPermissions>({});
  const [pwOpen, setPwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);

  const { data: admin, isLoading } = useQuery({
    queryKey: ["sa-admin", id],
    queryFn: async () => {
      const rich = await (supabase as any)
        .from("admins")
        .select("id, name, phone, password, active, notes, permissions, created_at, last_login_at")
        .eq("id", id).maybeSingle();
      if (!rich.error) return (rich.data ?? null) as AdminRow | null;
      // Before the profile/activity migration runs, active/notes/last_login_at
      // don't exist — fall back to the columns the super_admin migration added.
      const mid = await (supabase as any)
        .from("admins")
        .select("id, name, phone, password, permissions, created_at")
        .eq("id", id).maybeSingle();
      if (!mid.error) return (mid.data ?? null) as AdminRow | null;
      const { data } = await supabase.from("admins").select("id, name, phone").eq("id", id).maybeSingle();
      return (data ?? null) as AdminRow | null;
    },
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["admin-activity", id],
    queryFn: async () => {
      // Actions performed BY this admin
      const byAdmin = (supabase as any)
        .from("admin_activity")
        .select("id, action, entity_type, entity_label, details, created_at")
        .eq("admin_id", id).order("created_at", { ascending: false }).limit(100);
      // Actions performed ON this admin (by SA or others)
      const onAdmin = (supabase as any)
        .from("admin_activity")
        .select("id, action, entity_type, entity_label, details, created_at")
        .eq("entity_type", "admin").eq("entity_id", id)
        .order("created_at", { ascending: false }).limit(50);
      const [byRes, onRes] = await Promise.all([byAdmin, onAdmin]);
      const byRows = (byRes.error ? [] : byRes.data ?? []) as ActivityRow[];
      const onRows = (onRes.error ? [] : onRes.data ?? []) as ActivityRow[];
      const seen = new Set<string>();
      const merged: ActivityRow[] = [];
      for (const r of [...byRows, ...onRows]) {
        if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
      }
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return merged.slice(0, 100);
    },
  });

  const { data: logins = [] } = useQuery({
    queryKey: ["admin-logins", id],
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const { data, error } = await (supabase as any)
        .from("admin_logins")
        .select("id, created_at")
        .eq("admin_id", id)
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as LoginRow[];
    },
  });

  // Seed editable fields once the admin loads.
  useEffect(() => {
    if (admin) {
      setName(admin.name ?? "");
      setPhone(admin.phone ?? "");
      setNotes(admin.notes ?? "");
      setPermDraft(admin.permissions && typeof admin.permissions === "object" ? { ...admin.permissions } : fullPermissions());
    }
  }, [admin]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sa-admin", id] });
    qc.invalidateQueries({ queryKey: ["sa-admins"] });
  };

  const saveInfo = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const normalized = normalizePhone(phone);
      if (!normalized || normalized.length < 10) throw new Error("Enter a valid phone number");
      const { error } = await supabase.from("admins").update({ name: name.trim(), phone: normalized } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Details saved");
      trackAdminActivity({ action: "admin.update", entityType: "admin", entityId: id, entityLabel: name });
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const saveNotes = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("admins").update({ notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notes saved");
      trackAdminActivity({ action: "admin.notes", entityType: "admin", entityId: id, entityLabel: name });
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const savePerms = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("admins").update({ permissions: permDraft }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permissions updated");
      trackAdminActivity({ action: "admin.permissions", entityType: "admin", entityId: id, entityLabel: name });
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const resetPassword = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 6) throw new Error("Password must be at least 6 characters");
      const { error } = await supabase.from("admins").update({ password: newPassword } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password reset");
      trackAdminActivity({ action: "admin.reset_password", entityType: "admin", entityId: id, entityLabel: name });
      setPwOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reset failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await (supabase as any).from("admins").update({ active: next }).eq("id", id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(next ? "Admin activated" : "Admin suspended");
      trackAdminActivity({ action: next ? "admin.activate" : "admin.suspend", entityType: "admin", entityId: id, entityLabel: name });
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const removeAdmin = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("admins").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Admin removed");
      trackAdminActivity({ action: "admin.delete", entityType: "admin", entityId: id, entityLabel: name });
      qc.invalidateQueries({ queryKey: ["sa-admins"] });
      navigate("/super-admin");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Remove failed"),
  });

  if (isLoading) {
    return <div className="py-16 text-center text-muted-foreground">Loading…</div>;
  }
  if (!admin) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-muted-foreground">Admin not found.</p>
        <Button asChild variant="outline"><Link to="/super-admin">Back to admins</Link></Button>
      </div>
    );
  }

  const isActive = admin.active !== false;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-2">
          <Link to="/super-admin"><ArrowLeft className="h-4 w-4" /> All admins</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl text-foreground">{admin.name || "Admin"}</h1>
          {isActive
            ? <Badge className="bg-fv-success/15 text-fv-success hover:bg-fv-success/15">Active</Badge>
            : <Badge variant="destructive">Suspended</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Joined {admin.created_at ? fmt(admin.created_at) : "—"} · Last login {fmt(admin.last_login_at)}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account details */}
        <Card className="rounded-2xl shadow-card p-6 space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2"><ShieldCheck className="h-4.5 w-4.5 text-fv-orange" /> Account</h2>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-muted/50 rounded-lg px-3 py-2">
                {admin.password ? (reveal ? admin.password : "•".repeat(Math.min(admin.password.length, 12))) : "—"}
              </code>
              {admin.password && (
                <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => setReveal((v) => !v)} title={reveal ? "Hide" : "Show"}>
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => saveInfo.mutate()} disabled={saveInfo.isPending} className="gap-1.5">
              <Save className="h-4 w-4" /> Save details
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setNewPassword(""); setPwOpen(true); }} className="gap-1.5">
              <KeyRound className="h-4 w-4" /> Reset password
            </Button>
          </div>
        </Card>

        {/* Permissions + status */}
        <Card className="rounded-2xl shadow-card p-6 space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2"><ShieldCheck className="h-4.5 w-4.5 text-fv-orange" /> Permissions</h2>
          <div className="space-y-3">
            {ADMIN_PERMISSIONS.map((p) => (
              <div key={p.key} className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </div>
                <Switch checked={permDraft[p.key] === true} onCheckedChange={(v) => setPermDraft((prev) => ({ ...prev, [p.key]: v }))} />
              </div>
            ))}
          </div>
          <Button size="sm" onClick={() => savePerms.mutate()} disabled={savePerms.isPending} className="gap-1.5">
            <Save className="h-4 w-4" /> Save permissions
          </Button>

          <div className="border-t border-border pt-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Account access</p>
              <p className="text-xs text-muted-foreground">{isActive ? "Admin can sign in." : "Sign-in is blocked."}</p>
            </div>
            <Switch checked={isActive} onCheckedChange={(v) => toggleActive.mutate(v)} disabled={toggleActive.isPending} />
          </div>
        </Card>
      </div>

      {/* Internal notes */}
      <Card className="rounded-2xl shadow-card p-6 space-y-3">
        <h2 className="font-semibold text-foreground">Internal notes</h2>
        <p className="text-xs text-muted-foreground">Only the Super Admin can see this.</p>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Handles Whitefield societies" />
        <Button size="sm" onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending} className="gap-1.5 self-start">
          <Save className="h-4 w-4" /> Save notes
        </Button>
      </Card>

      {/* Activity timeline */}
      <Card className="rounded-2xl shadow-card p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2"><Activity className="h-4.5 w-4.5 text-fv-orange" /> Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No recorded activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-fv-orange shrink-0" />
                <div>
                  <span className="font-medium text-foreground">{ACTION_LABELS[a.action] || a.action}</span>
                  {a.entity_label && <span className="text-muted-foreground"> — {a.entity_label}</span>}
                  <div className="text-xs text-muted-foreground">{fmt(a.created_at)}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Login history — last 7 days grouped by date */}
      <Card className="rounded-2xl shadow-card p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2"><Clock className="h-4.5 w-4.5 text-fv-orange" /> Recent logins <span className="text-xs font-normal text-muted-foreground">Last 7 days</span></h2>
        {logins.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No sign-ins in the last 7 days.</p>
        ) : (() => {
          const grouped: Record<string, LoginRow[]> = {};
          for (const l of logins) {
            const day = format(new Date(l.created_at), "yyyy-MM-dd");
            (grouped[day] ??= []).push(l);
          }
          const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
          return (
            <div className="space-y-4">
              {days.map((day) => (
                <div key={day}>
                  <p className="text-xs font-semibold text-foreground mb-1.5">{format(new Date(day), "EEE, MMM d, yyyy")}</p>
                  <div className="flex flex-wrap gap-2">
                    {grouped[day].map((l) => (
                      <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(l.created_at), "h:mm a")}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </Card>

      {/* Danger zone */}
      <Card className="rounded-2xl border-destructive/20 bg-red-500/[0.03] p-6 space-y-3">
        <h2 className="font-semibold text-destructive">Danger zone</h2>
        <p className="text-xs text-muted-foreground">Permanently remove this admin account. This cannot be undone.</p>
        <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setRemoveOpen(true)}>
          <Trash2 className="h-4 w-4" /> Remove admin
        </Button>
      </Card>

      {/* Remove admin confirmation */}
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {admin.name || "this admin"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {admin.name || "this admin"}'s account and login access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeAdmin.mutate()}
            >
              Remove admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset password dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>Set a new password for {admin.name || admin.phone}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>Cancel</Button>
            <Button onClick={() => resetPassword.mutate()} disabled={resetPassword.isPending}>
              {resetPassword.isPending ? "Saving…" : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
