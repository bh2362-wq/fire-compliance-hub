// Extract the real error message from a supabase.functions.invoke error.
// supabase-js wraps non-2xx responses as FunctionsHttpError with a Response in `context`.
export async function extractEdgeError(e: unknown, fallback = "Unknown error"): Promise<string> {
  const err = e as { message?: string; context?: Response | { body?: unknown } };
  let detail = err?.message ?? fallback;
  try {
    const ctx: any = err?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.clone().json().catch(() => null);
      if (body?.error) detail = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
      else if (body?.message) detail = body.message;
    } else if (ctx && typeof ctx.text === "function") {
      const txt = await ctx.clone().text().catch(() => "");
      if (txt) detail = txt;
    }
  } catch { /* keep fallback */ }
  return detail;
}
