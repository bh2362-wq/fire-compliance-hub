import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Receipt, FileCheck } from "lucide-react";

interface InvoicePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onDecline: () => void;
  siteName: string;
}

export function InvoicePromptDialog({
  open,
  onOpenChange,
  onConfirm,
  onDecline,
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
            This report has been completed and locked. Would you like to create an invoice for this job now?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onDecline} className="sm:flex-1">
            Not Now
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="sm:flex-1 bg-primary hover:bg-primary/90">
            <Receipt className="w-4 h-4 mr-2" />
            Create Invoice
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
