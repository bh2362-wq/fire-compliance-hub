import { useMemo } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SignaturePad } from "@/components/ui/signature-pad";
import { CalendarIcon, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkReportDraft } from "../useWorkReportDraft";

interface Props {
  draft: WorkReportDraft;
  onPatch: (updates: Partial<WorkReportDraft>) => void;
  onComplete: () => void;
  completing: boolean;
  visitDate: string;
}

function isDataUrlSig(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith("data:image");
}

function deriveFinishTime(start: string, durationHours: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const dur = Number(durationHours);
  if (Number.isNaN(sh) || Number.isNaN(sm) || !Number.isFinite(dur) || dur <= 0) return "";
  const total = sh * 60 + sm + Math.round(dur * 60);
  const h = Math.floor((total % (24 * 60)) / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function SignStep({ draft, onPatch, onComplete, completing, visitDate }: Props) {
  const locked = draft.is_locked;
  const workDays = draft.work_days;

  const totalHours = useMemo(
    () =>
      workDays
        .reduce((sum, d) => sum + (parseFloat(d.duration) || 0), 0)
        .toFixed(2),
    [workDays],
  );

  const signSummary = useMemo(() => {
    const arrival = workDays.find((d) => !!d.startTime)?.startTime || "";
    const last = [...workDays]
      .reverse()
      .find((d) => !!d.finishTime || (!!d.startTime && !!d.duration));
    const departure =
      last?.finishTime ||
      (last?.startTime && last?.duration ? deriveFinishTime(last.startTime, last.duration) : "");
    const summaryDateRaw =
      [...workDays].reverse().find((d) => !!d.date)?.date ||
      format(new Date(visitDate), "yyyy-MM-dd");
    const singleDayDuration =
      [...workDays].reverse().find((d) => !!d.duration)?.duration || "";
    const displayDuration = workDays.length > 1 ? totalHours : singleDayDuration;
    return { arrival, departure, summaryDateRaw, displayDuration };
  }, [workDays, totalHours, visitDate]);

  const engineerSigOk = isDataUrlSig(draft.engineer_signature);
  const customerSigOk = draft.customer_not_present || isDataUrlSig(draft.customer_signature);
  const canComplete = engineerSigOk && customerSigOk && !!draft.engineer_name;

  const engineerSignDate = draft.engineer_sign_date ? new Date(draft.engineer_sign_date) : undefined;
  const customerSignDate = draft.customer_sign_date ? new Date(draft.customer_sign_date) : undefined;

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <div
        className={cn(
          "rounded-lg p-4 border-l-4",
          draft.work_completed ? "bg-green-50 border-l-green-500" : "bg-amber-50 border-l-amber-500",
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn("w-3 h-3 rounded-full", draft.work_completed ? "bg-green-500" : "bg-amber-500")} />
          <span
            className={cn(
              "font-semibold text-sm",
              draft.work_completed ? "text-green-800" : "text-amber-800",
            )}
          >
            {draft.work_completed ? "Works Completed" : "Works In Progress"}
          </span>
        </div>
      </div>

      {/* Service summary row */}
      <div className="grid grid-cols-4 gap-3 bg-muted/30 rounded-lg p-3">
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Date</p>
          <p className="font-semibold text-sm">
            {signSummary.summaryDateRaw
              ? format(new Date(signSummary.summaryDateRaw), "dd/MM/yyyy")
              : format(new Date(visitDate), "dd/MM/yyyy")}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Arrival</p>
          <p className="font-semibold text-sm">{signSummary.arrival || "—"}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Departure</p>
          <p className="font-semibold text-sm">{signSummary.departure || "—"}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Duration</p>
          <p className="font-semibold text-sm">
            {signSummary.displayDuration ? `${signSummary.displayDuration} hrs` : "—"}
          </p>
        </div>
      </div>

      {workDays.length > 1 && (
        <div className="text-center text-sm text-muted-foreground bg-muted/20 rounded-lg p-2">
          <span className="font-medium text-foreground">{workDays.length} work days</span> • Total:{" "}
          <span className="font-medium text-foreground">{totalHours} hours</span>
        </div>
      )}

      {/* Signature cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Engineer */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
            <h4 className="font-semibold text-sm uppercase tracking-wide">Engineer</h4>
            {engineerSigOk && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Signed
              </span>
            )}
          </div>
          <div className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Print Name</Label>
              <Input
                value={draft.engineer_name}
                onChange={(e) => onPatch({ engineer_name: e.target.value })}
                placeholder="Engineer name"
                className="h-9"
                disabled={locked}
              />
            </div>

            <SignaturePad
              value={draft.engineer_signature}
              onChange={(v) => onPatch({ engineer_signature: v || "" })}
              width={300}
              height={100}
              label="Signature"
              disabled={locked}
            />

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Date Signed</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-full justify-start text-left font-normal h-8 text-xs",
                        !engineerSignDate && "text-muted-foreground",
                      )}
                      disabled={locked}
                    >
                      <CalendarIcon className="mr-1.5 h-3 w-3" />
                      {engineerSignDate ? format(engineerSignDate, "dd/MM/yyyy") : "Select"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={engineerSignDate}
                      onSelect={(d) => onPatch({ engineer_sign_date: d ? d.toISOString() : null })}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Time Signed</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="time"
                    value={draft.engineer_sign_time || signSummary.departure}
                    onChange={(e) => onPatch({ engineer_sign_time: e.target.value })}
                    className="text-xs h-8 flex-1"
                    disabled={locked}
                  />
                  {signSummary.departure && !draft.engineer_sign_time && !locked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onPatch({ engineer_sign_time: signSummary.departure })}
                      title="Use departure time"
                    >
                      <Clock className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Customer */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
            <h4 className="font-semibold text-sm uppercase tracking-wide">Customer</h4>
            {draft.customer_not_present ? (
              <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Not Present
              </span>
            ) : isDataUrlSig(draft.customer_signature) ? (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Signed
              </span>
            ) : null}
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
              <Checkbox
                id="cust-not-present-work"
                checked={draft.customer_not_present}
                onCheckedChange={(v) => onPatch({ customer_not_present: v === true })}
                disabled={locked}
              />
              <Label htmlFor="cust-not-present-work" className="text-sm cursor-pointer">
                Customer not present
              </Label>
            </div>

            {draft.customer_not_present ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center min-h-[160px] flex flex-col items-center justify-center">
                <p className="text-sm text-amber-800 font-medium">Customer was not available</p>
                <p className="text-xs text-amber-600 mt-1">to sign off on this work</p>
                <p className="text-xs text-muted-foreground mt-3">Report signed by engineer only</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Print Name</Label>
                  <Input
                    value={draft.client_name}
                    onChange={(e) => onPatch({ client_name: e.target.value })}
                    placeholder="Customer name"
                    className="h-9"
                    disabled={locked}
                  />
                </div>

                <SignaturePad
                  value={draft.customer_signature}
                  onChange={(v) => onPatch({ customer_signature: v || "" })}
                  width={300}
                  height={100}
                  label="Signature"
                  disabled={locked}
                />

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date Signed</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "w-full justify-start text-left font-normal h-8 text-xs",
                            !customerSignDate && "text-muted-foreground",
                          )}
                          disabled={locked}
                        >
                          <CalendarIcon className="mr-1.5 h-3 w-3" />
                          {customerSignDate ? format(customerSignDate, "dd/MM/yyyy") : "Select"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-50" align="start">
                        <Calendar
                          mode="single"
                          selected={customerSignDate}
                          onSelect={(d) => onPatch({ customer_sign_date: d ? d.toISOString() : null })}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Time Signed</Label>
                    <Input
                      type="time"
                      value={draft.customer_sign_time}
                      onChange={(e) => onPatch({ customer_sign_time: e.target.value })}
                      className="text-xs h-8"
                      disabled={locked}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Button
          onClick={onComplete}
          disabled={!canComplete || completing || locked}
          className="w-full"
          size="lg"
        >
          {completing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Completing…
            </>
          ) : locked ? (
            "Report locked"
          ) : (
            "Complete work report"
          )}
        </Button>
        {!canComplete && !locked && (
          <ul className="text-xs text-muted-foreground mt-2 space-y-0.5">
            {!draft.engineer_name && <li>• Engineer name required</li>}
            {!engineerSigOk && <li>• Engineer signature required</li>}
            {!customerSigOk && <li>• Customer signature (or "not present" tick) required</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
