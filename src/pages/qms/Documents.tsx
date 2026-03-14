import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileText, 
  Plus, 
  Search, 
  Filter,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCheck
} from "lucide-react";
import { fetchDocuments, fetchDocumentCategories, QMSDocument } from "@/services/qmsService";
import { format } from "date-fns";
import { DocumentFormDialog } from "@/components/qms/DocumentFormDialog";
import { DocumentDetailDialog } from "@/components/qms/DocumentDetailDialog";

const Documents = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<QMSDocument | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['qms-documents'],
    queryFn: fetchDocuments,
  });

  const { data: categories } = useQuery({
    queryKey: ['qms-document-categories'],
    queryFn: fetchDocumentCategories,
  });

  const filteredDocuments = documents?.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.document_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || doc.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  }) || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'pending_approval': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'draft': return <FileText className="h-4 w-4 text-muted-foreground" />;
      case 'obsolete': return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-500">Approved</Badge>;
      case 'pending_approval': return <Badge className="bg-yellow-500">Pending</Badge>;
      case 'draft': return <Badge variant="secondary">Draft</Badge>;
      case 'obsolete': return <Badge variant="destructive">Obsolete</Badge>;
      default: return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Document Control</h2>
            <p className="text-muted-foreground">Manage controlled documents and approvals</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Document
          </Button>
          <DocumentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
          <DocumentDetailDialog open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)} document={selectedDoc} />
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>

        {/* Category Tabs */}
        <Tabs defaultValue="all" onValueChange={(v) => setSelectedCategory(v === 'all' ? null : v)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All Documents</TabsTrigger>
            {categories?.map((cat) => (
              <TabsTrigger key={cat.id} value={cat.id}>
                {cat.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <DocumentList documents={filteredDocuments} isLoading={isLoading} getStatusBadge={getStatusBadge} onSelect={setSelectedDoc} />
          </TabsContent>
          {categories?.map((cat) => (
            <TabsContent key={cat.id} value={cat.id} className="mt-6">
              <DocumentList 
                documents={filteredDocuments.filter(d => d.category_id === cat.id)} 
                isLoading={isLoading} 
                getStatusBadge={getStatusBadge}
                onSelect={setSelectedDoc}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

interface DocumentListProps {
  documents: QMSDocument[];
  isLoading: boolean;
  getStatusBadge: (status: string) => React.ReactNode;
}

const DocumentList = ({ documents, isLoading, getStatusBadge }: DocumentListProps) => {
  if (isLoading) {
    return (
      <div className="grid gap-4">
        {Array(5).fill(0).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileCheck className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No documents found</p>
          <p className="text-muted-foreground">Create your first controlled document</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {documents.map((doc) => (
        <Card key={doc.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onSelect?.(doc)}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-sm text-muted-foreground">{doc.document_number}</span>
                  {getStatusBadge(doc.status)}
                  {doc.category && (
                    <Badge variant="outline">{doc.category.name}</Badge>
                  )}
                </div>
                <h3 className="font-semibold text-lg">{doc.title}</h3>
                {doc.description && (
                  <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{doc.description}</p>
                )}
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <span>Version {doc.current_version}</span>
                  <span>•</span>
                  <span>Updated {format(new Date(doc.updated_at), 'dd MMM yyyy')}</span>
                  {doc.next_review_date && (
                    <>
                      <span>•</span>
                      <span className={new Date(doc.next_review_date) < new Date() ? 'text-destructive' : ''}>
                        Review due {format(new Date(doc.next_review_date), 'dd MMM yyyy')}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default Documents;
