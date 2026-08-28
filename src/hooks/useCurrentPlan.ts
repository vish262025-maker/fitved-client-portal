import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Your plan" — one definition, shared.
 *
 * The Dashboard and the Plan page both cached under ["plan", userId] but
 * asked different questions: the Dashboard for the most recent plan the
 * customer had PAID for, the Plan page for the most recent row of any kind.
 * React Query caches by key, so whichever ran last won — and opening the Plan
 * page would overwrite the Dashboard's answer with an abandoned checkout.
 * The customer then came home to "this plan was never activated", a renewal
 * date and a price belonging to a plan they never bought, while the plan they
 * were actually training on sat right there in the database.
 *
 * A never-paid row is only the answer when there is no purchase to show.
 */
export function useCurrentPlan(userId: string | undefined) {
  return useQuery({
    queryKey: ["plan", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("plans").select("*").eq("user_id", userId!)
        .order("created_at", { ascending: false });
      const rows = data ?? [];
      // NULL payment_status = collected outside the app, which counts as paid.
      const paid = rows.find(
        (p: any) => p.payment_status == null || p.payment_status === "success",
      );
      return paid ?? rows[0] ?? null;
    },
  });
}
