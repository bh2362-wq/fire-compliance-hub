import { supabase } from "@/integrations/supabase/client";

// CRUD for service_report_battery_tests — captures per-panel/PSU battery
// measurements collected during a service visit. Multiple rows per report
// are expected on sites with secondary PSUs.

export type LoadTestResult = "pass" | "fail" | "not_tested";
export type BatteryRecommendation = "retain" | "replace";

export interface BatteryTest {
  id: string;
  service_report_id: string;
  panel_or_psu_label: string;
  install_date: string | null;
  terminal_voltage_v: number | null;
  charge_current_ma: number | null;
  load_test_result: LoadTestResult | null;
  recommendation: BatteryRecommendation | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// `id` is optional: callers can pass a client-generated UUID so offline-queued
// inserts have stable identity before they sync.
export type BatteryTestInsert = Omit<
  BatteryTest,
  "id" | "created_at" | "updated_at"
> & { id?: string };

export type BatteryTestUpdate = Partial<
  Omit<BatteryTest, "id" | "service_report_id" | "created_at" | "updated_at">
>;

export async function listBatteryTests(serviceReportId: string): Promise<BatteryTest[]> {
  const { data, error } = await supabase
    .from("service_report_battery_tests" as never)
    .select("*")
    .eq("service_report_id", serviceReportId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as BatteryTest[];
}

export async function createBatteryTest(input: BatteryTestInsert): Promise<BatteryTest> {
  const { data, error } = await supabase
    .from("service_report_battery_tests" as never)
    .insert(input as never)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as BatteryTest;
}

export async function updateBatteryTest(
  id: string,
  updates: BatteryTestUpdate,
): Promise<BatteryTest> {
  const { data, error } = await supabase
    .from("service_report_battery_tests" as never)
    .update(updates as never)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as BatteryTest;
}

export async function deleteBatteryTest(id: string): Promise<void> {
  const { error } = await supabase
    .from("service_report_battery_tests" as never)
    .delete()
    .eq("id", id);

  if (error) throw error;
}
