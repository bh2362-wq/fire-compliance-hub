import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter 
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDocument, fetchDocumentCategories, QMSDocument } from "@/services/qmsService";
import { useAuth } from "@/contexts/AuthContext";
import { addMonths, format } from "date-fns";

interface DocumentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document?: QMSDocument | null;
}

const REVIEW_FREQUENCIES = [
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
  { value: 24, label: "24 months" },
  { value: 36, label: "36 months" },
];

export const DocumentFormDialog = ({ open, onOpenChange, document }: DocumentFormDialogProps) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditing = !!document;

  const [formData, setFormData] = useState({
    category_id: "",
    title: "",
    description: "",
    status: "draft",
    review_frequency_months: 12,
  });

  const { data: categories } = useQuery({
    queryKey: ['qms-document-categories'],
    queryFn: fetchDocumentCategories,
  });

  useEffect(() => {
    if (document) {
      setFormData({
        category_id: document.category_id || "",
        title: document.title,
        description: document.description || "",
        status: document.status,
        review_frequency_months: document.review_frequency_months || 12,
      });
    } else {
      setFormData({
        category_id: "",
        title: "",
        description: "",
        status: "draft",
        review_frequency_months: 12,
      });
    }
  }, [document, open]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<QMSDocument>) => createDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-documents"] });
      toast.success("Document created successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to create document");
      console.error(error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast.error("Please enter a document title");
      return;
    }

    const nextReviewDate = format(
      addMonths(new Date(), formData.review_frequency_months),
      'yyyy-MM-dd'
    );

    const submitData: Partial<QMSDocument> = {
      ...formData,
      category_id: formData.category_id || null,
      description: formData.description || null,
      next_review_date: nextReviewDate,
      created_by: user?.id || "",
    };

    createMutation.mutate(submitData);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{isEditing ? "Edit Document" : "New Document"}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>Create a controlled document in the QMS</ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody>
        <form id="document-form" onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={formData.category_id}
              onValueChange={(value) => setFormData({ ...formData, category_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No category</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Document Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Quality Manual"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the document purpose"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Review Frequency</Label>
              <Select
                value={String(formData.review_frequency_months)}
                onValueChange={(value) => setFormData({ ...formData, review_frequency_months: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVIEW_FREQUENCIES.map((freq) => (
                    <SelectItem key={freq.value} value={String(freq.value)}>
                      {freq.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isEditing && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_approval">Pending Approval</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="obsolete">Obsolete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p>📋 A unique document number will be auto-generated</p>
            <p>📅 Next review date will be calculated based on review frequency</p>
            <p>📁 You can upload files after creating the document</p>
          </div>
        </form>
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" form="document-form" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating..." : isEditing ? "Update Document" : "Create Document"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};
