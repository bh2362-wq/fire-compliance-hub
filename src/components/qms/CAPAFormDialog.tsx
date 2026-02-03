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
import { Checkbox } from "@/components/ui/checkbox";
import { createCAPA, QMSCAPA, fetchNCRs } from "@/services/qmsService";
import { useAuth } from "@/contexts/AuthContext";

interface CAPAFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capa?: QMSCAPA | null;
  linkedNcrId?: string | null;
}

export const CAPAFormDialog = ({ 
  open, 
  onOpenChange, 
  capa, 
  linkedNcrId 
}: CAPAFormDialogProps) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditing = !!capa;

  const [formData, setFormData] = useState({
    type: "corrective" as "corrective" | "preventive",
    title: "",
    description: "",
    action_plan: "",
    priority: "medium",
    status: "open",
    ncr_id: linkedNcrId || "",
    due_date: "",
    verification_required: true,
    effectiveness_review: "",
  });

  const { data: ncrs } = useQuery({
    queryKey: ['qms-ncrs'],
    queryFn: fetchNCRs,
  });

  useEffect(() => {
    if (capa) {
      setFormData({
        type: capa.type as "corrective" | "preventive",
        title: capa.title,
        description: capa.description,
        action_plan: capa.action_plan || "",
        priority: capa.priority,
        status: capa.status,
        ncr_id: capa.ncr_id || "",
        due_date: capa.due_date || "",
        verification_required: capa.verification_required,
        effectiveness_review: capa.effectiveness_review || "",
      });
    } else {
      setFormData({
        type: "corrective",
        title: "",
        description: "",
        action_plan: "",
        priority: "medium",
        status: "open",
        ncr_id: linkedNcrId || "",
        due_date: "",
        verification_required: true,
        effectiveness_review: "",
      });
    }
  }, [capa, linkedNcrId, open]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<QMSCAPA>) => createCAPA(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-capas"] });
      queryClient.invalidateQueries({ queryKey: ["qms-kpis"] });
      toast.success("CAPA created successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to create CAPA");
      console.error(error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.description.trim()) {
      toast.error("Please fill in required fields");
      return;
    }

    const submitData: Partial<QMSCAPA> = {
      ...formData,
      ncr_id: formData.ncr_id || null,
      due_date: formData.due_date || null,
      created_by: user?.id || "",
    };

    createMutation.mutate(submitData);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{isEditing ? "Edit CAPA" : "Create New CAPA"}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {isEditing ? "Update corrective/preventive action details" : "Raise a corrective or preventive action"}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody>
        <form id="capa-form" onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as "corrective" | "preventive" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrective">Corrective Action</SelectItem>
                  <SelectItem value="preventive">Preventive Action</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Brief description of the action"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detailed description of the issue and required action"
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Linked NCR</Label>
            <Select
              value={formData.ncr_id}
              onValueChange={(value) => setFormData({ ...formData, ncr_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select NCR (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No linked NCR</SelectItem>
                {ncrs?.filter(n => n.status !== 'closed').map((ncr) => (
                  <SelectItem key={ncr.id} value={ncr.id}>
                    {ncr.ncr_number} - {ncr.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="action_plan">Action Plan</Label>
            <Textarea
              id="action_plan"
              value={formData.action_plan}
              onChange={(e) => setFormData({ ...formData, action_plan: e.target.value })}
              placeholder="Steps to implement the corrective/preventive action"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
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
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="verification">Verification</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="verification_required"
              checked={formData.verification_required}
              onCheckedChange={(checked) => 
                setFormData({ ...formData, verification_required: checked === true })
              }
            />
            <Label htmlFor="verification_required" className="text-sm">
              Verification of effectiveness required
            </Label>
          </div>

          {isEditing && formData.status === 'verification' && (
            <div className="space-y-2">
              <Label htmlFor="effectiveness_review">Effectiveness Review</Label>
              <Textarea
                id="effectiveness_review"
                value={formData.effectiveness_review}
                onChange={(e) => setFormData({ ...formData, effectiveness_review: e.target.value })}
                placeholder="Document the effectiveness of the implemented action"
                rows={3}
              />
            </div>
          )}
        </form>
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" form="capa-form" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Saving..." : isEditing ? "Update CAPA" : "Create CAPA"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};
