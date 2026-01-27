import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface BS5839Checklist {
  // Control Equipment
  controlPanel: {
    visualInspection: boolean | null;
    faultIndicators: boolean | null;
    batteryCondition: boolean | null;
    batteryConnections: boolean | null;
    batteryVoltage: boolean | null;
    chargerOperation: boolean | null;
    earthFaultMonitoring: boolean | null;
    zoneLamps: boolean | null;
    printerOperation: boolean | null;
    logBookEntries: boolean | null;
  };
  // Detection Devices
  detectors: {
    visualInspection: boolean | null;
    contaminationCheck: boolean | null;
    secureFixing: boolean | null;
    unobstructed: boolean | null;
    functionalTest: boolean | null;
  };
  // Manual Call Points
  callPoints: {
    visualInspection: boolean | null;
    accessibleUnobstructed: boolean | null;
    correctSignage: boolean | null;
    operationalTest: boolean | null;
    glassesReplaced: boolean | null;
  };
  // Alarm Devices
  sounders: {
    visualInspection: boolean | null;
    secureFixing: boolean | null;
    audibilityCheck: boolean | null;
    visualAlarmDevices: boolean | null;
  };
  // Wiring & Installation
  wiring: {
    cableCondition: boolean | null;
    fireResistantCables: boolean | null;
    junctionBoxesLabelled: boolean | null;
    cablesSecured: boolean | null;
  };
  // Ancillary Functions
  ancillary: {
    fireDoorRelease: boolean | null;
    interfaceToFireService: boolean | null;
    plantShutdown: boolean | null;
    liftRecall: boolean | null;
    smokeVentilation: boolean | null;
    autoDialler: boolean | null;
  };
  // Documentation
  documentation: {
    logBookAvailable: boolean | null;
    asInstalledDrawings: boolean | null;
    operatingInstructions: boolean | null;
    zoneChart: boolean | null;
  };
}

export interface ServiceReport {
  id: string;
  visit_id: string;
  site_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  report_number: string | null;
  engineer_name: string | null;
  engineer_signature: string | null;
  client_name: string | null;
  client_signature: string | null;
  report_date: string;
  next_service_due: string | null;
  panel_manufacturer: string | null;
  panel_model: string | null;
  panel_location: string | null;
  system_type: string | null;
  zones_count: number | null;
  devices_count: number | null;
  checklist: BS5839Checklist;
  system_condition: string | null;
  defects_found: string | null;
  recommendations: string | null;
  work_carried_out: string | null;
  parts_used: string | null;
  notes: string | null;
  status: string;
}

export const getDefaultChecklist = (): BS5839Checklist => ({
  controlPanel: {
    visualInspection: null,
    faultIndicators: null,
    batteryCondition: null,
    batteryConnections: null,
    batteryVoltage: null,
    chargerOperation: null,
    earthFaultMonitoring: null,
    zoneLamps: null,
    printerOperation: null,
    logBookEntries: null,
  },
  detectors: {
    visualInspection: null,
    contaminationCheck: null,
    secureFixing: null,
    unobstructed: null,
    functionalTest: null,
  },
  callPoints: {
    visualInspection: null,
    accessibleUnobstructed: null,
    correctSignage: null,
    operationalTest: null,
    glassesReplaced: null,
  },
  sounders: {
    visualInspection: null,
    secureFixing: null,
    audibilityCheck: null,
    visualAlarmDevices: null,
  },
  wiring: {
    cableCondition: null,
    fireResistantCables: null,
    junctionBoxesLabelled: null,
    cablesSecured: null,
  },
  ancillary: {
    fireDoorRelease: null,
    interfaceToFireService: null,
    plantShutdown: null,
    liftRecall: null,
    smokeVentilation: null,
    autoDialler: null,
  },
  documentation: {
    logBookAvailable: null,
    asInstalledDrawings: null,
    operatingInstructions: null,
    zoneChart: null,
  },
});

