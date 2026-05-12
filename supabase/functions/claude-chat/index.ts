// Claude (Anthropic) chat edge function
// Supports plain chat + optional document context (text extracted client-side)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Msg {
  role: "user" | "assistant";
  content: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const systemOverride: string | undefined = body?.system;
    const documentText: string | undefined = body?.documentText;
    const mode: string = body?.mode || "chat"; // chat | analyze | summarise
    const requestedModel: string = body?.model || "claude-sonnet-4-5";
    // Map deprecated/invalid model aliases to currently-available Anthropic models
    const MODEL_ALIASES: Record<string, string> = {
      "claude-sonnet-4-20250514": "claude-sonnet-4-5",
      "claude-sonnet-4": "claude-sonnet-4-5",
      "claude-3-5-sonnet-latest": "claude-3-5-sonnet-20241022",
    };
    const model: string = MODEL_ALIASES[requestedModel] || requestedModel;

    if (messages.length === 0 && !documentText) {
      return new Response(
        JSON.stringify({ error: "messages or documentText required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let system = systemOverride ||
      "You are a helpful AI assistant for BHO Fire Ltd, a UK fire safety and alarm specialist. " +
      "Provide expert guidance on BS 5839 (fire detection), BS 5266 (emergency lighting), BAFE SP203, " +
      "and UK fire safety regulations. Use UK English spelling. Be concise and practical.";

    if (mode === "analyze") {
      system = "You are a fire safety document analyst. Extract key findings, defects, " +
        "recommendations, compliance issues, and action items from the document. " +
        "Use UK English. Format as structured Markdown with clear headings.";
    } else if (mode === "summarise") {
      system = "You are a fire safety report summariser. Produce an executive summary covering: " +
        "scope of work, key findings, defects/non-conformities, recommendations, and compliance status. " +
        "Keep it under 400 words. Use UK English and Markdown headings.";
    }

    const finalMessages: Msg[] = [...messages];
    if (documentText && documentText.trim()) {
      const truncated = documentText.slice(0, 180_000); // ~Claude context safety
      const docMsg = `Document content:\n\n"""\n${truncated}\n"""`;
      if (finalMessages.length === 0) {
        finalMessages.push({ role: "user", content: docMsg });
      } else {
        finalMessages[0] = {
          role: "user",
          content: `${docMsg}\n\n${finalMessages[0].content}`,
        };
      }
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: finalMessages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic error:", resp.status, errText);
      if (resp.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid Anthropic API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (resp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Claude rate limit exceeded, please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Claude API error: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const text = Array.isArray(data?.content)
      ? data.content.map((c: any) => c?.text || "").join("\n").trim()
      : "";

    return new Response(
      JSON.stringify({ content: text, model: data?.model, usage: data?.usage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("claude-chat error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
