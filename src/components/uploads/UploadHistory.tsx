import { FileUploadRecord, getUploadHistory } from "@/services/uploadService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, FileSpreadsheet, File, Eye, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface UploadHistoryProps {
  visitId?: string;
  siteId?: string;
  onViewUpload?: (uploadId: string) => void;
  refreshTrigger?: number;
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

interface SiteInfo {
  id: string;
  name: string;
}

const UploadHistory = ({
  visitId,
  siteId,
  onViewUpload,
  refreshTrigger,
}: UploadHistoryProps) => {
  const [uploads, setUploads] = useState<FileUploadRecord[]>([]);
  const [sites, setSites] = useState<Record<string, SiteInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Fetch uploads
      const { uploads: data, error: fetchError } = await getUploadHistory({
        visitId,
        siteId,
        limit: 10,
      });

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }
      
      setUploads(data);

      // Fetch site names for linked uploads
      const siteIds = [...new Set(data.filter(u => u.site_id).map(u => u.site_id!))];
      if (siteIds.length > 0) {
        const { data: siteData } = await supabase
          .from("sites")
          .select("id, name")
          .in("id", siteIds);
        
        if (siteData) {
          const siteMap: Record<string, SiteInfo> = {};
          siteData.forEach(s => { siteMap[s.id] = s; });
          setSites(siteMap);
        }
      }
      
      setLoading(false);
    };

    fetchData();
  }, [visitId, siteId, refreshTrigger]);

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Loading upload history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-destructive">
        Error loading uploads: {error}
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground border border-dashed border-border rounded-lg">
        No uploads yet. Upload a file to get started.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {uploads.map((upload) => (
        <div
          key={upload.id}
          className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg hover:bg-muted/30 transition-colors"
        >
          <div className="flex-shrink-0">{getFileIcon(upload.file_type)}</div>

          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">
              {upload.file_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(upload.created_at), {
                addSuffix: true,
              })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {upload.site_id && sites[upload.site_id] && (
              <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                {sites[upload.site_id].name}
              </Badge>
            )}
            <Badge variant="outline" className="bg-success/10 text-success border-success/20">
              {upload.devices_passed} passed
            </Badge>
            {upload.devices_failed > 0 && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                {upload.devices_failed} failed
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {upload.devices_found} devices
            </span>
          </div>

          {onViewUpload && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewUpload(upload.id)}
            >
              <Eye className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};

export default UploadHistory;
