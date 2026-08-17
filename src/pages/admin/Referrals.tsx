import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, Phone, MapPin } from "lucide-react";
import {
  computeReferrals, referralStatusLabel, REFERRAL_RATE,
  type ReferralRow, type ReferralStatus,
} from "@/lib/referrals";
import { useAuth } from "@/contexts/AuthContext";
import { scopeByAdmin } from "@/lib/adminScope";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const STATUS_STYLE: Record<ReferralStatus, { bg: string; color: string }> = {
  invited:   { bg: "rgba(138,143,158,0.14)", color: "#5f6472" },
  joined:    { bg: "rgba(59,130,246,0.12)",  color: "#2563eb" },
  purchased: { bg: "rgba(46,158,91,0.14)",   color: "#2e9e5b" },
  refunded:  { bg: "rgba(239,68,68,0.12)",   color: "#dc2626" },
};

export default function AdminReferrals() {
  const { user } = useAuth();
  const adminId = user?.id ?? null;
  const { data, isError: tableMissing } = useQuery({
    queryKey: ["admin-referrals", adminId],
    retry: false,
    queryFn: async () => {
      const { data: referrals, error } = await (supabase as any)
        .from("referrals").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const refs = (referrals ?? []) as ReferralRow[];

      const [{ data: allTrainers }, { data: profiles }] = await Promise.all([
        supabase.from("trainers").select("id, name, assigned_admin_id"),
        supabase.from("profiles").select("id, phone").in("phone", refs.map((r) => r.referred_phone).length ? refs.map((r) => r.referred_phone) : ["__none__"]),
      ]);
      // Referrals belong to trainers, so scope to this admin's trainers only.
      const trainers = scopeByAdmin((allTrainers ?? []) as any[], adminId);
      const ids = (profiles ?? []).map((p) => p.id);
      const { data: billing } = ids.length
        ? await supabase.from("billing_history").select("user_id, amount, payment_date, type").in("user_id", ids)
        : { data: [] as any[] };

      return {
        refs,
        trainers: trainers as { id: string; name: string }[],
        profiles: profiles ?? [],
        billing: billing ?? [],
      };
    },
  });

  const groups = useMemo(() => {
    if (!data) return [];
    const computed = computeReferrals(data.refs, data.profiles, data.billing);
    const byTrainer = new Map<string, typeof computed>();
    for (const c of computed) {
      const list = byTrainer.get(c.trainer_id) ?? [];
      list.push(c);
      byTrainer.set(c.trainer_id, list);
    }
    return data.trainers
      .map((t) => {
        const rows = byTrainer.get(t.id) ?? [];
        return { trainer: t, rows, total: rows.reduce((s, r) => s + r.earning, 0) };
      })
      .filter((g) => g.rows.length > 0)
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  const totalReferrals = groups.reduce((s, g) => s + g.rows.length, 0);

  if (tableMissing) {
    return (
      <div className="space-y-6 px-4 pt-4 md:px-0 md:pt-0">
        <h1 className="font-display text-3xl text-foreground">Referrals</h1>
        <Card className="p-6 rounded-2xl text-sm text-muted-foreground">
          The referrals table isn't set up yet — run <code>20260718120000_referrals.sql</code> in the Supabase SQL Editor.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 pt-4 md:px-0 md:pt-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground flex items-center gap-2">
            <Gift className="h-7 w-7 text-primary" /> Referrals
          </h1>
          <p className="mt-1 text-muted-foreground">
            {totalReferrals} referral(s) across {groups.length} trainer(s) · {Math.round(REFERRAL_RATE * 100)}% commission
          </p>
        </div>
        <Card className="px-5 py-3 rounded-2xl" style={{ background: "linear-gradient(135deg,#1E3A5F,#2d5a8e)" }}>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>Total owed to trainers</p>
          <p className="font-display text-2xl font-bold text-white">{inr(grandTotal)}</p>
        </Card>
      </header>

      {groups.length === 0 ? (
        <Card className="p-8 rounded-2xl text-center text-sm text-muted-foreground">
          No referrals yet.
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map(({ trainer, rows, total }) => (
            <Card key={trainer.id} className="rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b" style={{ background: "rgba(30,58,95,0.03)" }}>
                <p className="font-semibold">{trainer.name}</p>
                <div className="text-right">
                  <span className="font-display text-lg font-bold" style={{ color: "#2e9e5b" }}>{inr(total)}</span>
                  <span className="text-xs text-muted-foreground ml-1">earned</span>
                </div>
              </div>
              <div className="divide-y">
                {rows.map((r) => {
                  const st = STATUS_STYLE[r.status];
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{r.referred_name}</p>
                          <Badge style={{ background: st.bg, color: st.color }} className="border-0 text-[11px]">
                            {referralStatusLabel(r.status)}
                          </Badge>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.referred_phone}</span>
                          {r.referred_address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{r.referred_address}</span>}
                          {r.paid > 0 && <span>paid {inr(r.paid)}{r.refunded > 0 ? ` · refunded ${inr(r.refunded)}` : ""}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-sm" style={{ color: r.earning > 0 ? "#2e9e5b" : "#8a8f9e" }}>{inr(r.earning)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
