import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";
import { recalculatePlanDates } from "@/stores/pauseStore";
import { pauseDatesError } from "@/lib/pauseRules";
import { todayLocalISO } from "@/lib/sessionProgress";

export function PausesTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  // The pause being edited, as saved — only the dates a change affects have
  // to be today or later, so a running pause can still be extended or ended.
  const [editOriginal, setEditOriginal] = useState<{ from: string; to: string } | null>(null);
  const today = todayLocalISO();

  const { data: pauses = [] } = useQuery({
    queryKey: ["customer-pauses", userId],
    queryFn: async () => {
      const { data } = await (supabase.from("pauses") as any).select("*").eq("client_id", userId)
        .order("from_date", { ascending: false });
      return data ?? [];
    },
  });

  // Keep the admin list, the plan tab's carry-forward calc, and the
  // customer-facing plan queries in sync.
  const invalidatePauses = () => {
    qc.invalidateQueries({ queryKey: ["customer-pauses", userId] });
    qc.invalidateQueries({ queryKey: ["customer-pauses-for-plan", userId] });
    qc.invalidateQueries({ queryKey: ["customer-plan", userId] });
    qc.invalidateQueries({ queryKey: ["plan", userId] });
    qc.invalidateQueries({ queryKey: ["pauses", userId] });
  };

  const create = useMutation({
    mutationFn: async () => {
      // No pauses in the past — this form had no date limit at all, which is
      // how a 9–11 Sept pause came to be typed in on the 11th.
      const problem = pauseDatesError(from, to, todayLocalISO());
      if (problem) throw new Error(problem);
      const { error } = await (supabase.from("pauses") as any).insert({
        user_id: userId, client_id: userId, from_date: from, to_date: to, status: "active",
      });
      if (error) throw error;
      await recalculatePlanDates(userId);
    },
    onSuccess: () => {
      toast.success("Pause added");
      setFrom(""); setTo("");
      invalidatePauses();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pauses").update({ status: "completed" }).eq("id", id);
      if (error) throw error;
      await recalculatePlanDates(userId);
    },
    onSuccess: () => { toast.success("Pause ended"); invalidatePauses(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      const problem = pauseDatesError(editFrom, editTo, todayLocalISO(), editOriginal);
      if (problem) throw new Error(problem);
      const { error } = await supabase.from("pauses")
        .update({ from_date: editFrom, to_date: editTo })
        .eq("id", editingId!);
      if (error) throw error;
      await recalculatePlanDates(userId);
    },
    onSuccess: () => { toast.success("Pause updated"); setEditingId(null); invalidatePauses(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pauses").delete().eq("id", id);
      if (error) throw error;
      await recalculatePlanDates(userId);
    },
    onSuccess: () => { toast.success("Pause deleted"); invalidatePauses(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const startEdit = (p: { id: string; from_date: string; to_date: string }) => {
    setEditingId(p.id);
    setEditFrom(p.from_date);
    setEditTo(p.to_date);
    setEditOriginal({ from: p.from_date, to: p.to_date });
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-medium">Add pause</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" min={from && from > today ? from : today} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Pauses can start today or later — past classes can't be paused.</p>
        <Button onClick={() => create.mutate()} disabled={!from || !to || create.isPending}>
          {create.isPending ? "Adding…" : "Add pause"}
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">History</h3>
        {pauses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pauses yet.</p>
        ) : pauses.map((p) => (
          <div key={p.id} className="rounded-lg border p-3">
            {editingId === p.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>From</Label>
                    <Input
                      type="date"
                      value={editFrom}
                      min={today}
                      // Already under way: its start is in the past and stays put.
                      disabled={!!editOriginal && editOriginal.from < today}
                      onChange={(e) => setEditFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>To</Label>
                    <Input type="date" value={editTo} onChange={(e) => setEditTo(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending || !editFrom || !editTo}>
                    {saveEdit.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{formatDate(p.from_date)} → {formatDate(p.to_date)}</div>
                  <Badge variant={p.status === "active" ? "secondary" : "outline"} className="mt-1">{p.status}</Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => cancel.mutate(p.id)}>End</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => startEdit(p)} title="Edit dates">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this pause? This can't be undone.")) remove.mutate(p.id); }} title="Delete pause">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
