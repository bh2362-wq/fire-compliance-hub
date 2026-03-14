import { supabase } from "@/integrations/supabase/client";

// ============================================
// DOCUMENT CONTROL
// ============================================

export interface QMSDocument {
  id: string;
  category_id: string | null;
  document_number: string;
  title: string;
  description: string | null;
  current_version: number;
  status: string;
  review_frequency_months: number | null;
  next_review_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  category?: QMSDocumentCategory;
  versions?: QMSDocumentVersion[];
}

export interface QMSDocumentCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QMSDocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  changes_summary: string | null;
  created_by: string;
  created_at: string;
}

export const fetchDocumentCategories = async (): Promise<QMSDocumentCategory[]> => {
  const { data, error } = await supabase
    .from('qms_document_categories')
    .select('*')
    .order('sort_order');
  
  if (error) throw error;
  return data || [];
};

export const fetchDocuments = async (): Promise<QMSDocument[]> => {
  const { data, error } = await supabase
    .from('qms_documents')
    .select(`
      *,
      category:qms_document_categories(*)
    `)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data || []) as unknown as QMSDocument[];
};

export const createDocument = async (doc: Partial<QMSDocument>): Promise<QMSDocument> => {
  // Get next document number
  const { data: numData, error: numError } = await supabase.rpc('get_next_qms_number', { prefix: 'DOC' });
  if (numError) throw numError;

  const { data, error } = await supabase
    .from('qms_documents')
    .insert({
      category_id: doc.category_id,
      title: doc.title || '',
      description: doc.description,
      status: doc.status || 'draft',
      review_frequency_months: doc.review_frequency_months,
      next_review_date: doc.next_review_date,
      created_by: doc.created_by || '',
      document_number: numData,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data as unknown as QMSDocument;
};

export const fetchDocumentVersions = async (documentId: string): Promise<QMSDocumentVersion[]> => {
  const { data, error } = await supabase
    .from('qms_document_versions')
    .select('*')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false });
  
  if (error) throw error;
  return data || [];
};

// ============================================
// NON-CONFORMANCE REPORTS
// ============================================

export interface QMSNCR {
  id: string;
  ncr_number: string;
  site_id: string | null;
  visit_id: string | null;
  customer_id: string | null;
  title: string;
  description: string;
  source: string;
  severity: string;
  status: string;
  root_cause: string | null;
  immediate_action: string | null;
  raised_by: string;
  assigned_to: string | null;
  due_date: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
  site?: { name: string } | null;
  customer?: { name: string } | null;
}

export const fetchNCRs = async (): Promise<QMSNCR[]> => {
  const { data, error } = await supabase
    .from('qms_ncrs')
    .select(`
      *,
      site:sites(name),
      customer:customers(name)
    `)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data || []) as unknown as QMSNCR[];
};

