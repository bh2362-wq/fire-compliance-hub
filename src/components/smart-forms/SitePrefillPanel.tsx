/**
 * SitePrefillPanel
 *
 * Shown at the top of smart form step 0. Lets the engineer:
 *   1. Search for and select the current site
 *   2. See what previous cert data was found
 *   3. Apply prefill with one click — populates 10-15 fields instantly
 *
 * Usage:
 *   <SitePrefillPanel
 *     formType="bs5839_inspection_servicing"
 *     siteId={linkedSiteId}
 *     onSiteSelected={setSiteId}
 *     onPrefillApplied={(fields) => setPayload(prev => ({ ...prev, ...fields }))}
 *   />
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Search, CheckCircle2, X, Building2, ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildSmartPrefill, SmartPrefillResult } from "@/services/smartPrefillService";
import { cn } from "@/lib/utils";

interface Site { id: string; name: string; address: string | null; }

interface Props {
  formType: string;
  siteId?: string | null;
  onSiteSelected?: (siteId: string) => void;
  onPrefillApplied: (fields: Record<string, unknown>, batteryAgeHint?: SmartPrefillResult["battery_age_hint"]) => void;
  applied?: boolean;
}

export function SitePrefillPanel({ formType, siteId, onSiteSelected, onPrefillApplied, applied }: Props) {
  const [query, setQuery]         = useState("");
  const [sites, setSites]         = useState<Site[]>([]);
  const [open, setOpen]           = useState(false);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [prefill, setPrefill]     = useState<SmartPrefillResult | null>(null);
  const [loading, setLoading]     = useState(false);
  const [prefillApplied, setPrefillApplied] = useState(applied ?? false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // If siteId passed externally, auto-load
  useEffect(() => {
    if (siteId && !selectedSite) {
      supabase.from("sites").select("id, name, address").eq("id", siteId).single()
        .then(({ data }) => { if (data) { setSelectedSite(data); loadPrefill(siteId); } });
    }
  }, [siteId]);

  async function search(q: string) {
    setQuery(q);
    if (q.length < 2) { setSites([]); return; }
    const { data } = await supabase
      .from("sites")
      .select("id, name, address")
      .ilike("name", `%${q}%`)
      .limit(8);
    setSites(data ?? []);
    setOpen(true);
  }

  async function selectSite(site: Site) {
    setSelectedSite(site);
    setQuery(site.name);
    setOpen(false);
    setSites([]);
    onSiteSelected?.(site.id);
    await loadPrefill(site.id);
  }

  async function loadPrefill(id: string) {
    setLoading(true);
    try {
      const result = await buildSmartPrefill(id, formType);
      setPrefill(result);
    } finally {
      setLoading(false);
    }
  }

  function applyPrefill() {
    if (!prefill) return;
    onPrefillApplied(prefill.fields, prefill.battery_age_hint);
    setPrefillApplied(true);
  }

  function clearSite() {
    setSelectedSite(null);
    setQuery("");
    setPrefill(null);
    setPrefillApplied(false);
    onSiteSelected?.("");
  }

  // ── Applied state ────────────────────────────────────────────────────────────
  if (prefillApplied && selectedSite) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-sm">
        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-green-800 dark:text-green-400">{selectedSite.name}</span>
          {prefill && (
            <span className="text-green-700 dark:text-green-500 ml-2 text-xs">
              Prefilled from {prefill.source.cert_reference} ({prefill.source.completed_at_label}) — {prefill.source.field_count} fields
            </span>
          )}
        </div>
        <button onClick={clearSite} className="text-green-600 hover:text-green-800">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Site search */}
      <div ref={ref} className="relative">
        <div className="relative">
          {selectedSite ? (
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          )}
          <Input
            value={selectedSite ? selectedSite.name : query}
            onChange={e => { if (!selectedSite) search(e.target.value); }}
            onFocus={() => { if (query.length >= 2) setOpen(true); }}
            placeholder="Search for site to prefill — e.g. Palantir, Hampton..."
            className={cn("pl-9 pr-8 text-sm", selectedSite && "text-primary font-medium")}
          />
          {selectedSite ? (
            <button onClick={clearSite} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          ) : query && (
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          )}
        </div>

        {/* Dropdown results */}
        {open && sites.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {sites.map(site => (
              <button
                key={site.id}
                onClick={() => selectSite(site)}
                className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-start gap-2 border-b last:border-0"
              >
                <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{site.name}</p>
                  {site.address && <p className="text-xs text-muted-foreground truncate">{site.address}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Prefill offer */}
      {loading && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Looking up previous records for {selectedSite?.name}...
        </div>
      )}

      {!loading && selectedSite && prefill && !prefillApplied && (
        <div className="px-3 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  Previous data found
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  {prefill.source.cert_reference} · {prefill.source.completed_at_label}
                </p>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 bg-blue-50 dark:bg-transparent">
                    {prefill.source.field_count} fields
                  </Badge>
                  <span className="text-[10px] text-blue-600">Premises · System · Panel · Engineer</span>
                </div>
                {prefill.battery_age_hint && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                    ⚠ Battery age: was {prefill.battery_age_hint.previous_age}y — suggest updating to {prefill.battery_age_hint.suggested_age}y
                  </p>
                )}
              </div>
            </div>
            <Button size="sm" onClick={applyPrefill} className="flex-shrink-0 h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">
              Apply
            </Button>
          </div>
        </div>
      )}

      {!loading && selectedSite && !prefill && !prefillApplied && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border text-xs text-muted-foreground">
          <Building2 className="w-3.5 h-3.5" />
          No previous records for {selectedSite.name} — form will be blank
        </div>
      )}
    </div>
  );
}
