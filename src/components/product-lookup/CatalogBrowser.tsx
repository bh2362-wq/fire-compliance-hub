import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CatalogBrowserProps {
  refreshKey: number;
}

interface CatalogRow {
  id:          string;
  part_number: string;
  description: string;
  manufacturer: string;
  category:    string;
  unit_cost:   number;
  source:      "huvo" | "supplier";
  notes:       string | null;
}

const PAGE_SIZE = 100;

const CATEGORIES = [
  "All",
  "Detector", "Aspirating Detector", "Sounder", "MCP", "Panel",
  "Interface", "Cable", "Battery", "Door Control", "Intercom",
  "Accessories", "CCTV", "Intruder", "Suppression",
  "Emergency Lighting", "Disabled Alarm", "Other",
];

export function CatalogBrowser({ refreshKey }: CatalogBrowserProps) {
  const [rows,     setRows]     = useState<CatalogRow[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [mfgFilter, setMfgFilter] = useState("All");
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [loading,  setLoading]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Load manufacturers for filter dropdown ───────────────────────────────
  useEffect(() => {
    supabase
      .from("price_list_items")
      .select("manufacturer")
      .not("manufacturer", "is", null)
      .order("manufacturer")
      .then(({ data }) => {
        const unique = [...new Set((data || []).map((d: any) => d.manufacturer).filter(Boolean))].sort();
        setManufacturers(unique);
      });
  }, [refreshKey]);

  // ── Main data fetch ───────────────────────────────────────────────────────
  const fetchPage = useCallback(async (p: number, q: string, cat: string, mfg: string) => {
    setLoading(true);
    try {
      const from = (p - 1) * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      // ── price_list_items (Huvo + imported) ──────────────────────────────
      let pliQuery = supabase
        .from("price_list_items")
        .select("id, part_number, description, manufacturer, category, unit_cost, notes", { count: "exact" })
        .eq("is_active", true);

      if (q.trim()) {
        pliQuery = pliQuery.or(
          `part_number.ilike.%${q.trim()}%,description.ilike.%${q.trim()}%`
        );
      }
      if (cat !== "All") pliQuery = pliQuery.eq("category", cat);
      if (mfg !== "All") pliQuery = pliQuery.eq("manufacturer", mfg);

      const { data: pliData, count: pliCount, error: pliErr } = await pliQuery
        .order("part_number")
        .range(from, to);

      if (pliErr) throw pliErr;

      const mapped: CatalogRow[] = (pliData || []).map((r: any) => ({
        id:           r.id,
        part_number:  r.part_number,
        description:  r.description || r.part_number,
        manufacturer: r.manufacturer || "—",
        category:     r.category || "Other",
        unit_cost:    Number(r.unit_cost) || 0,
        source:       "huvo",
        notes:        r.notes || null,
      }));

      // ── supplier_products (legacy, only if no primary results on page 1) ──
      // Include only if no cat/mfg filter active to avoid confusion
      let spRows: CatalogRow[] = [];
      let spCount = 0;
      if (cat === "All" && mfg === "All") {
        let spQuery = supabase
          .from("supplier_products")
          .select("id, product_code, description, supplier_name, category, trade_price", { count: "exact" });

        if (q.trim()) {
          spQuery = spQuery.or(
            `product_code.ilike.%${q.trim()}%,description.ilike.%${q.trim()}%`
          );
        }

        const { data: spData, count: spC } = await spQuery
          .order("product_code")
          .limit(20);

        spCount = spC || 0;
        spRows = (spData || []).map((r: any) => ({
          id:           r.id,
          part_number:  r.product_code,
          description:  r.description || r.product_code,
          manufacturer: r.supplier_name || "—",
          category:     r.category || "Other",
          unit_cost:    Number(r.trade_price) || 0,
          source:       "supplier" as const,
          notes:        null,
        }));
      }

      // Combine — pli first, then any extra supplier rows not in pli
      const pliParts = new Set(mapped.map(r => r.part_number.toLowerCase()));
      const uniqueSp = spRows.filter(r => !pliParts.has(r.part_number.toLowerCase()));

      setRows([...mapped, ...(p === 1 ? uniqueSp.slice(0, 20) : [])]);
      setTotal((pliCount || 0) + spCount);
    } catch (e: any) {
      toast.error("Failed to load catalog");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(page, search, catFilter, mfgFilter);
  }, [page, refreshKey, fetchPage]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchPage(1, val, catFilter, mfgFilter);
    }, 300);
  };

  const handleCat = (val: string) => {
    setCatFilter(val);
    setPage(1);
    fetchPage(1, search, val, mfgFilter);
  };

  const handleMfg = (val: string) => {
    setMfgFilter(val);
    setPage(1);
    fetchPage(1, search, catFilter, val);
  };

  if (total === 0 && !search && catFilter === "All" && mfgFilter === "All" && !loading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Price Catalog</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {total.toLocaleString()} items
            </Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Part no. or description…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            {/* Category filter */}
            <Select value={catFilter} onValueChange={handleCat}>
              <SelectTrigger className="w-44 h-9 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Manufacturer filter */}
            <Select value={mfgFilter} onValueChange={handleMfg}>
              <SelectTrigger className="w-40 h-9 text-xs">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                <SelectItem value="All" className="text-xs">All brands</SelectItem>
                {manufacturers.map(m => (
                  <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">No items match your search.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[140px]">Part No.</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs w-[120px]">Brand</TableHead>
                    <TableHead className="text-xs w-[120px]">Category</TableHead>
                    <TableHead className="text-xs text-right w-[90px]">Price</TableHead>
                    <TableHead className="text-xs w-[60px]">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={row.notes === "verify-price" ? "bg-amber-50/40" : ""}
                    >
                      <TableCell className="font-mono text-xs py-2">{row.part_number}</TableCell>
                      <TableCell className="text-xs py-2 max-w-[320px]">
                        <span className="line-clamp-2">{row.description}</span>
                        {row.notes === "verify-price" && (
                          <span className="text-[10px] text-amber-600 ml-1">⚠ verify price</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{row.manufacturer}</TableCell>
                      <TableCell className="text-xs py-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {row.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2 text-right font-medium">
                        £{row.unit_cost.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          row.source === "huvo"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {row.source === "huvo" ? "Huvo" : "Cat"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                <span>
                  Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="sm"
                    className="h-7 w-7 p-0"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2">Page {page} / {totalPages}</span>
                  <Button
                    variant="outline" size="sm"
                    className="h-7 w-7 p-0"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
