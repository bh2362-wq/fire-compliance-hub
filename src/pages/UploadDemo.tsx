import DashboardLayout from "@/components/dashboard/DashboardLayout";
import FileUpload from "@/components/uploads/FileUpload";
import { useState } from "react";

const UploadDemo = () => {
  const [files, setFiles] = useState<File[]>([]);

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    console.log("Selected files:", selectedFiles);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Upload Panel Logs</h2>
          <p className="text-muted-foreground">
            Upload fire panel log files to reconcile device tests against your inventory
          </p>
        </div>

        <FileUpload onFilesSelected={handleFilesSelected} maxFiles={5} maxSizeMB={20} />

        {files.length > 0 && (
          <div className="p-4 bg-muted/30 rounded-lg border border-border">
            <p className="text-sm text-muted-foreground">
              Ready to process {files.length} file{files.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default UploadDemo;
