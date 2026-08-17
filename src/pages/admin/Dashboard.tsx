import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { buildMonthlyIncomeFromBilling, monthlyBreakdownArray, monthKey } from "@/lib/incomeAllocation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, IndianRupee, Wallet, AlertTriangle, UserCog,
  CalendarOff, CalendarX, Clock, Phone, CheckCircle2, ChevronRight, TrendingUp, RotateCcw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const RENEWAL_WINDOW = 14; // days ahead to surface expiring plans

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (iso: string) => new Date(iso + "T12:00:00");
const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.round(n));

const WhatsAppIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
  </svg>
);

function phoneLinks(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return { tel: `tel:${digits}`, wa: `https://wa.me/${intl}` };
}

type RenewalRow = { userId: string; name: string; phone: string | null; society: string; endDate: string; amount: number; autoRenew: boolean; renewalDate: string };
type GapRow = { userId: string; name: string; phone: string | null; missing: string[] };
type PausedRow = { userId: string; name: string; society: string; timeSlot: string | null; from: string; to: string };
type OffRow = { id: string; trainer: string; from: string; to: string; slot: string | null; reason: string | null };
type LapsedRow = { userId: string; name: string; phone: string | null; society: string; endDate: string; amount: number };

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const adminId = user?.id ?? null;

  const today = new Date();
  const todayISO = toISO(today);
  const windowEndISO = (() => { const d = new Date(); d.setDate(d.getDate() + RENEWAL_WINDOW); return toISO(d); })();
  const monthStartISO = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
  const daysUntil = (iso: string) => Math.round((parseISO(iso).getTime() - parseISO(todayISO).getTime()) / 86400000);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard", adminId],
    queryFn: async () => {
      // Everything in ONE parallel round trip — the tables are small, so it's
      // cheaper to fetch them whole and filter by role client-side than to pay
      // a serial roles-then-data waterfall (each round trip is a full RTT).
      const [rolesRes, profilesRes, allPlansRes, pausesRes, billingRes, societiesRes, trainersRes, offRes] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "client"),
        (supabase as any).from("profiles").select("id, name, phone, society_id, trainer_id, time_slot, assigned_admin_id"),
        // ALL plans (incl. completed) — used both for the client widgets and
        // for income proration, so fetch once with the union of columns
        (supabase as any).from("plans").select("id, user_id, amount, discount, status, start_date, end_date, auto_renew, renewal_date"),
        supabase.from("pauses").select("user_id, from_date, to_date, status"),
        // Fetch all billing with plan_id for proration (type marks refunds)
        (supabase as any).from("billing_history").select("amount, payment_date, plan_id, type"),
        supabase.from("societies").select("id, name"),
        (supabase as any).from("trainers").select("id, name, assigned_admin_id"),
        (supabase as any).from("trainer_off_times").select("id, trainer_id, from_date, to_date, time_slot, reason").gte("to_date", todayISO).order("from_date"),
      ]);

      const roleClientIds = new Set(((rolesRes.data ?? []) as any[]).map((r) => r.user_id));
      // Each admin only sees the customers assigned to them; the impersonating
      // Super Admin uses the viewed admin's id, so they see that admin's book.
      const profiles = ((profilesRes.data ?? []) as any[])
        .filter((p) => roleClientIds.has(p.id))
        .filter((p) => (adminId ? p.assigned_admin_id === adminId : true));
      const clientIds = new Set(profiles.map((p) => p.id));
      const allPlansForIncome = ((allPlansRes.data ?? []) as any[]).filter((p) => clientIds.has(p.user_id));
      const plans = allPlansForIncome;
      const pauses = ((pausesRes.data ?? []) as any[]).filter((p) => clientIds.has(p.user_id));
      // Only bill for plans owned by this admin's customers (proration keys on plan_id).
      const scopedPlanIds = new Set(allPlansForIncome.map((p) => p.id));
      const billing = ((billingRes.data ?? []) as any[]).filter((b) => b.plan_id && scopedPlanIds.has(b.plan_id));
      const societies = (societiesRes.data ?? []) as any[];
      // Trainers are per-admin too, so off-times only surface for this admin's trainers.
      const trainers = ((trainersRes.data ?? []) as any[])
        .filter((t) => (adminId ? t.assigned_admin_id === adminId : true));
      const scopedTrainerIds = new Set(trainers.map((t) => t.id));
      const offRaw = ((offRes.data ?? []) as any[])
        .filter((o) => (adminId ? scopedTrainerIds.has(o.trainer_id) : true));

      const socName = new Map(societies.map((s) => [s.id, s.name]));
      const trName = new Map(trainers.map((t) => [t.id, t.name]));
      const profName = new Map(profiles.map((p) => [p.id, p.name ?? "—"]));
      const profPhone = new Map(profiles.map((p) => [p.id, p.phone ?? null]));
      const profSlot = new Map(profiles.map((p) => [p.id, p.time_slot ?? null]));
      const profSoc = new Map(profiles.map((p) => [p.id, p.society_id ? (socName.get(p.society_id) ?? "—") : "—"]));

      // ── Headline numbers ───────────────────────────────────────────
      const activeUsers = new Set(
        plans.filter((p) => (p.status === "active" || p.status === "paused") && p.end_date >= todayISO).map((p) => p.user_id)
      );
      const activeClients = activeUsers.size;

      // ── Monthly income breakdown (prorated) ───────────────────────
      // Build a plan lookup for proration: plan_id → { start_date, end_date }
      const planMap = new Map<string, { start_date: string; end_date: string }>(
        allPlansForIncome.map((p) => [p.id, { start_date: p.start_date, end_date: p.end_date }])
      );

      // Prorate billing entries that have plan_id; legacy entries go to payment_date month
      const monthTotals = buildMonthlyIncomeFromBilling(billing, planMap);

      // Ensure current month always appears in the breakdown
      const currentMonthKey = todayISO.slice(0, 7);
      if (!monthTotals[currentMonthKey]) monthTotals[currentMonthKey] = 0;

      // Refunds per month — already subtracted from monthTotals (they're
      // negative rows booked to their payment month); tracked separately so
      // the admin can see how much of each month was refunded.
      const refundsByMonth: Record<string, number> = {};
      for (const b of billing) {
        const amt = Number(b.amount);
        if ((b.type === "refund" || amt < 0) && b.payment_date) {
          const mKey = b.payment_date.slice(0, 7);
          refundsByMonth[mKey] = (refundsByMonth[mKey] ?? 0) + Math.abs(amt);
        }
      }

      const monthlyBreakdown = monthlyBreakdownArray(monthTotals);

      // ── Attention queue ────────────────────────────────────────────
      const renewals: RenewalRow[] = plans
        .filter((p) => p.status === "active" && p.end_date >= todayISO && p.end_date <= windowEndISO)
        .map((p) => ({
          userId: p.user_id,
          name: profName.get(p.user_id) ?? "—",
          phone: profPhone.get(p.user_id) ?? null,
          society: profSoc.get(p.user_id) ?? "—",
          endDate: p.end_date,
          amount: Number(p.amount),
          autoRenew: !!p.auto_renew,
          renewalDate: p.renewal_date,
        }))
        .sort((a, b) => a.endDate.localeCompare(b.endDate));

      // Not renewed = each client's most recent plan has already ended,
      // so they have no current coverage and haven't been renewed.
      // "stopped" customers deliberately churned — don't chase them for renewal.
      const latestPlan = new Map<string, any>();
      for (const p of plans) {
        const cur = latestPlan.get(p.user_id);
        if (!cur || p.end_date > cur.end_date) latestPlan.set(p.user_id, p);
      }
      const notRenewed: LapsedRow[] = [...latestPlan.values()]
        .filter((p) => p.status !== "stopped" && (p.end_date < todayISO || p.status === "cancelled" || p.status === "completed"))
        .map((p) => ({
          userId: p.user_id,
          name: profName.get(p.user_id) ?? "—",
          phone: profPhone.get(p.user_id) ?? null,
          society: profSoc.get(p.user_id) ?? "—",
          endDate: p.end_date,
          amount: Number(p.amount),
        }))
        .sort((a, b) => b.endDate.localeCompare(a.endDate)); // most recently lapsed first

      const usersWithPlan = new Set(plans.map((p) => p.user_id));
      const gaps: GapRow[] = profiles
        .map((p) => {
          const missing: string[] = [];
          if (!usersWithPlan.has(p.id)) missing.push("No plan");
          if (!p.trainer_id) missing.push("No trainer");
          if (!p.society_id) missing.push("No society");
          return { userId: p.id, name: p.name ?? "—", phone: p.phone ?? null, missing };
        })
        .filter((g) => g.missing.length > 0)
        .sort((a, b) => b.missing.length - a.missing.length);

      const paused: PausedRow[] = pauses
        .filter((p) => p.status === "active" && p.to_date >= todayISO)
        .map((p) => ({
          userId: p.user_id,
          name: profName.get(p.user_id) ?? "—",
          society: profSoc.get(p.user_id) ?? "—",
          timeSlot: profSlot.get(p.user_id) ?? null,
          from: p.from_date,
          to: p.to_date,
        }))
        .sort((a, b) => a.to.localeCompare(b.to));

      const offTimes: OffRow[] = offRaw.map((o) => ({
        id: o.id,
        trainer: trName.get(o.trainer_id) ?? "Unknown trainer",
        from: o.from_date,
        to: o.to_date,
        slot: o.time_slot ?? null,
        reason: o.reason ?? null,
      }));

      return { activeClients, monthlyBreakdown, monthTotals, refundsByMonth, renewals, notRenewed, gaps, paused, offTimes, plans };
    },
  });

  const qc = useQueryClient();
  const plans = data?.plans ?? [];
  const currentMonthKey = todayISO.slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  const monthlyBreakdown = data?.monthlyBreakdown ?? [];
  const selectedInfo = monthlyBreakdown.find((m) => m.key === selectedMonth) ?? {
    key: selectedMonth,
    label: new Date(selectedMonth + "-02").toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    amount: 0,
  };

  // Prorated income for this month, next month, month after
  const thisMonthKey  = monthKey(0);
  const nextMonthKey  = monthKey(1);
  const afterMonthKey = monthKey(2);

  // All three cards read the same billing-based totals as the month picker:
  // collected payments split across their plan months, refunds deducted.
  const monthTotalsMap = data?.monthTotals ?? {};
  const thisMonthProjected  = monthTotalsMap[thisMonthKey]  ?? 0;
  const nextMonthProjected  = monthTotalsMap[nextMonthKey]  ?? 0;
  const afterMonthProjected = monthTotalsMap[afterMonthKey] ?? 0;

  const refundsByMonth = data?.refundsByMonth ?? {};
  const selectedMonthRefunds = refundsByMonth[selectedMonth] ?? 0;

  const labelFor = (key: string) =>
    new Date(key + "-02T12:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  useEffect(() => {
    if (!plans.length) return;
    // Expired plans complete automatically ("paused" rows are legacy from the
    // old status model — migrate them too). Renewal is always a manual admin
    // action from the customer's Plan tab.
    const expired = plans.filter(
      (p) => (p.status === "active" || p.status === "paused") && p.end_date < todayISO
    );
    if (expired.length > 0) {
      Promise.all(
        expired.map((p) =>
          supabase.from("plans").update({ status: "completed" }).eq("id", p.id)
        )
      ).then(() => {
        qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
        qc.invalidateQueries({ queryKey: ["admin-customer-list"] });
      });
    }
  }, [plans, todayISO, qc]);

  const lapsing = data?.renewals.filter((r) => !r.autoRenew) ?? [];
  const autoRenewing = data?.renewals.filter((r) => r.autoRenew) ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-foreground">Overview</h1>
        <p className="mt-1 text-muted-foreground">What needs your attention today.</p>
      </header>

      {/* ── Headline numbers ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Active Clients Card */}
        <Card className="rounded-2xl shadow-card p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Active clients</p>
              <p className="font-display text-2xl leading-tight mt-0.5">{isLoading ? "…" : data?.activeClients ?? 0}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">in a running program</p>
        </Card>
      </div>

      {/* ── Prorated Income Widget ───────────────────────────────────── */}
      <Card className="rounded-2xl shadow-card p-5 md:p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-green-500/10 text-green-600">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-lg">Income Breakdown</p>
            <p className="text-sm text-muted-foreground">Multi-month plans split proportionally across months</p>
          </div>
        </div>

        {/* 3-month grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {/* This month */}
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">This month</p>
            <p className="font-display text-2xl font-bold text-foreground">
              {isLoading ? "…" : inr(thisMonthProjected)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{labelFor(thisMonthKey)}</p>
            <p className="text-[11px] text-primary mt-2 font-medium">Actual + allocated</p>
          </div>

          {/* Next month */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next month</p>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Projected</Badge>
            </div>
            <p className="font-display text-2xl font-bold text-foreground">
              {isLoading ? "…" : nextMonthProjected > 0 ? inr(nextMonthProjected) : <span className="text-muted-foreground text-lg">—</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{labelFor(nextMonthKey)}</p>
            <p className="text-[11px] text-muted-foreground mt-2">From payments already collected</p>
          </div>

          {/* Month after */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Month after</p>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Projected</Badge>
            </div>
            <p className="font-display text-2xl font-bold text-foreground">
              {isLoading ? "…" : afterMonthProjected > 0 ? inr(afterMonthProjected) : <span className="text-muted-foreground text-lg">—</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{labelFor(afterMonthKey)}</p>
            <p className="text-[11px] text-muted-foreground mt-2">From payments already collected</p>
          </div>
        </div>

        {/* Refunds in the selected month — already deducted from the totals above */}
        <div className="mb-4 flex items-center justify-between rounded-xl border p-3"
          style={{ borderColor: "rgba(210,59,52,0.25)", background: "rgba(210,59,52,0.04)" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(210,59,52,0.1)" }}>
              <RotateCcw className="h-4 w-4" style={{ color: "#d23b34" }} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#d23b34" }}>
                Refunds · {selectedInfo.label}
              </p>
              <p className="text-[11px] text-muted-foreground">Deducted from that month's income</p>
            </div>
          </div>
          <p className="font-display text-lg font-bold shrink-0" style={{ color: selectedMonthRefunds > 0 ? "#d23b34" : undefined }}>
            {isLoading ? "…" : selectedMonthRefunds > 0 ? `−${inr(selectedMonthRefunds)}` : inr(0)}
          </p>
        </div>

        {/* Month picker — includes every past AND upcoming month with income
            (a 6-month plan bought in July shows slices through December) */}
        <div className="border-t pt-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2 py-1.5 hover:bg-muted/50">
                <Wallet className="h-4 w-4" />
                <span>Month: <strong className="text-foreground">{selectedInfo.label}</strong> · {inr(selectedInfo.amount)}</span>
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Change ▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[320px] max-h-[320px] overflow-y-auto rounded-xl p-1.5 shadow-elevated">
              <div className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground border-b mb-1">
                Monthly income (prorated) — past &amp; upcoming
              </div>
              {monthlyBreakdown.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">No billing records yet</p>
              )}
              {monthlyBreakdown.map((m) => (
                <DropdownMenuItem
                  key={m.key}
                  onClick={() => setSelectedMonth(m.key)}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 cursor-pointer ${
                    m.key === selectedMonth ? "bg-primary-soft text-primary font-medium" : ""
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{m.label}</span>
                    {m.key > currentMonthKey && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 shrink-0">Upcoming</Badge>
                    )}
                    {m.key === currentMonthKey && (
                      <Badge className="text-[9px] px-1.5 py-0 shrink-0">Current</Badge>
                    )}
                  </span>
                  <span className="text-xs font-semibold shrink-0 text-right">
                    <span className="text-muted-foreground">{inr(m.amount)}</span>
                    {(refundsByMonth[m.key] ?? 0) > 0 && (
                      <span className="block text-[10px]" style={{ color: "#d23b34" }}>
                        −{inr(refundsByMonth[m.key])} refunded
                      </span>
                    )}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      <div className="flex items-center gap-2 pt-2">
        <h2 className="font-display text-xl">Attention queue</h2>
      </div>

      {/* ── Renewals due ─────────────────────────────────────────────── */}
      <Section
        icon={AlertTriangle}
        title="Renewals due"
        subtitle={`Plans ending in the next ${RENEWAL_WINDOW} days — renew from the customer's Plan tab once paid`}
        count={data?.renewals.length ?? 0}
        accent="warning"
        loading={isLoading}
      >
        {lapsing.length > 0 && (
          <>
            <GroupLabel>Will lapse — needs a call ({lapsing.length})</GroupLabel>
            {lapsing.map((r) => (
              <RenewalLine key={`l-${r.userId}`} r={r} days={daysUntil(r.endDate)} onOpen={() => navigate(`/admin/customers/${r.userId}`)} danger />
            ))}
          </>
        )}
        {autoRenewing.length > 0 && (
          <>
            <GroupLabel>Expected to renew — collect payment &amp; renew ({autoRenewing.length})</GroupLabel>
            {autoRenewing.map((r) => (
              <RenewalLine key={`a-${r.userId}`} r={r} days={daysUntil(r.endDate)} onOpen={() => navigate(`/admin/customers/${r.userId}`)} />
            ))}
          </>
        )}
      </Section>

      {/* ── Not renewed ──────────────────────────────────────────────── */}
      <Section
        icon={CalendarX}
        title="Not renewed"
        subtitle="Plans that have ended without a renewal"
        count={data?.notRenewed.length ?? 0}
        accent="warning"
        loading={isLoading}
      >
        {data?.notRenewed.map((r) => {
          const links = phoneLinks(r.phone);
          const ago = Math.round((parseISO(todayISO).getTime() - parseISO(r.endDate).getTime()) / 86400000);
          return (
            <button
              key={r.userId}
              onClick={() => navigate(`/admin/customers/${r.userId}`)}
              className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {r.society} · {inr(r.amount)} · {ago >= 0 ? "ended" : "was to end"} {format(parseISO(r.endDate), "d MMM")}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="destructive" className="whitespace-nowrap">{ago >= 0 ? `${ago}d ago` : "ended early"}</Badge>
                {links && <ContactButtons links={links} />}
              </div>
            </button>
          );
        })}
      </Section>

      {/* ── Onboarding gaps ──────────────────────────────────────────── */}
      <Section
        icon={UserCog}
        title="Onboarding gaps"
        subtitle="Clients missing a plan, trainer, or society"
        count={data?.gaps.length ?? 0}
        accent="muted"
        loading={isLoading}
      >
        {data?.gaps.map((g) => {
          const links = phoneLinks(g.phone);
          return (
            <button
              key={g.userId}
              onClick={() => navigate(`/admin/customers/${g.userId}`)}
              className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{g.name}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {g.missing.map((m) => (
                    <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {links && <ContactButtons links={links} />}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          );
        })}
      </Section>

      {/* ── Currently paused ─────────────────────────────────────────── */}
      <Section
        icon={CalendarOff}
        title="Currently paused"
        subtitle="Clients on an active pause"
        count={data?.paused.length ?? 0}
        accent="muted"
        loading={isLoading}
      >
        {data?.paused.map((p) => (
          <button
            key={`${p.userId}-${p.from}`}
            onClick={() => navigate(`/admin/customers/${p.userId}`)}
            className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors"
          >
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{p.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {p.society}{p.timeSlot ? ` · ${p.timeSlot}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">
                {format(parseISO(p.from), "d MMM")} → {format(parseISO(p.to), "d MMM")}
              </p>
              <p className="text-xs font-medium">Back {format(parseISO(p.to), "d MMM")}</p>
            </div>
          </button>
        ))}
      </Section>

      {/* ── Trainer off-times ────────────────────────────────────────── */}
      <Section
        icon={Clock}
        title="Trainer off-times"
        subtitle="Upcoming trainer unavailability"
        count={data?.offTimes.length ?? 0}
        accent="muted"
        loading={isLoading}
      >
        {data?.offTimes.map((o) => {
          const sameDay = o.from === o.to;
          const isNow = o.from <= todayISO;
          return (
            <div key={o.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{o.trainer}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sameDay ? format(parseISO(o.from), "PPP") : `${format(parseISO(o.from), "PP")} → ${format(parseISO(o.to), "PP")}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {o.slot ? o.slot : "All slots"}{o.reason ? ` · ${o.reason}` : ""}
                </p>
              </div>
              <Badge variant={isNow ? "default" : "secondary"} className="shrink-0">
                {isNow ? "Off now" : "Upcoming"}
              </Badge>
            </div>
          );
        })}
      </Section>
    </div>
  );
}

/* ── Building blocks ──────────────────────────────────────────────── */

function Section({
  icon: Icon, title, subtitle, count, accent, loading, children,
}: {
  icon: React.ElementType; title: string; subtitle: string; count: number;
  accent: "warning" | "muted"; loading?: boolean; children: React.ReactNode;
}) {
  const accentCls = accent === "warning" ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground";
  return (
    <Card className="rounded-2xl shadow-card p-5 md:p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${accentCls}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-display text-lg">{title}</p>
            {count > 0 && <Badge variant={accent === "warning" ? "default" : "secondary"}>{count}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground py-2">Loading…</p>
      ) : count === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <CheckCircle2 className="h-4 w-4 text-primary" /> All clear
        </p>
      ) : (
        <div className="divide-y divide-border">{children}</div>
      )}
    </Card>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-3 pb-1">{children}</p>;
}

function ContactButtons({ links }: { links: { tel: string; wa: string } }) {
  return (
    <>
      <a
        href={links.tel}
        onClick={(e) => e.stopPropagation()}
        className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        title="Call"
      >
        <Phone className="h-4 w-4" />
      </a>
      <a
        href={links.wa}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="grid h-8 w-8 place-items-center rounded-full bg-[#25D366]/15 text-[#1da851] hover:bg-[#25D366]/25 transition-colors"
        title="WhatsApp"
      >
        <WhatsAppIcon size={16} />
      </a>
    </>
  );
}

function RenewalLine({
  r, days, onOpen, danger,
}: {
  r: RenewalRow; days: number; onOpen: () => void; danger?: boolean;
}) {
  const links = phoneLinks(r.phone);
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors"
    >
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{r.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {r.society} · {inr(r.amount)}
          {r.autoRenew ? ` · next cycle ${format(parseISO(r.renewalDate), "d MMM")}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Badge variant={danger ? "destructive" : "outline"} className="whitespace-nowrap">
          {days <= 0 ? "ends today" : `${days}d left`}
        </Badge>
        {links && <ContactButtons links={links} />}
      </div>
    </button>
  );
}
