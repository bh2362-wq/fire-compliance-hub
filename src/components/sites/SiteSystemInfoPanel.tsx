import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  SiteSystemInfo,
  BS5839_CATEGORIES,
  CABLE_TYPES,
  getSiteSystemInfo,
  updateSiteSystemInfo,
} from "@/services/siteSystemInfoService";

interface Props {
  siteId: string;
}

const EMPTY: Partial<SiteSystemInfo> = {};

// Normalise on save: empty strings on text fields become NULL so they
// don't crowd downstream rendering / unique-constraint logic.
function cleanForUpdate(info: Partial<SiteSystemInfo>): Partial<SiteSystemInfo> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(info)) {
    if (typeof v === "string" && v.trim() === "") out[k] = null;
    else out[k] = v;
  }
  return out as Partial<SiteSystemInfo>;
}

export function SiteSystemInfoPanel({ siteId }: Props) {
  const [info, setInfo] = useState<Partial<SiteSystemInfo>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    getSiteSystemInfo(siteId)
      .then((d) => setInfo(d ?? EMPTY))
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [siteId]);

  const patch = (p: Partial<SiteSystemInfo>) =>
    setInfo((s) => ({ ...s, ...p }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSiteSystemInfo(siteId, cleanForUpdate(info));
      toast.success("System info saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Panel</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Make / model">
            <Input
              value={info.panel_make_model ?? ""}
              onChange={(e) => patch({ panel_make_model: e.target.value })}
              placeholder="e.g. Fireclass FC503"
            />
          </Field>
          <Field label="Software version">
            <Input
              value={info.panel_software_version ?? ""}
              onChange={(e) => patch({ panel_software_version: e.target.value })}
            />
          </Field>
          <Field label="Year installed">
            <Input
              type="number"
              inputMode="numeric"
              value={info.year_installed ?? ""}
              onChange={(e) =>
                patch({
                  year_installed:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">System</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="BS 5839-1 category">
            <Select
              value={info.bs5839_category ?? "__none"}
              onValueChange={(v) =>
                patch({
                  bs5839_category: v === "__none" ? null : (v as never),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {BS5839_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cable type">
            <Select
              value={info.cable_type ?? "__none"}
              onValueChange={(v) =>
                patch({ cable_type: v === "__none" ? null : (v as never) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {CABLE_TYPES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Zones">
            <Input
              type="number"
              inputMode="numeric"
              value={info.num_zones ?? ""}
              onChange={(e) =>
                patch({
                  num_zones: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Loops">
            <Input
              type="number"
              inputMode="numeric"
              value={info.num_loops ?? ""}
              onChange={(e) =>
                patch({
                  num_loops: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Devices">
            <Input
              type="number"
              inputMode="numeric"
              value={info.num_devices ?? ""}
              onChange={(e) =>
                patch({
                  num_devices:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="PSU capacity (Ah)">
            <Input
              type="number"
              inputMode="decimal"
              step={0.1}
              value={info.psu_capacity_ah ?? ""}
              onChange={(e) =>
                patch({
                  psu_capacity_ah:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="ARC connected">
            <Select
              value={
                info.arc_connected == null ? "__none" : String(info.arc_connected)
              }
              onValueChange={(v) =>
                patch({
                  arc_connected:
                    v === "__none" ? null : v === "true" ? true : false,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Building</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Building type">
            <Input
              value={info.building_type ?? ""}
              onChange={(e) => patch({ building_type: e.target.value })}
            />
          </Field>
          <Field label="Occupancy type">
            <Input
              value={info.occupancy_type ?? ""}
              onChange={(e) => patch({ occupancy_type: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Coverage</h4>
        <Field label="Areas covered">
          <Textarea
            rows={2}
            value={info.areas_covered ?? ""}
            onChange={(e) => patch({ areas_covered: e.target.value })}
          />
        </Field>
        <Field label="Areas NOT covered">
          <Textarea
            rows={2}
            value={info.areas_not_covered ?? ""}
            onChange={(e) => patch({ areas_not_covered: e.target.value })}
          />
        </Field>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
