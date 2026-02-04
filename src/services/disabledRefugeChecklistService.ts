// Disabled Refuge System (EVC) Service Checklist
// Based on BS 5839-9 standard

export interface DisabledRefugeChecklist {
  // Section 1: Documentation & Compliance
  documentation_compliance: {
    system_designed_to_bs5839_9: boolean | null;
    as_built_drawings_available: boolean | null;
    om_manuals_available: boolean | null;
    log_book_present_completed: boolean | null;
    refuge_locations_on_fire_plans: boolean | null;
    fire_risk_assessment_references_refuge: boolean | null;
  };

  // Section 2: Control Equipment (Master Station)
  control_equipment: {
    master_panel_securely_mounted: boolean | null;
    panel_clearly_labelled: boolean | null;
    mains_power_indicator_operational: boolean | null;
    standby_batteries_installed: boolean | null;
    no_visible_damage_or_faults: boolean | null;
    system_reset_function_operates: boolean | null;
  };

  // Section 3: Power Supplies
  power_supplies: {
    mains_supply_present_labelled: boolean | null;
    battery_capacity_suitable: boolean | null;
    batteries_free_from_corrosion: boolean | null;
    battery_connections_secure: boolean | null;
    charger_functioning_correctly: boolean | null;
  };

  // Section 4: Disabled Refuge Outstations
  refuge_outstations: {
    installed_at_compliant_height: boolean | null;
    clearly_signed_with_refuge_signage: boolean | null;
    call_button_operates: boolean | null;
    two_way_speech_clear: boolean | null;
    visual_indicator_operates: boolean | null;
    no_physical_damage: boolean | null;
  };

  // Section 5: Communication Performance
  communication_performance: {
    call_connects_to_master_station: boolean | null;
    speech_audible_both_ways: boolean | null;
    no_background_noise_interference: boolean | null;
    multiple_calls_handled: boolean | null;
    priority_operation_works: boolean | null;
  };

  // Section 6: Cabling & Installation
  cabling_installation: {
    fire_resistant_cabling_installed: boolean | null;
    cable_routes_protected: boolean | null;
    glands_terminations_secure: boolean | null;
    no_exposed_damaged_cables: boolean | null;
    correct_segregation_from_non_fire: boolean | null;
  };

  // Section 7: Signage & Identification
  signage_identification: {
    refuge_signage_visible_compliant: boolean | null;
    instructions_displayed_at_outstations: boolean | null;
    master_station_location_identified: boolean | null;
    staff_instructions_displayed: boolean | null;
  };

  // Section 8: Testing & Maintenance
  testing_maintenance: {
    weekly_test_procedure_in_place: boolean | null;
    monthly_visual_inspection_completed: boolean | null;
    annual_service_carried_out: boolean | null;
    all_tests_recorded_in_log: boolean | null;
    faults_recorded_and_rectified: boolean | null;
  };

  // Section 9: Staff Awareness
  staff_awareness: {
    staff_trained_on_operation: boolean | null;
    emergency_procedures_understood: boolean | null;
    refuge_in_evacuation_plan: boolean | null;
    responsible_person_identified: boolean | null;
  };

  // Section 10: Final Status
  final_status: {
    system_fully_operational: boolean | null;
    no_outstanding_faults: boolean | null;
    system_returned_to_normal: boolean | null;
  };

  // Additional notes/activities
  additional_notes: string;

  // Sections excluded from PDF
  excluded_sections?: string[];

  // Individual items excluded from PDF (format: "section.item_key")
  excluded_items?: string[];
}

export const getDefaultDisabledRefugeChecklist = (): DisabledRefugeChecklist => ({
  documentation_compliance: {
    system_designed_to_bs5839_9: null,
    as_built_drawings_available: null,
    om_manuals_available: null,
    log_book_present_completed: null,
    refuge_locations_on_fire_plans: null,
    fire_risk_assessment_references_refuge: null,
  },
  control_equipment: {
    master_panel_securely_mounted: null,
    panel_clearly_labelled: null,
    mains_power_indicator_operational: null,
    standby_batteries_installed: null,
    no_visible_damage_or_faults: null,
    system_reset_function_operates: null,
  },
  power_supplies: {
    mains_supply_present_labelled: null,
    battery_capacity_suitable: null,
    batteries_free_from_corrosion: null,
    battery_connections_secure: null,
    charger_functioning_correctly: null,
  },
  refuge_outstations: {
    installed_at_compliant_height: null,
    clearly_signed_with_refuge_signage: null,
    call_button_operates: null,
    two_way_speech_clear: null,
    visual_indicator_operates: null,
    no_physical_damage: null,
  },
  communication_performance: {
    call_connects_to_master_station: null,
    speech_audible_both_ways: null,
    no_background_noise_interference: null,
    multiple_calls_handled: null,
    priority_operation_works: null,
  },
  cabling_installation: {
    fire_resistant_cabling_installed: null,
    cable_routes_protected: null,
    glands_terminations_secure: null,
    no_exposed_damaged_cables: null,
    correct_segregation_from_non_fire: null,
  },
  signage_identification: {
    refuge_signage_visible_compliant: null,
    instructions_displayed_at_outstations: null,
    master_station_location_identified: null,
    staff_instructions_displayed: null,
  },
  testing_maintenance: {
    weekly_test_procedure_in_place: null,
    monthly_visual_inspection_completed: null,
    annual_service_carried_out: null,
    all_tests_recorded_in_log: null,
    faults_recorded_and_rectified: null,
  },
  staff_awareness: {
    staff_trained_on_operation: null,
    emergency_procedures_understood: null,
    refuge_in_evacuation_plan: null,
    responsible_person_identified: null,
  },
  final_status: {
    system_fully_operational: null,
    no_outstanding_faults: null,
    system_returned_to_normal: null,
  },
  additional_notes: "",
});

