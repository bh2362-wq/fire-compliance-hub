// FireLogbook :: Cost Intelligence v2 :: types
// Matches cost_intelligence_v2.* schema + civ2_* RPCs.

export const CIV2_JOB_CATEGORIES = [
  'install', 'service', 'remedial', 'design', 'commissioning',
  'takeover', 'emergency', 'project', 'other',
] as const;
export type Civ2JobCategory = typeof CIV2_JOB_CATEGORIES[number];

export const CIV2_SYSTEM_TYPES = [
  'fire_alarm', 'emergency_lighting', 'sprinkler', 'suppression', 'aov',
  'disabled_refuge', 'nurse_call', 'door_entry', 'cctv', 'intruder', 'other',
] as const;
export type Civ2SystemType = typeof CIV2_SYSTEM_TYPES[number];

export const CIV2_PANEL_MAKES = [
  'gent', 'advanced', 'kentec', 'c_tec', 'morley',
  'notifier', 'hochiki', 'apollo', 'fike', 'menvier', 'other',
] as const;
export type Civ2PanelMake = typeof CIV2_PANEL_MAKES[number];

export const CIV2_BUILDING_TYPES = [
  'office', 'retail', 'industrial', 'warehouse', 'residential', 'hmo',
  'care_home', 'school', 'hospital', 'hotel', 'public', 'mixed_use', 'other',
] as const;
export type Civ2BuildingType = typeof CIV2_BUILDING_TYPES[number];

export const CIV2_COMPLEXITIES = ['low', 'medium', 'high', 'very_high'] as const;
export type Civ2Complexity = typeof CIV2_COMPLEXITIES[number];

export const CIV2_OUTCOMES = ['won', 'lost', 'pending', 'withdrawn'] as const;
export type Civ2Outcome = typeof CIV2_OUTCOMES[number];

export interface Civ2ScopeInput {
  job_category: Civ2JobCategory;
  system_type: Civ2SystemType;
  panel_make?: Civ2PanelMake | null;
  building_type?: Civ2BuildingType | null;
  region?: string | null;
  device_count?: number | null;
}

export interface Civ2Comparable {
  quotation_id: string;
  quotation_number: string | null;
  job_category: Civ2JobCategory;
  system_type: Civ2SystemType;
  panel_make: Civ2PanelMake | null;
  building_type: Civ2BuildingType | null;
  region: string | null;
  device_count: number | null;
  complexity: Civ2Complexity | null;
  total_cost: number | null;
  quoted_price: number | null;
  margin_percent: number | null;
  outcome: Civ2Outcome | null;
  decided_at: string | null;
  similarity_score: number;
}

export interface Civ2BenchmarkSummary {
  sample_size: number;
  win_rate: number | null;
  avg_quoted_price: number | null;
  median_quoted_price: number | null;
  p25_quoted_price: number | null;
  p75_quoted_price: number | null;
  avg_total_cost: number | null;
  avg_margin_percent: number | null;
}

export interface Civ2PriceRecommendation {
  suggested_price: number | null;
  floor: number | null;
  ceiling: number | null;
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
}
