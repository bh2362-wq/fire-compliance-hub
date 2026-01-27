import DashboardLayout from "@/components/dashboard/DashboardLayout";
import FileUpload from "@/components/uploads/FileUpload";
import ParsedResultsTable from "@/components/uploads/ParsedResultsTable";
import UploadHistory from "@/components/uploads/UploadHistory";
import SiteSelector from "@/components/uploads/SiteSelector";
import { parseCSV, parseTXT, ParseResult } from "@/lib/parsers/csvParser";
import { saveFileUpload } from "@/services/uploadService";
import { useState, useCallback } from "react";
import { Loader2, CheckCircle, AlertCircle, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ParsedFile {
  file: File;
  result: ParseResult;
  saved?: boolean;
  uploadId?: string;
}

const UploadDemo = () => {
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      setParsedFiles([]);
      return;
    }

    setParsing(true);
    const results: ParsedFile[] = [];

    for (const file of files) {
      try {
        const content = await file.text();
        const extension = file.name.split(".").pop()?.toLowerCase();

        let result: ParseResult;
        if (extension === "csv") {
          result = parseCSV(content);
        } else if (extension === "txt") {
          result = parseTXT(content);
        } else {
          result = {
            success: false,
            devices: [],
            headers: [],
            totalRows: 0,
            errors: ["PDF parsing requires server-side processing"],
            summary: { totalDevices: 0, testedDevices: 0, faultDevices: 0, unknownDevices: 0 },
          };
        }

        results.push({ file, result });
      } catch (err) {
        results.push({
          file,
          result: {
            success: false,
            devices: [],
            headers: [],
            totalRows: 0,
            errors: [`Failed to read file: ${err instanceof Error ? err.message : "Unknown error"}`],
            summary: { totalDevices: 0, testedDevices: 0, faultDevices: 0, unknownDevices: 0 },
          },
        });
      }
    }

    setParsedFiles(results);
    setParsing(false);
  }, []);

  const handleSaveToDatabase = async () => {
    setSaving(true);
    const updatedFiles = [...parsedFiles];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < updatedFiles.length; i++) {
      const { file, result, saved } = updatedFiles[i];
      
      if (saved || !result.success) continue;

      const { uploadId, error } = await saveFileUpload({
        file,
        parseResult: result,
        siteId: selectedSiteId && selectedSiteId !== "none" ? selectedSiteId : undefined,
      });

      if (error) {
        errorCount++;
        console.error(`Failed to save ${file.name}:`, error);
      } else {
        successCount++;
        updatedFiles[i] = { ...updatedFiles[i], saved: true, uploadId };
      }
    }

    setParsedFiles(updatedFiles);
    setSaving(false);
    setRefreshTrigger((prev) => prev + 1);

    if (successCount > 0) {
      toast({
        title: "Upload saved",
        description: `Successfully saved ${successCount} file${successCount > 1 ? "s" : ""} to the database.`,
      });
    }

    if (errorCount > 0) {
      toast({
        title: "Some uploads failed",
        description: `Failed to save ${errorCount} file${errorCount > 1 ? "s" : ""}. You may need to sign in.`,
        variant: "destructive",
      });
    }
  };

  const hasUnsavedFiles = parsedFiles.some((f) => f.result.success && !f.saved);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Upload Panel Logs</h2>
          <p className="text-muted-foreground">
            Upload fire panel log files to reconcile device tests against your inventory
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <FileUpload onFilesSelected={handleFilesSelected} maxFiles={5} maxSizeMB={20} />
          </div>
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-xl p-4">
              <SiteSelector
                value={selectedSiteId}
                onValueChange={setSelectedSiteId}
                disabled={saving}
              />
              {selectedSiteId && selectedSiteId !== "none" && (
                <div className="mt-3 flex items-center gap-2 text-sm text-success">
                  <Link className="w-4 h-4" />
                  <span>Uploads will be linked to this site</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {parsing && (
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Parsing files...</span>
          </div>
        )}

        {!parsing && parsedFiles.length > 0 && (
          <div className="space-y-6">
            {/* Save button */}
            {hasUnsavedFiles && (
              <div className="flex items-center justify-between p-4 bg-accent/5 border border-accent/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-accent" />
                  <span className="text-foreground">
                    {parsedFiles.filter((f) => f.result.success && !f.saved).length} file(s) ready to save
                  </span>
                </div>
                <Button
                  variant="hero"
                  onClick={handleSaveToDatabase}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    "Save to Database"
                  )}
                </Button>
              </div>
            )}

            {/* Parsed results */}
            {parsedFiles.map(({ file, result, saved }) => (
              <div key={file.name} className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-foreground">{file.name}</h3>
                  {result.success ? (
                    saved ? (
                      <span className="flex items-center gap-1 text-sm text-success">
                        <CheckCircle className="w-4 h-4" />
                        Saved
                      </span>
                    ) : (
                      <span className="text-sm text-accent">Ready to save</span>
                    )
                  ) : (
                    <span className="text-sm text-destructive">Parsing failed</span>
                  )}
                </div>

                {result.success && result.devices.length > 0 ? (
                  <ParsedResultsTable result={result} fileName={file.name} />
                ) : (
                  <div className="p-6 bg-muted/30 rounded-lg border border-border text-center">
                    <p className="text-muted-foreground">
                      {result.errors.length > 0
                        ? result.errors[0]
                        : "No device data could be extracted from this file"}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload History */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Recent Uploads</h3>
          <UploadHistory refreshTrigger={refreshTrigger} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default UploadDemo;
