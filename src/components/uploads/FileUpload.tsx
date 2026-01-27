import { useCallback, useState } from "react";
import { Upload, X, FileText, FileSpreadsheet, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface UploadedFile {
  file: File;
  id: string;
  preview?: string;
}

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  className?: string;
}

const ACCEPTED_TYPES = {
  "text/csv": [".csv"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
};

const getFileIcon = (type: string) => {
  if (type === "text/csv" || type.includes("csv")) {
    return <FileSpreadsheet className="w-8 h-8 text-success" />;
  }
  if (type === "application/pdf") {
    return <FileText className="w-8 h-8 text-destructive" />;
  }
  return <File className="w-8 h-8 text-muted-foreground" />;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const FileUpload = ({
  onFilesSelected,
  maxFiles = 5,
  maxSizeMB = 20,
  className,
}: FileUploadProps) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      const validTypes = Object.keys(ACCEPTED_TYPES);
      const validExtensions = Object.values(ACCEPTED_TYPES).flat();
      const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;

      if (!validTypes.includes(file.type) && !validExtensions.includes(extension)) {
        return `Invalid file type. Accepted: CSV, PDF, TXT`;
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        return `File too large. Maximum size: ${maxSizeMB}MB`;
      }

      return null;
    },
    [maxSizeMB]
  );

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      setError(null);
      const fileArray = Array.from(files);
      const remainingSlots = maxFiles - uploadedFiles.length;

      if (fileArray.length > remainingSlots) {
        setError(`Maximum ${maxFiles} files allowed`);
        return;
      }

      const validFiles: UploadedFile[] = [];
      for (const file of fileArray) {
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }

        validFiles.push({
          file,
          id: `${file.name}-${Date.now()}-${Math.random()}`,
        });
      }

      const newFiles = [...uploadedFiles, ...validFiles];
      setUploadedFiles(newFiles);
      onFilesSelected(newFiles.map((f) => f.file));
    },
    [uploadedFiles, maxFiles, validateFile, onFilesSelected]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
      }
    },
    [processFiles]
  );

  const removeFile = useCallback(
    (id: string) => {
      const newFiles = uploadedFiles.filter((f) => f.id !== id);
      setUploadedFiles(newFiles);
      onFilesSelected(newFiles.map((f) => f.file));
    },
    [uploadedFiles, onFilesSelected]
  );

  const clearAll = useCallback(() => {
    setUploadedFiles([]);
    onFilesSelected([]);
    setError(null);
  }, [onFilesSelected]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 text-center",
          dragActive
            ? "border-accent bg-accent/5 scale-[1.02]"
            : "border-border hover:border-accent/50 hover:bg-muted/30",
          uploadedFiles.length >= maxFiles && "opacity-50 pointer-events-none"
        )}
      >
        <input
          type="file"
          multiple
          accept=".csv,.pdf,.txt,text/csv,application/pdf,text/plain"
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={uploadedFiles.length >= maxFiles}
        />

        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
              dragActive ? "bg-accent/20" : "bg-muted"
            )}
          >
            <Upload
              className={cn(
                "w-6 h-6 transition-colors",
                dragActive ? "text-accent" : "text-muted-foreground"
              )}
            />
          </div>

          <div>
            <p className="font-medium text-foreground">
              {dragActive ? "Drop files here" : "Drag & drop panel log files"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse • CSV, PDF, TXT up to {maxSizeMB}MB
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="w-4 h-4" />
            <span>CSV</span>
            <span className="text-border">•</span>
            <FileText className="w-4 h-4" />
            <span>PDF</span>
            <span className="text-border">•</span>
            <File className="w-4 h-4" />
            <span>TXT</span>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""} selected
            </p>
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
              Clear all
            </Button>
          </div>

          <div className="space-y-2">
            {uploadedFiles.map((uploadedFile) => (
              <FilePreviewCard
                key={uploadedFile.id}
                file={uploadedFile.file}
                onRemove={() => removeFile(uploadedFile.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface FilePreviewCardProps {
  file: File;
  onRemove: () => void;
}

const FilePreviewCard = ({ file, onRemove }: FilePreviewCardProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Generate preview for text files
  useState(() => {
    if (file.type === "text/plain" || file.type === "text/csv" || file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setPreview(text.slice(0, 500));
      };
      reader.readAsText(file.slice(0, 1000));
    }
  });

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="flex-shrink-0">{getFileIcon(file.type)}</div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
        </div>

        <div className="flex items-center gap-1">
          {preview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-xs"
            >
              {expanded ? "Hide" : "Preview"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Preview Content */}
      {expanded && preview && (
        <div className="border-t border-border bg-muted/30 p-3">
          <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap overflow-auto max-h-40">
            {preview}
            {preview.length >= 500 && "..."}
          </pre>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
