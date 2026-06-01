import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Clock, Trash2 } from "lucide-react";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";
import type { WorkDayEntry, WorkReportDraft } from "../useWorkReportDraft";

interface Props {
  draft: WorkReportDraft;
  onPatch: (updates: Partial<WorkReportDraft>) => void;
}

function calculateDuration(start: string, finish: string): string {
  if (!start || !finish) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [fh, fm] = finish.split(":").map(Number);
  let startMin = sh * 60 + sm;
  let finishMin = fh * 60 + fm;
  if (finishMin < startMin) finishMin += 24 * 60; // overnight
  return ((finishMin - startMin) / 60).toFixed(2);
}

export function WorksStep({ draft, onPatch }: Props) {
  const locked = draft.is_locked;
  const workDays = draft.work_days;

  const updateDay = (index: number, field: keyof WorkDayEntry, value: string) => {
    const next = workDays.map((d, i) => {
      if (i !== index) return d;
      const merged = { ...d, [field]: value };
      if (field === "startTime" || field === "finishTime") {
        merged.duration = calculateDuration(
          field === "startTime" ? value : merged.startTime,
          field === "finishTime" ? value : merged.finishTime,
        );
      }
      return merged;
    });
    onPatch({ work_days: next });
  };

  const addDay = () => {
    onPatch({
      work_days: [...workDays, { date: "", startTime: "", finishTime: "", duration: "" }],
    });
  };

  const removeDay = (index: number) => {
    if (workDays.length <= 1) return;
    onPatch({ work_days: workDays.filter((_, i) => i !== index) });
  };

  const totalHours = workDays
    .reduce((sum, d) => sum + (parseFloat(d.duration) || 0), 0)
    .toFixed(2);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Works Report / Carried Out</Label>
          <AIRewriteButton
            text={draft.works_report}
            type="works"
            onRewrite={(v) => onPatch({ works_report: v })}
            disabled={locked}
            generateRecommendations
            onRecommendationsGenerated={(recs) => {
              if (!draft.further_action.trim()) {
                onPatch({ further_action: recs });
              } else {
                onPatch({ further_action: `${draft.further_action}\n\n${recs}` });
              }
            }}
          />
        </div>
        <Textarea
          value={draft.works_report}
          onChange={(e) => onPatch({ works_report: e.target.value })}
          placeholder="Describe the work carried out..."
          className="min-h-[150px]"
          disabled={locked}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Further Action / Comments</Label>
          <AIRewriteButton
            text={draft.further_action}
            type="comments"
            onRewrite={(v) => onPatch({ further_action: v })}
            disabled={locked}
          />
        </div>
        <Textarea
          value={draft.further_action}
          onChange={(e) => onPatch({ further_action: e.target.value })}
          placeholder="Any follow-up actions required..."
          className="min-h-[100px]"
          disabled={locked}
        />
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium">Work Days</h4>
          <Button variant="outline" size="sm" onClick={addDay} disabled={locked}>
            <Plus className="h-4 w-4 mr-1" />
            Add Day
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left text-sm font-medium p-3">Date</th>
                <th className="text-left text-sm font-medium p-3 w-28">Start</th>
                <th className="text-left text-sm font-medium p-3 w-28">Finish</th>
                <th className="text-left text-sm font-medium p-3 w-24">Hours</th>
                <th className="text-left text-sm font-medium p-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {workDays.map((day, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="p-2">
                    <Input
                      type="date"
                      value={day.date}
                      onChange={(e) => updateDay(index, "date", e.target.value)}
                      disabled={locked}
                      className="border-0 bg-transparent focus-visible:ring-0"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="time"
                      value={day.startTime}
                      onChange={(e) => updateDay(index, "startTime", e.target.value)}
                      disabled={locked}
                      className="border-0 bg-transparent focus-visible:ring-0"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="time"
                      value={day.finishTime}
                      onChange={(e) => updateDay(index, "finishTime", e.target.value)}
                      disabled={locked}
                      className="border-0 bg-transparent focus-visible:ring-0"
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        value={day.duration}
                        onChange={(e) => updateDay(index, "duration", e.target.value)}
                        placeholder="0.00"
                        disabled={locked}
                        className="border-0 bg-transparent focus-visible:ring-0 w-16"
                      />
                      {day.duration && (
                        <span className="text-xs text-muted-foreground">
                          ({Math.floor(parseFloat(day.duration) || 0)}h{" "}
                          {Math.round(((parseFloat(day.duration) || 0) % 1) * 60)}m)
                        </span>
                      )}
                      {!locked && day.startTime && day.finishTime && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            updateDay(index, "duration", calculateDuration(day.startTime, day.finishTime))
                          }
                          title="Recalculate hours"
                        >
                          <Clock className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="p-2">
                    {workDays.length > 1 && !locked && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeDay(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30">
              <tr className="border-t border-border">
                <td colSpan={3} className="p-3 text-right font-medium">Total Hours:</td>
                <td className="p-3" colSpan={2}>
                  <div className="flex items-center gap-1">
                    <span className="text-lg font-bold text-primary">{totalHours}</span>
                    <span className="text-sm text-muted-foreground">
                      ({Math.floor(parseFloat(totalHours))}h{" "}
                      {Math.round((parseFloat(totalHours) % 1) * 60)}m)
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>No. of Engineers</Label>
            <Input
              type="number"
              min={1}
              value={draft.num_engineers}
              onChange={(e) =>
                onPatch({ num_engineers: e.target.value ? parseInt(e.target.value, 10) : "" })
              }
              disabled={locked}
            />
          </div>
          <div className="space-y-2">
            <Label>Travel Time (hrs)</Label>
            <Input
              value={draft.travel_time}
              onChange={(e) => onPatch({ travel_time: e.target.value })}
              placeholder="e.g. 1.5"
              disabled={locked}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
