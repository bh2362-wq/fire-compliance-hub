export const SYSTEM_TYPES = [
  'gent_vigilon', 'gent_squad', 'gent_compact', 'conventional', 'aspirating',
  'addressable_other', 'hybrid', 'voice_alarm', 'wireless',
] as const;
export type SystemType = typeof SYSTEM_TYPES[number];

export const JOB_CATEGORIES = [
  'new_install', 'system_upgrade', 'system_takeover', 'extension',
  'reactive_remedial', 'planned_maintenance', 'design_only',
  'commissioning_only', 'cause_and_effect', 'acceptance_testing',
  'verification', 'certification',
] as const;
export type JobCategory = typeof JOB_CATEGORIES[number];

export const BUILDING_TYPES = [
  'hotel', 'serviced_apartments', 'school_primary', 'school_secondary',
  'further_education', 'higher_education', 'healthcare_acute',
  'healthcare_care_home', 'office_commercial', 'retail',
  'industrial_warehouse', 'residential_hmo', 'residential_block',
  'gov_central', 'gov_local_authority', 'mod_defence', 'fcdo_diplomatic',
  'data_centre', 'leisure_hospitality', 'transport', 'other',
] as const;
export type BuildingType = typeof BUILDING_TYPES[number];

export const REGIONS = [
  'london_central', 'london_outer', 'south_east', 'south_west',
  'east_england', 'midlands', 'north', 'wales', 'scotland',
  'northern_ireland', 'overseas',
] as const;
export type Region = typeof REGIONS[number];

export const BS5839_CATEGORIES = ['L1', 'L2', 'L3', 'L4', 'L5', 'M', 'P1', 'P2', 'combined'] as const;
export type Bs5839Category = typeof BS5839_CATEGORIES[number];

export const BID_OUTCOMES = ['won', 'lost', 'pending', 'withdrawn', 'no_bid', 'awarded_no_pricing'] as const;
export type BidOutcome = typeof BID_OUTCOMES[number];

export const SYSTEM_TYPE_LABELS: Record<SystemType, string> = {
  gent_vigilon: 'Gent Vigilon',
  gent_squad: 'Gent Squad',
  gent_compact: 'Gent Compact',
  conventional: 'Conventional',
  aspirating: 'Aspirating (ASD)',
  addressable_other: 'Addressable (other)',
  hybrid: 'Hybrid',
  voice_alarm: 'Voice alarm',
  wireless: 'Wireless',
};

export const JOB_CATEGORY_LABELS: Record<JobCategory, string> = {
  new_install: 'New install',
  system_upgrade: 'System upgrade',
  system_takeover: 'System takeover',
  extension: 'Extension',
  reactive_remedial: 'Reactive / remedial',
  planned_maintenance: 'Planned maintenance',
  design_only: 'Design only',
  commissioning_only: 'Commissioning only',
  cause_and_effect: 'Cause & effect',
  acceptance_testing: 'Acceptance testing',
  verification: 'Verification',
  certification: 'Certification',
};

export const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
  hotel: 'Hotel',
  serviced_apartments: 'Serviced apartments',
  school_primary: 'Primary school',
  school_secondary: 'Secondary school',
  further_education: 'Further education',
  higher_education: 'Higher education',
  healthcare_acute: 'Healthcare (acute)',
  healthcare_care_home: 'Care home',
  office_commercial: 'Office / commercial',
  retail: 'Retail',
  industrial_warehouse: 'Industrial / warehouse',
  residential_hmo: 'Residential HMO',
  residential_block: 'Residential block',
  gov_central: 'Central government',
  gov_local_authority: 'Local authority',
  mod_defence: 'MoD / defence',
  fcdo_diplomatic: 'FCDO / diplomatic',
  data_centre: 'Data centre',
  leisure_hospitality: 'Leisure / hospitality',
  transport: 'Transport',
  other: 'Other',
};

export const REGION_LABELS: Record<Region, string> = {
  london_central: 'London (central)',
  london_outer: 'London (outer)',
  south_east: 'South East',
  south_west: 'South West',
  east_england: 'East of England',
  midlands: 'Midlands',
  north: 'North',
  wales: 'Wales',
  scotland: 'Scotland',
  northern_ireland: 'Northern Ireland',
  overseas: 'Overseas',
};

