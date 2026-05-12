// whatsapp-reader edge function
// Reads the open WhatsApp Web tab via Claude in Chrome automation
// and returns the structured chat list.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // Use Claude computer-use to read WhatsApp Web
    // The raw page text extraction method that worked in testing
    const extractScript = `
(function() {
  try {
    const rows = document.querySelectorAll('[role="grid"] [role="row"]');
    const chats = [];
    rows.forEach(row => {
      try {
        const nameEl = row.querySelector('span[title]');
        const name = nameEl ? nameEl.getAttribute('title') || nameEl.textContent.trim() : '';
        const previewEls = row.querySelectorAll('span[title]');
        let preview = '';
        if (previewEls.length > 1) preview = previewEls[1]?.getAttribute('title') || previewEls[1]?.textContent?.trim() || '';
        const unreadEl = row.querySelector('[aria-label*="unread"], [data-testid="icon-unread-count"]');
        const unread = unreadEl ? unreadEl.textContent.trim() : '';
        const timeEls = row.querySelectorAll('span');
        let time = '';
        timeEls.forEach(s => { if (s.textContent.match(/\\d{1,2}[:/]\\d{2}|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i)) time = s.textContent.trim(); });
        if (name && name.length > 0 && name.length < 60) {
          chats.push({ name, preview, time, unread });
        }
      } catch(e) {}
    });
    return JSON.stringify(chats.slice(0, 60));
  } catch(e) {
    return JSON.stringify([]);
  }
})()`;

    // Call Claude API with computer use to execute the script on the WhatsApp tab
    // For now, return a structured response indicating what would be read
    // The actual Chrome automation happens via the client-side shortcut

    return new Response(
      JSON.stringify({
        error: "Chrome extension required",
        message: "Please use the Claude in Chrome extension to read WhatsApp. Open web.whatsapp.com in Chrome, ensure the Claude extension has permission, then click Read WhatsApp.",
        script: extractScript,
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
