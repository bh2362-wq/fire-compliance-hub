import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import {
  searchSupplierProducts,
  type SupplierProduct,
} from "@/services/supplierProductService";

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** Fires when the engineer picks a suggestion. Caller patches both
   *  description and unit_price on the row in one go. */
  onPickSuggestion?: (description: string, unitPrice: number) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  /** Optional className passed through to the Textarea. */
  className?: string;
}

// Catalog-as-you-type autocomplete on a description Textarea. Triggers
// when the engineer has typed ≥ 3 characters and the input is focused.
// Debounced 300 ms so a quick word-burst doesn't fire one query per
// keystroke. Multi-word queries auto-broaden via the service's broad
// mode so "smoke detector white" surfaces relevant rows.
//
// Picking a suggestion replaces the description verbatim (PR #238
// contract) and patches unit_price via onPickSuggestion. The popover
// closes on outside click / blur / Escape.
export function DescriptionAutocomplete({
  value,
  onChange,
  onPickSuggestion,
  placeholder,
  disabled,
  rows = 2,
  className,
}: Props) {
  const [suggestions, setSuggestions] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const lastQueryRef = useRef("");

  // Close on outside click — Textarea + popover share a relative wrapper.
  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [open]);

  // Debounced fetch.
  useEffect(() => {
    if (disabled || dismissed || !focused) {
      setOpen(false);
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (trimmed === lastQueryRef.current) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      lastQueryRef.current = trimmed;
      setLoading(true);
      try {
        // Auto-broaden multi-word queries — same logic as the
        // Catalog Price Lookup dialog after the auto-detect change.
        // 10 suggestions tops; the popover is meant to be glance-able,
        // not a full lookup window (which still exists via the
        // Lookup/Change button on the row).
        const looksMultiWord = trimmed.split(/\s+/).filter((t) => t.length >= 2).length >= 2;
        const { data } = await searchSupplierProducts(trimmed, 10, { broad: looksMultiWord });
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, focused, disabled, dismissed]);

  function pick(p: SupplierProduct) {
    onChange(p.description);
    onPickSuggestion?.(p.description, Number(p.trade_price) || 0);
    setOpen(false);
    setDismissed(true);          // don't re-open on the very next keystroke
    lastQueryRef.current = p.description;
  }

  return (
    <div ref={containerRef} className="relative">
      <Textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // Re-arm autocomplete when the engineer types after picking
          // or dismissing.
          if (dismissed) setDismissed(false);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Defer closing so an in-flight click on a suggestion still
          // registers before the popover unmounts.
          setTimeout(() => setFocused(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
            setDismissed(true);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={className}
      />
      {open && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover shadow-md">
          <div className="px-2 py-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground border-b">
            <Sparkles className="h-3 w-3" />
            <span>{loading ? "Searching…" : `${suggestions.length} catalog match${suggestions.length === 1 ? "" : "es"}`}</span>
            <button
              type="button"
              className="ml-auto text-[10px] hover:text-foreground"
              onClick={() => { setOpen(false); setDismissed(true); }}
              tabIndex={-1}
            >
              Hide
            </button>
          </div>
          {suggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/60 flex items-start gap-2"
              // onMouseDown fires before blur, so the pick lands even
              // when the Textarea blurs.
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.description}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {p.product_code && <Badge variant="outline" className="text-[10px] font-mono">{p.product_code}</Badge>}
                  {p.supplier_name && <span>· {p.supplier_name}</span>}
                  {p.category && <span>· {p.category}</span>}
                </div>
              </div>
              <span className="text-[11px] font-semibold whitespace-nowrap">£{Number(p.trade_price).toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
