import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
          <Field label="Manual call points">
            <Input
              type="number"
              inputMode="numeric"
              value={info.num_manual_call_points ?? ""}
              onChange={(e) =>
                patch({
                  num_manual_call_points:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Sounders">
            <Input
              type="number"
              inputMode="numeric"
              value={info.num_sounders ?? ""}
              onChange={(e) =>
                patch({
                  num_sounders:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Detectors">
            <Input
              type="number"
              inputMode="numeric"
              value={info.num_detectors ?? ""}
              onChange={(e) =>
                patch({
                  num_detectors:
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

        {info.arc_connected === true && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <Field label="ARC provider">
              <Input
                value={info.arc_provider ?? ""}
                onChange={(e) => patch({ arc_provider: e.target.value })}
                placeholder="e.g. EMCS / CSL DualCom"
              />
            </Field>
            <Field label="ARC account ref">
              <Input
                value={info.arc_account_ref ?? ""}
                onChange={(e) => patch({ arc_account_ref: e.target.value })}
              />
            </Field>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Site profile</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
          <Field label="Access hours">
            <Input
              value={info.access_hours ?? ""}
              onChange={(e) => patch({ access_hours: e.target.value })}
              placeholder="e.g. Mon–Fri 08:00–17:00"
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

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Duty Holder / Responsible Person
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Name">
            <Input
              value={info.duty_holder_name ?? ""}
              onChange={(e) => patch({ duty_holder_name: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <Input
              value={info.duty_holder_role ?? ""}
              onChange={(e) => patch({ duty_holder_role: e.target.value })}
              placeholder="e.g. Facilities Manager"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={info.duty_holder_email ?? ""}
              onChange={(e) => patch({ duty_holder_email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel"
              value={info.duty_holder_phone ?? ""}
              onChange={(e) => patch({ duty_holder_phone: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-muted-foreground">
            Voice Alarm (PAVA)
          </h4>
          <div className="flex items-center gap-2">
            <Label htmlFor="has-pava" className="text-xs">
              Site has PAVA
            </Label>
            <Switch
              id="has-pava"
              checked={info.has_pava === true}
              onCheckedChange={(checked) => patch({ has_pava: checked })}
            />
          </div>
        </div>

        {info.has_pava === true && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="PAVA make">
                <Input
                  value={info.pava_make ?? ""}
                  onChange={(e) => patch({ pava_make: e.target.value })}
                />
              </Field>
              <Field label="PAVA model">
                <Input
                  value={info.pava_model ?? ""}
                  onChange={(e) => patch({ pava_model: e.target.value })}
                />
              </Field>
              <Field label="Software version">
                <Input
                  value={info.pava_software_version ?? ""}
                  onChange={(e) =>
                    patch({ pava_software_version: e.target.value })
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Zones">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={info.pava_num_zones ?? ""}
                  onChange={(e) =>
                    patch({
                      pava_num_zones:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Loudspeakers">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={info.pava_num_loudspeakers ?? ""}
                  onChange={(e) =>
                    patch({
                      pava_num_loudspeakers:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Circuits">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={info.pava_num_circuits ?? ""}
                  onChange={(e) =>
                    patch({
                      pava_num_circuits:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Fire alarm interface method">
                <Input
                  value={info.pava_fa_interface_method ?? ""}
                  onChange={(e) =>
                    patch({ pava_fa_interface_method: e.target.value })
                  }
                  placeholder="e.g. Volt-free contacts / RS-485 / EN 54-13"
                />
              </Field>
              <Field label="Network topology">
                <Input
                  value={info.pava_network_topology ?? ""}
                  onChange={(e) =>
                    patch({ pava_network_topology: e.target.value })
                  }
                  placeholder="e.g. Single-loop / dual-redundant ring"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="BS EN 54-16 compliant">
                <Select
                  value={
                    info.pava_bs_en_54_16_compliant == null
                      ? "__none"
                      : String(info.pava_bs_en_54_16_compliant)
                  }
                  onValueChange={(v) =>
                    patch({
                      pava_bs_en_54_16_compliant:
                        v === "__none" ? null : v === "true",
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
              <Field label="BS EN 54-24 compliant">
                <Select
                  value={
                    info.pava_bs_en_54_24_compliant == null
                      ? "__none"
                      : String(info.pava_bs_en_54_24_compliant)
                  }
                  onValueChange={(v) =>
                    patch({
                      pava_bs_en_54_24_compliant:
                        v === "__none" ? null : v === "true",
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
              <Field label="Has backup amplifier">
                <Select
                  value={
                    info.pava_has_backup_amplifier == null
                      ? "__none"
                      : String(info.pava_has_backup_amplifier)
                  }
                  onValueChange={(v) =>
                    patch({
                      pava_has_backup_amplifier:
                        v === "__none" ? null : v === "true",
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
          </div>
        )}
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
