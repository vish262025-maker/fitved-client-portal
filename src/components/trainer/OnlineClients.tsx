import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Video, CalendarDays, Clock, UserRound, Phone, TrendingUp } from "lucide-react";
import { daySetLabel } from "@/lib/daySets";
import { STATUS_LABEL, OPEN_STATUSES, type BookingRequest } from "@/lib/bookingRequests";
import { formatDate, daysBetween } from "@/lib/dates";

/**
 * Trainer → Online Clients.
 *
 * Deliberately separate from the offline roster: offline clients come from
 * profiles.trainer_id (society batches), online clients come from their
 * booking (booking_requests.trainer_id + training_mode='online'). A trainer
 * only ever sees bookings assigned to them.
 */
export function OnlineClients({ trainerId }: { trainerId: string | null }) {
  const [openClient, setOpenClient] = useState<any | null>(null);

  const q = useQuery({
    queryKey: ["trainer-online-clients", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("booking_requests")
        .select("*")
        .eq("trainer_id", trainerId)          // only this trainer's clients
        .eq("training_mode", "online")
        .in("status", OPEN_STATUSES)
        .order("created_at", { ascending: false });
      if (error) return { __notReady: true } as const;

      const reqs = (data ?? []) as BookingRequest[];
      if (!reqs.length) return { reqs: [], people: {}, plans: {}, plansByUser: {} };

      const uids = [...new Set(reqs.map((r) => r.user_id))];
      const [{ data: profs }, { data: opts }, { data: plans }] = await Promise.all([
        (supabase as any).from("profiles").select("id, name, phone").in("id", uids),
        (supabase as any).from("plan_options").select("id, name, duration_months, total_sessions"),
        (supabase as any).from("plans")
          .select("user_id, total_sessions, start_date, end_date, status, training_days")
          .in("user_id", uids).eq("status", "active"),
      ]);

      return {
        reqs,
        people: Object.fromEntries(((profs ?? []) as any[]).map((p) => [p.id, p])),
        plans: Object.fromEntries(((opts ?? []) as any[]).map((p) => [p.id, p])),
        plansByUser: Object.fromEntries(((plans ?? []) as any[]).map((p) => [p.user_id, p])),
      };
    },
  });

  const notReady = (q.data as any)?.__notReady === true;
  const reqs: BookingRequest[] = (q.data as any)?.reqs ?? [];
  const people: Record<string, any> = (q.data as any)?.people ?? {};
  const planOpts: Record<string, any> = (q.data as any)?.plans ?? {};
  const plansByUser: Record<string, any> = (q.data as any)?.plansByUser ?? {};

  if (notReady || (!q.isLoading && reqs.length === 0)) return null;

  /** Sessions used mirrors the customer Plan page: elapsed share of the plan. */
  const progressOf = (userId: string) => {
    const pl = plansByUser[userId];
    if (!pl) return null;
    const total = Number(pl.total_sessions ?? 0);
    const totalDays = daysBetween(pl.start_date, pl.end_date);
    const elapsed = daysBetween(pl.start_date, new Date().toISOString());
    const pct = totalDays > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100))) : 0;
    const done = Math.round((total * pct) / 100);
    return { total, done, left: Math.max(0, total - done), pct, plan: pl };
  };

  return (
    <>
      <Card className="rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Video className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">Online clients</p>
            <p className="font-display text-lg text-foreground">
              {reqs.length} {reqs.length === 1 ? "client" : "clients"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {reqs.map((r) => {
            const p = people[r.user_id];
            const opt = r.plan_option_id ? planOpts[r.plan_option_id] : null;
            const prog = progressOf(r.user_id);
            return (
              <div key={r.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{p?.name ?? "Client"}</p>
                    <p className="text-xs text-muted-foreground">
                      Online {r.training_type === "personal" ? "Personal" : "Group"} Training
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {opt && <p>Plan: {opt.name}</p>}
                  {prog && (
                    <p>
                      Sessions: {prog.total} · Completed {prog.done} · Remaining {prog.left}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3" /> {daySetLabel(r.preferred_days ?? []) || "—"}
                    {r.preferred_time ? <><Clock className="ml-1 h-3 w-3" /> {r.preferred_time}</> : null}
                  </p>
                </div>

                <Button variant="outline" size="sm" className="mt-3 w-full"
                  onClick={() => setOpenClient({ req: r, person: p, opt, prog })}>
                  View client
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Client detail */}
      <Dialog open={!!openClient} onOpenChange={(v) => !v && setOpenClient(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openClient?.person?.name ?? "Client"}</DialogTitle>
            <DialogDescription>
              Online {openClient?.req?.training_type === "personal" ? "Personal" : "Group"} Training
            </DialogDescription>
          </DialogHeader>

          {openClient && (
            <div className="space-y-4">
              <section className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Overview</p>
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <UserRound className="h-4 w-4 text-muted-foreground" /> {openClient.person?.name ?? "—"}
                </p>
                {openClient.person?.phone && (
                  <p className="flex items-center gap-2 text-sm text-foreground">
                    <Phone className="h-4 w-4 text-muted-foreground" /> {openClient.person.phone}
                  </p>
                )}
              </section>

              <section className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Plan</p>
                <p className="text-sm text-foreground">{openClient.opt?.name ?? "—"}</p>
                {openClient.prog?.plan && (
                  <p className="text-xs text-muted-foreground">
                    {formatDate(openClient.prog.plan.start_date)} → {formatDate(openClient.prog.plan.end_date)}
                  </p>
                )}
              </section>

              {openClient.prog && (
                <section className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Progress</p>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    {openClient.prog.done} of {openClient.prog.total} sessions · {openClient.prog.left} remaining
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${openClient.prog.pct}%` }} />
                  </div>
                </section>
              )}

              <section className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Schedule</p>
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  {daySetLabel(openClient.req.preferred_days ?? []) || "—"}
                </p>
                {openClient.req.preferred_time && (
                  <p className="flex items-center gap-2 text-sm text-foreground">
                    <Clock className="h-4 w-4 text-muted-foreground" /> {openClient.req.preferred_time}
                  </p>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
