/**
 * DefectImportPanel
 *
 * Shown at the top of any form's defects step. Fetches outstanding defects
 * from the site_defects register for the linked site and lets the engineer
 * import them with one click — pre-populating location, description, severity
 * and recommended action.
 *
 * After import the engineer can update status to "Closed" if remediated on
 * this visit. When the cert completes, those status updates flow back to the
 * register via the existing pushDefectsToSiteDefects logic.
 *
 * Props:
 *   siteId          — site to look up; panel stays hidden if falsy
 *   alreadyImported — Set of register defect IDs already in the form
 *   onImport        — called with array of DefectEntry objects to add
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight, Download, AlertTriangle, Loader2 } from "lucide-react";
import { listDefects, SiteDefect, DefectCategory } from "@/services/defectService";
import type { DefectEntry } from "@/services/smartFormService";

// ── Category → severity mapping ───────────────────────────────────────────────
const CAT_TO_SEVERITY: Record<DefectCategory, DefectEntry["severity"]> = {
  1: "Critical",
  2: "Major",
  3: "Minor",
};

const CAT_COLORS: Record<DefectCategory, string> = {
  1: "bg-red-100 text-red-700 border-red-200",
  2: "bg-amber-100 text-amber-700 border-amber-200",
  3: "bg-blue-100 text-blue-700 border-blue-200",
};

const CAT_LABELS: Record<DefectCategory, string> = {
  1: "Cat 1",
  2: "Cat 2",
  3: "Cat 3",
};

// ── Status → form status mapping ──────────────────────────────────────────────
function mapStatus(s: SiteDefect["status"]): DefectEntry["status"] {
  if (s === "quoted")        return "Requires Quote";
  if (s === "remediated")    return "Closed";
  if (s === "accepted_risk") return "Closed";
  return "Open";
}

// ── Convert SiteDefect → DefectEntry ──────────────────────────────────────────
function toDefectEntry(d: SiteDefect): DefectEntry & { _register_id: string } {
  // description field in register often has "Recommended: ..." appended — split it out
  const [desc, ...rest] = d.description.split("\nRecommended: ");
  const recommended = rest.join("\nRecommended: ").trim();

  return {
    id: `imported-${d.id}`,
    _register_id: d.id,
    location:           d.location || "",
    description:        desc.trim(),
    severity:           CAT_TO_SEVERITY[d.category] ?? "Minor",
    bs_reference:       d.notes?.replace(/^(.*) — from cert.*$/, "$1").trim() || "",
    recommended_action: recommended || "",
    status:             mapStatus(d.status),
    photo_url:          undefined,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  siteId: string | null | undefined;
  alreadyImported: Set<string>;   // set of _register_id strings already in form
  onImport: (entries: (DefectEntry & { _register_id?: string })[]) => void;
}

export function DefectImportPanel({ siteId, alreadyImported, onImport }: Props) {
  const [open, setOpen]         = useState(false);
  const [defects, setDefects]   = useState<SiteDefect[]>([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded]     = useState(false);

  // Auto-load when panel opens
  useEffect(() => {
    if (!open || !siteId || loaded) return;
    setLoading(true);
    listDefects({ siteId, status: "open" })
      .then(rows => {
        // Also fetch quoted
        return listDefects({ siteId, status: "quoted" }).then(quoted => [...rows, ...quoted]);
      })
      .then(all => {
        // Dedupe and sort by category
        const seen = new Set<string>();
        const unique = all.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
        unique.sort((a, b) => a.category - b.category);
        setDefects(unique);
        setLoaded(true);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, siteId, loaded]);

  if (!siteId) {
    return (
      <div className="rounded-lg border bg-muted/20 px-3 py-2.5 mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Download className="w-3.5 h-3.5" />
        <span>
          <strong>Import from defect register</strong> — link this form to a site (via the Site prefill panel above) to load outstanding defects.
        </span>
      </div>
    );
  }

  const importable = defects.filter(d => !alreadyImported.has(d.id));
  const allSelected = importable.length > 0 && importable.every(d => selected.has(d.id));

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importable.map(d => d.id)));
    }
  }

  function doImport() {
    const toImport = importable
      .filter(d => selected.has(d.id))
      .map(d => toDefectEntry(d));
    if (toImport.length === 0) return;
    onImport(toImport);
    setSelected(new Set());
    setOpen(false);
  }

  const hasOutstanding = importable.length > 0;

  return (
    <div className="rounded-lg border overflow-hidden mb-1">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Download className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">Import from defect register</span>
          {hasOutstanding && !open && (
            <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">
              {importable.length} outstanding
            </Badge>
          )}
          {!hasOutstanding && loaded && (
            <span className="text-xs text-muted-foreground">No outstanding defects</span>
          )}
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {/* Content */}
      {open && (
        <div className="border-t bg-card">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading outstanding defects...
            </div>
          ) : importable.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground text-center">
              No outstanding open or quoted defects for this site.
            </p>
          ) : (
            <>
              {/* Select all + import button */}
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    className="h-3.5 w-3.5"
                  />
                  Select all ({importable.length})
                </label>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={selected.size === 0}
                  onClick={doImport}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Import {selected.size > 0 ? `${selected.size} ` : ""}selected
                </Button>
              </div>

              {/* Defect list */}
              <ScrollArea className="max-h-64">
                <div className="divide-y">
                  {importable.map(d => {
                    const isSelected = selected.has(d.id);
                    const [desc] = d.description.split("\nRecommended: ");
                    return (
                      <label
                        key={d.id}
                        className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isSelected ? "bg-blue-50/60 dark:bg-blue-950/20" : "hover:bg-muted/30"}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggle(d.id)}
                          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${CAT_COLORS[d.category]}`}>
                              {CAT_LABELS[d.category]}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                              d.status === "quoted"
                                ? "border-purple-200 bg-purple-50 text-purple-700"
                                : "border-orange-200 bg-orange-50 text-orange-700"
                            }`}>
                              {d.status === "quoted" ? "Quoted" : "Open"}
                            </Badge>
                            {d.location && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                {d.location}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-foreground leading-snug line-clamp-2">
                            {desc.trim()}
                          </p>
                          {d.notes && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {d.notes.replace(/ — from cert.*$/, "")}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Info note */}
              <div className="flex items-start gap-2 px-3 py-2 border-t bg-muted/10 text-xs text-muted-foreground">
                <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-500" />
                Imported defects are pre-filled from the register. Update the status to <strong>Closed</strong> for any remediated on this visit — the register will be updated when the cert completes.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
