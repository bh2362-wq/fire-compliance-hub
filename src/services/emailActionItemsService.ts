import { supabase } from "@/integrations/supabase/client";

export type IntentType = "visit" | "callout" | "quote" | "meeting" | "reminder" | "issue" | "note";
export type IntentPriority = "low" | "medium" | "high" | "urgent";
export type IntentStatus = "pending" | "actioned" | "dismissed" | "snoozed";

export interface IntentPayload {
  company_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  site_city?: string | null;
  site_postcode?: string | null;
  visit_type?: string | null;
  description?: string | null;
  notes?: string | null;
  client_po_number?: string | null;
  [k: string]: unknown;
}

export interface ScannedIntent {
  intent_type: IntentType;
  priority: IntentPriority;
  title: string;
  summary?: string | null;
  suggested_date?: string | null;
  payload?: IntentPayload | null;
}

export interface EmailActionItemRow {
  id: string;
  source_email_id: string | null;
  source_subject: string | null;
  source_from: string | null;
  source_received_at: string | null;
  source_preview: string | null;
  intent_type: IntentType;
  priority: IntentPriority;
  title: string;
  summary: string | null;
  suggested_date: string | null;
  suggested_payload: IntentPayload;
  status: IntentStatus;
  actioned_entity_type: string | null;
  actioned_entity_id: string | null;
  snooze_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceEmailMeta {
  emailId?: string;
  subject?: string;
  from?: string;
  receivedAt?: string;
  preview?: string;
}

export async function saveScannedIntents(intents: ScannedIntent[], source: SourceEmailMeta) {
  if (!intents.length) return [];

  // Dedupe by source_email_id — once a user has dismissed (or actioned)
  // an intent from a given email, the cron-driven re-scans shouldn't
  // resurrect it on the dashboard. If ANY row exists for this
  // source_email_id (any status), skip the insert entirely. Without
  // an emailId we can't dedupe and accept the row as new.
  if (source.emailId) {
    const { data: existing } = await supabase
      .from("email_action_items")
      .select("id, status")
      .eq("source_email_id", source.emailId)
      .limit(1);
    if (existing && existing.length > 0) {
      return [] as EmailActionItemRow[];
    }
  }

  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id ?? null;
  const rows = intents.map((i) => ({
    source_email_id: source.emailId ?? null,
    source_subject: source.subject ?? null,
    source_from: source.from ?? null,
    source_received_at: source.receivedAt ?? null,
    source_preview: source.preview?.slice(0, 1000) ?? null,
    intent_type: i.intent_type,
    priority: i.priority || "medium",
    title: i.title,
    summary: i.summary ?? null,
    suggested_date: i.suggested_date || null,
    suggested_payload: ((i.payload ?? {}) as unknown) as never,
    status: "pending" as IntentStatus,
    created_by: userId,
  }));
  const { data, error } = await supabase.from("email_action_items").insert(rows as never).select();
  if (error) throw error;
  return data as unknown as EmailActionItemRow[];
}

export async function listPendingActionItems(limit = 100) {
  const { data, error } = await supabase
    .from("email_action_items")
    .select("*")
    .in("status", ["pending", "snoozed"])
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as EmailActionItemRow[];
}

export async function updateActionItem(id: string, patch: Partial<EmailActionItemRow>) {
  const { error } = await supabase.from("email_action_items").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function dismissActionItem(id: string) {
  return updateActionItem(id, { status: "dismissed" });
}

export async function markActioned(id: string, entityType?: string, entityId?: string) {
  return updateActionItem(id, {
    status: "actioned",
    actioned_entity_type: entityType ?? null,
    actioned_entity_id: entityId ?? null,
  });
}
