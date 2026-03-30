import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobProgressTrackerProps {
  status: string;
  hasReport: boolean;
  hasInvoice: boolean;
  compact?: boolean;
}

const steps = [
  { key: "scheduled", label: "Booked" },
  { key: "completed", label: "Done" },
  { key: "report", label: "Report" },
  { key: "invoiced", label: "Invoiced" },
];

const JobProgressTracker = ({ status, hasReport, hasInvoice, compact = false }: JobProgressTrackerProps) => {
  const getStepStatus = (stepKey: string) => {
    switch (stepKey) {
      case "scheduled":
        return ["scheduled", "confirmed", "in_progress", "completed", "pending_review", "invoiced"].includes(status);
      case "completed":
        return ["completed", "pending_review", "invoiced"].includes(status) || hasReport;
      case "report":
        return hasReport;
      case "invoiced":
        return hasInvoice || status === "invoiced";
      default:
        return false;
    }
  };

  const getCurrentStep = () => {
    if (hasInvoice || status === "invoiced") return "invoiced";
    if (hasReport) return "report";
    if (["completed", "pending_review"].includes(status)) return "completed";
    return "scheduled";
  };

  const currentStep = getCurrentStep();

  const getNextActionLabel = () => {
    if (hasInvoice || status === "invoiced") return null;
    if (hasReport) return "Create Invoice";
    if (["completed", "pending_review"].includes(status)) return "Write Report";
    if (["in_progress"].includes(status)) return "Complete Job";
    return "Start Job";
  };

  const nextAction = getNextActionLabel();

  if (compact) {
    const completedSteps = steps.filter(s => getStepStatus(s.key)).length;
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex gap-0.5">
          {steps.map((step) => (
            <div
              key={step.key}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                getStepStatus(step.key) ? "bg-success" : "bg-muted"
              )}
            />
          ))}
        </div>
        {nextAction && (
          <span className="text-[10px] text-accent font-medium">
            → {nextAction}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, idx) => {
        const done = getStepStatus(step.key);
        const isCurrent = step.key === currentStep && !getStepStatus(steps[idx + 1]?.key);
        return (
          <div key={step.key} className="flex items-center">
            {idx > 0 && (
              <div className={cn("w-3 h-px mx-0.5", done ? "bg-success" : "bg-border")} />
            )}
            <div className="flex items-center gap-0.5">
              {done ? (
                <CheckCircle2 className="w-3 h-3 text-success" />
              ) : (
                <Circle className={cn("w-3 h-3", isCurrent ? "text-accent" : "text-muted-foreground/30")} />
              )}
              <span className={cn(
                "text-[10px]",
                done ? "text-success font-medium" : isCurrent ? "text-accent font-medium" : "text-muted-foreground/50"
              )}>
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default JobProgressTracker;
