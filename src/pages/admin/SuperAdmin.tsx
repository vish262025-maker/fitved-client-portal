import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phoneAuth";
import { trackAdminActivity } from "@/lib/adminActivity";
import { useAuth } from "@/contexts/AuthContext";
import {
  ADMIN_PERMISSIONS,
  fullPermissions,
  type AdminPermissions,
} from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, KeyRound, ShieldCheck, Trash2, Eye, EyeOff, ChevronRight, Settings2 } from "lucide-react";
import { toast } from "sonner";

interface AdminRow {
  id: string;
  name: string | null;
  phone: string | null;
  password?: string | null;
  active?: boolean | null;
  permissions?: AdminPermissions | null;
  created_at?: string | null;
}

// Recognise "migration hasn't been run" errors so we can show a helpful toast
// instead of a raw Postgres message.
function isSchemaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /schema cache|does not exist|Could not find|column .* of/i.test(msg);
}
const MIGRATION_HINT =
  "Run the Super Admin migration (20260811120000_super_admin.sql) in Supabase first.";

export default function SuperAdmin() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { viewAsAdmin } = useAuth();

  const openAdminDashboard = (a: AdminRow) => {
    viewAsAdmin({ id: a.id, name: a.name, permissions: a.permissions ?? null });
    navigate("/admin", { replace: true });
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Which admins' passwords are currently revealed (Super Admin can view them).
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const toggleReveal = (id: string) => setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ["sa-admins"],
    queryFn: async () => {
      // Preferred: read the SA flag + permissions. Fall back if the migration
      // hasn't been applied yet so the page still lists admins.
      const rich = await (supabase as any)
        .from("admins")
        .select("id, name, phone, password, active, permissions, created_at")
        .order("created_at", { ascending: true });
      if (!rich.error) return (rich.data ?? []) as AdminRow[];

      const { data, error } = await supabase
        .from("admins")
        .select("id, name, phone, password")
        .order("name");
      if (error) throw error;
      return (data ?? []) as AdminRow[];
    },
  });

  const startCreate = () => { setName(""); setPhone(""); setPassword(""); setCreateOpen(true); };

  const createAdmin = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const normalized = normalizePhone(phone);
      if (!normalized || normalized.length < 10) throw new Error("Enter a valid phone number");
      if (password.length < 6) throw new Error("Password must be at least 6 characters");

      const { data: existing } = await supabase
        .from("admins").select("id").eq("phone", normalized).maybeSingle();
      if (existing) throw new Error("An admin with this phone already exists");

      // New admins start with full permissions (matching current admin behavior);
      // the Super Admin can restrict them afterwards.
      const res = await (supabase as any).from("admins").insert({
        name: name.trim(),
        phone: normalized,
        password,
        permissions: fullPermissions(),
      }).select("id").maybeSingle();
      // If the permissions column doesn't exist yet, retry with the legacy shape.
      if (res.error && isSchemaError(res.error)) {
        const legacy = await supabase
          .from("admins")
          .insert({ name: name.trim(), phone: normalized, password } as never)
          .select("id").maybeSingle();
        if (legacy.error) throw legacy.error;
        return legacy.data?.id as string | undefined;
      }
      if (res.error) throw res.error;
      return res.data?.id as string | undefined;
    },
    onSuccess: (newId) => {
      toast.success("Admin created");
      trackAdminActivity({ action: "admin.create", entityType: "admin", entityId: newId ?? null, entityLabel: name });
      qc.invalidateQueries({ queryKey: ["sa-admins"] });
      setCreateOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create admin"),
  });

  // Password reset, permission editing, suspend, and removal all live on the
  // per-admin profile page (/super-admin/admins/:id).

  const grantedCount = (a: AdminRow) =>
    a.permissions && typeof a.permissions === "object"
      ? ADMIN_PERMISSIONS.filter((p) => a.permissions?.[p.key] === true).length
      : ADMIN_PERMISSIONS.length; // legacy/unknown → full

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-fv-orange" /> Super Admin
          </h1>
          <p className="mt-1 text-muted-foreground">
            {admins.length} admin account{admins.length === 1 ? "" : "s"} — manage access, passwords, and permissions.
          </p>
        </div>
        <Button onClick={startCreate} className="gap-2"><Plus className="h-4 w-4" /> Add admin</Button>
      </header>

      <Card className="rounded-2xl shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Password</TableHead>
              <TableHead className="hidden md:table-cell">Permissions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : admins.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No admins yet</TableCell></TableRow>
            ) : admins.map((a) => (
              <TableRow
                key={a.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => openAdminDashboard(a)}
              >
                <TableCell className="font-medium text-foreground hover:text-fv-orange transition-colors">
                  {a.name || "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">{a.phone || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-foreground">
                      {a.password ? (revealed[a.id] ? a.password : "•".repeat(Math.min(a.password.length, 10))) : "—"}
                    </code>
                    {a.password && (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        title={revealed[a.id] ? "Hide password" : "Show password"}
                        onClick={(e) => { e.stopPropagation(); toggleReveal(a.id); }}>
                        {revealed[a.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="secondary">{grantedCount(a)}/{ADMIN_PERMISSIONS.length}</Badge>
                </TableCell>
                <TableCell>
                  {a.active === false
                    ? <Badge variant="destructive">Suspended</Badge>
                    : <Badge className="bg-fv-success/15 text-fv-success hover:bg-fv-success/15">Active</Badge>}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button asChild size="sm" variant="ghost" title="Settings & activity" onClick={(e) => e.stopPropagation()}>
                    <Link to={`/super-admin/admins/${a.id}`}><Settings2 className="h-4 w-4" /></Link>
                  </Button>
                  <Button size="sm" variant="ghost" title="Open dashboard"
                    onClick={(e) => { e.stopPropagation(); openAdminDashboard(a); }}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create admin */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add admin</DialogTitle>
            <DialogDescription>Create a new admin account with its own login credentials.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone *</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label>Password *</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createAdmin.mutate()} disabled={createAdmin.isPending}>
              {createAdmin.isPending ? "Creating…" : "Create admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