export const BS5839_CATEGORY_LABELS: Record<Bs5839Category, string> = {
  L1: 'L1', L2: 'L2', L3: 'L3', L4: 'L4', L5: 'L5',
  M: 'M', P1: 'P1', P2: 'P2', combined: 'Combined',
};

export const BID_OUTCOME_LABELS: Record<BidOutcome, string> = {
  won: 'Won',
  lost: 'Lost',
  pending: 'Pending',
  withdrawn: 'Withdrawn',
  no_bid: 'No bid',
  awarded_no_pricing: 'Awarded (no pricing)',
};

export interface QuoteScope {
  systemType: SystemType;
  buildingType: BuildingType;
  jobCategory?: JobCategory;
  deviceCount?: number;
  loopCount?: number;
  region?: Region;
  bs5839Category?: Bs5839Category;
  giaSqm?: number;
  lookbackYears?: number;
  limit?: number;
}

export interface ComparableJob {
  job_id: string;
  job_reference: string | null;
  client_name: string | null;
  classified_at: string;
  system_type: SystemType;
  job_category: JobCategory;
  building_type: BuildingType;
  region: Region | null;
  loop_count: number | null;
  device_count_total: number | null;
  gia_sqm: number | null;
  quoted_total: number | null;
  invoiced_total: number | null;
  achieved_margin_pct: number | null;
  bid_outcome: BidOutcome | null;
  cost_per_device: number | null;
  cost_per_loop: number | null;
  cost_per_sqm: number | null;
  similarity_score: number;
  scope_summary: string | null;
}

export interface ComparableJobsStats {
  sample_size: number;
  median_cost_per_device: number | null;
  p25_cost_per_device: number | null;
  p75_cost_per_device: number | null;
  median_cost_per_loop: number | null;
  median_cost_per_sqm: number | null;
  median_margin_pct: number | null;
  median_quoted_total: number | null;
  p25_quoted_total: number | null;
  p75_quoted_total: number | null;
  recommended_low: number | null;
  recommended_target: number | null;
  recommended_high: number | null;
  win_rate_pct: number | null;
  jobs_won: number;
  jobs_lost: number;
}

export interface ComparablesResult {
  jobs: ComparableJob[];
  stats: ComparableJobsStats | null;
}

export interface MarketContext {
  sample_size: number;
  median_value: number | null;
  p25_value: number | null;
  p75_value: number | null;
  recent_count_12mo: number;
  top_buyers: Array<{ name: string; count: number; median_value: number }>;
}

export interface IngestRun {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed' | null;
  records_fetched: number | null;
  records_upserted: number | null;
  records_skipped: number | null;
  window_from: string | null;
  window_to: string | null;
  error_message: string | null;
  run_metadata: Record<string, unknown> | null;
}

/* ------------------------------------------------------------------ */
/* AI pricing assessment (generate-pricing-narrative edge function)    */
/* ------------------------------------------------------------------ */

export type RiskFlagSeverity = 'high' | 'medium' | 'low';

export type RiskFlagCategory =
  | 'labour'
  | 'materials'
  | 'access'
  | 'programme'
  | 'competitive'
  | 'scope'
  | 'margin'
  | 'data_quality';

export interface RiskFlag {
  severity: RiskFlagSeverity;
  category: RiskFlagCategory;
  flag: string;
}

export interface PricingAssessment {
  recommendation_id: string;
  narrative: string;
  risk_flags: RiskFlag[];
  win_probability_pct: number | null;
  suggested_margin_pct: number | null;
  confidence_score: number;
  caveats?: string[];
  hallucination_detected?: boolean;
  fabricated_references?: string[];
  outcome_misattributions?: string[];
  based_on: {
    comparable_count: number;
    market_context_count: number;
    lookback_years: number;
  };
  generated_at?: string;
  model_version?: string;
}

export interface PricingAssessmentInsufficientData {
  recommendation_id: null;
  narrative: null;
  reason: 'insufficient_data';
  flags: [];
  win_probability: null;
  suggested_margin: null;
  confidence: 0;
}

export type PricingAssessmentResult =
  | PricingAssessment
  | PricingAssessmentInsufficientData;

export function isPricingAssessment(
  r: PricingAssessmentResult,
): r is PricingAssessment {
  return r.recommendation_id !== null;
}

