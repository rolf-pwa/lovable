import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument } from "pdf-lib";
import { AppLayout } from "@/shared/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Progress } from "@/shared/components/ui/progress";
import { supabase } from "@/shared/integrations/supabase/client";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  CheckCircle2,
  Users,
  Anchor,
  ArrowRight,
  FileText,
  Sparkles,
  AlertCircle,
  SkipForward,
  Play,
} from "lucide-react";

type Step = "upload" | "splitting" | "classifying" | "review" | "onboarding" | "complete";

interface Segment {
  startPage: number;
  endPage: number;
  pageCount: number;
}

interface ClientGroup {
  clientName: string;
  segments: Segment[];
  totalPages: number;
  institutions: string[];
  status: "pending" | "processing" | "done" | "error";
  result?: any;
}

export default function BulkOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fmt = (v: number | null | undefined) =>
    v != null ? `$${v.toLocaleString("en-CA", { minimumFractionDigits: 0 })}` : "—";

  // Step 1: Split PDF on blank pages
  const handleSplit = useCallback(async () => {
    if (!file) return;

    setStep("splitting");
    setProgress({ current: 0, total: 100, label: "Loading PDF…" });

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setPdfBytes(bytes);
      const pdfDoc = await PDFDocument.load(bytes);
      const totalPages = pdfDoc.getPageCount();

      setProgress({ current: 10, total: 100, label: `Scanning ${totalPages} pages for blank separators…` });

      // Detect blank pages by checking content stream size
      const blankPages: number[] = [];
      for (let i = 0; i < totalPages; i++) {
        const page = pdfDoc.getPage(i);
        const contentStream = page.node.get(page.node.context.obj("Contents"));

        let isBlank = false;
        if (!contentStream) {
          isBlank = true;
        } else {
          // Check if the content stream is very small (blank pages have minimal content)
          try {
            // Try to get the raw content - blank pages have very short streams
            const ref = page.node.get(page.node.context.obj("Contents"));
            if (ref) {
              const obj = page.node.context.lookup(ref);
              if (obj && "getContents" in obj) {
                const content = (obj as any).getContents();
                isBlank = content.length < 100;
              } else if (obj && "toString" in obj) {
                const str = obj.toString();
                isBlank = str.length < 200;
              }
            }
          } catch {
            // If we can't read content, try a size-based heuristic
            // Blank pages in financial statements typically have no annotations and minimal resources
            const annots = page.node.get(page.node.context.obj("Annots"));
            const resources = page.node.get(page.node.context.obj("Resources"));
            if (!annots && (!resources || resources.toString().length < 100)) {
              isBlank = true;
            }
          }
        }

        if (isBlank) blankPages.push(i);

        if (i % 50 === 0) {
          setProgress({
            current: 10 + Math.round((i / totalPages) * 60),
            total: 100,
            label: `Scanning page ${i + 1} of ${totalPages}…`,
          });
        }
      }

      // Build segments between blank pages
      const segs: Segment[] = [];
      let segStart = 0;
      for (const b of blankPages) {
        if (b > segStart) {
          segs.push({ startPage: segStart, endPage: b - 1, pageCount: b - segStart });
        }
        segStart = b + 1;
      }
      if (segStart < totalPages) {
        segs.push({ startPage: segStart, endPage: totalPages - 1, pageCount: totalPages - segStart });
      }

      setSegments(segs);
      setProgress({ current: 80, total: 100, label: `Found ${segs.length} statement segments across ${totalPages} pages` });

      toast.success(`Detected ${segs.length} statement segments separated by ${blankPages.length} blank pages`);

      // Move to classification
      await classifySegments(segs, bytes);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to split PDF: " + err.message);
      setStep("upload");
    }
  }, [file]);

  // Step 2: Classify each segment by uploading first page and asking AI
  async function classifySegments(segs: Segment[], bytes: Uint8Array) {
    setStep("classifying");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Not authenticated"); setStep("upload"); return; }

    setProgress({ current: 0, total: segs.length, label: "Uploading segment samples for AI classification…" });

    // Extract first page of each segment and upload
    const chunkPaths: string[] = [];
    const batchSize = 10; // Process in batches to avoid overwhelming

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      try {
        const srcDoc = await PDFDocument.load(bytes);
        const newDoc = await PDFDocument.create();
        // Copy just the first page of this segment
        const [copied] = await newDoc.copyPages(srcDoc, [seg.startPage]);
        newDoc.addPage(copied);
        const firstPageBytes = await newDoc.save();

        const path = `bulk-classify/${Date.now()}-seg${i}.pdf`;
        const { error } = await supabase.storage
          .from("statement-uploads")
          .upload(path, firstPageBytes, { contentType: "application/pdf" });
        if (error) throw error;
        chunkPaths.push(path);
      } catch (err: any) {
        console.error(`Failed to extract segment ${i}:`, err);
        chunkPaths.push("");
      }

      setProgress({ current: i + 1, total: segs.length, label: `Extracting segment ${i + 1} of ${segs.length}…` });
    }

    // Call classify in batches
    const allClassifications: Array<{ chunkIndex: number; clientName: string; institutions: string[] }> = [];

    for (let batchStart = 0; batchStart < chunkPaths.length; batchStart += batchSize) {
      const batchPaths = chunkPaths.slice(batchStart, batchStart + batchSize).filter(Boolean);
      if (!batchPaths.length) continue;

      setProgress({
        current: batchStart,
        total: chunkPaths.length,
        label: `AI classifying segments ${batchStart + 1}–${Math.min(batchStart + batchSize, chunkPaths.length)}…`,
      });

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-onboarding-classify`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ chunkPaths: batchPaths }),
          }
        );
        const data = await res.json();
        if (data.classifications) {
          allClassifications.push(
            ...data.classifications.map((c: any, idx: number) => ({
              ...c,
              chunkIndex: batchStart + idx,
            }))
          );
        }
      } catch (err) {
        console.error("Classify batch error:", err);
      }
    }

    // Group segments by client name
    const groupMap = new Map<string, ClientGroup>();

    for (let i = 0; i < segs.length; i++) {
      const classification = allClassifications.find((c) => c.chunkIndex === i);
      const clientName = classification?.clientName || `Unknown Client ${i + 1}`;
      const normalizedName = clientName.trim();

      if (!groupMap.has(normalizedName)) {
        groupMap.set(normalizedName, {
          clientName: normalizedName,
          segments: [],
          totalPages: 0,
          institutions: classification?.institutions || [],
          status: "pending",
        });
      }

      const group = groupMap.get(normalizedName)!;
      group.segments.push(segs[i]);
      group.totalPages += segs[i].pageCount;
      if (classification?.institutions) {
        for (const inst of classification.institutions) {
          if (!group.institutions.includes(inst)) group.institutions.push(inst);
        }
      }
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
    setClientGroups(groups);
    setStep("review");

    toast.success(`Identified ${groups.length} unique clients across ${segs.length} statements`);
  }

  // Step 3: Onboard all clients
  async function handleOnboardAll() {
    setStep("onboarding");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !pdfBytes) return;

    let completed = 0;
    const total = clientGroups.length;

    for (let gi = 0; gi < clientGroups.length; gi++) {
      const group = clientGroups[gi];
      setClientGroups((prev) =>
        prev.map((g, i) => (i === gi ? { ...g, status: "processing" } : g))
      );
      setProgress({
        current: gi,
        total,
        label: `Onboarding ${group.clientName} (${gi + 1}/${total})…`,
      });

      try {
        // Create a PDF containing all this client's pages
        const srcDoc = await PDFDocument.load(pdfBytes);
        const clientDoc = await PDFDocument.create();

        const pageIndices: number[] = [];
        for (const seg of group.segments) {
          for (let p = seg.startPage; p <= seg.endPage; p++) {
            pageIndices.push(p);
          }
        }

        const copiedPages = await clientDoc.copyPages(srcDoc, pageIndices);
        for (const page of copiedPages) {
          clientDoc.addPage(page);
        }

        const clientPdfBytes = await clientDoc.save();
        const path = `bulk-onboarding/${Date.now()}-${group.clientName.replace(/\s+/g, "_")}.pdf`;

        const { error: upErr } = await supabase.storage
          .from("statement-uploads")
          .upload(path, clientPdfBytes, { contentType: "application/pdf" });
        if (upErr) throw upErr;

        // Call the onboarding-ingest function
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-ingest`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              filePaths: [path],
              familyName: group.clientName,
            }),
          }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setClientGroups((prev) =>
          prev.map((g, i) => (i === gi ? { ...g, status: "done", result: data } : g))
        );
        completed++;
      } catch (err: any) {
        console.error(`Failed to onboard ${group.clientName}:`, err);
        setClientGroups((prev) =>
          prev.map((g, i) => (i === gi ? { ...g, status: "error", result: { error: err.message } } : g))
        );
      }

      // Delay between onboarding calls to avoid rate limiting
      if (gi < clientGroups.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setStep("complete");
    toast.success(`Onboarded ${completed} of ${total} clients`);
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bulk Onboarding</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a multi-client omnibus statement PDF. Blank pages are used as separators to auto-detect each client's statements.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "upload", label: "Upload" },
            { key: "splitting", label: "Split" },
            { key: "classifying", label: "Classify" },
            { key: "review", label: "Review" },
            { key: "onboarding", label: "Onboard" },
          ].map(({ key, label }, i) => {
            const steps: string[] = ["upload", "splitting", "classifying", "review", "onboarding", "complete"];
            const currentIdx = steps.indexOf(step);
            const stepIdx = steps.indexOf(key);
            const isActive = stepIdx <= currentIdx;
            return (
              <div key={key} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-6 ${isActive ? "bg-primary" : "bg-border"}`} />}
                <div className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Upload Step */}
        {step === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Upload Omnibus Statement
              </CardTitle>
              <CardDescription>
                Upload the full multi-client PDF. Blank pages between statements will be detected automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {file ? (
                <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-4">
                  <FileText className="h-8 w-8 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <div
                  onClick={() => inputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border p-8 hover:border-primary/50 transition-colors"
                >
                  <Upload className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Drop your omnibus PDF or <span className="font-medium text-primary">browse</span>
                  </p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setFile(f);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSplit} disabled={!file} className="gap-2" size="lg">
                  <Sparkles className="h-4 w-4" />
                  Split & Classify
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Processing Steps (splitting/classifying) */}
        {(step === "splitting" || step === "classifying") && (
          <Card>
            <CardContent className="py-10 space-y-4">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-lg font-medium">
                  {step === "splitting" ? "Splitting PDF…" : "AI is identifying clients…"}
                </p>
              </div>
              <p className="text-center text-sm text-muted-foreground">{progress.label}</p>
              <Progress
                value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
                className="h-2"
              />
              <p className="text-center text-xs text-muted-foreground">
                {progress.current} / {progress.total}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Review Step */}
        {step === "review" && (
          <div className="space-y-4">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">
                      Found {clientGroups.length} clients across {segments.length} statements
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Review the detected clients below, then click "Onboard All" to create family records and stage accounts.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Detected Clients
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {clientGroups.map((group, i) => (
                    <div key={i} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{group.clientName}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.segments.length} statement(s) · {group.totalPages} pages
                          {group.institutions.length > 0 && ` · ${group.institutions.join(", ")}`}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {group.segments.length} stmt
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => { setStep("upload"); setFile(null); setSegments([]); setClientGroups([]); }}>
                Start Over
              </Button>
              <Button onClick={handleOnboardAll} className="gap-2" size="lg">
                <Play className="h-4 w-4" />
                Onboard All {clientGroups.length} Clients
              </Button>
            </div>
          </div>
        )}

        {/* Onboarding Progress / Complete */}
        {(step === "onboarding" || step === "complete") && (
          <div className="space-y-4">
            {step === "onboarding" && (
              <Card>
                <CardContent className="py-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="font-medium">{progress.label}</p>
                  </div>
                  <Progress
                    value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
                    className="h-2"
                  />
                </CardContent>
              </Card>
            )}

            {step === "complete" && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Bulk Onboarding Complete</p>
                      <p className="text-sm text-muted-foreground">
                        {clientGroups.filter((g) => g.status === "done").length} of {clientGroups.length} clients
                        onboarded successfully. All accounts staged in the Holding Tank.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Client Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {clientGroups.map((group, i) => (
                    <div key={i} className="flex items-center justify-between py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{group.clientName}</p>
                        {group.result && group.status === "done" && (
                          <p className="text-xs text-muted-foreground">
                            {group.result.contacts?.length || 0} contact(s) ·{" "}
                            {group.result.accountsInserted || 0} account(s) staged
                          </p>
                        )}
                        {group.status === "error" && (
                          <p className="text-xs text-destructive">{group.result?.error || "Failed"}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {group.status === "pending" && (
                          <Badge variant="outline" className="text-[10px]">Pending</Badge>
                        )}
                        {group.status === "processing" && (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        )}
                        {group.status === "done" && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                        {group.status === "error" && (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {step === "complete" && (
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => navigate("/holding-tank")} className="gap-2">
                  <Anchor className="h-4 w-4" />
                  Go to Holding Tank
                </Button>
                <Button variant="outline" onClick={() => navigate("/families")}>
                  View Families
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
