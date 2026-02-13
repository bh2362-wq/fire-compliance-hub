import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Check } from "lucide-react";
import { DevicePriceItem } from "@/services/devicePricingService";

interface DevicePriceResultsDialogProps {
  item: DevicePriceItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPrice: (price: number) => void;
}

export function DevicePriceResultsDialog({ item, open, onOpenChange, onSelectPrice }: DevicePriceResultsDialogProps) {
  const suppliers = Array.isArray(item.ai_price_results) ? item.ai_price_results : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>AI Price Results</DialogTitle>
          <DialogDescription>
            {item.model_number || item.description} — Select a supplier price to use as your cost price.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No supplier prices found.</p>
          ) : (
            suppliers.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{s.name}</span>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <span className="text-lg font-bold">£{Number(s.estimated_price).toFixed(2)}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectPrice(s.estimated_price)}
                  className="ml-2"
                >
                  <Check className="mr-1 h-3 w-3" /> Use Price
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
