import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAppToken(): Promise<string> {
  const tenantId = Deno.env.get("MICROSOFT_TENANT_ID")!;
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID")!;
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!res.ok) throw new Error("Failed to get app token");
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all engineers with Microsoft emails
    const { data: engineers } = await supabase
      .from("profiles")
      .select("user_id, microsoft_email, full_name");

    const engineersWithEmail = (engineers || []).filter(
      (e: any) => e.microsoft_email
    );

    if (engineersWithEmail.length === 0) {
      return new Response(
        JSON.stringify({ message: "No engineers with Microsoft email configured", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getAppToken();
    let totalSynced = 0;

    for (const engineer of engineersWithEmail) {
      const msEmail = (engineer as any).microsoft_email;
      
      // Get all synced events for this engineer
      const { data: syncRecords } = await supabase
        .from("outlook_calendar_sync")
        .select("id, appointment_id, outlook_event_id, last_synced_at")
        .eq("engineer_id", engineer.user_id);

      if (!syncRecords || syncRecords.length === 0) continue;

      for (const sync of syncRecords) {
        try {
          // Fetch event from Outlook
          const eventRes = await fetch(
            `https://graph.microsoft.com/v1.0/users/${msEmail}/events/${sync.outlook_event_id}?$select=subject,start,end,isCancelled,lastModifiedDateTime`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          if (eventRes.status === 404) {
            // Event deleted in Outlook — mark appointment as cancelled
            await supabase
              .from("appointments")
              .update({ status: "cancelled" })
              .eq("id", sync.appointment_id);

            await supabase
              .from("outlook_calendar_sync")
              .delete()
              .eq("id", sync.id);

            totalSynced++;
            continue;
          }

          if (!eventRes.ok) continue;

          const event = await eventRes.json();

          // Check if Outlook event was modified after our last sync
          const outlookModified = new Date(event.lastModifiedDateTime);
          const lastSynced = new Date(sync.last_synced_at);

          if (outlookModified <= lastSynced) continue;

          // Extract date from Outlook event
          const outlookDate = event.start?.dateTime?.split("T")[0];
          const outlookStartTime = event.start?.dateTime?.split("T")[1]?.substring(0, 8);
          const outlookEndTime = event.end?.dateTime?.split("T")[1]?.substring(0, 8);

          if (!outlookDate) continue;

          // Update the appointment with Outlook changes
          const updates: Record<string, string> = {};
          updates.appointment_date = outlookDate;
          if (outlookStartTime) updates.start_time = outlookStartTime;
          if (outlookEndTime) updates.end_time = outlookEndTime;
          if (event.subject) updates.title = event.subject;

          await supabase
            .from("appointments")
            .update(updates)
            .eq("id", sync.appointment_id);

          // Also sync the linked visit date if applicable
          const { data: apt } = await supabase
            .from("appointments")
            .select("visit_id")
            .eq("id", sync.appointment_id)
            .single();

          if (apt?.visit_id) {
            await supabase
              .from("service_visits")
              .update({ visit_date: outlookDate })
              .eq("id", apt.visit_id);
          }

          await supabase
            .from("outlook_calendar_sync")
            .update({
              last_synced_at: new Date().toISOString(),
              sync_direction: "pull",
            })
            .eq("id", sync.id);

          totalSynced++;
        } catch (err) {
          console.error(`Failed to pull event ${sync.outlook_event_id}:`, err);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced: totalSynced }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Outlook sync pull error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
