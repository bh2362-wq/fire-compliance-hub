import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSpreadsheet, FileText, File, GitCompare, Upload, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

interface FileUpload {
  id: string;
  file_name: string;
  file_type: string;
  devices_found: number | null;
  devices_passed: number | null;
  devices_failed: number | null;
  created_at: string;
}

interface SiteUploadHistoryProps {
  siteId: string;
}

const getFileIcon = (fileType: string) => {
  if (fileType.includes("csv")) {
    return <FileSpreadsheet className="w-5 h-5 text-success" />;
  }
  if (fileType.includes("pdf")) {
    return <FileText className="w-5 h-5 text-destructive" />;
  }
  return <File className="w-5 h-5 text-muted-foreground" />;
};

const SiteUploadHistory = ({ siteId }: SiteUploadHistoryProps) => {
  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUploads = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("file_uploads")
        .select("id, file_name, file_type, devices_found, devices_passed, devices_failed, created_at")
        .eq("site_id", siteId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!error && data) {
        setUploads(data);
      }
      setLoading(false);
    };

    fetchUploads();
  }, [siteId]);

  const handleReconcile = (uploadId: string) => {
    const params = new URLSearchParams();
    params.set("siteId", siteId);
    params.set("uploadId", uploadId);
    navigate(`/dashboard/reconciliation?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="p-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Upload History</h3>
            <p className="text-sm text-muted-foreground">
              {uploads.length} upload{uploads.length !== 1 ? "s" : ""} for this site
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/dashboard/upload?siteId=${siteId}`)}
        >
          <Upload className="w-4 h-4 mr-2" />
          New Upload
        </Button>
      </div>

      {uploads.length === 0 ? (
        <div className="p-12 text-center">
          <Upload className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No uploads yet</h3>
          <p className="text-muted-foreground mb-4">
            Upload a test results file to reconcile against this site's inventory.
          </p>
          <Button
            variant="hero"
            onClick={() => navigate(`/dashboard/upload?siteId=${siteId}`)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload File
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex-shrink-0">{getFileIcon(upload.file_type)}</div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{upload.file_name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(upload.created_at), { addSuffix: true })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                  {upload.devices_passed || 0} passed
                </Badge>
                {(upload.devices_failed || 0) > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-destructive/10 text-destructive border-destructive/20"
                  >
                    {upload.devices_failed} failed
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  {upload.devices_found || 0} devices
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReconcile(upload.id)}
                className="text-accent hover:text-accent"
              >
                <GitCompare className="w-4 h-4 mr-1" />
                Reconcile
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SiteUploadHistory;
