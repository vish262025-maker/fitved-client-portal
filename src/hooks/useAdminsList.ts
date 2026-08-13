import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminLite {
  id: string;
  name: string | null;
  phone: string | null;
}

// Shared list of admin accounts for "assign admin" dropdowns across the app.
// Degrades to an empty list if the admins table isn't reachable.
export function useAdminsList() {
  return useQuery({
    queryKey: ["admins-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admins")
        .select("id, name, phone")
        .order("name");
      if (error) return [] as AdminLite[];
      return (data ?? []) as AdminLite[];
    },
  });
}
