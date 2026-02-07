import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Receipt, FileCheck, Mail } from "lucide-react";

interface InvoicePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onDecline: () => void;
  onEmailReport?: () => void;
  siteName: string;
}

export function InvoicePromptDialog({
  open,
  onOpenChange,
  onConfirm,
  onDecline,
  onEmailReport,
  siteName,
}: InvoicePromptDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
              <FileCheck className="w-6 h-6 text-success" />
            </div>
            <div>
              <AlertDialogTitle>Report Completed</AlertDialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{siteName}</p>
            </div>
          </div>
          <AlertDialogDescription className="text-left">
            This report has been completed and locked. What would you like to do next?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onDecline} className="sm:flex-1">
            Not Now
          </AlertDialogCancel>
          {onEmailReport && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onEmailReport();
              }}
              className="sm:flex-1"
            >
              <Mail className="w-4 h-4 mr-2" />
              Email Report
            </Button>
          )}
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            className="sm:flex-1"
          >
            <Receipt className="w-4 h-4 mr-2" />
            Create Invoice
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
