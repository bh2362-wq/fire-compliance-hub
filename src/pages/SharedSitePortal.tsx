/**
 * SharedSitePortal
 * Public-facing, no-auth compliance portal page.
 * URL: /portal/:token
 *
 * Shows the responsible person (facilities manager, building owner):
 * - Site name and address
 * - Current compliance status
 * - Recent certificates with download links
 * - Open defects (plain-English summary)
 * - Upcoming service date
 * - BHO Fire & Security branding
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format, formatDistanceToNow, parseISO, isPast } from "date-fns";
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Calendar, MapPin,
  Phone, Mail, FileText, Clock, Building2, Flame, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PortalSite {
  id:            string;
  name:          string;
  address:       string | null;
  city:          string | null;
  postcode:      string | null;
  contact_name:  string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status:        string | null;
}

interface PortalCert {
  id:                    string;
  form_type:             string;
  certificate_reference: string;
  completed_at:          string;
  overall_status:        string;
  next_service_date:     string | null;
  defect_count:          number;
}

interface PortalDefect {
  id:          string;
  description: string;
  severity:    string;
  status:      string;
  raised_at:   string;
  location?:   string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const FORM_TYPE_LABELS: Record<string, string> = {
  bs5839_inspection_servicing:  "Fire Alarm Inspection & Service",
  bs5839_installation:          "Fire Alarm Installation Certificate",
  bs5839_commissioning:         "Fire Alarm Commissioning Certificate",
  bs5839_modification:          "Fire Alarm Modification Certificate",
  asd_service:                  "ASD Annual Service Certificate",
  asd_commissioning:            "ASD Commissioning Certificate",
  el_inspection_commissioning:  "Emergency Lighting Certificate",
  dry_riser:                    "Dry Riser Certificate",
};

function complianceFromStatus(status: string | null) {
  if (status === "Satisfactory")
    return { label: "Compliant",     bg: "bg-success/10",    text: "text-success",     border: "border-success/30",     Icon: CheckCircle2 };
  if (status === "Unsatisfactory")
    return { label: "Action needed", bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30",  Icon: AlertTriangle };
  if (status?.includes("Observation"))
    return { label: "Observations",  bg: "bg-warning/10",    text: "text-warning",     border: "border-warning/30",     Icon: AlertTriangle };
  return   { label: "Unknown",       bg: "bg-muted",         text: "text-muted-foreground", border: "border-border",    Icon: ShieldCheck };
}

function severityLabel(s: string) {
  if (s === "Critical" || s === "Cat 1") return { label: "Urgent action required", cls: "vstatus vstatus-overdue" };
  if (s === "Major"    || s === "Cat 2") return { label: "Remedial work needed",   cls: "vstatus vstatus-inprogress" };
  return                                         { label: "Advisory",               cls: "vstatus vstatus-scheduled" };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SharedSitePortal() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [site, setSite]             = useState<PortalSite | null>(null);
  const [certs, setCerts]           = useState<PortalCert[]>([]);
  const [defects, setDefects]       = useState<PortalDefect[]>([]);
  const [showAllCerts, setShowAllCerts] = useState(false);

  useEffect(() => { if (token) load(); }, [token]);

  async function load() {
    try {
      // 1. Find site by portal_token
      const { data: siteData, error: siteErr } = await supabase
        .from("sites")
        .select("id, name, address, city, postcode, contact_name, contact_email, contact_phone, status")
        .eq("portal_token", token!)
        .single();

      if (siteErr || !siteData) {
        setError("This portal link is invalid or has been removed.");
        return;
      }
      setSite(siteData as PortalSite);

      // 2. Fetch completed certs for this site
      const { data: certData } = await supabase
        .from("smart_form_submissions")
        .select("id, form_type, certificate_reference, completed_at, payload")
        .eq("site_id", siteData.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(20);

      const mappedCerts: PortalCert[] = (certData ?? []).map((c: any) => ({
        id:                    c.id,
        form_type:             c.form_type,
        certificate_reference: c.certificate_reference,
        completed_at:          c.completed_at,
        overall_status:        c.payload?.overall_status ?? "",
        next_service_date:     c.payload?.next_service_date ?? null,
        defect_count:          (c.payload?.defects ?? []).length,
      }));
      setCerts(mappedCerts);

      // 3. Fetch open defects
      const { data: defectData } = await supabase
        .from("site_defects")
        .select("id, description, severity, status, raised_at, location")
        .eq("site_id", siteData.id)
        .in("status", ["open", "in_progress"])
        .order("raised_at", { ascending: false });

      setDefects((defectData ?? []) as PortalDefect[]);

    } catch (e: any) {
      setError(e.message ?? "Failed to load portal");
    } finally {
      setLoading(false);
    }
  }

  // Derive next service date from certs
  const nextServiceDate = certs.find(c => c.next_service_date)?.next_service_date ?? null;
  const latestCert      = certs[0];
  const compliance      = complianceFromStatus(latestCert?.overall_status ?? null);
  const visibleCerts    = showAllCerts ? certs : certs.slice(0, 4);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Loading compliance portal…</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !site) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <ShieldCheck className="w-14 h-14 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-semibold mb-2">Portal unavailable</h2>
          <p className="text-muted-foreground text-sm">{error ?? "This portal link is invalid."}</p>
          <p className="text-xs text-muted-foreground mt-4">
            Contact BHO Fire & Security Ltd on <a href="tel:03300438659" className="text-primary">0330 043 8659</a>
          </p>
        </div>
      </div>
    );
  }

  // ── Portal ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f6f8]">

      {/* Top bar — BHO branding */}
      <header className="bg-[#0d1928] text-white px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Flame className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">BHO Fire & Security Ltd</p>
              <p className="text-[11px] text-white/50">Compliance Portal</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-xs text-white/60">
            <a href="tel:03300438659" className="hover:text-white flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />0330 043 8659
            </a>
            <a href="mailto:admin@bhofire.com" className="hover:text-white flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />admin@bhofire.com
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Site identity */}
        <div className="bg-white rounded-xl border border-[#e8eaed] p-5" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <h1 className="text-xl font-semibold">{site.name}</h1>
              </div>
              {(site.address || site.city || site.postcode) && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  {[site.address, site.city, site.postcode].filter(Boolean).join(", ")}
                </p>
              )}
              {site.contact_name && (
                <p className="text-xs text-muted-foreground mt-1">Responsible person: {site.contact_name}</p>
              )}
            </div>

            {/* Compliance badge */}
            <div className={cn("flex-shrink-0 rounded-lg border px-4 py-3 text-center", compliance.bg, compliance.border)}>
              <compliance.Icon className={cn("w-5 h-5 mx-auto mb-1", compliance.text)} />
              <p className={cn("text-xs font-semibold whitespace-nowrap", compliance.text)}>{compliance.label}</p>
            </div>
          </div>
        </div>

        {/* Key dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-[#e8eaed] p-4" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">Last inspected</p>
            <p className="text-base font-semibold">
              {latestCert
                ? format(parseISO(latestCert.completed_at), "dd MMMM yyyy")
                : "No records"}
            </p>
            {latestCert && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDistanceToNow(parseISO(latestCert.completed_at), { addSuffix: true })}
              </p>
            )}
          </div>
          <div className={cn(
            "rounded-xl border p-4",
            nextServiceDate && isPast(parseISO(nextServiceDate))
              ? "bg-destructive/5 border-destructive/20"
              : "bg-white border-[#e8eaed]"
          )} style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">Next inspection due</p>
            <p className={cn("text-base font-semibold",
              nextServiceDate && isPast(parseISO(nextServiceDate)) ? "text-destructive" : ""
            )}>
              {nextServiceDate
                ? format(parseISO(nextServiceDate), "dd MMMM yyyy")
                : "Not scheduled"}
            </p>
            {nextServiceDate && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {isPast(parseISO(nextServiceDate))
                  ? "Overdue — please contact us to arrange"
                  : formatDistanceToNow(parseISO(nextServiceDate), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>

        {/* Open defects */}
        {defects.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e8eaed] overflow-hidden" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <div className="px-5 py-3.5 border-b border-[#e8eaed] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <h2 className="text-sm font-semibold">Open defects ({defects.length})</h2>
            </div>
            <div className="divide-y divide-[#f1f3f5]">
              {defects.map(d => {
                const sev = severityLabel(d.severity);
                return (
                  <div key={d.id} className="px-5 py-3.5 flex items-start gap-3">
                    <span className={cn(sev.cls, "mt-0.5 flex-shrink-0")}>{sev.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{d.description}</p>
                      {d.location && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <MapPin className="w-3 h-3 inline mr-1" />{d.location}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Certificates */}
        <div className="bg-white rounded-xl border border-[#e8eaed] overflow-hidden" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <div className="px-5 py-3.5 border-b border-[#e8eaed] flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Certificates issued</h2>
          </div>

          {certs.length === 0 && (
            <p className="px-5 py-6 text-sm text-muted-foreground text-center">No certificates on record yet.</p>
          )}

          <div className="divide-y divide-[#f1f3f5]">
            {visibleCerts.map(c => {
              const comp = complianceFromStatus(c.overall_status);
              return (
                <div key={c.id} className="px-5 py-3.5 flex items-center gap-3">
                  <comp.Icon className={cn("w-4 h-4 flex-shrink-0", comp.text)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {FORM_TYPE_LABELS[c.form_type] ?? c.form_type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.certificate_reference} · {format(parseISO(c.completed_at), "dd MMM yyyy")}
                      {c.defect_count > 0 && ` · ${c.defect_count} defect${c.defect_count > 1 ? "s" : ""} noted`}
                    </p>
                  </div>
                  <span className={cn("vstatus flex-shrink-0", comp.text === "text-success" ? "vstatus-completed" : comp.text === "text-destructive" ? "vstatus-overdue" : "vstatus-inprogress")}>
                    {c.overall_status || "Completed"}
                  </span>
                </div>
              );
            })}
          </div>

          {certs.length > 4 && (
            <button
              onClick={() => setShowAllCerts(!showAllCerts)}
              className="w-full px-5 py-3 text-xs text-muted-foreground hover:text-foreground border-t border-[#f1f3f5] flex items-center justify-center gap-1.5 transition-colors hover:bg-muted/20"
            >
              {showAllCerts
                ? <><ChevronUp className="w-3.5 h-3.5" />Show fewer</>
                : <><ChevronDown className="w-3.5 h-3.5" />Show all {certs.length} certificates</>}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-4 space-y-1">
          <p className="text-xs text-muted-foreground">
            This compliance report is provided by <strong>BHO Fire & Security Ltd</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            <a href="tel:03300438659" className="text-primary hover:underline">0330 043 8659</a>
            {" · "}
            <a href="mailto:admin@bhofire.com" className="text-primary hover:underline">admin@bhofire.com</a>
            {" · "}
            <a href="https://bhofire.com" className="text-primary hover:underline">bhofire.com</a>
          </p>
          <p className="text-[10px] text-muted-foreground/60 pt-1">
            Last updated {format(new Date(), "dd MMM yyyy HH:mm")}
          </p>
        </div>
      </main>
    </div>
  );
}
