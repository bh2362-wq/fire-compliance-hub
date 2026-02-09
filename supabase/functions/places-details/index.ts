const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { placeId, sessionToken } = await req.json();

    // Validate placeId: must be a string, max 300 chars, alphanumeric + basic chars
    if (!placeId || typeof placeId !== 'string' || placeId.trim().length === 0 || placeId.length > 300) {
      return new Response(
        JSON.stringify({ error: 'placeId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate placeId format (Google Place IDs are alphanumeric with hyphens/underscores)
    if (!/^[A-Za-z0-9_\-]+$/.test(placeId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid placeId format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate sessionToken if provided
    if (sessionToken && (typeof sessionToken !== 'string' || sessionToken.length > 100)) {
      return new Response(
        JSON.stringify({ error: 'Invalid session token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      console.error('GOOGLE_PLACES_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Google Places Details API
    const params = new URLSearchParams({
      place_id: placeId,
      key: apiKey,
      fields: 'address_components,formatted_address,name,types',
    });

    if (sessionToken) {
      params.append('sessiontoken', sessionToken);
    }

    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?${params}`;
    console.log('Calling Places Details API for placeId:', placeId);

    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();

    if (detailsData.status !== 'OK') {
      console.error('Details API error:', detailsData.status, detailsData.error_message);
      return new Response(
        JSON.stringify({ error: detailsData.error_message || 'Details fetch failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse address components
    const components = detailsData.result.address_components || [];
    const getComponent = (type: string) => {
      const comp = components.find((c: any) => c.types.includes(type));
      return comp?.long_name || '';
    };

    // Build structured address
    const streetNumber = getComponent('street_number');
    const route = getComponent('route');
    const address = [streetNumber, route].filter(Boolean).join(' ');
    const city = getComponent('postal_town') || getComponent('locality');
    const postcode = getComponent('postal_code');

    // Check if this is a business/establishment and get the name
    const types = detailsData.result.types || [];
    const isEstablishment = types.some((t: string) => 
      ['establishment', 'point_of_interest', 'store', 'food', 'health', 'finance', 'lodging', 'premise'].includes(t)
    );
    const businessName = isEstablishment ? (detailsData.result.name || '') : '';

    console.log('Parsed address:', { address, city, postcode, businessName, types });

    return new Response(
      JSON.stringify({
        address,
        city,
        postcode,
        formatted_address: detailsData.result.formatted_address,
        businessName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in places-details:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
