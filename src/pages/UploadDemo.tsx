import DashboardLayout from "@/components/dashboard/DashboardLayout";
import FileUpload from "@/components/uploads/FileUpload";
import ParsedResultsTable from "@/components/uploads/ParsedResultsTable";
import { parseCSV, parseTXT, ParseResult } from "@/lib/parsers/csvParser";
import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";

interface ParsedFile {
  file: File;
  result: ParseResult;
}

const UploadDemo = () => {
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [parsing, setParsing] = useState(false);

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
          // For PDFs, we'll need server-side parsing
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

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Upload Panel Logs</h2>
          <p className="text-muted-foreground">
            Upload fire panel log files to reconcile device tests against your inventory
          </p>
        </div>

        <FileUpload onFilesSelected={handleFilesSelected} maxFiles={5} maxSizeMB={20} />

        {parsing && (
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Parsing files...</span>
          </div>
        )}

        {!parsing && parsedFiles.length > 0 && (
          <div className="space-y-8">
            {parsedFiles.map(({ file, result }) => (
              <div key={file.name} className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-foreground">{file.name}</h3>
                  {result.success ? (
                    <span className="text-sm text-success">Successfully parsed</span>
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
      </div>
    </DashboardLayout>
  );
};

export default UploadDemo;
