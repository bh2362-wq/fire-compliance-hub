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
  VisitCallout,
  FaultDetails,
  PRIORITIES,
  COMMERCIAL_CLASSIFICATIONS,
  REPORT_METHODS,
  getVisitCallout,
  updateVisitCallout,
} from "@/services/visitCalloutService";

interface Props {
  visitId: string;
}

const EMPTY: Partial<VisitCallout> = {};

// HTML <input type="datetime-local"> wants 'YYYY-MM-DDTHH:mm' (no zone,
// no seconds). Round-trip through Date so a stored UTC string renders
// as local time for the engineer.
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// text[] columns are edited as comma-separated strings — the most
// engineer-friendly editor that doesn't need a tag-input component.
function arrayToInput(arr: string[] | null | undefined): string {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

function inputToArray(s: string): string[] | null {
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length === 0 ? null : parts;
}

export function VisitCalloutPanel({ visitId }: Props) {
  const [info, setInfo] = useState<Partial<VisitCallout>>(EMPTY);
  // Tracking text[] / textarea inputs as their raw string forms so we
  // don't reformat as the user types.
  const [zonesText, setZonesText] = useState("");
  const [loopsText, setLoopsText] = useState("");
  const [fault, setFault] = useState<FaultDetails>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    getVisitCallout(visitId)
      .then((d) => {
        const v = d ?? EMPTY;
        setInfo(v);
        setZonesText(arrayToInput(v.affected_zones));
        setLoopsText(arrayToInput(v.affected_loops));
        setFault(v.fault_details ?? {});
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [visitId]);

  const patch = (p: Partial<VisitCallout>) =>
    setInfo((s) => ({ ...s, ...p }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Compose the final payload from the controlled form state.
      const cleanFault: FaultDetails = {};
      (Object.keys(fault) as (keyof FaultDetails)[]).forEach((k) => {
        const v = (fault[k] ?? "").trim();
        if (v.length > 0) cleanFault[k] = v;
      });

      const payload: Partial<VisitCallout> = {
        ...info,
        affected_zones: inputToArray(zonesText),
        affected_loops: inputToArray(loopsText),
        fault_details: Object.keys(cleanFault).length > 0 ? cleanFault : null,
      };

      // Normalise empty strings on scalar text fields → NULL.
      const STRING_FIELDS: (keyof VisitCallout)[] = ["reported_by"];
      STRING_FIELDS.forEach((k) => {
        const v = payload[k];
        if (typeof v === "string" && v.trim() === "") {
          (payload as Record<string, unknown>)[k] = null;
        }
      });

      await updateVisitCallout(visitId, payload);
      toast.success("Callout details saved");
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
    <div className="space-y-5">
      {/* ── Triage ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Triage</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Priority">
            <Select
              value={info.priority ?? "__none"}
              onValueChange={(v) =>
                patch({ priority: v === "__none" ? null : (v as never) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Commercial classification">
            <Select
              value={info.commercial_classification ?? "__none"}
              onValueChange={(v) =>
                patch({
                  commercial_classification:
                    v === "__none" ? null : (v as never),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {COMMERCIAL_CLASSIFICATIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Call received at">
            <Input
              type="datetime-local"
              value={toLocalInput(info.call_received_at)}
              onChange={(e) =>
                patch({ call_received_at: fromLocalInput(e.target.value) })
              }
            />
          </Field>
          <Field label="Reported by">
            <Input
              value={info.reported_by ?? ""}
              onChange={(e) => patch({ reported_by: e.target.value })}
              placeholder="Name + role / site contact"
            />
          </Field>
          <Field label="Report method">
            <Select
              value={info.report_method ?? "__none"}
              onValueChange={(v) =>
                patch({ report_method: v === "__none" ? null : (v as never) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {REPORT_METHODS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      {/* ── Engineer response ────────────────────────────────────── */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Engineer response
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Engineer assigned at">
            <Input
              type="datetime-local"
              value={toLocalInput(info.engineer_assigned_at)}
              onChange={(e) =>
                patch({ engineer_assigned_at: fromLocalInput(e.target.value) })
              }
            />
          </Field>
          <Field label="ARC notified at">
            <Input
              type="datetime-local"
              value={toLocalInput(info.arc_notified_at)}
              onChange={(e) =>
                patch({ arc_notified_at: fromLocalInput(e.target.value) })
              }
            />
          </Field>
        </div>
      </section>

      {/* ── Affected ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Affected</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Affected zones">
            <Input
              value={zonesText}
              onChange={(e) => setZonesText(e.target.value)}
              placeholder="e.g. 3, 7, 12 — comma separated"
            />
          </Field>
          <Field label="Affected loops">
            <Input
              value={loopsText}
              onChange={(e) => setLoopsText(e.target.value)}
              placeholder="e.g. 1, 2 — comma separated"
            />
          </Field>
        </div>
      </section>

      {/* ── Fault narrative (JSONB) ──────────────────────────────── */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Fault narrative
        </h4>
        <Field label="Fault as reported">
          <Textarea
            rows={2}
            value={fault.reported ?? ""}
            onChange={(e) => setFault((s) => ({ ...s, reported: e.target.value }))}
          />
        </Field>
        <Field label="Status on arrival">
          <Textarea
            rows={2}
            value={fault.on_arrival ?? ""}
            onChange={(e) =>
              setFault((s) => ({ ...s, on_arrival: e.target.value }))
            }
          />
        </Field>
        <Field label="Investigation &amp; fault found">
          <Textarea
            rows={2}
            value={fault.found ?? ""}
            onChange={(e) => setFault((s) => ({ ...s, found: e.target.value }))}
          />
        </Field>
        <Field label="Action taken">
          <Textarea
            rows={2}
            value={fault.action_taken ?? ""}
            onChange={(e) =>
              setFault((s) => ({ ...s, action_taken: e.target.value }))
            }
          />
        </Field>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save callout details"}
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
