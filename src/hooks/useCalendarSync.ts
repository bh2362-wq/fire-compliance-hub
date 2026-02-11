import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook that runs on the Schedule page to ensure all open visits
 * have corresponding calendar appointments. Creates missing ones
 * and syncs dates that are out of sync.
 */
export function useCalendarSync() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    syncVisitsToCalendar();
  }, []);

  async function syncVisitsToCalendar() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all open visits
      const { data: visits, error: vErr } = await supabase
        .from("visits")
        .select("id, visit_date, visit_type, status, engineer_id, site_id, site:sites(id, name)")
        .in("status", ["scheduled", "in_progress", "pending_review"]);

      if (vErr || !visits || visits.length === 0) return;

      // Get all appointments linked to visits
      const visitIds = visits.map((v: any) => v.id);
      const { data: appointments } = await supabase
        .from("appointments")
        .select("id, visit_id, appointment_date")
        .in("visit_id", visitIds);

      const aptByVisit = new Map<string, { id: string; appointment_date: string }>();
      (appointments || []).forEach((a: any) => {
        if (a.visit_id) aptByVisit.set(a.visit_id, a);
      });

      let created = 0;
      let synced = 0;

      const VISIT_TYPE_LABELS: Record<string, string> = {
        quarterly_service: "Quarterly Service",
        biannual_service: "6-Monthly Service",
        annual_inspection: "Annual Inspection",
        emergency: "Emergency Callout",
        remedial: "Remedial Works",
        supply_only: "Supply Only",
      };

      for (const visit of visits as any[]) {
        const existing = aptByVisit.get(visit.id);
        const visitTypeLabel = VISIT_TYPE_LABELS[visit.visit_type] || visit.visit_type;
        const siteName = visit.site?.name || "Site Visit";

        if (!existing) {
          // Create missing appointment
          await supabase.from("appointments").insert({
            visit_id: visit.id,
            site_id: visit.site_id,
            engineer_id: visit.engineer_id || user.id,
            title: `${visitTypeLabel} - ${siteName}`,
            appointment_date: visit.visit_date,
            start_time: "09:00:00",
            end_time: "17:00:00",
            status: visit.status === "in_progress" ? "in_progress" : "scheduled",
            visit_type: visit.visit_type,
            created_by: user.id,
          });
          created++;
        } else if (existing.appointment_date !== visit.visit_date) {
          // Sync mismatched dates — visit date is the source of truth
          await supabase
            .from("appointments")
            .update({ appointment_date: visit.visit_date })
            .eq("id", existing.id);
          synced++;
        }
      }

      if (created > 0 || synced > 0) {
        await queryClient.invalidateQueries({ queryKey: ["appointments"] });
        const parts: string[] = [];
        if (created > 0) parts.push(`${created} missing appointment${created > 1 ? "s" : ""} created`);
        if (synced > 0) parts.push(`${synced} date${synced > 1 ? "s" : ""} synced`);
        toast({
          title: "Calendar Sync Complete",
          description: parts.join(", ") + ".",
        });
      }
    } catch (err) {
      console.error("Calendar sync error:", err);
    }
  }
}
