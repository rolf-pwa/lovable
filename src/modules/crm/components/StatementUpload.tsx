import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { FileUp, X, FileText, Loader2 } from "lucide-react";

interface StatementUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  isIngesting?: boolean;
}

export function StatementUpload({ files, onFilesChange, isIngesting }: StatementUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf"
    );
    if (dropped.length) onFilesChange([...files, ...dropped]);
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length) onFilesChange([...files, ...selected]);
    // Reset so the same file can be re-added
    e.target.value = "";
  }

  function removeFile(index: number) {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileUp className="h-5 w-5 text-primary" />
          Statement Upload
          <Badge variant="secondary" className="text-[10px] ml-auto">Optional</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Upload financial statement PDFs. Data will be extracted by AI and routed to the Review Queue for approval.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* File list */}
        {files.map((file, i) => (
          <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
            <FileText className="h-6 w-6 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            {isIngesting ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Ingesting…
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeFile(i)}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <FileUp className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Drop PDFs here or <span className="font-medium text-primary">browse</span>
          </p>
          <p className="text-xs text-muted-foreground/60">PDF files up to 20 MB each</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleSelect}
            className="hidden"
          />
        </div>
      </CardContent>
    </Card>
  );
}
