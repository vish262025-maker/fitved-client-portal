import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Whether this customer is offered Pause Classes at all.
 *
 * Pause is a GROUP-training benefit, online or offline alike. A group class
 * runs whether or not any one member turns up, so letting a member pause costs
 * nothing to arrange and the days carry forward. One-to-one training is the
 * opposite: the trainer's slot is reserved for that client alone, so a pause
 * is a cancellation, handled by talking to us rather than a self-service
 * button. Personal is therefore the only exclusion — mode is not.
 *
 * Returns false while loading, so the option is never shown and then withdrawn.
 */
export function useCanPauseClasses() {
  const { user, role } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["pause-eligibility", user?.id],
    // The customer's training mode can change under them — an admin approves a
    // mode-switch request in a different browser entirely, so nothing in this
    // session can invalidate it. The app disables refetch-on-focus globally,
    // which left the plan list showing the wrong mode's prices until a manual
    // reload. This one query opts back in: it is small, and being wrong about
    // it means showing someone the wrong catalogue.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,

    enabled: !!user && role === "client",
    queryFn: async () => {
      const [{ data: prof }, { data: plans }] = await Promise.all([
        (supabase as any).from("profiles").select("class_mode").eq("id", user!.id).maybeSingle(),
        (supabase as any)
          .from("plans")
          .select("training_mode, training_type, payment_status, status, created_at")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false }),
      ]);

      // An abandoned checkout says nothing about what they train — only a plan
      // they actually bought decides this.
      const paid = ((plans ?? []) as any[]).filter(
        (p) => p.payment_status == null || p.payment_status === "success",
      );
      const current = paid[0] ?? null;

      return {
        // Pausing needs something to pause. Without a running plan the option
        // was still offered, and "Pause status: Active" was shown to someone
        // who had never bought a class.
        hasActivePlan: !!current && current.status === "active",
        classMode: (prof?.class_mode ?? null) as "online" | "offline" | null,
        trainingMode: (current?.training_mode ?? null) as string | null,
        trainingType: (current?.training_type ?? null) as string | null,
      };
    },
  });

  const isPersonal = data?.trainingType === "personal";

  const canPause = role === "client" && !isLoading && !!data && !isPersonal && !!data.hasActivePlan;

  return {
    canPause,
    /**
     * True only for a CUSTOMER who may not pause. Admins open /pause to look
     * at a customer's pauses, so they are never blocked by this.
     */
    blocked: role === "client" && !isLoading && !canPause,
    isPersonal,
    loading: isLoading,
  };
}
