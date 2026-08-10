import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/shared/components/AppLayout";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Brain as BrainIcon, Search, Pin, Loader2 } from "lucide-react";
import { QuickCapture } from "@/shared/components/QuickCapture";
import { BrainAsk } from "../components/BrainAsk";
import { BrainDocType, listBrainDocuments } from "@/shared/lib/brain";

const DOC_TYPE_LABELS: Record<BrainDocType, string> = {
  note: "Note",
  kb_entry: "Bot Knowledge",
  recap: "Daily Recap",
  vault_file: "Vault File",
  upload: "Upload",
  link: "Link",
  transcript: "Transcript",
};

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-emerald-500/15 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  processing: "bg-blue-500/15 text-blue-600",
  error: "bg-destructive/15 text-destructive",
  skipped: "bg-muted text-muted-foreground",
};

export default function Brain() {
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<BrainDocType | "all">("all");
  const [searchParams] = useSearchParams();
  const askQuery = searchParams.get("ask") || undefined;

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["brain-documents", search, docType],
    queryFn: () => listBrainDocuments({ search: search.trim() || undefined, docType }),
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <BrainIcon className="h-6 w-6 text-accent" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Second Brain</h1>
            <p className="text-sm text-muted-foreground">Your private memory — capture, browse, and ask.</p>
          </div>
        </div>

        <QuickCapture />

        <Tabs defaultValue={askQuery ? "ask" : "browse"}>
          <TabsList>
            <TabsTrigger value="browse">Browse</TabsTrigger>
            <TabsTrigger value="ask">Ask</TabsTrigger>
          </TabsList>

          <TabsContent value="ask" className="pt-4">
            <BrainAsk initialQuestion={askQuery} />
          </TabsContent>

          <TabsContent value="browse" className="space-y-6 pt-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search captured notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={docType} onValueChange={(v) => setDocType(v as BrainDocType | "all")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nothing here yet — capture a note above to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <Link key={doc.id} to={`/brain/${doc.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {doc.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" />}
                          <h3 className="truncate font-medium text-foreground">{doc.title}</h3>
                        </div>
                        {doc.body && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{doc.body}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-xs">
                            {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                          </Badge>
                          {doc.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Badge className={`shrink-0 text-xs ${STATUS_STYLES[doc.index_status] || ""}`} variant="outline">
                        {doc.index_status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