export const createNCR = async (ncr: Partial<QMSNCR>): Promise<QMSNCR> => {
  const { data: numData, error: numError } = await supabase.rpc('get_next_qms_number', { prefix: 'NCR' });
  if (numError) throw numError;

  const { data, error } = await supabase
    .from('qms_ncrs')
    .insert({
      title: ncr.title || '',
      description: ncr.description || '',
      source: ncr.source || 'other',
      severity: ncr.severity || 'minor',
      status: ncr.status || 'open',
      site_id: ncr.site_id,
      visit_id: ncr.visit_id,
      customer_id: ncr.customer_id,
      root_cause: ncr.root_cause,
      immediate_action: ncr.immediate_action,
      raised_by: ncr.raised_by || '',
      assigned_to: ncr.assigned_to,
      due_date: ncr.due_date,
      ncr_number: numData,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data as unknown as QMSNCR;
};

export const updateNCR = async (id: string, updates: Partial<QMSNCR>): Promise<QMSNCR> => {
  const { data, error } = await supabase
    .from('qms_ncrs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data as unknown as QMSNCR;
};

// ============================================
// CAPAs
// ============================================

export interface QMSCAPA {
  id: string;
  capa_number: string;
  ncr_id: string | null;
  type: string;
  title: string;
  description: string;
  action_plan: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  verification_required: boolean;
  verified_by: string | null;
  verified_at: string | null;
  effectiveness_review: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  ncr?: { ncr_number: string; title: string } | null;
}

export const fetchCAPAs = async (): Promise<QMSCAPA[]> => {
  const { data, error } = await supabase
    .from('qms_capas')
    .select(`
      *,
      ncr:qms_ncrs(ncr_number, title)
    `)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data || []) as unknown as QMSCAPA[];
};

export const createCAPA = async (capa: Partial<QMSCAPA>): Promise<QMSCAPA> => {
  const { data: numData, error: numError } = await supabase.rpc('get_next_qms_number', { prefix: 'CAPA' });
  if (numError) throw numError;

  const { data, error } = await supabase
    .from('qms_capas')
    .insert({
      title: capa.title || '',
      description: capa.description || '',
      type: capa.type || 'corrective',
      status: capa.status || 'open',
      priority: capa.priority || 'medium',
      ncr_id: capa.ncr_id,
      action_plan: capa.action_plan,
      assigned_to: capa.assigned_to,
      due_date: capa.due_date,
      verification_required: capa.verification_required ?? true,
      created_by: capa.created_by || '',
      capa_number: numData,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data as unknown as QMSCAPA;
};

// ============================================
// RISKS
// ============================================

export interface QMSRisk {
  id: string;
  risk_number: string;
  category: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  risk_score: number;
  current_controls: string | null;
  additional_controls: string | null;
  residual_likelihood: number | null;
  residual_impact: number | null;
  residual_score: number;
  status: string;
  owner_id: string | null;
  review_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const fetchRisks = async (): Promise<QMSRisk[]> => {
  const { data, error } = await supabase
    .from('qms_risks')
    .select('*')
    .order('risk_score', { ascending: false });
  
  if (error) throw error;
  return (data || []) as unknown as QMSRisk[];
};

export const createRisk = async (risk: Partial<QMSRisk>): Promise<QMSRisk> => {
  const { data: numData, error: numError } = await supabase.rpc('get_next_qms_number', { prefix: 'RISK' });
  if (numError) throw numError;

  const { data, error } = await supabase
    .from('qms_risks')
    .insert({
      title: risk.title || '',
      description: risk.description || '',
      category: risk.category || 'operational',
      likelihood: risk.likelihood || 1,
      impact: risk.impact || 1,
      status: risk.status || 'active',
      current_controls: risk.current_controls,
      additional_controls: risk.additional_controls,
      owner_id: risk.owner_id,
      review_date: risk.review_date,
      created_by: risk.created_by || '',
      risk_number: numData,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data as unknown as QMSRisk;
};

// ============================================
// TRAINING
// ============================================

export interface QMSTrainingType {
  id: string;
  name: string;
  description: string | null;
  validity_months: number | null;
  is_mandatory: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QMSTrainingRecord {
  id: string;
  user_id: string;
  training_type_id: string;
  completion_date: string;
  expiry_date: string | null;
  certificate_url: string | null;
  certificate_number: string | null;
  trainer: string | null;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  training_type?: QMSTrainingType;
  profile?: { full_name: string; email: string } | null;
}

export const fetchTrainingTypes = async (): Promise<QMSTrainingType[]> => {
  const { data, error } = await supabase
    .from('qms_training_types')
    .select('*')
    .order('sort_order');
  
  if (error) throw error;
  return (data || []) as unknown as QMSTrainingType[];
};

export const fetchTrainingRecords = async (): Promise<QMSTrainingRecord[]> => {
  const { data, error } = await supabase
    .from('qms_training_records')
    .select(`
      *,
      training_type:qms_training_types(*)
    `)
    .order('expiry_date', { ascending: true });
  
  if (error) throw error;
  return (data || []) as unknown as QMSTrainingRecord[];
};

// ============================================
// AUDITS
// ============================================

export interface QMSAudit {
  id: string;
  audit_number: string;
  template_id: string | null;
  title: string;
  audit_type: string;
  scope: string | null;
  scheduled_date: string;
  completed_date: string | null;
  lead_auditor_id: string | null;
  auditee_department: string | null;
  status: string;
  findings: unknown[];
  summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const fetchAudits = async (): Promise<QMSAudit[]> => {
  const { data, error } = await supabase
    .from('qms_audits')
    .select('*')
    .order('scheduled_date', { ascending: false });
  
  if (error) throw error;
  return (data || []) as unknown as QMSAudit[];
};

export const createAudit = async (audit: Partial<QMSAudit>): Promise<QMSAudit> => {
  const { data: numData, error: numError } = await supabase.rpc('get_next_qms_number', { prefix: 'AUD' });
  if (numError) throw numError;

  const { data, error } = await supabase
    .from('qms_audits')
    .insert({
      title: audit.title || '',
      audit_type: audit.audit_type || 'internal',
      scheduled_date: audit.scheduled_date || new Date().toISOString().split('T')[0],
      status: audit.status || 'planned',
      template_id: audit.template_id,
      scope: audit.scope,
      lead_auditor_id: audit.lead_auditor_id,
      auditee_department: audit.auditee_department,
      created_by: audit.created_by || '',
      audit_number: numData,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data as unknown as QMSAudit;
};

// ============================================
// FEEDBACK
// ============================================

export interface QMSFeedback {
  id: string;
  feedback_number: string;
  customer_id: string | null;
  site_id: string | null;
  visit_id: string | null;
  type: string;
  channel: string | null;
  subject: string;
  description: string;
  priority: string;
  status: string;
  resolution: string | null;
  ncr_id: string | null;
  assigned_to: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  satisfaction_rating: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  customer?: { name: string } | null;
  site?: { name: string } | null;
}

export const fetchFeedback = async (): Promise<QMSFeedback[]> => {
  const { data, error } = await supabase
    .from('qms_feedback')
    .select(`
      *,
      customer:customers(name),
      site:sites(name)
    `)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data || []) as unknown as QMSFeedback[];
};

export const createFeedback = async (feedback: Partial<QMSFeedback>): Promise<QMSFeedback> => {
  const { data: numData, error: numError } = await supabase.rpc('get_next_qms_number', { prefix: 'FB' });
  if (numError) throw numError;

  const { data, error } = await supabase
    .from('qms_feedback')
    .insert({
      subject: feedback.subject || '',
      description: feedback.description || '',
      type: feedback.type || 'enquiry',
      channel: feedback.channel,
      priority: feedback.priority || 'medium',
      status: feedback.status || 'open',
      customer_id: feedback.customer_id,
      site_id: feedback.site_id,
      visit_id: feedback.visit_id,
      assigned_to: feedback.assigned_to,
      created_by: feedback.created_by || '',
      feedback_number: numData,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data as unknown as QMSFeedback;
};

// ============================================
// MANAGEMENT REVIEWS
// ============================================

export interface QMSManagementReview {
  id: string;
  review_number: string;
  review_date: string;
  attendees: string[] | null;
  agenda: unknown[];
  kpi_data: Record<string, unknown>;
  decisions: unknown[];
  action_items: unknown[];
  minutes: string | null;
  status: string;
  next_review_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const fetchManagementReviews = async (): Promise<QMSManagementReview[]> => {
  const { data, error } = await supabase
    .from('qms_management_reviews')
    .select('*')
    .order('review_date', { ascending: false });
  
  if (error) throw error;
  return (data || []) as unknown as QMSManagementReview[];
};

// ============================================
// KPI DASHBOARD DATA
// ============================================

export interface QMSKPIData {
  openNCRs: number;
  closedNCRsThisMonth: number;
  openCAPAs: number;
  overdueCAPAs: number;
  highRisks: number;
  expiringTraining: number;
  pendingApprovals: number;
  upcomingAudits: number;
  openFeedback: number;
  complaintsThisMonth: number;
}

export const fetchQMSKPIs = async (): Promise<QMSKPIData> => {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Fetch all data in parallel
  const [ncrs, capas, risks, training, audits, feedback, approvals] = await Promise.all([
    supabase.from('qms_ncrs').select('status, closed_at'),
    supabase.from('qms_capas').select('status, due_date'),
    supabase.from('qms_risks').select('risk_score, status'),
    supabase.from('qms_training_records').select('expiry_date, status'),
    supabase.from('qms_audits').select('scheduled_date, status'),
    supabase.from('qms_feedback').select('type, status, created_at'),
    supabase.from('qms_document_approvals').select('status'),
  ]);

  const ncrsData = ncrs.data || [];
  const capasData = capas.data || [];
  const risksData = risks.data || [];
  const trainingData = training.data || [];
  const auditsData = audits.data || [];
  const feedbackData = feedback.data || [];
  const approvalsData = approvals.data || [];

  return {
    openNCRs: ncrsData.filter(n => n.status !== 'closed').length,
    closedNCRsThisMonth: ncrsData.filter(n => n.closed_at && n.closed_at >= monthStart).length,
    openCAPAs: capasData.filter(c => !['closed', 'cancelled'].includes(c.status)).length,
    overdueCAPAs: capasData.filter(c => c.due_date && c.due_date < today && !['closed', 'cancelled'].includes(c.status)).length,
    highRisks: risksData.filter(r => (r.risk_score as number) >= 15 && r.status === 'active').length,
    expiringTraining: trainingData.filter(t => t.expiry_date && t.expiry_date <= thirtyDaysFromNow && t.expiry_date >= today).length,
    pendingApprovals: approvalsData.filter(a => a.status === 'pending').length,
    upcomingAudits: auditsData.filter(a => a.scheduled_date >= today && a.scheduled_date <= thirtyDaysFromNow && a.status === 'planned').length,
    openFeedback: feedbackData.filter(f => !['resolved', 'closed'].includes(f.status)).length,
    complaintsThisMonth: feedbackData.filter(f => f.type === 'complaint' && f.created_at >= monthStart).length,
  };
};
