import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Users, UserRound, Video, Settings2, Pencil, ChevronRight, Clock, CalendarDays,
} from "lucide-react";
import { OnlineBatchesDialog } from "@/components/admin/OnlineBatchesDialog";
import { EditAssignmentDialog } from "@/components/admin/EditAssignmentDialog";
import { batchName, batchTiming, type OnlineBatch } from "@/lib/onlineBatches";
import { daySetLabel } from "@/lib/daySets";
import { STATUS_LABEL, type BookingRequest } from "@/lib/bookingRequests";
import { deriveSubscriptionStatus, SUBSCRIPTION_LABEL, SUBSCRIPTION_TONE, isPaid } from "@/lib/subscription";
import { AwaitingTrainer } from "@/components/admin/AwaitingTrainer";

/**
 * Admin → Online Customers.
 * Batches and 1-to-1 slots are the rows; expanding one reveals the customers
 * training in it. Customers whose batch was removed fall into an "Unassigned"
 * row so nobody disappears from the admin's view.
 */
export default function OnlineCustomers() {
  const { user } = useAuth();
  const adminId = user?.id ?? null;
  const [manage, setManage] = useState<null | "group" | "personal">(null);
  const [editing, setEditing] = useState<BookingRequest | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

  const q = useQuery({
    queryKey: ["admin-online-customers", adminId],
    enabled: !!adminId,
    queryFn: async () => {
      const [{ data: reqData, error }, { data: batchData }] = await Promise.all([
        (supabase as any).from("booking_requests").select("*")
          .eq("assigned_admin_id", adminId)
          .eq("training_mode", "online")
          .order("created_at", { ascending: false }),
        (supabase as any).from("online_batches").select("*")
          .eq("assigned_admin_id", adminId).order("sort_order"),
      ]);
      if (error) return { __notReady: true } as const;

      const batches = (batchData ?? []) as OnlineBatch[];

      /**
       * The roster is everyone who has PAID for an online plan.
       *
       * It used to come from booking_requests alone. That table belongs to the
       * older self-service booking flow; a purchase through the payment
       * gateway creates a `plans` row carrying the batch and never writes one
       * — so a customer could pay, be correctly placed in a batch, and still
       * show as "0 customers" here. Paid plans are synthesised into the same
       * shape, and a real booking row still wins where one exists.
       */
      const { data: myProfiles } = await (supabase as any)
        .from("profiles").select("id").eq("assigned_admin_id", adminId);
      const myIds = ((myProfiles ?? []) as any[]).map((p) => p.id);
      const { data: onlinePlans } = myIds.length
        ? await (supabase as any)
            .from("plans")
            .select("id, user_id, batch_id, trainer_id, training_type, training_days, time_slot, status, payment_status, plan_option_id, created_at")
            .eq("training_mode", "online")
            .in("user_id", myIds)
            .order("created_at", { ascending: false })
        : { data: [] };

      const reqData2 = (reqData ?? []) as BookingRequest[];
      const seen = new Set(reqData2.map((r) => r.user_id));
      const synthesised = ((onlinePlans ?? []) as any[])
        // Never bought = never booked. Group must be in a batch; personal has
        // no batch at all — it is one-to-one, scheduled on the plan itself.
        .filter((p) => (p.payment_status == null || p.payment_status === "success"))
        .filter((p) => (p.training_type === "personal" ? true : !!p.batch_id))
        .filter((p) => !seen.has(p.user_id) && (seen.add(p.user_id), true))
        .map((p) => ({
          id: `plan:${p.id}`,
          user_id: p.user_id,
          assigned_admin_id: adminId,
          training_mode: "online",
          training_type: p.training_type ?? "group",
          batch_id: p.batch_id,
          trainer_id: p.trainer_id,
          preferred_days: p.training_days,
          training_days: p.training_days,
          // The schedule of the batch they are in — a gateway purchase has no
          // booking row to carry it, so take it from the batch itself.
          preferred_time: (() => {
            const b = batches.find((x: any) => x.id === p.batch_id);
            if (b?.start_time && b?.end_time) return `${b.start_time} – ${b.end_time}`;
            // One-to-one has no batch: the time was agreed on the plan itself.
            return p.time_slot ?? null;
          })(),
          plan_option_id: p.plan_option_id,
          // The subscription's own lifecycle, expressed in this screen's
          // vocabulary, so Status opens on what is actually true.
          status: p.status === "completed" ? "completed"
            : p.status === "stopped" || p.status === "cancelled" ? "cancelled"
            : p.trainer_id ? "trainer_assigned" : "pending_trainer_assignment",
          payment_status: p.payment_status,
          created_at: p.created_at,
        })) as unknown as BookingRequest[];

      // A deleted customer can leave its booking behind; don't render a
      // nameless ghost row for someone who no longer exists.
      const reqsRaw = [...reqData2, ...synthesised];
      const uids = [...new Set(reqsRaw.map((r) => r.user_id))];
      const tids = [...new Set([
        ...reqsRaw.map((r) => r.trainer_id),
        ...batches.map((b) => b.trainer_id),
      ].filter(Boolean))] as string[];

      const [{ data: profs }, { data: plans }, { data: trainers }, { data: subs }] = await Promise.all([
        uids.length ? (supabase as any).from("profiles").select("id, name, phone").in("id", uids) : Promise.resolve({ data: [] }),
        (supabase as any).from("plan_options").select("id, name, duration_months, total_sessions"),
        tids.length ? (supabase as any).from("trainers").select("id, name").in("id", tids) : Promise.resolve({ data: [] }),
        // The SUBSCRIPTION is the source of truth for status, dates and money.
        // The booking row only records how the customer got here.
        uids.length
          ? (supabase as any).from("plans").select("*").in("user_id", uids)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

      const liveIds = new Set(((profs ?? []) as any[]).map((p) => p.id));
      const reqs = reqsRaw.filter((r) => liveIds.has(r.user_id));

      // Newest subscription per customer.
      const subByUser: Record<string, any> = {};
      for (const sub of (subs ?? []) as any[]) {
        if (!subByUser[sub.user_id]) subByUser[sub.user_id] = sub;
      }

      return {
        reqs, batches,
        people: Object.fromEntries(((profs ?? []) as any[]).map((p) => [p.id, p])),
        plans: Object.fromEntries(((plans ?? []) as any[]).map((p) => [p.id, p])),
        trainers: Object.fromEntries(((trainers ?? []) as any[]).map((t) => [t.id, t])),
        subs: subByUser,
      };
    },
  });

  const notReady = (q.data as any)?.__notReady === true;
  const reqs: BookingRequest[] = (q.data as any)?.reqs ?? [];
  const allBatches: OnlineBatch[] = (q.data as any)?.batches ?? [];
  const people: Record<string, any> = (q.data as any)?.people ?? {};
  const plans: Record<string, any> = (q.data as any)?.plans ?? {};
  const trainers: Record<string, any> = (q.data as any)?.trainers ?? {};
  const subs: Record<string, any> = (q.data as any)?.subs ?? {};

  // Customers grouped by the batch/slot they booked.
  const byBatch = useMemo(() => {
    const map: Record<string, BookingRequest[]> = {};
    for (const r of reqs) (map[r.batch_id ?? "__none__"] ??= []).push(r);
    return map;
  }, [reqs]);

  /** Online one-to-one customers. No batches — each row is a person. */
  const PersonalSection = () => {
    const rows = reqs.filter((r) => r.training_type === "personal" && r.trainer_id);
    return (
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-foreground" />
            <h2 className="font-display text-xl text-foreground">Personal training</h2>
            <span className="text-sm text-muted-foreground">
              ({rows.length} {rows.length === 1 ? "customer" : "customers"})
            </span>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No online personal customers yet — confirmed bookings appear here.
          </p>
        ) : (
          rows.map((r) => {
            const person = people[r.user_id];
            return (
              <button key={r.id} onClick={() => setEditing(r)}
                className="flex w-full items-center gap-3 border-b border-border p-4 text-left transition-colors last:border-b-0 hover:bg-muted/40">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fv-orange/10 text-fv-orange">
                  <UserRound className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">
                    {person?.name ?? "Customer"}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {person?.phone && <span>{person.phone}</span>}
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> {daySetLabel((r as any).training_days ?? []) || "—"}
                    </span>
                    {r.preferred_time && (
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {r.preferred_time}</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-3 w-3" /> {r.trainer_id ? trainers[r.trainer_id]?.name ?? "Trainer" : "No trainer"}
                    </span>
                  </span>
                </span>
                <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })
        )}
      </section>
    );
  };

  const Section = ({
    title, icon: Icon, type,
  }: { title: string; icon: React.ElementType; type: "personal" | "group" }) => {
    const batches = allBatches.filter((b) => b.training_type === type);
    const orphans = (byBatch["__none__"] ?? []).filter((r) => r.training_type === type);
    const total = reqs.filter((r) => r.training_type === type).length;
    const noun = type === "group" ? "batches" : "slots";

    const Row = ({ b, rows }: { b: OnlineBatch | null; rows: BookingRequest[] }) => {
      const key = b?.id ?? `none-${type}`;
      const open = !!openRows[key];
      const seats = b?.capacity != null ? `${rows.length}/${b.capacity}` : `${rows.length}`;
      const trainer = b?.trainer_id ? trainers[b.trainer_id]?.name : null;

      return (
        <div className="border-b border-border last:border-b-0">
          <button
            onClick={() => setOpenRows((p) => ({ ...p, [key]: !open }))}
            className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
          >
            <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fv-orange/10 text-fv-orange">
              <Icon className="h-5 w-5" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-foreground">
                {b ? batchName(b) : "Unassigned"}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {b && (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> {daySetLabel(b.days ?? []) || "—"}
                    </span>
                    {batchTiming(b) && (
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {batchTiming(b)}</span>
                    )}
                    <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" /> {trainer ?? "No trainer"}</span>
                  </>
                )}
                {!b && <span>Customers whose {type === "group" ? "batch" : "slot"} is no longer set</span>}
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                {seats} {rows.length === 1 ? "customer" : "customers"}
              </Badge>
              {b && !b.active && <Badge variant="outline">Hidden</Badge>}
            </span>
          </button>

          {open && (
            <div className="bg-muted/20 px-4 pb-4">
              {rows.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No customers in this {type === "group" ? "batch" : "slot"} yet.</p>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {rows.map((r) => {
                    const p = people[r.user_id];
                    const sub = subs[r.user_id] ?? null;
                    const plan = (sub?.plan_option_id && plans[sub.plan_option_id])
                      || (r.plan_option_id ? plans[r.plan_option_id] : null);
                    // Derived from the subscription's own dates, so a plan that
                    // has run out reads Expired here without waiting for anyone
                    // to open a page that writes the status.
                    const subStatus = deriveSubscriptionStatus(sub);
                    const tone = SUBSCRIPTION_TONE[subStatus];
                    return (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{p?.name ?? "Customer"}</p>
                          <p className="text-xs text-muted-foreground">
                            {p?.phone ?? "—"}{plan ? ` · ${plan.name}` : ""}
                            {sub?.start_date && sub?.end_date ? ` · ${sub.start_date} → ${sub.end_date}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={tone === "green" ? "secondary" : tone === "red" ? "destructive" : "outline"}>
                            {SUBSCRIPTION_LABEL[subStatus]}
                          </Badge>
                          <Badge variant="outline" className="font-normal">
                            {sub ? (isPaid(sub) ? "Paid" : sub.payment_status === "refunded" ? "Refunded" : "Payment pending")
                                 : STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                          <Button size="sm" variant="ghost" title="Edit assignment" onClick={() => setEditing(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-xl text-foreground">
            <Icon className="h-5 w-5" /> {title}
            <span className="text-sm font-normal text-muted-foreground">
              ({batches.length} {noun} · {total} {total === 1 ? "customer" : "customers"})
            </span>
          </h2>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setManage(type)}>
            <Settings2 className="h-4 w-4" /> Manage {noun}
          </Button>
        </div>

        <Card className="overflow-hidden rounded-2xl shadow-card">
          {batches.length === 0 && orphans.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No {noun} yet — add one to start taking online {type} bookings.
            </p>
          ) : (
            <>
              {batches.map((b) => <Row key={b.id} b={b} rows={byBatch[b.id] ?? []} />)}
              {orphans.length > 0 && <Row b={null} rows={orphans} />}
            </>
          )}
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 font-display text-3xl text-foreground">
          <Video className="h-7 w-7" /> Online Customers
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your online customers — group batches and one-to-one clients. Open a row to see
          who is in it. Offline customers are managed under Customers and Personal Bookings.
        </p>
      </header>

      {notReady ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          Online training isn't enabled yet — run the <code>online_batches</code> migration in Supabase.
        </div>
      ) : q.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Loading…</div>
      ) : (
        /*
         * Group batches only.
         *
         * Online PERSONAL used to be sold out of admin-defined slots, which is
         * why it had a section here with its own "Manage slots". It no longer
         * works that way: the customer picks their own days and time at
         * checkout and an admin confirms a trainer afterwards — so those
         * customers live in Personal Bookings, alongside the offline ones,
         * and there are no slots left to manage.
         */
        <>
          {/*
            Online personal customers live here, permanently, beside the group
            batches — one place per customer. New bookings arrive in the queue
            above; confirming one moves it into this list.
          */}
          <AwaitingTrainer adminId={adminId} mode="online" />

          <PersonalSection />
          <Section title="Group training" icon={Users} type="group" />
        </>
      )}

      <EditAssignmentDialog
        request={editing}
        adminId={adminId}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
      />

      {adminId && manage && (
        <OnlineBatchesDialog
          adminId={adminId}
          trainingType={manage}
          open={!!manage}
          onOpenChange={(v) => !v && setManage(null)}
        />
      )}
    </div>
  );
}
