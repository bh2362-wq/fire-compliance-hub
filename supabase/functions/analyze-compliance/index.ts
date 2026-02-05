 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers":
     "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
 };
 
 interface AnalyzeRequest {
   reportId: string;
   reportData: {
     report_type: string;
     defects?: string;
     recommendations?: string;
     works_description?: string;
     further_action?: string;
     checklist?: Record<string, any>;
     units?: Array<{
       asset_name: string;
       defects?: string;
       recommendations?: string;
       checklist?: Record<string, any>;
     }>;
     workDays?: Array<{
       description?: string;
     }>;
   };
   siteInfo: {
     name: string;
     address?: string;
   };
 }
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
     if (!LOVABLE_API_KEY) {
       throw new Error("LOVABLE_API_KEY is not configured");
     }
 
     const authHeader = req.headers.get("Authorization");
     if (!authHeader) {
       return new Response(
         JSON.stringify({ error: "No authorization header" }),
         { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const { reportId, reportData, siteInfo } = (await req.json()) as AnalyzeRequest;
 
     if (!reportData) {
       return new Response(
         JSON.stringify({ error: "No report data provided" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Build a comprehensive prompt for the AI
     const reportSummary = buildReportSummary(reportData, siteInfo);
 
     const systemPrompt = `You are a fire safety compliance expert specializing in BS 5839, BS 5266, and related UK fire safety regulations. 
 
 Analyze the following service report data and identify ALL non-compliant items, defects, and required remedial works.
 
 For each issue found, provide:
 1. A clear description of the issue
 2. The relevant regulation reference (e.g., "BS 5839-1:2017 Clause 25.2")
 3. Priority level: "critical" (immediate safety risk), "high" (compliance breach), "medium" (recommended improvement), or "low" (advisory)
 4. Source section from the report where this was identified
 
 IMPORTANT RULES:
 - Focus on actual defects, failed items, and recommendations that indicate work is needed
 - Items marked as "NO" or "FAIL" in checklists indicate non-compliance
 - Extract specific defect descriptions and recommendations from the text fields
 - If the checklist shows items as N/A, ignore them
 - Be specific about what needs to be fixed
 - Use proper fire safety terminology
 
 Return your response as a JSON array of objects with this structure:
 {
   "items": [
     {
       "description": "Clear description of the remedial work required",
       "regulation_reference": "BS XXXX-X:XXXX Clause X.X",
       "priority": "critical|high|medium|low",
       "source_section": "Where in the report this was found"
     }
   ],
   "summary": "Brief summary of overall compliance status"
 }
 
 If no issues are found, return: { "items": [], "summary": "System is fully compliant. No remedial works required." }`;
 
     console.log("Analyzing compliance for report:", reportId);
     console.log("Report summary:", reportSummary);
 
     const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
       method: "POST",
       headers: {
         Authorization: `Bearer ${LOVABLE_API_KEY}`,
         "Content-Type": "application/json",
       },
       body: JSON.stringify({
         model: "google/gemini-2.5-flash",
         messages: [
           { role: "system", content: systemPrompt },
           { role: "user", content: reportSummary },
         ],
         max_tokens: 2000,
       }),
     });
 
     if (!response.ok) {
       if (response.status === 429) {
         return new Response(
           JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
           { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
       const errorText = await response.text();
       console.error("AI gateway error:", response.status, errorText);
       throw new Error(`AI gateway error: ${response.status}`);
     }
 
     const data = await response.json();
     const content = data.choices?.[0]?.message?.content?.trim();
 
     if (!content) {
       throw new Error("No response from AI");
     }
 
     // Parse the JSON response
     let analysisResult;
     try {
       // Extract JSON from potential markdown code blocks
       let jsonContent = content;
       const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
       if (jsonMatch) {
         jsonContent = jsonMatch[1].trim();
       }
       analysisResult = JSON.parse(jsonContent);
     } catch (parseError) {
       console.error("Failed to parse AI response:", content);
       throw new Error("Failed to parse compliance analysis");
     }
 
     console.log("Analysis result:", analysisResult);
 
     return new Response(
       JSON.stringify(analysisResult),
       { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   } catch (error) {
     console.error("Compliance analysis error:", error);
     const errorMessage = error instanceof Error ? error.message : "Unknown error";
     return new Response(
       JSON.stringify({ error: errorMessage }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });
 
 function buildReportSummary(reportData: AnalyzeRequest["reportData"], siteInfo: AnalyzeRequest["siteInfo"]): string {
   const parts: string[] = [];
   
   parts.push(`SITE: ${siteInfo.name}`);
   if (siteInfo.address) parts.push(`ADDRESS: ${siteInfo.address}`);
   parts.push(`REPORT TYPE: ${reportData.report_type || "Service Report"}`);
   parts.push("");
 
   // Add defects and recommendations from main report
   if (reportData.defects?.trim()) {
     parts.push("DEFECTS FOUND:");
     parts.push(reportData.defects);
     parts.push("");
   }
 
   if (reportData.recommendations?.trim()) {
     parts.push("RECOMMENDATIONS:");
     parts.push(reportData.recommendations);
     parts.push("");
   }
 
   if (reportData.works_description?.trim()) {
     parts.push("WORKS DESCRIPTION:");
     parts.push(reportData.works_description);
     parts.push("");
   }
 
   if (reportData.further_action?.trim()) {
     parts.push("FURTHER ACTION REQUIRED:");
     parts.push(reportData.further_action);
     parts.push("");
   }
 
   // Add checklist data
   if (reportData.checklist && Object.keys(reportData.checklist).length > 0) {
     parts.push("CHECKLIST RESULTS:");
     for (const [section, items] of Object.entries(reportData.checklist)) {
       if (typeof items === "object" && items !== null) {
         const failedItems = Object.entries(items)
           .filter(([_, value]) => value === "NO" || value === "FAIL" || value === false)
           .map(([key]) => key);
         
         if (failedItems.length > 0) {
           parts.push(`Section ${section} - Failed items: ${failedItems.join(", ")}`);
         }
       }
     }
     parts.push("");
   }
 
   // Add unit-specific data (for ASD/Disabled Refuge reports with multiple units)
   if (reportData.units && reportData.units.length > 0) {
     parts.push("INDIVIDUAL UNIT REPORTS:");
     for (const unit of reportData.units) {
       parts.push(`\nUnit: ${unit.asset_name}`);
       if (unit.defects?.trim()) {
         parts.push(`Defects: ${unit.defects}`);
       }
       if (unit.recommendations?.trim()) {
         parts.push(`Recommendations: ${unit.recommendations}`);
       }
       if (unit.checklist && Object.keys(unit.checklist).length > 0) {
         const failedItems: string[] = [];
         for (const [section, items] of Object.entries(unit.checklist)) {
           if (typeof items === "object" && items !== null) {
             for (const [key, value] of Object.entries(items)) {
               if (value === "NO" || value === "FAIL" || value === false) {
                 failedItems.push(`${section}.${key}`);
               }
             }
           }
         }
         if (failedItems.length > 0) {
           parts.push(`Failed checklist items: ${failedItems.join(", ")}`);
         }
       }
     }
     parts.push("");
   }
 
   // Add work days description (for job sheets)
   if (reportData.workDays && reportData.workDays.length > 0) {
     parts.push("WORK PERFORMED:");
     for (let i = 0; i < reportData.workDays.length; i++) {
       const day = reportData.workDays[i];
       if (day.description?.trim()) {
         parts.push(`Day ${i + 1}: ${day.description}`);
       }
     }
     parts.push("");
   }
 
   return parts.join("\n");
 }