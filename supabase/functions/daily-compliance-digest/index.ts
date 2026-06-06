// Daily compliance digest — invoked by cron at 07:00.
//
// Scans for the three classes of items that drive ops attention:
//   - BAFE certificates already expired (status != "expired" so they
//     should still be acting on them)
//   - BAFE certificates expiring within 30 days
//   - RAMS documents whose review_date is past or within 30 days
//   - Service visits in scheduled/in_progress state with visit_date < today
//
// If anything turns up, it emails the COMPLIANCE_DIGEST_EMAIL recipient(s)
// via Resend. If nothing turns up, it still returns a 200 with a zero
// summary — cron history then shows a clean run rather than an error.
//
// Auth: this function checks the X-Cron-Secret header against
// CRON_SECRET in env. The Authorization header (a service-role JWT
// supplied by pg_cron) is accepted by Supabase platform auth too — the
// header check is belt-and-braces in case verify_jwt gets relaxed later.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type Row<T extends Record<string, unknown>> = T;

interface BafeCert {
  id: string;
  certificate_type: string | null;
  expiry_date: string | null;
  status: string | null;
  site: { name: string | null } | null;
}

interface Rams {
  id: string;
  title: string | null;
  review_date: string | null;
  site: { name: string | null } | null;
}

interface Visit {
  id: string;
  visit_date: string;
  status: string | null;
  visit_type: string | null;
  site: { name: string | null } | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function renderSection(title: string, rows: string[]): string {
  if (rows.length === 0) return "";
  return `<h3 style="margin:18px 0 6px 0;font-size:14px;color:#1a1a1a">${title} (${rows.length})</h3>` +
    `<ul style="margin:0 0 12px 18px;padding:0;font-size:13px;line-height:1.45;color:#333">` +
    rows.map((r) => `<li>${r}</li>`).join("") +
    `</ul>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    if (CRON_SECRET) {
      const incoming = req.headers.get("x-cron-secret");
      if (incoming !== CRON_SECRET) {
        return new Response(JSON.stringify({ error: "invalid cron secret" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const COMPLIANCE_DIGEST_EMAIL = Deno.env.get("COMPLIANCE_DIGEST_EMAIL");
    const COMPLIANCE_DIGEST_FROM =
      Deno.env.get("COMPLIANCE_DIGEST_FROM") || "BHO Fire Hub <hub@bhofire.com>";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const today = new Date();
    const in30 = new Date(today.getTime() + 30 * 86_400_000);
    const todayIso = isoDate(today);
    const in30Iso = isoDate(in30);

    // ── BAFE: expired ──────────────────────────────────────────────────
    const certsExpiredQ = await supabase
      .from("bafe_certificates")
      .select("id, certificate_type, expiry_date, status, site:sites(name)")
      .lt("expiry_date", todayIso)
      .neq("status", "expired");
    const certsExpired: Row<BafeCert>[] = (certsExpiredQ.data ?? []) as Row<BafeCert>[];

    // ── BAFE: expiring within 30 days ──────────────────────────────────
    const certsExpiringQ = await supabase
      .from("bafe_certificates")
      .select("id, certificate_type, expiry_date, status, site:sites(name)")
      .gte("expiry_date", todayIso)
      .lte("expiry_date", in30Iso);
    const certsExpiring: Row<BafeCert>[] = (certsExpiringQ.data ?? []) as Row<BafeCert>[];

    // ── RAMS: review_date past or within 30 days ───────────────────────
    const ramsDueQ = await supabase
      .from("rams_documents")
      .select("id, title, review_date, site:sites(name)")
      .lte("review_date", in30Iso);
    const ramsDue: Row<Rams>[] = (ramsDueQ.data ?? []) as Row<Rams>[];

    // ── Service visits: overdue (status scheduled/in_progress, date past) ─
    const visitsOverdueQ = await supabase
      .from("service_visits")
      .select("id, visit_date, status, visit_type, site:sites(name)")
      .in("status", ["scheduled", "in_progress", "pending_review"])
      .lt("visit_date", todayIso);
    const visitsOverdue: Row<Visit>[] = (visitsOverdueQ.data ?? []) as Row<Visit>[];

    const summary = {
      certs_expired: certsExpired.length,
      certs_expiring_30d: certsExpiring.length,
      rams_due: ramsDue.length,
      visits_overdue: visitsOverdue.length,
    };

    // ── Build email body ───────────────────────────────────────────────
    const sections: string[] = [];

    sections.push(renderSection(
      "BAFE certificates expired",
      certsExpired.map((c) =>
        `${c.site?.name ?? "—"} — ${c.certificate_type ?? "?"} (expired ${c.expiry_date ?? "?"})`,
      ),
    ));
    sections.push(renderSection(
      "BAFE certificates expiring within 30 days",
      certsExpiring.map((c) =>
        `${c.site?.name ?? "—"} — ${c.certificate_type ?? "?"} (expires ${c.expiry_date ?? "?"})`,
      ),
    ));
    sections.push(renderSection(
      "RAMS due for review within 30 days",
      ramsDue.map((r) =>
        `${r.site?.name ?? "—"} — ${r.title ?? "(untitled)"} (review ${r.review_date ?? "?"})`,
      ),
    ));
    sections.push(renderSection(
      "Overdue service visits",
      visitsOverdue.map((v) =>
        `${v.site?.name ?? "—"} — ${v.visit_type ?? "visit"} due ${v.visit_date}`,
      ),
    ));

    const nonEmpty = sections.filter((s) => s.length > 0);

    let emailSent = false;
    let emailError: string | null = null;

    if (nonEmpty.length > 0 && RESEND_API_KEY && COMPLIANCE_DIGEST_EMAIL) {
      const html =
        `<div style="font-family:Inter,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:640px">` +
        `<h2 style="margin:0 0 4px 0">BHO Fire — Daily Compliance Digest</h2>` +
        `<p style="margin:0 0 16px 0;color:#666;font-size:13px">${todayIso}</p>` +
        nonEmpty.join("") +
        `<hr style="margin:20px 0;border:0;border-top:1px solid #e0e0e0">` +
        `<p style="color:#888;font-size:12px;margin:0">Automated by FireLogbook. Reply to this email to flag issues.</p>` +
        `</div>`;

      const subject =
        `BHO Compliance Digest — ${summary.certs_expired} expired · ` +
        `${summary.certs_expiring_30d} expiring · ${summary.visits_overdue} overdue visits`;

      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: COMPLIANCE_DIGEST_FROM,
          to: COMPLIANCE_DIGEST_EMAIL.split(",").map((s) => s.trim()).filter(Boolean),
          subject,
          html,
        }),
      });

      if (!r.ok) {
        emailError = await r.text().catch(() => "(no body)");
        console.warn("Resend send failed", r.status, emailError);
      } else {
        emailSent = true;
      }
    }

    console.log("daily-compliance-digest", JSON.stringify({
      ...summary,
      email_sent: emailSent,
      email_configured: Boolean(RESEND_API_KEY && COMPLIANCE_DIGEST_EMAIL),
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        date: todayIso,
        summary,
        email_sent: emailSent,
        email_error: emailError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("daily-compliance-digest error:", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
