import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndianRupee } from "lucide-react";
import { deriveSubscriptionStatus } from "@/lib/subscription";
import { serviceModeOf } from "@/lib/serviceMode";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const monthLabel = (k: string) =>
  new Date(k + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

type Scope = "all" | "offline" | "online";

/**
 * Revenue for the admin Overview.
 *
 * Every figure is derived from real ledger rows and real subscriptions —
 * nothing is entered by hand. Refunds are stored as negative `refund` rows and
 * subtract from the totals they belong to.
 */
/**
 * `earnedByMonth` is the Income Breakdown's own allocation, passed in rather
 * than recomputed. Recomputing it here drifted: that card counts only billing
 * rows carrying a plan_id and scopes by plan ownership, while this one also
 * counts manual rows and scopes by profile — so the same month showed two
 * different totals.
 */
export function RevenueSection({ adminId, earnedByMonth }: {
  adminId: string | null;
  earnedByMonth?: Record<string, number>;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const q = useQuery({
    queryKey: ["admin-revenue", adminId],
    enabled: !!adminId,
    queryFn: async () => {
      const [{ data: profiles }, { data: bills }, { data: plans }, { data: options }] =
        await Promise.all([
          (supabase as any).from("profiles").select("id, assigned_admin_id"),
          (supabase as any).from("billing_history").select("*"),
          (supabase as any).from("plans").select("*"),
          (supabase as any).from("plan_options").select("id, name"),
        ]);
      const mine = new Set(
        ((profiles ?? []) as any[])
          .filter((p) => (adminId ? p.assigned_admin_id === adminId : true))
          .map((p) => p.id),
      );
      return {
        bills: ((bills ?? []) as any[]).filter((b) => mine.has(b.user_id)),
        plans: ((plans ?? []) as any[]).filter((p) => mine.has(p.user_id)),
        options: Object.fromEntries(((options ?? []) as any[]).map((o) => [o.id, o])),
      };
    },
  });

  const stats = useMemo(() => {
    if (!q.data) return null;
    const planById = Object.fromEntries(q.data.plans.map((p: any) => [p.id, p]));

    // A ledger row inherits its mode from the plan it paid for. Manual entries
    // and most refunds carry no plan_id, so fall back to the customer's own
    // subscription — without that they vanished from the Offline/Online views
    // and made a single mode total exceed "All".
    const modeByUser = new Map<string, string>();
    for (const p of q.data.plans) {
      if (p.training_mode && !modeByUser.has(p.user_id)) modeByUser.set(p.user_id, p.training_mode);
    }
    const modeOf = (b: any): string | null =>
      (b.plan_id ? planById[b.plan_id]?.training_mode : null)
      ?? modeByUser.get(b.user_id)
      ?? null;

    const inScope = (b: any) => scope === "all" || modeOf(b) === scope;
    const rows = q.data.bills.filter(inScope);

    // Anything still unattributed (a customer with no subscription at all) is
    // reported rather than silently dropped, so the modes always add up.
    const unattributed = q.data.bills.filter((b: any) => modeOf(b) === null);
    const subs = q.data.plans.filter((p: any) => scope === "all" || p.training_mode === scope);

    const sum = (xs: any[]) => xs.reduce((t, b) => t + Number(b.amount ?? 0), 0);
    const payments = rows.filter((b: any) => b.type === "payment");
    const refunds = rows.filter((b: any) => b.type === "refund");
    const pending = subs.filter((p: any) => p.payment_status === "pending");
    const failed = subs.filter((p: any) => p.payment_status === "failed");

    const statuses = subs.map((p: any) => deriveSubscriptionStatus(p));

    const byMonth: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    const byType: Record<string, number> = { group: 0, personal: 0 };
    for (const b of rows) {
      const k = String(b.payment_date).slice(0, 7);
      byMonth[k] = (byMonth[k] ?? 0) + Number(b.amount ?? 0);
      const p = b.plan_id ? planById[b.plan_id] : null;
      const opt = p?.plan_option_id ? q.data.options[p.plan_option_id] : null;
      const label = opt?.name
        ? `${opt.name}${p ? ` · ${serviceModeOf(p).replace("_", " ")}` : ""}`
        : "Other / manual";
      byPlan[label] = (byPlan[label] ?? 0) + Number(b.amount ?? 0);
      const t = p?.training_type;
      if (t === "group" || t === "personal") byType[t] += Number(b.amount ?? 0);
    }

    // Cash banked in the month vs income earned in it — a multi-month plan
    // paid in June puts a slice into July. Both are correct; showing them
    // together stops the two cards looking like they disagree.
    const earned = earnedByMonth ?? {};
    const months = [...new Set([...Object.keys(byMonth), ...Object.keys(earned)])]
      .sort().reverse();
    if (!months.includes(month)) months.unshift(month);

    return {
      net: sum(rows), paid: sum(payments), refunded: Math.abs(sum(refunds)),
      pendingAmount: pending.reduce((t: number, p: any) => t + Number(p.amount ?? 0), 0),
      pendingCount: pending.length, failedCount: failed.length,
      active: statuses.filter((s) => s === "active").length,
      expired: statuses.filter((s) => s === "expired").length,
      months, byMonth, earned, byType,
      unattributed: unattributed.reduce((t: number, b: any) => t + Number(b.amount ?? 0), 0),
      unattributedCount: unattributed.length,
      byPlan: Object.entries(byPlan).sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [q.data, scope, month, earnedByMonth]);

  if (!stats) return null;

  return (
    <Card className="rounded-2xl shadow-card p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-green-500/10 text-green-600">
            <IndianRupee className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-lg">Revenue</p>
            <p className="text-sm text-muted-foreground">
              From real payments and subscriptions — nothing entered by hand.
            </p>
          </div>
        </div>
        <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="offline">Offline</TabsTrigger>
            <TabsTrigger value="online">Online</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {scope !== "all" && stats.unattributedCount > 0 && (
        <p className="mb-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {stats.unattributedCount} entr{stats.unattributedCount === 1 ? "y" : "ies"} worth {inr(stats.unattributed)} can't
          be traced to a subscription, so they appear only under All.
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Kpi label="Net revenue" value={inr(stats.net)} hint="payments minus refunds" />
        <Kpi label="Collected" value={inr(stats.paid)} />
        <Kpi label="Refunded" value={inr(stats.refunded)} />
        <Kpi label="Awaiting payment" value={inr(stats.pendingAmount)}
             hint={`${stats.pendingCount} pending · ${stats.failedCount} failed`} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 sm:grid-cols-4">
        <Kpi label="Active subscriptions" value={String(stats.active)} />
        <Kpi label="Expired" value={String(stats.expired)} />
        <Kpi label="Group revenue" value={inr(stats.byType.group)} />
        <Kpi label="Personal revenue" value={inr(stats.byType.personal)} />
      </div>

      {/* Month as a dropdown — the list only grows over time. */}
      <div className="mt-5 border-t pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Month</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border bg-background px-3 py-1.5 text-sm">
            {stats.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Collected</p>
            <p className="mt-0.5 font-display text-2xl tabular-nums">{inr(stats.byMonth[month] ?? 0)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">cash banked this month</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Earned</p>
            <p className="mt-0.5 font-display text-2xl tabular-nums">{inr(stats.earned[month] ?? 0)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              multi-month plans spread across the months they cover
            </p>
          </div>
        </div>
      </div>

      {stats.byPlan.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Revenue by plan</p>
          <ul className="mt-2 divide-y">
            {stats.byPlan.map(([label, value]) => (
              <li key={label} className="flex items-center justify-between py-2 text-sm">
                <span className="capitalize">{label}</span>
                <span className="tabular-nums">{inr(value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-2xl leading-tight tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
