// whatsapp-reader edge function
// WhatsApp Web is pinned to the browser session that scanned the QR code, so
// the server cannot read it directly. Instead, we return an extraction script
// for the Chrome extension to run inside the user's web.whatsapp.com tab.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const extractScript = `
(() => {
  const rows = document.querySelectorAll('[role="grid"] [role="row"]');
  const chats = [];
  rows.forEach((row) => {
    const text = (row.innerText || "").split("\\n").map((s) => s.trim()).filter(Boolean);
    if (!text.length) return;
    const name = text[0] || "";
    const time = text[1] || "";
    const preview = text.slice(2, -1).join(" ") || text[2] || "";
    const last = text[text.length - 1] || "";
    const unread = /^\\d+$/.test(last) ? last : "";
    if (name) chats.push({ name, time, preview, unread });
  });
  return chats;
})();
`.trim();

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  return new Response(
    JSON.stringify({
      error: "Chrome extension required",
      script: extractScript,
    }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
