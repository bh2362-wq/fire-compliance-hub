 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers":
     "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
 };
 
 interface SmsReminderRequest {
   reminder_id?: string;
   to: string;
   message: string;
   invoice_number?: string;
   amount_due?: number;
 }
 
 const handler = async (req: Request): Promise<Response> => {
   if (req.method === "OPTIONS") {
     return new Response("ok", { headers: corsHeaders });
   }
 
   try {
     const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
     const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
     const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
 
     if (!accountSid || !authToken || !fromNumber) {
       throw new Error("Missing Twilio credentials");
     }
 
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const supabase = createClient(supabaseUrl, supabaseServiceKey);
 
     // Verify JWT
     const authHeader = req.headers.get("Authorization");
     if (!authHeader) {
       throw new Error("No authorization header");
     }
     
     const { data: { user }, error: authError } = await supabase.auth.getUser(
       authHeader.replace("Bearer ", "")
     );
     
     if (authError || !user) {
       throw new Error("Unauthorized");
     }
 
     const { reminder_id, to, message, invoice_number, amount_due }: SmsReminderRequest = await req.json();
 
     if (!to || !message) {
       throw new Error("Missing required fields: to, message");
     }
 
     // Clean phone number - ensure it starts with +
     const cleanPhone = to.startsWith("+") ? to : `+44${to.replace(/^0/, "")}`;
 
     console.log(`Sending SMS to ${cleanPhone} for invoice ${invoice_number}`);
 
     // Send SMS via Twilio
     const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
     const credentials = btoa(`${accountSid}:${authToken}`);
 
     const formData = new URLSearchParams();
     formData.append("To", cleanPhone);
     formData.append("From", fromNumber);
     formData.append("Body", message);
 
     const twilioResponse = await fetch(twilioUrl, {
       method: "POST",
       headers: {
         "Authorization": `Basic ${credentials}`,
         "Content-Type": "application/x-www-form-urlencoded",
       },
       body: formData.toString(),
     });
 
     const twilioResult = await twilioResponse.json();
 
     if (!twilioResponse.ok) {
       console.error("Twilio error:", twilioResult);
       
       // Update reminder status to failed
       if (reminder_id) {
         await supabase
           .from("credit_control_reminders")
           .update({
             status: "failed",
             error_message: twilioResult.message || "SMS send failed",
           })
           .eq("id", reminder_id);
       }
       
       throw new Error(twilioResult.message || "Failed to send SMS");
     }
 
     console.log("SMS sent successfully:", twilioResult.sid);
 
     // Update reminder status to sent
     if (reminder_id) {
       await supabase
         .from("credit_control_reminders")
         .update({
           status: "sent",
           sent_at: new Date().toISOString(),
           external_id: twilioResult.sid,
         })
         .eq("id", reminder_id);
     }
 
     return new Response(
       JSON.stringify({
         success: true,
         message_sid: twilioResult.sid,
         status: twilioResult.status,
       }),
       {
         status: 200,
         headers: { "Content-Type": "application/json", ...corsHeaders },
       }
     );
   } catch (error: any) {
     console.error("Error in send-sms-reminder:", error);
     return new Response(
       JSON.stringify({ error: error.message }),
       {
         status: 500,
         headers: { "Content-Type": "application/json", ...corsHeaders },
       }
     );
   }
 };
 
 serve(handler);