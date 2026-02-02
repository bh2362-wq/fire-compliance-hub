// ASD (Aspirating Smoke Detection) Service Checklist
// Based on user's job sheet format

export interface AirflowReading {
  before: string;
  after: string;
}

export interface ASDChecklist {
  // Section 1: Pre-Service Actions
  pre_service_actions: {
    airflow_recorded: boolean | null;
    event_log_downloaded: boolean | null;
    configuration_file_downloaded: boolean | null;
    event_log_given_to_site_manager: boolean | null;
    configuration_file_given_to_site_manager: boolean | null;
  };
  
  // Section 2: Airflow Readings (before and after service)
  airflow_readings: {
    pipe_1: AirflowReading;
    pipe_2: AirflowReading;
    pipe_3: AirflowReading;
    pipe_4: AirflowReading;
  };
  
  // Section 3: Faults and Repairs
  faults_and_repairs: {
    detector_faults_present: boolean | null;
    actions_taken: string;
    parts_replaced: string;
  };
  
  // Section 4: Cleaning Activities
  cleaning_activities: {
    filter_cleaned_or_replaced: boolean | null;
    pipe_flush_completed: boolean | null;
    sampling_holes_cleaned: boolean | null;
    capillaries_cleaned: boolean | null;
  };
  
  // Section 5: System Checks
  system_checks: {
    service_history_reviewed: boolean | null;
    power_supply_ups_checked: boolean | null;
    battery_backup_checked: boolean | null;
    battery_charging_checked: boolean | null;
    fire_alarm_tested_at_detector: boolean | null;
    fault_notification_tested_at_detector: boolean | null;
    fire_alarm_tested_at_monitoring_system: boolean | null;
    fault_notification_tested_at_monitoring_system: boolean | null;
    compared_to_commissioning_data: boolean | null;
    system_returned_to_normal_mode: boolean | null;
  };
  
  // Section 6: Additional Activities
  additional_activities: string;
  
  // Section 7: Environment & Filter Info
  environment_and_filter_info: {
    environment_class: string;
    filter_replacement_frequency_months: string;
  };

  // Sections excluded from PDF
  excluded_sections?: string[];
  
  // Individual items excluded from PDF (format: "section.item_key")
  excluded_items?: string[];
}

export const getDefaultASDChecklist = (): ASDChecklist => ({
  pre_service_actions: {
    airflow_recorded: null,
    event_log_downloaded: null,
    configuration_file_downloaded: null,
    event_log_given_to_site_manager: null,
    configuration_file_given_to_site_manager: null,
  },
  airflow_readings: {
    pipe_1: { before: "", after: "" },
    pipe_2: { before: "", after: "" },
    pipe_3: { before: "", after: "" },
    pipe_4: { before: "", after: "" },
  },
  faults_and_repairs: {
    detector_faults_present: null,
    actions_taken: "",
    parts_replaced: "",
  },
  cleaning_activities: {
    filter_cleaned_or_replaced: null,
    pipe_flush_completed: null,
    sampling_holes_cleaned: null,
    capillaries_cleaned: null,
  },
  system_checks: {
    service_history_reviewed: null,
    power_supply_ups_checked: null,
    battery_backup_checked: null,
    battery_charging_checked: null,
    fire_alarm_tested_at_detector: null,
    fault_notification_tested_at_detector: null,
    fire_alarm_tested_at_monitoring_system: null,
    fault_notification_tested_at_monitoring_system: null,
    compared_to_commissioning_data: null,
    system_returned_to_normal_mode: null,
  },
  additional_activities: "",
  environment_and_filter_info: {
    environment_class: "",
    filter_replacement_frequency_months: "",
  },
});

export const ASD_CHECKLIST_LABELS = {
  pre_service_actions: {
    airflow_recorded: "Airflow recorded before service",
    event_log_downloaded: "Event log downloaded",
    configuration_file_downloaded: "Configuration file downloaded",
    event_log_given_to_site_manager: "Event log given to site manager",
    configuration_file_given_to_site_manager: "Configuration file given to site manager",
  },
  faults_and_repairs: {
    detector_faults_present: "Detector faults present",
  },
  cleaning_activities: {
    filter_cleaned_or_replaced: "Filter cleaned or replaced",
    pipe_flush_completed: "Pipe flush completed",
    sampling_holes_cleaned: "Sampling holes cleaned",
    capillaries_cleaned: "Capillaries cleaned",
  },
  system_checks: {
    service_history_reviewed: "Service history reviewed",
    power_supply_ups_checked: "Power supply / UPS checked",
    battery_backup_checked: "Battery backup checked",
    battery_charging_checked: "Battery charging checked",
    fire_alarm_tested_at_detector: "Fire alarm tested at detector",
    fault_notification_tested_at_detector: "Fault notification tested at detector",
    fire_alarm_tested_at_monitoring_system: "Fire alarm tested at monitoring system",
    fault_notification_tested_at_monitoring_system: "Fault notification tested at monitoring system",
    compared_to_commissioning_data: "Compared to commissioning data",
    system_returned_to_normal_mode: "System returned to normal mode",
  },
};

export const ASD_SECTION_LABELS: Record<string, string> = {
  pre_service_actions: "Pre-Service Actions",
  airflow_readings: "Airflow Readings",
  faults_and_repairs: "Faults & Repairs",
  cleaning_activities: "Cleaning Activities",
  system_checks: "System Checks",
  additional_activities: "Additional Activities",
  environment_and_filter_info: "Environment & Filter Information",
};

export const ENVIRONMENT_CLASSES = [
  { value: "1", label: "Class 1 - Clean office environment" },
  { value: "2", label: "Class 2 - Standard office/retail" },
  { value: "3", label: "Class 3 - Light industrial" },
  { value: "4", label: "Class 4 - Industrial" },
  { value: "5", label: "Class 5 - Heavy industrial" },
  { value: "6", label: "Class 6 - Extreme conditions" },
];
