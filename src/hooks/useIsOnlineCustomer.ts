import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * True when the signed-in customer trains online.
 *
 * Pause classes are an offline-only benefit, so online customers must not be
 * offered the Pause section anywhere in the app.
 */
export function useIsOnlineCustomer() {
  const { user, role } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["profile-class-mode", user?.id],
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
      const { data } = await (supabase as any)
        .from("profiles").select("class_mode").eq("id", user!.id).maybeSingle();
      return (data?.class_mode ?? null) as "online" | "offline" | null;
    },
  });
  return { isOnline: role === "client" && data === "online", loading: isLoading };
}
