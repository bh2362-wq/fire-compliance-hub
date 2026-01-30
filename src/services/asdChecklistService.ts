// ASD (Aspirating Smoke Detection) Service Checklist
// Based on BS 5839-1:2025 requirements for aspirating systems

export interface ASDChecklist {
  // Section 1: Documentation & Preliminary
  documentation: {
    zonesCovered: boolean | null;
    previousRecordsReviewed: boolean | null;
    outstandingFaultsReviewed: boolean | null;
    drawingsMatchInstallation: boolean | null;
    causeEffectConfirmed: boolean | null;
    logbookChecked: boolean | null;
  };
  // Section 2: Power Supply & Batteries
  powerSupply: {
    mainsSupplyPresent: boolean | null;
    powerIndicatorsNormal: boolean | null;
    batteriesFittedSecure: boolean | null;
    batteryCapacityCorrect: boolean | null;
    batteryAgeChecked: boolean | null;
    batteryLoadTestCompleted: boolean | null;
    chargerFunctioning: boolean | null;
  };
  // Section 3: ASD Control Unit
  controlUnit: {
    noFaultsDisplayed: boolean | null;
    displayIndicatorsOperational: boolean | null;
    eventLogReviewed: boolean | null;
    configurationVerified: boolean | null;
    alarmThresholdsAppropriate: boolean | null;
  };
  // Section 4: Airflow & Pipe Network
  airflowNetwork: {
    airflowReadingsNormal: boolean | null;
    noAirflowFaults: boolean | null;
    samplingPipesSecure: boolean | null;
    pipeworkFreeFromDamage: boolean | null;
    endCapsFitted: boolean | null;
    samplingHolesClear: boolean | null;
    pipeworkLabelled: boolean | null;
  };
  // Section 5: Filters & Cleanliness
  filtersCleanliness: {
    filterInspected: boolean | null;
    filterCleanedReplaced: boolean | null;
    detectorChamberClean: boolean | null;
    noExcessiveDust: boolean | null;
  };
  // Section 6: Functional Smoke Testing
  functionalTesting: {
    smokeIntroducedAtSamplingPoint: boolean | null;
    smokeIntroducedAtFurthestPoint: boolean | null;
    transportTimeRecorded: boolean | null;
    transportTime: string | null; // Store actual time value
    asdAlarmActivated: boolean | null;
    alarmReceivedAtPanel: boolean | null;
    correctZoneDisplayed: boolean | null;
    soundersOperated: boolean | null;
    systemResetCorrectly: boolean | null;
  };
  // Section 7: Interfaces & Signals
  interfacesSignals: {
    alarmSignalTransmitted: boolean | null;
    faultSignalTransmitted: boolean | null;
    interfacesOperated: boolean | null;
    remoteMonitoringConfirmed: boolean | null;
  };
  // Section 8: Faults & Remedials
  faultsRemedials: {
    faultsIdentified: boolean | null;
    faultsRecordedInLogbook: boolean | null;
    immediateRepairsCompleted: boolean | null;
    outstandingIssuesListed: boolean | null;
    clientInformed: boolean | null;
  };
}

export const getDefaultASDChecklist = (): ASDChecklist => ({
  documentation: {
    zonesCovered: null,
    previousRecordsReviewed: null,
    outstandingFaultsReviewed: null,
    drawingsMatchInstallation: null,
    causeEffectConfirmed: null,
    logbookChecked: null,
  },
  powerSupply: {
    mainsSupplyPresent: null,
    powerIndicatorsNormal: null,
    batteriesFittedSecure: null,
    batteryCapacityCorrect: null,
    batteryAgeChecked: null,
    batteryLoadTestCompleted: null,
    chargerFunctioning: null,
  },
  controlUnit: {
    noFaultsDisplayed: null,
    displayIndicatorsOperational: null,
    eventLogReviewed: null,
    configurationVerified: null,
    alarmThresholdsAppropriate: null,
  },
  airflowNetwork: {
    airflowReadingsNormal: null,
    noAirflowFaults: null,
    samplingPipesSecure: null,
    pipeworkFreeFromDamage: null,
    endCapsFitted: null,
    samplingHolesClear: null,
    pipeworkLabelled: null,
  },
  filtersCleanliness: {
    filterInspected: null,
    filterCleanedReplaced: null,
    detectorChamberClean: null,
    noExcessiveDust: null,
  },
  functionalTesting: {
    smokeIntroducedAtSamplingPoint: null,
    smokeIntroducedAtFurthestPoint: null,
    transportTimeRecorded: null,
    transportTime: null,
    asdAlarmActivated: null,
    alarmReceivedAtPanel: null,
    correctZoneDisplayed: null,
    soundersOperated: null,
    systemResetCorrectly: null,
  },
  interfacesSignals: {
    alarmSignalTransmitted: null,
    faultSignalTransmitted: null,
    interfacesOperated: null,
    remoteMonitoringConfirmed: null,
  },
  faultsRemedials: {
    faultsIdentified: null,
    faultsRecordedInLogbook: null,
    immediateRepairsCompleted: null,
    outstandingIssuesListed: null,
    clientInformed: null,
  },
});

