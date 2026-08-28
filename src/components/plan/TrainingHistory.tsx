import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/dates";

const NAVY   = "#1E3A5F";
const MUTED  = "#8a8f9e";
const BORDER = "rgba(30,58,95,0.08)";

interface Props { userId: string }

interface PastPlan {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  total_sessions: number | null;
  attended: number;
  mode: string;
  type: string;
}

/**
 * What the customer has trained with FitVed before now.
 *
 * A plan that ended used to disappear entirely — the dashboard said "your past
 * schedule is shown below" and showed an empty calendar, because the calendar
 * only knows the current term. This is the record that survives it: every plan
 * they actually paid for, when it ran, and how many classes they took on it.
 *
 * Only paid plans appear. An abandoned checkout is not something that happened
 * to the customer, so it is not part of their history.
 */
export function TrainingHistory({ userId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["training-history", userId],
    enabled: !!userId,
    queryFn: async (): Promise<PastPlan[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: plans } = await (supabase as any)
        .from("plans")
        .select("id, plan_option_id, start_date, end_date, total_sessions, status, payment_status, training_mode, training_type")
        .eq("user_id", userId)
        .order("start_date", { ascending: false });

      // NULL payment_status = money collected outside the app, which counts as
      // paid. "pending" never does — that plan was never bought.
      const paid = (plans ?? []).filter(
        (p: any) => p.payment_status == null || p.payment_status === "success",
      );
      const past = paid.filter(
        (p: any) => p.status === "completed" || p.status === "expired" || (p.end_date && p.end_date < today),
      );
      if (!past.length) return [];

      const ids = past.map((p: any) => p.id);
      const { data: sessions } = await (supabase as any)
        .from("training_sessions")
        .select("plan_id, status")
        .in("plan_id", ids);

      // A class the customer was marked absent for still ran, and still came
      // out of what they bought — so "paused" counts as a class taken.
      const taken = new Map<string, number>();
      for (const s of (sessions ?? []) as any[]) {
        if (s.status !== "completed" && s.status !== "paused") continue;
        taken.set(s.plan_id, (taken.get(s.plan_id) ?? 0) + 1);
      }

      const optIds = [...new Set(past.map((p: any) => p.plan_option_id).filter(Boolean))];
      const { data: opts } = optIds.length
        ? await (supabase as any).from("plan_options").select("id, name").in("id", optIds)
        : { data: [] };
      const names = new Map((opts ?? []).map((o: any) => [o.id, o.name]));

      return past.map((p: any) => ({
        id: p.id,
        name: names.get(p.plan_option_id) ?? `${p.total_sessions ?? "—"} sessions`,
        start_date: p.start_date,
        end_date: p.end_date,
        total_sessions: p.total_sessions,
        attended: taken.get(p.id) ?? 0,
        mode: p.training_mode === "online" ? "Online" : "Offline",
        type: p.training_type === "personal" ? "Personal" : "Group",
      }));
    },
  });

  if (isLoading || !data || data.length === 0) return null;

  const totalClasses = data.reduce((n, p) => n + p.attended, 0);

  return (
    <div className="rounded-[20px]" style={{ background: "#fff", border: `1px solid ${BORDER}`, padding: 18 }}>
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center rounded-xl shrink-0"
          style={{ width: 34, height: 34, background: "rgba(30,58,95,0.06)" }}>
          <History size={17} color={NAVY} />
        </span>
        <div>
          <p className="font-display" style={{ fontSize: 17, color: NAVY }}>Your training history</p>
          <p style={{ fontSize: 12.5, color: MUTED }}>
            {totalClasses} {totalClasses === 1 ? "class" : "classes"} across {data.length}{" "}
            {data.length === 1 ? "plan" : "plans"}
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col">
        {data.map((p, i) => (
          <li key={p.id} className="flex items-start justify-between gap-3"
            style={{ paddingTop: i === 0 ? 0 : 13, paddingBottom: 13, borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
            <div className="min-w-0">
              <p className="font-semibold truncate" style={{ fontSize: 14.5, color: NAVY }}>{p.name}</p>
              <p style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
                {formatDate(p.start_date)} — {formatDate(p.end_date)}
              </p>
              <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{p.mode} · {p.type}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold" style={{ fontSize: 15, color: NAVY, fontVariantNumeric: "tabular-nums" }}>
                {p.attended}{p.total_sessions ? ` / ${p.total_sessions}` : ""}
              </p>
              <p style={{ fontSize: 11.5, color: MUTED }}>classes taken</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
