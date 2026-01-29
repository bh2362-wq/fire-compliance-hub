import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, ClipboardCheck } from "lucide-react";

interface ReportTypeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: "bs5839" | "work") => void;
}

export function ReportTypeSelector({
  open,
  onOpenChange,
  onSelect,
}: ReportTypeSelectorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Report Type</DialogTitle>
          <DialogDescription>
            Choose the type of service report to create for this visit.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 hover:border-primary"
            onClick={() => {
              onSelect("work");
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-semibold">Work Report</span>
            </div>
            <p className="text-sm text-muted-foreground text-left">
              General job sheet for all service types. Includes job details, works carried out, materials used, and sign-off.
            </p>
          </Button>

          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 hover:border-primary"
            onClick={() => {
              onSelect("bs5839");
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <span className="font-semibold">BS5839 Fire Alarm Report</span>
            </div>
            <p className="text-sm text-muted-foreground text-left">
              Comprehensive fire alarm service report with BS5839:2025 compliance checklist, system details, and condition assessment.
            </p>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