export const DISABLED_REFUGE_CHECKLIST_LABELS: Record<string, Record<string, string>> = {
  documentation_compliance: {
    system_designed_to_bs5839_9: "System designed and installed to BS 5839-9",
    as_built_drawings_available: "As-built drawings available and up to date",
    om_manuals_available: "O&M manuals available on site",
    log_book_present_completed: "Log book present and completed",
    refuge_locations_on_fire_plans: "Refuge locations clearly identified on fire plans",
    fire_risk_assessment_references_refuge: "Fire Risk Assessment references disabled refuge provision",
  },
  control_equipment: {
    master_panel_securely_mounted: "Master control panel securely mounted and accessible",
    panel_clearly_labelled: "Panel clearly labelled 'Disabled Refuge / EVC'",
    mains_power_indicator_operational: "Mains power indicator present and operational",
    standby_batteries_installed: "Standby batteries installed and secure",
    no_visible_damage_or_faults: "No visible damage or fault indications",
    system_reset_function_operates: "System reset function operates correctly",
  },
  power_supplies: {
    mains_supply_present_labelled: "Mains supply present and correctly labelled",
    battery_capacity_suitable: "Battery capacity suitable (24hrs standby + 3hrs operation)",
    batteries_free_from_corrosion: "Batteries free from corrosion or leakage",
    battery_connections_secure: "Battery connections tight and secure",
    charger_functioning_correctly: "Charger functioning correctly",
  },
  refuge_outstations: {
    installed_at_compliant_height: "Installed at compliant height and accessible to wheelchair users",
    clearly_signed_with_refuge_signage: "Clearly signed with standard refuge signage",
    call_button_operates: "Call button operates correctly",
    two_way_speech_clear: "Two-way speech clear and intelligible",
    visual_indicator_operates: "Visual indicator (LED) operates correctly",
    no_physical_damage: "No physical damage to faceplate or controls",
  },
  communication_performance: {
    call_connects_to_master_station: "Call connects to correct master station location",
    speech_audible_both_ways: "Speech audible both ways without distortion",
    no_background_noise_interference: "No excessive background noise or interference",
    multiple_calls_handled: "Multiple calls handled correctly (if applicable)",
    priority_operation_works: "Priority operation works as intended",
  },
  cabling_installation: {
    fire_resistant_cabling_installed: "Fire-resistant cabling installed (where required)",
    cable_routes_protected: "Cable routes protected and adequately supported",
    glands_terminations_secure: "Glands, terminations, and fixings secure",
    no_exposed_damaged_cables: "No exposed or damaged cables",
    correct_segregation_from_non_fire: "Correct segregation from non-fire systems",
  },
  signage_identification: {
    refuge_signage_visible_compliant: "Refuge signage visible and compliant",
    instructions_displayed_at_outstations: "Instructions for use displayed at outstations",
    master_station_location_identified: "Master station location clearly identified",
    staff_instructions_displayed: "Staff instructions displayed where appropriate",
  },
  testing_maintenance: {
    weekly_test_procedure_in_place: "Weekly user test procedure in place (where required)",
    monthly_visual_inspection_completed: "Monthly visual inspection completed",
    annual_service_carried_out: "Six-monthly or annual service carried out by competent person",
    all_tests_recorded_in_log: "All tests recorded in log book",
    faults_recorded_and_rectified: "Any faults recorded and rectified",
  },
  staff_awareness: {
    staff_trained_on_operation: "Staff trained on system operation",
    emergency_procedures_understood: "Emergency procedures understood",
    refuge_in_evacuation_plan: "Refuge management included in evacuation plan",
    responsible_person_identified: "Responsible person identified",
  },
  final_status: {
    system_fully_operational: "System fully operational",
    no_outstanding_faults: "No outstanding faults",
    system_returned_to_normal: "System left in normal operating condition",
  },
};

export const DISABLED_REFUGE_SECTION_LABELS: Record<string, string> = {
  documentation_compliance: "Documentation & Compliance",
  control_equipment: "Control Equipment (Master Station)",
  power_supplies: "Power Supplies",
  refuge_outstations: "Disabled Refuge Outstations",
  communication_performance: "Communication Performance",
  cabling_installation: "Cabling & Installation",
  signage_identification: "Signage & Identification",
  testing_maintenance: "Testing & Maintenance",
  staff_awareness: "Staff Awareness",
  final_status: "Final Status",
  additional_notes: "Additional Notes",
};
