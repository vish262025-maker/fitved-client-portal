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
 * An unpaid row is NOT a fallback. A customer who has never bought anything
 * has no plan — showing them the shell of an abandoned checkout told someone
 * who had never paid that their plan "was never activated", offered to renew
 * it, and said it had been stopped. They have no plan; the dashboard should
 * invite them to choose one.
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
      return rows.find(
        (p: any) => p.payment_status == null || p.payment_status === "success",
      ) ?? null;
    },
  });
}
