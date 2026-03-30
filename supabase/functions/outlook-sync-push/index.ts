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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get app token: ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { appointment_id } = await req.json();

    if (!appointment_id) {
      return new Response(
        JSON.stringify({ error: "appointment_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the appointment
    const { data: appointment, error: aptErr } = await supabase
      .from("appointments")
      .select("*, site:sites(name, address)")
      .eq("id", appointment_id)
      .single();

    if (aptErr || !appointment) {
      return new Response(
        JSON.stringify({ error: "Appointment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the engineer's Microsoft email
    const engineerId = appointment.engineer_id;
    if (!engineerId) {
      return new Response(
        JSON.stringify({ error: "No engineer assigned" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("microsoft_email, full_name")
      .eq("user_id", engineerId)
      .single();

    const msEmail = (profile as any)?.microsoft_email;
    if (!msEmail) {
      return new Response(
        JSON.stringify({ error: "Engineer has no Microsoft email configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getAppToken();

    // Build the event
    const startDate = appointment.appointment_date;
    const startTime = appointment.start_time || "09:00:00";
    const endTime = appointment.end_time || "17:00:00";
    const siteName = appointment.site?.name || "";
    const siteAddress = appointment.site?.address || "";

    const event = {
      subject: appointment.title,
      body: {
        contentType: "Text",
        content: `${appointment.description || ""}\n\nSite: ${siteName}\nAddress: ${siteAddress}`,
      },
      start: {
        dateTime: `${startDate}T${startTime}`,
        timeZone: "Europe/London",
      },
      end: {
        dateTime: `${startDate}T${endTime}`,
        timeZone: "Europe/London",
      },
      location: {
        displayName: siteName,
        address: siteAddress ? { street: siteAddress } : undefined,
      },
    };

    // Check if already synced
    const { data: existingSync } = await supabase
      .from("outlook_calendar_sync")
      .select("id, outlook_event_id")
      .eq("appointment_id", appointment_id)
      .eq("engineer_id", engineerId)
      .maybeSingle();

    let outlookEventId: string;

    if (existingSync) {
      // Update existing event
      const updateRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${msEmail}/events/${existingSync.outlook_event_id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        }
      );

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Failed to update Outlook event: ${errText}`);
      }

      outlookEventId = existingSync.outlook_event_id;

      await supabase
        .from("outlook_calendar_sync")
        .update({ last_synced_at: new Date().toISOString(), sync_direction: "push" })
        .eq("id", existingSync.id);
    } else {
      // Create new event
      const createRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${msEmail}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        }
      );

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Failed to create Outlook event: ${errText}`);
      }

      const createdEvent = await createRes.json();
      outlookEventId = createdEvent.id;

      await supabase.from("outlook_calendar_sync").insert({
        appointment_id,
        engineer_id: engineerId,
        outlook_event_id: outlookEventId,
        sync_direction: "push",
      });
    }

    return new Response(
      JSON.stringify({ success: true, outlook_event_id: outlookEventId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Outlook sync push error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
