import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPlus, Search } from "lucide-react";
import { formatPlanName } from "@/lib/sessionPlan";
import { AddCustomerDialog } from "@/components/admin/AddCustomerDialog";

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  society: string | null;
  trainer_name: string | null;
  plan_type: string | null;
  plan_status: string | null;
}

export default function Customers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const adminId = user?.id ?? null;
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const { data: customers = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-customer-list", adminId],
    queryFn: async (): Promise<CustomerRow[]> => {
      // One parallel round trip — roles are filtered client-side instead of
      // paying a serial roles-then-data waterfall.
      const [{ data: roles }, { data: allProfiles }, { data: plans }, { data: trainers }, { data: societies }] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "client"),
        (supabase as any).from("profiles").select("id, name, phone, society_id, trainer_id, assigned_admin_id"),
        supabase.from("plans").select("user_id, total_sessions, status, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("trainers").select("id, name"),
        supabase.from("societies").select("id, name"),
      ]);

      // Customers are profiles flagged with the "client" role — trainers/admins
      // also have profiles rows, so this gate keeps them out of the book.
      const clientIds = new Set((roles ?? []).map((r) => r.user_id));
      const profiles = ((allProfiles ?? []) as any[])
        .filter((p) => clientIds.has(p.id))
        .filter((p) => (adminId ? p.assigned_admin_id === adminId : true));

      return (profiles ?? []).map((p) => {
        // Plans are newest-first, so the first match is the current cycle —
        // a renewed customer keeps an older "completed" row we must skip past.
        const plan = plans?.find((pl) => pl.user_id === p.id);
        const trainer = trainers?.find((t) => t.id === p.trainer_id);
        const soc = societies?.find((s) => s.id === p.society_id);
        return {
          id: p.id,
          name: p.name,
          phone: p.phone,
          society: soc?.name ?? null,
          trainer_name: trainer?.name ?? null,
          plan_type: plan && plan.status === "active" ? formatPlanName(plan.total_sessions) : null,
          plan_status: plan?.status ?? null,
        };
      });
    },
  });

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(s) ||
      c.phone?.toLowerCase().includes(s) ||
      c.society?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground">Customers</h1>
          <p className="mt-1 text-muted-foreground">{customers.length} total · click a row for details</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> Add customer
        </Button>
      </header>

      <Card className="rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, society…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">Society</TableHead>
                <TableHead className="hidden lg:table-cell">Trainer</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No customers</TableCell></TableRow>
              ) : filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/admin/customers/${c.id}`)}>
                  <TableCell className="font-medium">{c.name ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.phone ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.society ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{c.trainer_name ?? "—"}</TableCell>
                  <TableCell>{c.plan_type ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.plan_status === "active" ? "secondary" : c.plan_status === "stopped" ? "destructive" : "outline"}>
                      {c.plan_status ?? "no plan"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => refetch()} />
    </div>
  );
}
