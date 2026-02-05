 import { supabase } from "@/integrations/supabase/client";
 
 export interface EmailTemplate {
   id: string;
   name: string;
   subject_template: string;
   greeting_template: string;
   body_template: string;
   signoff_template: string;
   is_default: boolean;
   is_active: boolean;
   template_type: string;
   created_by: string;
   created_at: string;
   updated_at: string;
 }
 
 export interface EmailTemplateInput {
   name: string;
   subject_template: string;
   greeting_template: string;
   body_template: string;
   signoff_template: string;
   is_default?: boolean;
   is_active?: boolean;
   template_type?: string;
 }
 
 export async function getEmailTemplates(): Promise<EmailTemplate[]> {
   const { data, error } = await supabase
     .from("email_templates")
     .select("*")
     .eq("is_active", true)
     .order("name");
 
   if (error) throw error;
   return data || [];
 }
 
 export async function getAllEmailTemplates(): Promise<EmailTemplate[]> {
   const { data, error } = await supabase
     .from("email_templates")
     .select("*")
     .order("name");
 
   if (error) throw error;
   return data || [];
 }
 
 export async function getDefaultTemplate(): Promise<EmailTemplate | null> {
   const { data, error } = await supabase
     .from("email_templates")
     .select("*")
     .eq("is_default", true)
     .eq("is_active", true)
     .single();
 
   if (error && error.code !== "PGRST116") throw error;
   return data;
 }
 
 export async function createEmailTemplate(
   template: EmailTemplateInput,
   userId: string
 ): Promise<EmailTemplate> {
   // If setting as default, unset other defaults first
   if (template.is_default) {
     await supabase
       .from("email_templates")
       .update({ is_default: false })
       .eq("is_default", true);
   }
 
   const { data, error } = await supabase
     .from("email_templates")
     .insert({
       ...template,
       created_by: userId,
     })
     .select()
     .single();
 
   if (error) throw error;
   return data;
 }
 
 export async function updateEmailTemplate(
   id: string,
   template: Partial<EmailTemplateInput>
 ): Promise<EmailTemplate> {
   // If setting as default, unset other defaults first
   if (template.is_default) {
     await supabase
       .from("email_templates")
       .update({ is_default: false })
       .neq("id", id)
       .eq("is_default", true);
   }
 
   const { data, error } = await supabase
     .from("email_templates")
     .update(template)
     .eq("id", id)
     .select()
     .single();
 
   if (error) throw error;
   return data;
 }
 
 export async function deleteEmailTemplate(id: string): Promise<void> {
   const { error } = await supabase
     .from("email_templates")
     .delete()
     .eq("id", id);
 
   if (error) throw error;
 }
 
 // Helper to replace placeholders in template
 export function applyTemplate(
   template: EmailTemplate,
   variables: Record<string, string>
 ): { subject: string; greeting: string; body: string; signoff: string } {
   const replacePlaceholders = (text: string): string => {
     return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
       return variables[key] || match;
     });
   };
 
   return {
     subject: replacePlaceholders(template.subject_template),
     greeting: replacePlaceholders(template.greeting_template),
     body: replacePlaceholders(template.body_template),
     signoff: replacePlaceholders(template.signoff_template),
   };
 }