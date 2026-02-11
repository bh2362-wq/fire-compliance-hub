import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Fetch visits scheduled for tomorrow with requirements
    const { data: visits, error: visitError } = await supabase
      .from("visits")
      .select(`
        id, visit_date, visit_type, engineer_id, notes,
        site:sites(name, address, city, postcode)
      `)
      .eq("visit_date", tomorrowStr)
      .in("status", ["scheduled", "in_progress"]);

    if (visitError) throw visitError;
    if (!visits || visits.length === 0) {
      return new Response(JSON.stringify({ message: "No visits tomorrow" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const visitIds = visits.map((v: any) => v.id);

    // Fetch all requirements for these visits
    const { data: requirements } = await supabase
      .from("visit_requirements")
      .select("visit_id, category, item_name, quantity, notes")
      .in("visit_id", visitIds);

    const reqsByVisit: Record<string, any[]> = {};
    (requirements || []).forEach((r: any) => {
      if (!reqsByVisit[r.visit_id]) reqsByVisit[r.visit_id] = [];
      reqsByVisit[r.visit_id].push(r);
    });

    // Group visits by engineer
    const visitsByEngineer: Record<string, any[]> = {};
    for (const visit of visits) {
      const engineerId = (visit as any).engineer_id || "unassigned";
      if (!visitsByEngineer[engineerId]) visitsByEngineer[engineerId] = [];
      visitsByEngineer[engineerId].push({
        ...visit,
        requirements: reqsByVisit[(visit as any).id] || [],
      });
    }

    // Fetch engineer profiles
    const engineerIds = Object.keys(visitsByEngineer).filter((id) => id !== "unassigned");
    let engineerEmails: Record<string, { email: string; name: string }> = {};

    if (engineerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", engineerIds);

      (profiles || []).forEach((p: any) => {
        engineerEmails[p.user_id] = { email: p.email, name: p.full_name || "Engineer" };
      });
    }

    let sentCount = 0;

    for (const [engineerId, engineerVisits] of Object.entries(visitsByEngineer)) {
      if (engineerId === "unassigned") continue;
      const engineer = engineerEmails[engineerId];
      if (!engineer?.email) continue;

      const visitRows = engineerVisits.map((v: any) => {
        const site = v.site as any;
        const reqs = v.requirements as any[];
        const reqList = reqs.length > 0
          ? reqs.map((r: any) => `• ${r.quantity > 1 ? r.quantity + "x " : ""}${r.item_name} (${r.category})${r.notes ? " - " + r.notes : ""}`).join("<br/>")
          : "<em>No requirements tagged</em>";

        return `
          <tr>
            <td style="padding:8px;border:1px solid #e2e8f0;font-weight:600;">${site?.name || "Site"}</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${v.visit_type || ""}</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${site?.address || ""}, ${site?.postcode || ""}</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${reqList}</td>
          </tr>`;
      }).join("");

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
          <h2 style="color:#1a1a2e;">Tomorrow's Jobs - ${tomorrowStr}</h2>
          <p>Hi ${engineer.name},</p>
          <p>Here's a summary of your jobs for tomorrow with required materials and equipment:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Site</th>
                <th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Type</th>
                <th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Address</th>
                <th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Requirements</th>
              </tr>
            </thead>
            <tbody>${visitRows}</tbody>
          </table>
          <p style="color:#64748b;font-size:13px;">Please ensure all items are loaded into your van before departure.</p>
        </div>`;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "BHO Fire <notifications@bhofire.com>",
          to: [engineer.email],
          subject: `Job Preparation - ${tomorrowStr}`,
          html,
        }),
      });

      if (emailRes.ok) sentCount++;
      else console.error("Failed to send to", engineer.email, await emailRes.text());

      // Rate limit delay
      await new Promise((r) => setTimeout(r, 600));
    }

    return new Response(
      JSON.stringify({ message: `Sent ${sentCount} reminder(s)`, sentCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("engineer-reminder error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
