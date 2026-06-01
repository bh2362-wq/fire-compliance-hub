import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wind } from "lucide-react";
import type { ASDAsset, ASDDraft } from "../useASDDraft";

interface Props {
  draft: ASDDraft;
  onPatch: (updates: Partial<ASDDraft>) => void;
  assets: ASDAsset[];
}

export function DetailsStep({ draft, onPatch, assets }: Props) {
  const hasMultiple = assets.length > 1;
  const primary = assets[0];
  const disabled = draft.is_locked;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Report details</h3>
        <p className="text-xs text-muted-foreground">
          Engineer + client representative for this aspirating smoke detection service visit.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Certificate Number</Label>
          <Input
            value={draft.report_number ?? ""}
            readOnly
            className="bg-muted/50 font-mono"
            placeholder="Auto-generated"
          />
        </div>
        <div className="space-y-2">
          <Label>Engineer Name</Label>
          <Input
            value={draft.engineer_name}
            onChange={(e) => onPatch({ engineer_name: e.target.value })}
            placeholder="Engineer name"
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label>Client Representative</Label>
          <Input
            value={draft.client_name}
            onChange={(e) => onPatch({ client_name: e.target.value })}
            placeholder="Client name"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="font-medium mb-3">
          Aspirating Smoke Detection unit{hasMultiple ? "s" : ""} information
        </h4>
        {hasMultiple ? (
          <div className="space-y-2">
            {assets.map((asset, i) => (
              <div
                key={asset.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border"
              >
                <Wind className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">{asset.item_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {[asset.manufacturer, asset.model, asset.location].filter(Boolean).join(" • ") || "ASD Unit"}
                  </div>
                </div>
                {i === 0 && <Badge variant="secondary" className="text-xs">Primary</Badge>}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Unit Name</Label>
              <Input value={primary?.item_name || ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Manufacturer</Label>
              <Input value={primary?.manufacturer || "—"} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input value={primary?.model || "—"} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={primary?.location || "—"} disabled className="bg-muted" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
