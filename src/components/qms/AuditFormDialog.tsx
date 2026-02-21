import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { createAudit, QMSAudit } from "@/services/qmsService";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

interface AuditFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit?: QMSAudit | null;
}

const AUDIT_TYPES = [
  { value: "internal", label: "Internal Audit" },
  { value: "external", label: "External Audit" },
  { value: "supplier", label: "Supplier Audit" },
];

const DEPARTMENTS = [
  "Operations",
  "Engineering",
  "Finance",
  "Administration",
  "Quality",
  "Health & Safety",
  "Management",
];

export const AuditFormDialog = ({ open, onOpenChange, audit }: AuditFormDialogProps) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditing = !!audit;

  const [formData, setFormData] = useState({
    title: "",
    audit_type: "internal",
    scope: "",
    auditee_department: "",
    scheduled_date: format(new Date(), 'yyyy-MM-dd'),
    status: "planned",
    summary: "",
  });

  useEffect(() => {
    if (audit) {
      setFormData({
        title: audit.title,
        audit_type: audit.audit_type,
        scope: audit.scope || "",
        auditee_department: audit.auditee_department || "",
        scheduled_date: audit.scheduled_date,
        status: audit.status,
        summary: audit.summary || "",
      });
    } else {
      setFormData({
        title: "",
        audit_type: "internal",
        scope: "",
        auditee_department: "",
        scheduled_date: format(new Date(), 'yyyy-MM-dd'),
        status: "planned",
        summary: "",
      });
    }
  }, [audit, open]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<QMSAudit>) => createAudit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-audits"] });
      queryClient.invalidateQueries({ queryKey: ["qms-kpis"] });
      toast.success("Audit scheduled successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to schedule audit");
      console.error(error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.scheduled_date) {
      toast.error("Please fill in required fields");
      return;
    }

    const submitData: Partial<QMSAudit> = {
      ...formData,
      scope: formData.scope || null,
      auditee_department: formData.auditee_department || null,
      summary: formData.summary || null,
      created_by: user?.id || "",
    };

    createMutation.mutate(submitData);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{isEditing ? "Edit Audit" : "Schedule Audit"}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>Plan and schedule internal or external audits</ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody>
        <form id="audit-form" onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Audit Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Q1 2026 Quality System Audit"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Audit Type *</Label>
              <Select
                value={formData.audit_type}
                onValueChange={(value) => setFormData({ ...formData, audit_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduled_date">Scheduled Date *</Label>
              <Input
                id="scheduled_date"
                type="date"
                value={formData.scheduled_date}
                onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Department/Area</Label>
            <Select
              value={formData.auditee_department || "none"}
              onValueChange={(value) => setFormData({ ...formData, auditee_department: value === "none" ? "" : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All Departments</SelectItem>
                {DEPARTMENTS.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scope">Audit Scope</Label>
            <Textarea
              id="scope"
              value={formData.scope}
              onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
              placeholder="Define the scope and objectives of this audit"
              rows={3}
            />
          </div>

          {isEditing && (
            <>
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
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.status === 'completed' && (
                <div className="space-y-2">
                  <Label htmlFor="summary">Audit Summary</Label>
                  <Textarea
                    id="summary"
                    value={formData.summary}
                    onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                    placeholder="Summary of audit findings and conclusions"
                    rows={3}
                  />
                </div>
              )}
            </>
          )}
        </form>
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" form="audit-form" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Saving..." : isEditing ? "Update Audit" : "Schedule Audit"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};