export const ASD_CHECKLIST_LABELS: Record<string, Record<string, string>> = {
  documentation: {
    zonesCovered: "1.1 Confirm ASD zones/areas covered",
    previousRecordsReviewed: "1.2 Review previous service records",
    outstandingFaultsReviewed: "1.3 Review outstanding faults/advisories",
    drawingsMatchInstallation: "1.4 Confirm drawings match installation",
    causeEffectConfirmed: "1.5 Confirm cause and effect for ASD alarms",
    logbookChecked: "1.6 Check fire logbook entries",
  },
  powerSupply: {
    mainsSupplyPresent: "2.1 Mains supply present",
    powerIndicatorsNormal: "2.2 Power supply indicators normal",
    batteriesFittedSecure: "2.3 Batteries fitted and secure",
    batteryCapacityCorrect: "2.4 Battery capacity correct",
    batteryAgeChecked: "2.5 Battery age/date checked",
    batteryLoadTestCompleted: "2.6 Battery load test completed (if applicable)",
    chargerFunctioning: "2.7 Charger functioning correctly",
  },
  controlUnit: {
    noFaultsDisplayed: "3.1 No faults displayed",
    displayIndicatorsOperational: "3.2 Display and indicators operational",
    eventLogReviewed: "3.3 Event log reviewed",
    configurationVerified: "3.4 Configuration/sensitivity verified (if accessible)",
    alarmThresholdsAppropriate: "3.5 Alarm thresholds appropriate",
  },
  airflowNetwork: {
    airflowReadingsNormal: "4.1 Airflow readings within normal range",
    noAirflowFaults: "4.2 No airflow faults present",
    samplingPipesSecure: "4.3 Sampling pipes secure",
    pipeworkFreeFromDamage: "4.4 Pipework free from damage",
    endCapsFitted: "4.5 End caps fitted",
    samplingHolesClear: "4.6 Sampling holes clear",
    pipeworkLabelled: "4.7 Pipework labelled",
  },
  filtersCleanliness: {
    filterInspected: "5.1 Filter inspected",
    filterCleanedReplaced: "5.2 Filter cleaned or replaced as required",
    detectorChamberClean: "5.3 Detector chamber clean (where permitted)",
    noExcessiveDust: "5.4 No excessive dust contamination",
  },
  functionalTesting: {
    smokeIntroducedAtSamplingPoint: "6.1 Smoke introduced at sampling point",
    smokeIntroducedAtFurthestPoint: "6.2 Smoke introduced at furthest sampling point (where practical)",
    transportTimeRecorded: "6.3 Transport time recorded",
    transportTime: "6.4 Transport time (seconds):",
    asdAlarmActivated: "6.5 ASD alarm activated correctly",
    alarmReceivedAtPanel: "6.6 Alarm received at fire alarm control panel",
    correctZoneDisplayed: "6.7 Correct zone/device displayed",
    soundersOperated: "6.8 Sounders/outputs operated",
    systemResetCorrectly: "6.9 System reset correctly",
  },
  interfacesSignals: {
    alarmSignalTransmitted: "7.1 Alarm signal transmitted to fire panel",
    faultSignalTransmitted: "7.2 Fault signal transmitted correctly",
    interfacesOperated: "7.3 Interfaces operated",
    remoteMonitoringConfirmed: "7.4 Remote monitoring confirmed (if applicable)",
  },
  faultsRemedials: {
    faultsIdentified: "8.1 Faults identified during service",
    faultsRecordedInLogbook: "8.2 Faults recorded in logbook",
    immediateRepairsCompleted: "8.3 Immediate repairs completed (if possible)",
    outstandingIssuesListed: "8.4 Outstanding issues listed as advisories",
    clientInformed: "8.5 Client informed",
  },
};

export const ASD_SECTION_LABELS: Record<string, string> = {
  documentation: "Section 1: Documentation & Preliminary",
  powerSupply: "Section 2: Power Supply & Batteries",
  controlUnit: "Section 3: ASD Control Unit",
  airflowNetwork: "Section 4: Airflow & Pipe Network",
  filtersCleanliness: "Section 5: Filters & Cleanliness",
  functionalTesting: "Section 6: Functional Smoke Testing",
  interfacesSignals: "Section 7: Interfaces & Signals",
  faultsRemedials: "Section 8: Faults & Remedials",
};
