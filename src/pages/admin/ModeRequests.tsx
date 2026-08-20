import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeftRight, Check, X, Wifi, Home, Inbox } from "lucide-react";
import { MODE_LABEL, type ClassMode } from "@/lib/classMode";

type Req = {
  id: string;
  user_id: string;
  assigned_admin_id: string | null;
  current_mode: ClassMode | null;
  requested_mode: ClassMode;
  status: string;
  created_at: string;
};

export default function ModeRequests() {
  const { user } = useAuth();
  const adminId = user?.id ?? null;
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin-mode-requests", adminId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("mode_switch_requests")
        .select("id, user_id, assigned_admin_id, current_mode, requested_mode, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) return { __notReady: true } as const;

      const reqs = ((data ?? []) as Req[]).filter((r) => (adminId ? r.assigned_admin_id === adminId : true));
      const ids = [...new Set(reqs.map((r) => r.user_id))];
      let names: Record<string, { name: string; phone: string }> = {};
      if (ids.length) {
        const { data: profs } = await (supabase as any)
          .from("profiles").select("id, name, phone").in("id", ids);
        names = Object.fromEntries((profs ?? []).map((p: any) => [p.id, { name: p.name, phone: p.phone }]));
      }
      return { reqs, names };
    },
  });

  const notReady = (q.data as any)?.__notReady === true;
  const reqs: Req[] = (q.data as any)?.reqs ?? [];
  const names: Record<string, { name: string; phone: string }> = (q.data as any)?.names ?? {};

  const resolve = async (r: Req, approve: boolean) => {
    setBusyId(r.id);
    try {
      if (approve) {
        const { error: pErr } = await (supabase as any)
          .from("profiles").update({ class_mode: r.requested_mode }).eq("id", r.user_id);
        if (pErr) throw pErr;
      }
      const { error } = await (supabase as any)
        .from("mode_switch_requests")
        .update({ status: approve ? "approved" : "rejected", resolved_at: new Date().toISOString() })
        .eq("id", r.id);
      if (error) throw error;
      toast.success(approve ? "Mode switched" : "Request rejected");
      qc.invalidateQueries({ queryKey: ["admin-mode-requests", adminId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-foreground">Mode Switch Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Approve or reject customer requests to switch between Online and Offline classes.
        </p>
      </header>

      {notReady ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          Mode switch requests aren't enabled yet — run the latest migration
          (<code>class_mode_switch_requests</code>) in Supabase.
        </div>
      ) : q.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Loading…</div>
      ) : reqs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-fv-orange/10">
            <Inbox className="h-6 w-6 text-fv-orange" />
          </div>
          <p className="mt-4 font-display text-xl text-foreground">No pending requests</p>
          <p className="mt-1 text-sm text-muted-foreground">Switch requests from your customers will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reqs.map((r) => {
            const p = names[r.user_id];
            const ReqIcon = r.requested_mode === "online" ? Wifi : Home;
            return (
              <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{p?.name || "Customer"}</p>
                  <p className="text-xs text-muted-foreground">{p?.phone || r.user_id}</p>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-normal">
                      {r.current_mode ? MODE_LABEL[r.current_mode] : "Not set"}
                    </Badge>
                    <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge className="gap-1 bg-fv-orange/15 text-fv-orange hover:bg-fv-orange/15">
                      <ReqIcon className="h-3 w-3" /> {MODE_LABEL[r.requested_mode]}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={busyId === r.id}
                    onClick={() => resolve(r, false)}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-fv-orange text-white hover:bg-fv-orange/90" disabled={busyId === r.id}
                    onClick={() => resolve(r, true)}>
                    <Check className="h-4 w-4" /> Approve &amp; switch
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
