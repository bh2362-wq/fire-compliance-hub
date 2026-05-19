import { useQuery } from "@tanstack/react-query";
import { getSiteIntelligence } from "@/services/siteIntelligenceService";

export function useSiteIntelligence(siteId: string | null | undefined) {
  return useQuery({
    queryKey: ["site-intelligence", siteId],
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000, // 5 min
    queryFn: () => getSiteIntelligence(siteId as string),
  });
}
