import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trackAdminActivity } from "@/lib/adminActivity";
import { useAdminsList } from "@/hooks/useAdminsList";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Society {
  id: string;
  name: string;
  address: string | null;
  assigned_admin_id?: string | null;
}

export default function Societies() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canDeleteSociety = can("delete_society");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Society | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [assignedAdminId, setAssignedAdminId] = useState<string>("");
  const { data: adminsList = [] } = useAdminsList();

  const { data: societies = [] } = useQuery({
    queryKey: ["societies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("societies").select("*").order("name");
      if (error) throw error;
      return data as Society[];
    },
  });

  const { data: trainerLinks = [] } = useQuery({
    queryKey: ["society-trainer-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("trainer_societies").select("society_id, trainer_id");
      return data ?? [];
    },
  });

  // How many customers belong to each society (profiles.society_id).
  const { data: memberCounts = {} } = useQuery({
    queryKey: ["society-member-counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles").select("society_id").not("society_id", "is", null);
      const counts: Record<string, number> = {};
      for (const p of data ?? []) {
        if (p.society_id) counts[p.society_id] = (counts[p.society_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const startNew = () => { setEditing(null); setName(""); setAddress(""); setAssignedAdminId(""); setOpen(true); };
  const startEdit = (s: Society) => { setEditing(s); setName(s.name); setAddress(s.address ?? ""); setAssignedAdminId(s.assigned_admin_id ?? ""); setOpen(true); };

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      let societyId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("societies")
          .update({ name, address: address || null }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("societies")
          .insert({ name, address: address || null }).select("id").single();
        if (error) throw error;
        societyId = data?.id;
      }
      // Assign managing admin (best-effort — column may not exist pre-migration).
      if (societyId) {
        await (supabase as any).from("societies")
          .update({ assigned_admin_id: assignedAdminId || null }).eq("id", societyId);
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Society updated" : "Society created");
      trackAdminActivity({
        action: editing ? "society.update" : "society.create",
        entityType: "society",
        entityId: editing?.id ?? null,
        entityLabel: name,
      });
      qc.invalidateQueries({ queryKey: ["societies"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: async ({ id }: { id: string; name: string }) => {
      const { error } = await supabase.from("societies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Deleted");
      trackAdminActivity({ action: "society.delete", entityType: "society", entityId: vars.id, entityLabel: vars.name });
      qc.invalidateQueries({ queryKey: ["societies"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground">Societies</h1>
          <p className="mt-1 text-muted-foreground">{societies.length} location(s)</p>
        </div>
        <Button onClick={startNew} className="gap-2"><Plus className="h-4 w-4" /> Add society</Button>
      </header>

      <Card className="rounded-2xl shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Address</TableHead>
              <TableHead title="Customers in this society">Members</TableHead>
              <TableHead>Trainers</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {societies.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No societies yet</TableCell></TableRow>
            ) : societies.map((s) => {
              const count = trainerLinks.filter((l) => l.society_id === s.id).length;
              const members = memberCounts[s.id] ?? 0;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="hidden md:table-cell">{s.address ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{members}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{count}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    {canDeleteSociety && (
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (confirm(`Delete ${s.name}?`)) remove.mutate({ id: s.id, name: s.name });
                      }}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit society" : "Add society"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Managing admin</Label>
              <Select value={assignedAdminId || "none"} onValueChange={(v) => setAssignedAdminId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {adminsList.map((ad) => (
                    <SelectItem key={ad.id} value={ad.id}>{ad.name || ad.phone || "Admin"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
              {save.isPending ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