export const CHECKLIST_LABELS: Record<string, Record<string, string>> = {
  controlPanel: {
    visualInspection: "Visual inspection of control equipment",
    faultIndicators: "Check fault indicators are clear",
    batteryCondition: "Battery condition satisfactory",
    batteryConnections: "Battery connections secure and clean",
    batteryVoltage: "Battery voltage within tolerance",
    chargerOperation: "Charger operation verified",
    earthFaultMonitoring: "Earth fault monitoring functional",
    zoneLamps: "Zone lamps/indicators functioning",
    printerOperation: "Printer operation (if fitted)",
    logBookEntries: "Previous log book entries reviewed",
  },
  detectors: {
    visualInspection: "Visual inspection of all detectors",
    contaminationCheck: "Detectors free from contamination",
    secureFixing: "Detectors securely fixed",
    unobstructed: "Detectors unobstructed (min 500mm)",
    functionalTest: "Functional test of sample detectors",
  },
  callPoints: {
    visualInspection: "Visual inspection of all MCPs",
    accessibleUnobstructed: "MCPs accessible and unobstructed",
    correctSignage: "Correct signage displayed",
    operationalTest: "Operational test performed",
    glassesReplaced: "Replacement glasses fitted where needed",
  },
  sounders: {
    visualInspection: "Visual inspection of alarm devices",
    secureFixing: "Sounders/beacons securely fixed",
    audibilityCheck: "Audibility check performed (min 65dB)",
    visualAlarmDevices: "VADs operational where fitted",
  },
  wiring: {
    cableCondition: "Cable condition satisfactory",
    fireResistantCables: "Fire resistant cables used throughout",
    junctionBoxesLabelled: "Junction boxes labelled 'FIRE ALARM'",
    cablesSecured: "Cables properly secured",
  },
  ancillary: {
    fireDoorRelease: "Fire door release/hold open devices",
    interfaceToFireService: "Interface to fire service",
    plantShutdown: "Plant shutdown connections",
    liftRecall: "Lift recall interface",
    smokeVentilation: "Smoke ventilation interface",
    autoDialler: "Auto-dialler/remote signalling",
  },
  documentation: {
    logBookAvailable: "Log book available and up to date",
    asInstalledDrawings: "As-installed drawings available",
    operatingInstructions: "Operating instructions available",
    zoneChart: "Zone chart/plan displayed at panel",
  },
};

export const SECTION_LABELS: Record<string, string> = {
  controlPanel: "Control & Indicating Equipment",
  detectors: "Detection Devices",
  callPoints: "Manual Call Points",
  sounders: "Alarm Devices (Sounders & VADs)",
  wiring: "Wiring & Installation",
  ancillary: "Ancillary Functions",
  documentation: "Documentation",
};

export const SYSTEM_TYPES = [
  { value: "L1", label: "L1 - Life Protection (Full)" },
  { value: "L2", label: "L2 - Life Protection (Extended)" },
  { value: "L3", label: "L3 - Life Protection (Escape Routes)" },
  { value: "L4", label: "L4 - Life Protection (Escape Routes Only)" },
  { value: "L5", label: "L5 - Life Protection (Localised)" },
  { value: "M", label: "M - Manual System" },
  { value: "P1", label: "P1 - Property Protection (Full)" },
  { value: "P2", label: "P2 - Property Protection (Defined Areas)" },
];

export async function getServiceReport(visitId: string): Promise<ServiceReport | null> {
  const { data, error } = await supabase
    .from("service_reports")
    .select("*")
    .eq("visit_id", visitId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  
  return {
    ...data,
    checklist: (data.checklist as unknown as BS5839Checklist) || getDefaultChecklist(),
  } as ServiceReport;
}

export async function createServiceReport(
  visitId: string,
  siteId: string,
  userId: string,
  initialData?: Partial<Omit<ServiceReport, 'checklist'>> & { checklist?: BS5839Checklist }
): Promise<ServiceReport> {
  const insertData = {
    visit_id: visitId,
    site_id: siteId,
    created_by: userId,
    checklist: JSON.parse(JSON.stringify(getDefaultChecklist())) as Json,
    ...(initialData?.engineer_name && { engineer_name: initialData.engineer_name }),
  };

  const { data, error } = await supabase
    .from("service_reports")
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    checklist: (data.checklist as unknown as BS5839Checklist) || getDefaultChecklist(),
  } as ServiceReport;
}

export async function updateServiceReport(
  reportId: string,
  updates: Partial<Omit<ServiceReport, 'checklist'>> & { checklist?: BS5839Checklist }
): Promise<ServiceReport> {
  const { checklist, ...rest } = updates;
  const dbUpdates: Record<string, unknown> = { ...rest };
  
  if (checklist) {
    dbUpdates.checklist = JSON.parse(JSON.stringify(checklist));
  }
  
  const { data, error } = await supabase
    .from("service_reports")
    .update(dbUpdates)
    .eq("id", reportId)
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    checklist: (data.checklist as unknown as BS5839Checklist) || getDefaultChecklist(),
  } as ServiceReport;
}

export async function getSiteServiceReports(siteId: string): Promise<ServiceReport[]> {
  const { data, error } = await supabase
    .from("service_reports")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((d) => ({
    ...d,
    checklist: (d.checklist as unknown as BS5839Checklist) || getDefaultChecklist(),
  })) as ServiceReport[];
}
