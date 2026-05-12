// whatsapp-reader edge function
// WhatsApp Web cannot be read from a server context (it's pinned to the
// browser session that scanned the QR code). This endpoint therefore tells
// the client to fall back to paste mode.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  return new Response(
    JSON.stringify({
      requiresPasteMode: true,
      chats: [],
      message:
        "Auto-read isn't available — WhatsApp Web is tied to your browser session. " +
        "Switched to paste mode: open the chat in WhatsApp, copy the messages, and paste them below.",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
