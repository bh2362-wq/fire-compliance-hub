import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Cloud, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SharePointBulkUploadProps {
  reports: Array<{
    id: string;
    report_number: string | null;
    report_date: string;
    site_id: string;
    sharepoint_url?: string | null;
    notes: string | null;
    // All fields needed for PDF generation
    [key: string]: any;
  }>;
  customerName: string;
  siteMap: Record<string, string>; // siteId -> siteName
  visitMap: Record<string, { visit_type: string; visit_date: string }>;
  generatePdfBase64ForReport: (report: any) => Promise<string | null>;
  onComplete?: () => void;
  label?: string;
}

const sanitize = (name: string) =>
  name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();

export function SharePointBulkUpload({
  reports,
  customerName,
  siteMap,
  visitMap,
  generatePdfBase64ForReport,
  onComplete,
  label = "Upload All to SharePoint",
}: SharePointBulkUploadProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [failed, setFailed] = useState(0);
  const [skipped, setSkipped] = useState(0);

  const pendingReports = reports.filter((r) => !r.sharepoint_url && r.report_number);

  const handleBulkUpload = async () => {
    if (pendingReports.length === 0) {
      toast.info("All reports are already uploaded to SharePoint");
      return;
    }

    setUploading(true);
    setTotal(pendingReports.length);
    setCompleted(0);
    setFailed(0);
    setSkipped(0);
    setProgress(0);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pendingReports.length; i++) {
      const report = pendingReports[i];
      const siteName = siteMap[report.site_id];
      const visit = visitMap[report.visit_id];

      if (!siteName || !visit) {
        failCount++;
        setFailed(failCount);
        setProgress(((i + 1) / pendingReports.length) * 100);
        continue;
      }

      try {
        const folderPath = `Customers/${sanitize(customerName)}/${sanitize(siteName)}/Reports`;
        const fileName = `${report.report_number}.pdf`;

        const fileBase64 = await generatePdfBase64ForReport(report);
        if (!fileBase64) {
          failCount++;
          setFailed(failCount);
          setProgress(((i + 1) / pendingReports.length) * 100);
          continue;
        }

        const { data, error } = await supabase.functions.invoke("upload-to-sharepoint", {
          body: { folderPath, fileName, fileBase64, contentType: "application/pdf" },
        });

        if (error || data?.error) {
          failCount++;
          setFailed(failCount);
        } else {
          // Save URL to report
          await supabase
            .from("service_reports")
            .update({
              sharepoint_folder: folderPath,
              sharepoint_url: data.webUrl || null,
            })
            .eq("id", report.id);

          successCount++;
          setCompleted(successCount);
        }
      } catch (err) {
        console.error(`Failed to upload report ${report.report_number}:`, err);
        failCount++;
        setFailed(failCount);
      }

      setProgress(((i + 1) / pendingReports.length) * 100);
    }

    setUploading(false);

    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} report${successCount > 1 ? "s" : ""} to SharePoint`);
      onComplete?.();
    }
    if (failCount > 0) {
      toast.error(`${failCount} report${failCount > 1 ? "s" : ""} failed to upload`);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialogOpen(true)}
        disabled={pendingReports.length === 0}
        title={pendingReports.length === 0 ? "All reports already uploaded" : `${pendingReports.length} reports to upload`}
      >
        <Cloud className="w-4 h-4 mr-2" />
        {label}
        {pendingReports.length > 0 && (
          <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
            {pendingReports.length}
          </span>
        )}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(o) => !uploading && setDialogOpen(o)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5" />
              Bulk Upload to SharePoint
            </DialogTitle>
            <DialogDescription>
              Upload {pendingReports.length} report{pendingReports.length !== 1 ? "s" : ""} to SharePoint.
              Each report will be saved to: <span className="font-medium text-foreground">{sanitize(customerName)}/[Site]/Reports/[Number].pdf</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {uploading ? (
              <div className="space-y-3">
                <Progress value={progress} className="h-2" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Uploading... {Math.round(progress)}%</span>
                  <span>
                    {completed} done{failed > 0 ? `, ${failed} failed` : ""}
                  </span>
                </div>
              </div>
            ) : progress === 100 ? (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm font-medium">Upload Complete</p>
                <p className="text-sm text-muted-foreground">
                  {completed} uploaded, {failed} failed{skipped > 0 ? `, ${skipped} skipped` : ""}
                </p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                <p>Reports without a SharePoint link will be uploaded. Already-uploaded reports will be skipped.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={uploading}
            >
              {progress === 100 ? "Close" : "Cancel"}
            </Button>
            {progress < 100 && (
              <Button onClick={handleBulkUpload} disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Start Upload
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
