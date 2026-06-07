import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Roles map to user_roles.role. The director is modelled as 'owner'
// (set in TeamManagementTab / on signup). 'admin' is a delegated
// elevated role; 'engineer'/'apprentice'/'office' are operational.
export type AppRole =
  | "owner"
  | "admin"
  | "engineer"
  | "apprentice"
  | "office"
  | "auditor"
  | "client";

interface UseUserRoleResult {
  roles: AppRole[];
  isOwner: boolean;
  isAdmin: boolean;
  isElevated: boolean;
  loading: boolean;
}

export function useUserRole(): UseUserRoleResult {
  const { user, loading: authLoading } = useAuth();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["user-roles", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) {
        console.warn("[useUserRole] couldn't read roles:", error.message);
        return [] as AppRole[];
      }
      return (data ?? []).map((r: { role: string }) => r.role as AppRole);
    },
  });

  return {
    roles,
    isOwner: roles.includes("owner"),
    isAdmin: roles.includes("admin"),
    isElevated: roles.some((r) =>
      (["owner", "admin", "engineer"] as AppRole[]).includes(r),
    ),
    loading: authLoading || isLoading,
  };
}
