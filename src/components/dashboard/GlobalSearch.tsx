import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, MapPin, ClipboardList, BarChart3, FileSpreadsheet, Receipt, Users, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: "customer" | "site" | "visit" | "report" | "quotation";
  href: string;
}

const typeConfig = {
  customer: { icon: Users, label: "Customer", color: "text-blue-500" },
  site: { icon: MapPin, label: "Site", color: "text-green-500" },
  visit: { icon: ClipboardList, label: "Visit", color: "text-orange-500" },
  report: { icon: BarChart3, label: "Report", color: "text-purple-500" },
  quotation: { icon: FileSpreadsheet, label: "Quotation", color: "text-teal-500" },
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        setResults([]);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const term = `%${q.trim()}%`;

      const [customers, sites, visits, reports, quotations] = await Promise.all([
        supabase.from("customers").select("id, name, contact_name, city").ilike("name", term).limit(5),
        supabase.from("sites").select("id, name, address, city").ilike("name", term).limit(5),
        supabase.from("visits").select("id, visit_type, visit_date, sites!inner(name)").or(`visit_type.ilike.${term}`).limit(5),
        supabase.from("service_reports").select("id, report_number, report_type, sites!inner(name)").or(`report_number.ilike.${term},report_type.ilike.${term}`).limit(5),
        supabase.from("quotations").select("id, quotation_number, customer_name, site_name").or(`quotation_number.ilike.${term},customer_name.ilike.${term},site_name.ilike.${term}`).limit(5),
      ]);

      const mapped: SearchResult[] = [];

      (customers.data || []).forEach((c: any) => mapped.push({
        id: c.id, title: c.name, subtitle: [c.contact_name, c.city].filter(Boolean).join(" · "),
        type: "customer", href: `/customers/${c.id}`,
      }));

      (sites.data || []).forEach((s: any) => mapped.push({
        id: s.id, title: s.name, subtitle: [s.address, s.city].filter(Boolean).join(", "),
        type: "site", href: `/dashboard/sites/${s.id}`,
      }));

      (visits.data || []).forEach((v: any) => mapped.push({
        id: v.id, title: `${v.visit_type || "Visit"}`, subtitle: `${(v as any).sites?.name || ""} · ${v.visit_date || ""}`,
        type: "visit", href: `/dashboard/visits`,
      }));

      (reports.data || []).forEach((r: any) => mapped.push({
        id: r.id, title: r.report_number || "Report", subtitle: `${r.report_type || ""} · ${(r as any).sites?.name || ""}`,
        type: "report", href: `/dashboard/reports`,
      }));

      (quotations.data || []).forEach((q: any) => mapped.push({
        id: q.id, title: q.quotation_number || "Quote", subtitle: [q.customer_name, q.site_name].filter(Boolean).join(" · "),
        type: "quotation", href: `/dashboard/quotations`,
      }));

      setResults(mapped);
      setSelectedIndex(0);
    } catch (err) {
      console.error("Global search error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 250);
  };

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    navigate(result.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground text-sm transition-colors min-w-[180px] md:min-w-[260px]"
      >
        <Search className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline">Search everything...</span>
        <span className="sm:hidden">Search...</span>
        <kbd className="hidden md:inline-flex ml-auto items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop for mobile */}
          <div className="fixed inset-0 z-50 bg-black/20 md:bg-transparent" onClick={() => setOpen(false)} />
          <div className="fixed left-1/2 top-[10%] -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg md:absolute md:left-auto md:top-full md:translate-x-0 md:right-0 md:mt-2 md:w-[480px] rounded-xl border border-border bg-popover shadow-xl">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search customers, sites, reports, quotes..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                autoFocus
              />
              {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              <button onClick={() => { setOpen(false); setQuery(""); setResults([]); }} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-1">
              {query.length < 2 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Type at least 2 characters to search
                </div>
              )}

              {query.length >= 2 && !loading && results.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No results found for "{query}"
                </div>
              )}

              {Object.entries(grouped).map(([type, items]) => {
                const config = typeConfig[type as keyof typeof typeConfig];
                return (
                  <div key={type}>
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {config.label}s
                    </div>
                    {items.map((result) => {
                      flatIndex++;
                      const idx = flatIndex;
                      const Icon = config.icon;
                      return (
                        <button
                          key={result.id}
                          onClick={() => handleSelect(result)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors",
                            idx === selectedIndex && "bg-accent"
                          )}
                        >
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-muted", config.color)}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                            {result.subtitle && (
                              <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                            )}
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {config.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>ESC Close</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
