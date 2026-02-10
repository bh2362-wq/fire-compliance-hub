import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

// BS 5839-1:2025 Fire Detection & Fire Alarm Inspection & Servicing Checklist
// Based on BAFE SP203-1 Clause 9.8 & BS5839-1:2025 Clause 45

export interface BS5839Checklist {
  // Section 1: Visual Inspection
  visualInspection: {
    mcpsUnobstructed: boolean | null;
    newExitsWithoutMcp: boolean | null;
    partitionsNearDetectors: boolean | null;
    storageNearCeilings: boolean | null;
    additionalDetectionRequired: boolean | null;
    highRacking: boolean | null;
    inRackDetection: boolean | null;
    inRackRecommendation: boolean | null;
    clearSpaceBelow: boolean | null;
    occupancyChanges: boolean | null;
    buildingAlterations: boolean | null;
    detectorsNotDamaged: boolean | null;
    vadsNotObstructed: boolean | null;
    vadsLensesClean: boolean | null;
    cableFixingsSecure: boolean | null;
  };
  // Section 2: Manual Call Points
  manualCallPoints: {
    switchMechanismTested: boolean | null;
  };
  // Section 3: Automatic Detection
  automaticDetection: {
    detectorsFunctionallyTested: boolean | null;
    remoteIndicatorsTested: boolean | null;
    opticalBeamTested: boolean | null;
    aspiratingTested: boolean | null;
    carbonMonoxideTested: boolean | null;
    flameDetectorsTested: boolean | null;
    multiSensorsTested: boolean | null;
    analogueValuesChecked: boolean | null;
  };
  // Section 4: Audible Alarms
  audibleAlarms: {
    devicesOperated: boolean | null;
    correctOperation: boolean | null;
  };
  // Section 5: Visual Alarms
  visualAlarms: {
    devicesOperated: boolean | null;
    correctOperation: boolean | null;
  };
  // Section 6: Ancillary Equipment
  ancillaryEquipment: {
    causeEffectConfirmed: boolean | null;
  };
  // Section 7: Radio Linked Equipment
  radioLinkedEquipment: {
    signalStrengthRecorded: boolean | null;
    signalStrengthAdequate: boolean | null;
    radioEquipmentServiced: boolean | null;
  };
  // Section 8: Fault Monitoring
  faultMonitoring: {
    removalOfDevice: boolean | null;
    shortCircuitAlarmDevices: boolean | null;
    shortCircuitPowerSupply: boolean | null;
    earthFault: boolean | null;
    fuseRemoval: boolean | null;
    shortCircuitControlEquipment: boolean | null;
    shortCircuitRepeatEquipment: boolean | null;
    shortCircuitArc: boolean | null;
    mainsPowerFailure: boolean | null;
    standbyPowerFailure: boolean | null;
    batteryChargerFailure: boolean | null;
    batteryDisconnection: boolean | null;
    communicationLink: boolean | null;
    endOfLineResistors: boolean | null;
    otherFireProtection: boolean | null;
    tactileAlarmDevices: boolean | null;
  };
  // Section 9: Standby Power Supplies
  standbyPowerSupplies: {
    ventedBatteriesExamined: boolean | null;
    chargeVoltage: string | null;
    chargeVoltageWithinSpec: boolean | null;
    batteriesServiceable: boolean | null;
    batteriesLoadTested: boolean | null;
    specificGravityChecked: boolean | null;
    standbyBatteriesSized: boolean | null;
  };
  // Section 10: Control & Indicating Equipment
  controlEquipment: {
    fireAlarmFunctionsChecked: boolean | null;
    controlsChecked: boolean | null;
    ancillaryFunctionsTested: boolean | null;
    printerTested: boolean | null;
    printerConsumables: boolean | null;
    filamentLampsReplaced: boolean | null;
  };
  // Section 11: Cause & Effect
  causeEffect: {
    programmeConfirmed: boolean | null;
  };
  // Section 12: Remote Transmission of Alarms
  remoteTransmission: {
    alarmSignalsChecked: boolean | null;
    faultSignalsChecked: boolean | null;
  };
  // Section 13: Detection Zones
  detectionZones: {
    zonePlanSuitable: boolean | null;
  };
  // Section 14: False Alarms
  falseAlarms: {
    detectorCount: number | null;
    falseAlarmCount: number | null;
    exceedsPermissible: boolean | null;
    elevenOrMoreAlarms: boolean | null;
    twoOrMoreFromSingleMcp: boolean | null;
    twoOrMoreFromSingleLocation: boolean | null;
    persistentCauseIdentified: boolean | null;
    investigationCarriedOut: boolean | null;
  };
  // Section 15: Logbook
  logbook: {
    faultsAttended: boolean | null;
    testDetailsRecorded: boolean | null;
    defectsReported: boolean | null;
  };
  // Section 16: Certification
  certification: {
    bs5839CertIssued: boolean | null;
    bafeCertIssued: boolean | null;
  };
  // Section 17: Post Inspection Checks
  postInspection: {
    systemReturnedToNormal: boolean | null;
    arcAdvised: boolean | null;
    equipmentReturned: boolean | null;
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
  sharepoint_folder: string | null;
  sharepoint_url: string | null;
}

export const getDefaultChecklist = (): BS5839Checklist => ({
  visualInspection: {
    mcpsUnobstructed: null,
    newExitsWithoutMcp: null,
    partitionsNearDetectors: null,
    storageNearCeilings: null,
    additionalDetectionRequired: null,
    highRacking: null,
    inRackDetection: null,
    inRackRecommendation: null,
    clearSpaceBelow: null,
    occupancyChanges: null,
    buildingAlterations: null,
    detectorsNotDamaged: null,
    vadsNotObstructed: null,
    vadsLensesClean: null,
    cableFixingsSecure: null,
  },
  manualCallPoints: {
    switchMechanismTested: null,
  },
  automaticDetection: {
    detectorsFunctionallyTested: null,
    remoteIndicatorsTested: null,
    opticalBeamTested: null,
    aspiratingTested: null,
    carbonMonoxideTested: null,
    flameDetectorsTested: null,
    multiSensorsTested: null,
    analogueValuesChecked: null,
  },
  audibleAlarms: {
    devicesOperated: null,
    correctOperation: null,
  },
  visualAlarms: {
    devicesOperated: null,
    correctOperation: null,
  },
  ancillaryEquipment: {
    causeEffectConfirmed: null,
  },
  radioLinkedEquipment: {
    signalStrengthRecorded: null,
    signalStrengthAdequate: null,
    radioEquipmentServiced: null,
  },
  faultMonitoring: {
    removalOfDevice: null,
    shortCircuitAlarmDevices: null,
    shortCircuitPowerSupply: null,
    earthFault: null,
    fuseRemoval: null,
    shortCircuitControlEquipment: null,
    shortCircuitRepeatEquipment: null,
    shortCircuitArc: null,
    mainsPowerFailure: null,
    standbyPowerFailure: null,
    batteryChargerFailure: null,
    batteryDisconnection: null,
    communicationLink: null,
    endOfLineResistors: null,
    otherFireProtection: null,
    tactileAlarmDevices: null,
  },
  standbyPowerSupplies: {
    ventedBatteriesExamined: null,
    chargeVoltage: null,
    chargeVoltageWithinSpec: null,
    batteriesServiceable: null,
    batteriesLoadTested: null,
    specificGravityChecked: null,
    standbyBatteriesSized: null,
  },
  controlEquipment: {
    fireAlarmFunctionsChecked: null,
    controlsChecked: null,
    ancillaryFunctionsTested: null,
    printerTested: null,
    printerConsumables: null,
    filamentLampsReplaced: null,
  },
  causeEffect: {
    programmeConfirmed: null,
  },
  remoteTransmission: {
    alarmSignalsChecked: null,
    faultSignalsChecked: null,
  },
  detectionZones: {
    zonePlanSuitable: null,
  },
  falseAlarms: {
    detectorCount: null,
    falseAlarmCount: null,
    exceedsPermissible: null,
    elevenOrMoreAlarms: null,
    twoOrMoreFromSingleMcp: null,
    twoOrMoreFromSingleLocation: null,
    persistentCauseIdentified: null,
    investigationCarriedOut: null,
  },
  logbook: {
    faultsAttended: null,
    testDetailsRecorded: null,
    defectsReported: null,
  },
  certification: {
    bs5839CertIssued: null,
    bafeCertIssued: null,
  },
  postInspection: {
    systemReturnedToNormal: null,
    arcAdvised: null,
    equipmentReturned: null,
  },
});

export const CHECKLIST_LABELS: Record<string, Record<string, string>> = {
  visualInspection: {
    mcpsUnobstructed: "1.1 Are all manual call points unobstructed and conspicuous?",
    newExitsWithoutMcp: "1.2 Have there been any new exits created without the provision of a manual call point?",
    partitionsNearDetectors: "1.3 Are there any new or relocated partitions within 500mm of any automatic fire detector?",
    storageNearCeilings: "1.4 Is there any storage which encroaches within 300mm of ceilings?",
    additionalDetectionRequired: "1.5 If yes to 1.4, is there a requirement to install additional fire detection?",
    highRacking: "1.6 Is there any racking present greater than 8m in height or containing high value/risk materials?",
    inRackDetection: "1.7 If yes to 1.6, is in rack detection installed?",
    inRackRecommendation: "1.8 If no to 1.7, has recommendation been written for in rack detection?",
    clearSpaceBelow: "1.9 Is 500mm clear space being maintained below each automatic fire detector?",
    occupancyChanges: "1.10 Have there been any changes to occupancy making existing detection unsuitable?",
    buildingAlterations: "1.11 Have there been any alterations/extensions requiring additional detection?",
    detectorsNotDamaged: "1.12 Have all detectors & remote indicators been examined to ensure not damaged/painted?",
    vadsNotObstructed: "1.13 Have all visual alarm devices been checked that they are not obstructed from view?",
    vadsLensesClean: "1.14 Have all visual alarm devices been checked to ensure their lenses are clean?",
    cableFixingsSecure: "1.15 Has a visual inspection of cable fixings ensured they are secure and undamaged?",
  },
  manualCallPoints: {
    switchMechanismTested: "2.1 Has the switch mechanism of every manual call point been tested?",
  },
  automaticDetection: {
    detectorsFunctionallyTested: "3.1 Have all automatic fire detectors been functionally tested?",
    remoteIndicatorsTested: "3.2 Have all remote indicators been functionally tested?",
    opticalBeamTested: "3.3 Have all optical beam smoke detectors been functionally tested?",
    aspiratingTested: "3.4 Have all aspirating fire detectors been inspected & serviced per ASD Checklist?",
    carbonMonoxideTested: "3.5 Have all carbon monoxide fire detectors been functionally tested?",
    flameDetectorsTested: "3.6 Have all flame detectors been functionally tested?",
    multiSensorsTested: "3.7 Have all multi-sensors been functionally tested per manufacturer recommendations?",
    analogueValuesChecked: "3.8 Have all analogue values been confirmed within manufacturer's range?",
  },
  audibleAlarms: {
    devicesOperated: "4.1 Have all audible alarm devices been operated to check correct functioning?",
    correctOperation: "4.2 Have all audible alarm devices been checked for correct operation?",
  },
  visualAlarms: {
    devicesOperated: "5.1 Have all visual alarm devices been operated to check correct functioning?",
    correctOperation: "5.2 Have all visual alarm devices been checked for correct operation?",
  },
  ancillaryEquipment: {
    causeEffectConfirmed: "6.1 Has the cause and effect programme been confirmed by operating at least one cause?",
  },
  radioLinkedEquipment: {
    signalStrengthRecorded: "7.1 Are details of radio signal strength levels from commissioning held in logbook?",
    signalStrengthAdequate: "7.2 Radio signal strengths have been checked for adequacy and results recorded?",
    radioEquipmentServiced: "7.3 Has all radio system equipment been inspected per manufacturer recommendations?",
  },
  faultMonitoring: {
    removalOfDevice: "8.1 Removal of a manual call point, fire detector or detachable alarm device?",
    shortCircuitAlarmDevices: "8.2 Short circuit and open circuit to circuits serving fire alarm devices?",
    shortCircuitPowerSupply: "8.3 Short/open circuit of wiring between separate enclosure power supply and equipment?",
    earthFault: "8.4 Introduction of an earth fault?",
    fuseRemoval: "8.5 Removal of any fuse or operation of other protective device?",
    shortCircuitControlEquipment: "8.6 Short/open circuit on wiring between separate control/indicating equipment?",
    shortCircuitRepeatEquipment: "8.7 Short/open circuit on wiring between main and repeat control/mimic diagram?",
    shortCircuitArc: "8.8 Short/open circuit on wiring to alarm receiving centre transmission equipment?",
    mainsPowerFailure: "8.9 Introduction of a mains power failure?",
    standbyPowerFailure: "8.10 Introduction of a standby power failure?",
    batteryChargerFailure: "8.11 Introduction of a battery charger failure?",
    batteryDisconnection: "8.12 Disconnection of 1 battery where batteries are connected in parallel?",
    communicationLink: "8.13 Short/open/disconnection of communication link to separate systems (voice alarm etc)?",
    endOfLineResistors: "8.14 Removal of any end of line resistors (non addressable circuits)?",
    otherFireProtection: "8.15 All connections to other fire protection systems simulated for fault per BS7273?",
    tactileAlarmDevices: "8.16 All tactile alarm devices for people with impaired hearing simulated for fault?",
  },
  standbyPowerSupplies: {
    ventedBatteriesExamined: "9.1 Have all vented batteries and connections been examined with electrolyte checked?",
    chargeVoltage: "9.2 Battery steady state charge voltage measurement:",
    chargeVoltageWithinSpec: "9.3 Is the steady state charge voltage within manufacturer recommendations?",
    batteriesServiceable: "9.4 Batteries have been inspected and are in good serviceable condition?",
    batteriesLoadTested: "9.5 Batteries have been momentarily load tested with mains off - serviceable?",
    specificGravityChecked: "9.6 Have any vented batteries been examined to ensure specific gravity is correct?",
    standbyBatteriesSized: "9.7 Have all standby batteries been verified as suitably sized using verification record?",
  },
  controlEquipment: {
    fireAlarmFunctionsChecked: "10.1 Have all fire alarm functions been checked by operation of detector/MCP on each circuit?",
    controlsChecked: "10.2 Have all controls and visual indicators been checked for correct operation?",
    ancillaryFunctionsTested: "10.3 Have all ancillary functions of the CIE been tested?",
    printerTested: "10.4 Have all printers been tested for correct operation and legible characters?",
    printerConsumables: "10.5 Are there sufficient quantities of printer consumables until next service?",
    filamentLampsReplaced: "10.6 All unmonitored permanently illuminated filament lamp indicators replaced?",
  },
  causeEffect: {
    programmeConfirmed: "11.1 The cause & effect programme has been confirmed by operation of at least one cause?",
  },
  remoteTransmission: {
    alarmSignalsChecked: "12.1 Has automatic transmission of alarm signals to ARC been checked and confirmed?",
    faultSignalsChecked: "12.2 Has automatic transmission of fault signals to ARC been checked and confirmed?",
  },
  detectionZones: {
    zonePlanSuitable: "13.1 Is there a suitable zone plan correctly orientated and fixed to all CIE?",
  },
  falseAlarms: {
    detectorCount: "14.1 Quantity of fire detectors present on the system?",
    falseAlarmCount: "14.2 How many false alarms have occurred within the previous 12 months?",
    exceedsPermissible: "14.3 Does the rate of false alarms exceed 1 per 25 detectors per annum?",
    elevenOrMoreAlarms: "14.4 Have there been 11 or more false alarms since the previous service visit?",
    twoOrMoreFromSingleMcp: "14.5 Have there been 2+ false alarms from a single MCP or detector since last visit?",
    twoOrMoreFromSingleLocation: "14.6 Have there been 2+ false alarms from a single detector location since last visit?",
    persistentCauseIdentified: "14.7 Is there an identified persistent cause of false alarms?",
    investigationCarriedOut: "14.8 If yes to 14.3-14.7, has investigation been carried out and advice provided?",
  },
  logbook: {
    faultsAttended: "15.1 Have all faults recorded in the system logbook received appropriate attention?",
    testDetailsRecorded: "15.2 Have the details of MCPs and detectors used for test 10.1 been recorded in logbook?",
    defectsReported: "15.3 Have defects identified during this visit been reported and recorded in logbook?",
  },
  certification: {
    bs5839CertIssued: "16.1 Has a BS5839-1:2017 H.6 Inspection & Service certificate been issued?",
    bafeCertIssued: "16.2 Has a BAFE SP203-1 Section 5 Inspection & Service certificate been issued?",
  },
  postInspection: {
    systemReturnedToNormal: "17.1 The system has been returned to its normal state?",
    arcAdvised: "17.2 The alarm-receiving centre has been advised that normal monitoring is to resume?",
    equipmentReturned: "17.3 Test keys, access keys and documentation have been returned to the Client?",
  },
};

export const SECTION_LABELS: Record<string, string> = {
  visualInspection: "Section 1: Visual Inspection",
  manualCallPoints: "Section 2: Manual Call Points",
  automaticDetection: "Section 3: Automatic Detection",
  audibleAlarms: "Section 4: Audible Alarms",
  visualAlarms: "Section 5: Visual Alarms",
  ancillaryEquipment: "Section 6: Ancillary Equipment",
  radioLinkedEquipment: "Section 7: Radio Linked Equipment",
  faultMonitoring: "Section 8: Fault Monitoring",
  standbyPowerSupplies: "Section 9: Standby Power Supplies",
  controlEquipment: "Section 10: Control & Indicating Equipment",
  causeEffect: "Section 11: Cause & Effect",
  remoteTransmission: "Section 12: Remote Transmission of Alarms",
  detectionZones: "Section 13: Detection Zones",
  falseAlarms: "Section 14: False Alarms",
  logbook: "Section 15: Logbook",
  certification: "Section 16: Certification",
  postInspection: "Section 17: Post Inspection Checks",
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

export const INSPECTION_TYPES = [
  { value: "periodic", label: "Periodic Service" },
  { value: "annual", label: "Annual Inspection" },
  { value: "quarterly_vented", label: "Quarterly Inspection of Vented Batteries" },
];

export const SERVICE_FREQUENCIES = [
  { value: "quarterly", label: "Quarterly" },
  { value: "six_monthly", label: "Six Monthly" },
  { value: "other", label: "Other" },
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
  initialData?: Partial<Omit<ServiceReport, 'checklist'>> & { checklist?: BS5839Checklist },
  reportType: 'JOB' | 'CERT' = 'CERT',
  assignNumberNow: boolean = false
): Promise<ServiceReport> {
  // Only get report number now if explicitly requested (e.g., when completing)
  // This prevents consuming numbers for drafts that may be abandoned
  let reportNumber: string | null = null;
  
  if (assignNumberNow) {
    const { data: numberData, error: numberError } = await supabase
      .rpc('get_next_report_number', { report_type: reportType });
    
    if (numberError) {
      console.error("Failed to generate report number:", numberError);
    } else {
      reportNumber = numberData;
    }
  }

  const insertData = {
    visit_id: visitId,
    site_id: siteId,
    created_by: userId,
    checklist: JSON.parse(JSON.stringify(getDefaultChecklist())) as Json,
    report_number: reportNumber,
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

// Assign a report number to an existing report (call when completing/finalizing)
export async function assignReportNumber(
  reportId: string,
  reportType: 'JOB' | 'CERT' = 'JOB'
): Promise<string | null> {
  const { data: numberData, error: numberError } = await supabase
    .rpc('get_next_report_number', { report_type: reportType });
  
  if (numberError) {
    console.error("Failed to generate report number:", numberError);
    return null;
  }

  if (numberData) {
    const { error: updateError } = await supabase
      .from("service_reports")
      .update({ report_number: numberData })
      .eq("id", reportId);
    
    if (updateError) {
      console.error("Failed to assign report number:", updateError);
      return null;
    }
  }

  return numberData;
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
