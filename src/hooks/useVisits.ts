import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Visit {
  id: string;
  site_id: string;
  visit_date: string;
  visit_type: string;
  status: string | null;
  notes: string | null;
  engineer_id: string | null;
  devices_tested: number | null;
  total_devices: number | null;
  coverage_percentage: number | null;
  issues_count: number | null;
  quoted_price: number | null;
  estimated_hours: number | null;
  appointment_time: string | null;
  job_number: string | null;
  created_at: string;
  updated_at: string;
  site?: {
    id: string;
    name: string;
  } | null;
}

interface UseVisitsOptions {
  siteId?: string;
  limit?: number;
}

export function useVisits(options?: UseVisitsOptions) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchVisits = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("visits")
        .select(`
          *,
          site:sites(id, name)
        `)
        .order("visit_date", { ascending: false });

      if (options?.siteId) {
        query = query.eq("site_id", options.siteId);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      setVisits(data || []);
    } catch (err) {
      console.error("Error fetching visits:", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [options?.siteId, options?.limit]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  return { visits, loading, error, refetch: fetchVisits };
}

export async function updateVisitStatus(
  visitId: string,
  status: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("visits")
      .update({ status })
      .eq("id", visitId);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("Error updating visit status:", err);
    return { error: err as Error };
  }
}
