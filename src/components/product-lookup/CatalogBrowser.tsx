import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Pencil, Trash2, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  getSupplierProducts,
  updateSupplierProduct,
  deleteSupplierProduct,
  SupplierProduct,
} from "@/services/supplierProductService";

interface CatalogBrowserProps {
  refreshKey: number;
}

const PAGE_SIZE = 50;

export function CatalogBrowser({ refreshKey }: CatalogBrowserProps) {
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<SupplierProduct>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchPage = useCallback(async (p: number, search: string) => {
    setLoading(true);
    const { data, total: t, error } = await getSupplierProducts(p, PAGE_SIZE, search);
    if (error) toast.error("Failed to load catalog");
    setProducts(data);
    setTotal(t);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPage(page, filter);
  }, [page, refreshKey, fetchPage]);

  const handleFilterChange = (val: string) => {
    setFilter(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchPage(1, val);
    }, 300);
  };

  const startEdit = (p: SupplierProduct) => {
    setEditingId(p.id);
    setEditData({ product_code: p.product_code, description: p.description, trade_price: p.trade_price, category: p.category || "" });
  };

  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await updateSupplierProduct(editingId, {
      product_code: editData.product_code,
      description: editData.description,
      trade_price: Number(editData.trade_price) || 0,
      category: editData.category || null,
    });
    if (error) { toast.error("Update failed"); return; }
    toast.success("Product updated");
    setEditingId(null);
    setEditData({});
    fetchPage(page, filter);
  };

  const handleDelete = async (id: string) => {
    const { error } = await deleteSupplierProduct(id);
    if (error) { toast.error("Delete failed"); return; }
    toast.success("Product deleted");
    fetchPage(page, filter);
  };

  if (total === 0 && !filter && !loading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Catalog Data</CardTitle>
            <Badge variant="secondary" className="text-xs">{total.toLocaleString()} products</Badge>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter products…"
              value={filter}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[160px]">Product Code</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs w-[120px]">Category</TableHead>
                    <TableHead className="text-xs text-right w-[100px]">Trade Price</TableHead>
                    <TableHead className="text-xs text-center w-[90px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) =>
                    editingId === p.id ? (
                      <TableRow key={p.id}>
                        <TableCell className="py-1">
                          <Input value={editData.product_code || ""} onChange={(e) => setEditData({ ...editData, product_code: e.target.value })} className="h-8 text-sm font-mono" />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input value={editData.description || ""} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input value={editData.category as string || ""} onChange={(e) => setEditData({ ...editData, category: e.target.value })} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input type="number" step="0.01" value={editData.trade_price ?? ""} onChange={(e) => setEditData({ ...editData, trade_price: parseFloat(e.target.value) })} className="h-8 text-sm text-right" />
                        </TableCell>
                        <TableCell className="py-1 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}><Check className="h-3.5 w-3.5 text-primary" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm font-medium py-2">{p.product_code}</TableCell>
                        <TableCell className="text-sm py-2">{p.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">{p.category || "—"}</TableCell>
                        <TableCell className="text-sm text-right font-bold py-2">£{Number(p.trade_price).toFixed(2)}</TableCell>
                        <TableCell className="text-center py-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs px-2">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
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
