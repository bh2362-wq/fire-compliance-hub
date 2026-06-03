import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Package, Wrench, Cpu, HelpCircle, Loader2, Check, Sparkles, Save, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { lookupMaterial, saveToCatalog, searchCatalog, MaterialSuggestion } from "@/services/materialsCatalogService";

interface Requirement {
  id: string;
  visit_id: string;
  category: string;
  item_name: string;
  quantity: number;
  notes: string | null;
  is_confirmed: boolean;
  created_at: string;
}

interface VisitRequirementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string;
  siteName: string;
  visitDate: string;
  onUpdate?: () => void;
}

const CATEGORIES = [
  { value: "materials", label: "Materials", icon: Package, color: "bg-primary/10 text-primary border-primary/20" },
  { value: "tools", label: "Tools", icon: Wrench, color: "bg-warning/10 text-warning border-warning/20" },
  { value: "equipment", label: "Special Equipment", icon: Cpu, color: "bg-accent/10 text-accent border-accent/20" },
  { value: "other", label: "Other", icon: HelpCircle, color: "bg-muted text-muted-foreground border-border" },
];

export function VisitRequirementsDialog({
  open,
  onOpenChange,
  visitId,
  siteName,
  visitDate,
  onUpdate,
}: VisitRequirementsDialogProps) {
  const { toast } = useToast();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New item form
  const [newCategory, setNewCategory] = useState("materials");
  const [newItemName, setNewItemName] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newNotes, setNewNotes] = useState("");

  // AI lookup state
  const [suggestions, setSuggestions] = useState<MaterialSuggestion[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<MaterialSuggestion | null>(null);
  const [partNumber, setPartNumber] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) fetchRequirements();
    if (!open) {
      resetForm();
    }
  }, [open, visitId]);

  // Autofill: debounced search as user types
  useEffect(() => {
    if (!newItemName.trim() || newItemName.trim().length < 2 || newCategory !== "materials") {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await searchCatalog(newItemName.trim(), 5);
      if (results.length > 0) {
        setSuggestions(results);
        setShowSuggestions(true);
        setAiUsed(false);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [newItemName, newCategory]);

  const resetForm = () => {
    setNewItemName("");
    setNewQuantity("1");
    setNewNotes("");
    setPartNumber("");
    setRetailPrice("");
    setSelectedSuggestion(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setAiUsed(false);
  };

  const fetchRequirements = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("visit_requirements")
      .select("*")
      .eq("visit_id", visitId)
      .order("category")
      .order("created_at");

    if (!error && data) setRequirements(data as Requirement[]);
    setLoading(false);
  };

  const handleAILookup = async () => {
    if (!newItemName.trim()) return;
    setLookingUp(true);
    setShowSuggestions(true);

    try {
      const { suggestions: results, ai_used } = await lookupMaterial(newItemName.trim());
      setSuggestions(results);
      setAiUsed(ai_used);
      if (results.length === 0) {
        toast({ title: "No matches", description: "No products found. You can still add manually." });
      }
    } catch {
      toast({ title: "Lookup failed", variant: "destructive" });
    } finally {
      setLookingUp(false);
    }
  };

  const handleSelectSuggestion = (s: MaterialSuggestion) => {
    setSelectedSuggestion(s);
    setNewItemName(s.description);
    setPartNumber(s.part_number);
    setRetailPrice(s.retail_price.toFixed(2));
    setShowSuggestions(false);
  };

  const handleAdd = async () => {
    if (!newItemName.trim()) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const itemLabel = partNumber
      ? `${partNumber} - ${newItemName.trim()}`
      : newItemName.trim();

    const priceNote = retailPrice
      ? `£${Number(retailPrice).toFixed(2)} each`
      : "";
    const combinedNotes = [priceNote, newNotes.trim()].filter(Boolean).join(" | ");

    const { error } = await supabase.from("visit_requirements").insert({
      visit_id: visitId,
      category: newCategory,
      item_name: itemLabel,
      quantity: parseInt(newQuantity) || 1,
      notes: combinedNotes || null,
      created_by: user.id,
    });

    if (error) {
      toast({ title: "Error", description: "Failed to add requirement", variant: "destructive" });
    } else {
      // Save to catalog for future autofill if we have a part number
      if (partNumber && selectedSuggestion) {
        await saveToCatalog(selectedSuggestion);
      } else if (partNumber) {
        await saveToCatalog({
          part_number: partNumber,
          description: newItemName.trim(),
          retail_price: Number(retailPrice) || 0,
          category: newCategory,
          supplier: "",
          source: "catalog",
        });
      }

      resetForm();
      fetchRequirements();
      onUpdate?.();
      toast({ title: "Added", description: "Requirement added and saved to catalog" });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("visit_requirements").delete().eq("id", id);
    if (!error) {
      setRequirements((prev) => prev.filter((r) => r.id !== id));
      onUpdate?.();
    }
  };

  const handleToggleConfirm = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("visit_requirements")
      .update({ is_confirmed: !current })
      .eq("id", id);
    if (!error) {
      setRequirements((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_confirmed: !current } : r))
      );
      onUpdate?.();
    }
  };

  const getCategoryConfig = (cat: string) =>
    CATEGORIES.find((c) => c.value === cat) || CATEGORIES[3];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Job Requirements
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {siteName} — {visitDate}
          </p>
        </DialogHeader>

        {/* Add new item */}
        <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/30">
          <p className="text-sm font-medium text-foreground">Add Requirement</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Qty</Label>
              <Input
                className="h-9"
                type="number"
                min="1"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
              />
            </div>
          </div>

          {/* Item name with AI lookup */}
          <div className="relative">
            <Label className="text-xs">Item / Description</Label>
            <div className="flex gap-1.5">
              <Input
                className="h-9 flex-1"
                placeholder="e.g. Apollo XP95 smoke detector"
                value={newItemName}
                onChange={(e) => {
                  setNewItemName(e.target.value);
                  setSelectedSuggestion(null);
                  setPartNumber("");
                  setRetailPrice("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (showSuggestions && suggestions.length > 0) {
                      handleSelectSuggestion(suggestions[0]);
                    } else {
                      handleAILookup();
                    }
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2 shrink-0"
                onClick={handleAILookup}
                disabled={lookingUp || !newItemName.trim()}
                title="AI Product Lookup"
              >
                {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
              </Button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto"
              >
                <div className="p-1.5">
                  <p className="text-[10px] text-muted-foreground px-2 pb-1 flex items-center gap-1">
                    {aiUsed ? <><Sparkles className="h-3 w-3" /> AI suggestions</> : <><Search className="h-3 w-3" /> Catalog matches</>}
                  </p>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/80 transition-colors"
                      onClick={() => handleSelectSuggestion(s)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-primary">{s.part_number}</span>
                        <span className="text-xs font-bold text-foreground">£{s.retail_price.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{s.description}</p>
                      {s.supplier && <span className="text-[10px] text-muted-foreground">{s.supplier}</span>}
                    </button>
                  ))}
                </div>
                <button
                  className="w-full text-center text-xs text-muted-foreground py-1.5 border-t border-border hover:bg-muted/50"
                  onClick={() => setShowSuggestions(false)}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* Part number & price (shown when populated) */}
          {(partNumber || selectedSuggestion) && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Part Number</Label>
                <Input
                  className="h-9 font-mono text-sm"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  placeholder="e.g. 55000-600"
                />
              </div>
              <div>
                <Label className="text-xs">Retail Price (£)</Label>
                <Input
                  className="h-9"
                  type="number"
                  step="0.01"
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              className="min-h-[50px]"
              placeholder="Any additional details..."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={saving || !newItemName.trim()} size="sm" className="w-full">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add {partNumber ? "& Save to Catalog" : ""}
          </Button>
        </div>

        {/* Current requirements list */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Requirements ({requirements.length})
          </p>
          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-4">Loading...</div>
          ) : requirements.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
              No requirements added yet
            </div>
          ) : (
            <div className="space-y-1.5">
              {requirements.map((req) => {
                const cat = getCategoryConfig(req.category);
                const Icon = cat.icon;
                return (
                  <div
                    key={req.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border ${
                      req.is_confirmed ? "bg-success/5 border-success/20" : "bg-card border-border"
                    }`}
                  >
                    <button
                      onClick={() => handleToggleConfirm(req.id, req.is_confirmed)}
                      className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        req.is_confirmed
                          ? "bg-success border-success text-success-foreground"
                          : "border-muted-foreground/30 hover:border-primary"
                      }`}
                    >
                      {req.is_confirmed && <Check className="w-3 h-3" />}
                    </button>
                    <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm ${req.is_confirmed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {req.quantity > 1 ? `${req.quantity}x ` : ""}
                          {req.item_name}
                        </span>
                        <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${cat.color}`}>
                          {cat.label}
                        </Badge>
                      </div>
                      {req.notes && (
                        <p className="text-xs text-muted-foreground truncate">{req.notes}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive"
                      onClick={() => handleDelete(req.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
