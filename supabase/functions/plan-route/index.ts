import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VisitInput {
  id: string;
  site_name: string;
  postcode: string;
  visit_type: string;
  estimated_hours: number;
  visit_date: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { visits, office_postcode } = await req.json() as {
      visits: VisitInput[];
      office_postcode: string;
    };

    if (!visits?.length || !office_postcode) {
      return new Response(JSON.stringify({ error: "visits and office_postcode are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!GOOGLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Google API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build origins and destinations for Distance Matrix
    const postcodes = visits.map(v => v.postcode);
    const allPoints = [office_postcode, ...postcodes];
    const n = allPoints.length;

    // Distance Matrix API limits to 25 elements per request (origins * destinations)
    // We batch row-by-row: 1 origin × n destinations per request (always ≤ 25 if n ≤ 25)
    // For very large n, we also chunk destinations
    const MAX_ELEMENTS = 25;
    const travelMatrix: number[][] = [];
    const distanceMatrix: number[][] = [];

    for (let i = 0; i < n; i++) {
      travelMatrix[i] = new Array(n).fill(999999);
      distanceMatrix[i] = new Array(n).fill(0);
      const origin = encodeURIComponent(allPoints[i] + ", UK");

      // Chunk destinations so origin(1) * chunk ≤ 25
      const chunkSize = MAX_ELEMENTS;
      for (let dStart = 0; dStart < n; dStart += chunkSize) {
        const dEnd = Math.min(dStart + chunkSize, n);
        const destSlice = allPoints.slice(dStart, dEnd);
        const destParam = destSlice.map(p => encodeURIComponent(p + ", UK")).join("|");

        const matrixUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destParam}&mode=driving&key=${GOOGLE_API_KEY}`;
        const matrixRes = await fetch(matrixUrl);
        const matrixData = await matrixRes.json();

        if (matrixData.status !== "OK") {
          console.error("Distance Matrix error:", matrixData);
          return new Response(JSON.stringify({ error: "Failed to calculate distances", details: matrixData.error_message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const elements = matrixData.rows[0]?.elements || [];
        for (let j = 0; j < elements.length; j++) {
          if (elements[j]?.status === "OK") {
            travelMatrix[i][dStart + j] = elements[j].duration.value;
            distanceMatrix[i][dStart + j] = elements[j].distance.value;
          }
        }
      }
    }

    // Build a combined matrixData-like structure for plan building
    const matrixData = {
      rows: travelMatrix.map((row, i) => ({
        elements: row.map((dur, j) => ({
          status: dur < 999999 ? "OK" : "ZERO_RESULTS",
          duration: { value: dur },
          distance: { value: distanceMatrix[i][j] },
        })),
      })),
    };

    // Nearest-neighbour greedy algorithm for route optimisation
    // Index 0 = office, indices 1..n-1 = visits
    const visitCount = visits.length;
    const visited = new Set<number>();
    const route: number[] = [];
    let current = 0; // start at office

    for (let step = 0; step < visitCount; step++) {
      let bestIdx = -1;
      let bestTime = Infinity;
      for (let j = 1; j <= visitCount; j++) {
        if (!visited.has(j) && travelMatrix[current][j] < bestTime) {
          bestTime = travelMatrix[current][j];
          bestIdx = j;
        }
      }
      if (bestIdx === -1) break;
      visited.add(bestIdx);
      route.push(bestIdx);
      current = bestIdx;
    }

    // Build the optimised plan
    const plan: Array<{
      visit_id: string;
      site_name: string;
      postcode: string;
      visit_type: string;
      estimated_hours: number;
      travel_time_minutes: number;
      travel_distance_km: number;
      order: number;
    }> = [];

    let totalTravelMinutes = 0;
    let totalJobHours = 0;
    let prevIdx = 0; // office

    for (let i = 0; i < route.length; i++) {
      const idx = route[i];
      const visit = visits[idx - 1];
      const element = matrixData.rows[prevIdx]?.elements[idx];
      const travelMins = element?.status === "OK" ? Math.round(element.duration.value / 60) : 0;
      const distKm = element?.status === "OK" ? Math.round((element.distance.value / 1000) * 10) / 10 : 0;

      totalTravelMinutes += travelMins;
      totalJobHours += visit.estimated_hours || 0;

      plan.push({
        visit_id: visit.id,
        site_name: visit.site_name,
        postcode: visit.postcode,
        visit_type: visit.visit_type,
        estimated_hours: visit.estimated_hours || 0,
        travel_time_minutes: travelMins,
        travel_distance_km: distKm,
        order: i + 1,
      });

      prevIdx = idx;
    }

    // Return travel (last site back to office)
    const returnElement = matrixData.rows[current]?.elements[0];
    const returnMins = returnElement?.status === "OK" ? Math.round(returnElement.duration.value / 60) : 0;
    const returnKm = returnElement?.status === "OK" ? Math.round((returnElement.distance.value / 1000) * 10) / 10 : 0;
    totalTravelMinutes += returnMins;

    // Geocode all postcodes for map pins
    const geocodePromises = allPoints.map(async (pc) => {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(pc + ", UK")}&key=${GOOGLE_API_KEY}`);
      const data = await res.json();
      if (data.results?.[0]?.geometry?.location) {
        return { postcode: pc, lat: data.results[0].geometry.location.lat, lng: data.results[0].geometry.location.lng };
      }
      return { postcode: pc, lat: 0, lng: 0 };
    });

    const locations = await Promise.all(geocodePromises);

    return new Response(JSON.stringify({
      plan,
      locations,
      office_postcode,
      total_travel_minutes: totalTravelMinutes,
      total_job_hours: totalJobHours,
      return_travel_minutes: returnMins,
      return_distance_km: returnKm,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("plan-route error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
