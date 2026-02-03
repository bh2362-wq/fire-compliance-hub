import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createNCR, updateNCR, QMSNCR } from "@/services/qmsService";
import { getSites, Site } from "@/services/siteService";
import { getCustomers, Customer } from "@/services/customerService";
import { Loader2 } from "lucide-react";

interface NCRFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ncr?: QMSNCR | null;
}

const NCR_SOURCES = [
  { value: "internal_audit", label: "Internal Audit" },
  { value: "external_audit", label: "External Audit" },
  { value: "customer_complaint", label: "Customer Complaint" },
  { value: "site_visit", label: "Site Visit" },
  { value: "service_report", label: "Service Report" },
  { value: "management_review", label: "Management Review" },
  { value: "supplier_issue", label: "Supplier Issue" },
  { value: "process_deviation", label: "Process Deviation" },
  { value: "other", label: "Other" },
];

const NCR_SEVERITIES = [
  { value: "critical", label: "Critical" },
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
  { value: "observation", label: "Observation" },
];

const NCR_STATUSES = [
  { value: "open", label: "Open" },
  { value: "investigation", label: "Investigation" },
  { value: "action_required", label: "Action Required" },
  { value: "verification", label: "Verification" },
  { value: "closed", label: "Closed" },
];

export function NCRFormDialog({ open, onOpenChange, ncr }: NCRFormDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!ncr;

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    source: "other",
    severity: "minor",
    status: "open",
    site_id: "",
    customer_id: "",
    root_cause: "",
    immediate_action: "",
    due_date: "",
  });

  const { data: sitesData } = useQuery({
    queryKey: ["sites"],
    queryFn: getSites,
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
  });

  const sites = sitesData?.sites || [];
  const customers = customersData?.customers || [];

  useEffect(() => {
    if (ncr) {
      setFormData({
        title: ncr.title || "",
        description: ncr.description || "",
        source: ncr.source || "other",
        severity: ncr.severity || "minor",
        status: ncr.status || "open",
        site_id: ncr.site_id || "",
        customer_id: ncr.customer_id || "",
        root_cause: ncr.root_cause || "",
        immediate_action: ncr.immediate_action || "",
        due_date: ncr.due_date || "",
      });
    } else {
      setFormData({
        title: "",
        description: "",
        source: "other",
        severity: "minor",
        status: "open",
        site_id: "",
        customer_id: "",
        root_cause: "",
        immediate_action: "",
        due_date: "",
      });
    }
  }, [ncr, open]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<QMSNCR>) => createNCR(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-ncrs"] });
      queryClient.invalidateQueries({ queryKey: ["qms-kpis"] });
      toast.success("NCR raised successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to create NCR: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<QMSNCR>) => updateNCR(ncr!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-ncrs"] });
      queryClient.invalidateQueries({ queryKey: ["qms-kpis"] });
      toast.success("NCR updated successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to update NCR: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formData.description.trim()) {
      toast.error("Description is required");
      return;
    }

    const payload: Partial<QMSNCR> = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      source: formData.source,
      severity: formData.severity,
      status: formData.status,
      site_id: formData.site_id || null,
      customer_id: formData.customer_id || null,
      root_cause: formData.root_cause.trim() || null,
      immediate_action: formData.immediate_action.trim() || null,
      due_date: formData.due_date || null,
      raised_by: user?.id || "",
    };

    if (isEditing) {
      // Add closed info if status changed to closed
      if (formData.status === "closed" && ncr?.status !== "closed") {
        payload.closed_at = new Date().toISOString();
        payload.closed_by = user?.id || null;
      }
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>
          {isEditing ? "Edit NCR" : "Raise Non-Conformance Report"}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {isEditing
            ? `Editing ${ncr?.ncr_number}`
            : "Record a new non-conformance for investigation and corrective action."}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <ResponsiveDialogBody>
        <form id="ncr-form" onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Brief description of the non-conformance"
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Detailed description of what was observed..."
              rows={3}
              maxLength={2000}
            />
          </div>

          {/* Source and Severity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select
                value={formData.source}
                onValueChange={(value) =>
                  setFormData({ ...formData, source: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {NCR_SOURCES.map((source) => (
                    <SelectItem key={source.value} value={source.value}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <Select
                value={formData.severity}
                onValueChange={(value) =>
                  setFormData({ ...formData, severity: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {NCR_SEVERITIES.map((sev) => (
                    <SelectItem key={sev.value} value={sev.value}>
                      {sev.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status and Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {NCR_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
              />
            </div>
          </div>

          {/* Site and Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="site_id">Related Site</Label>
              <Select
                value={formData.site_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, site_id: value === "none" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select site (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {sites.map((site: Site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_id">Related Customer</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, customer_id: value === "none" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {customers.map((customer: Customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Immediate Action */}
          <div className="space-y-2">
            <Label htmlFor="immediate_action">Immediate Action Taken</Label>
            <Textarea
              id="immediate_action"
              value={formData.immediate_action}
              onChange={(e) =>
                setFormData({ ...formData, immediate_action: e.target.value })
              }
              placeholder="Describe any immediate containment or corrective actions..."
              rows={2}
              maxLength={1000}
            />
          </div>

          {/* Root Cause (usually filled during investigation) */}
          {isEditing && (
            <div className="space-y-2">
              <Label htmlFor="root_cause">Root Cause Analysis</Label>
              <Textarea
                id="root_cause"
                value={formData.root_cause}
                onChange={(e) =>
                  setFormData({ ...formData, root_cause: e.target.value })
                }
                placeholder="What is the underlying cause of this non-conformance?"
                rows={2}
                maxLength={1000}
              />
            </div>
          )}
        </form>
      </ResponsiveDialogBody>

      <ResponsiveDialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" form="ncr-form" disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? "Update NCR" : "Raise NCR"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}
