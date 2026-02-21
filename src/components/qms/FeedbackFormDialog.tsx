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
import { createFeedback, QMSFeedback } from "@/services/qmsService";
import { getCustomers } from "@/services/customerService";
import { getSites } from "@/services/siteService";
import { useAuth } from "@/contexts/AuthContext";

interface FeedbackFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feedback?: QMSFeedback | null;
}

const FEEDBACK_TYPES = [
  { value: "complaint", label: "Complaint" },
  { value: "positive", label: "Positive Feedback" },
  { value: "suggestion", label: "Suggestion" },
  { value: "enquiry", label: "Enquiry" },
];

const CHANNELS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "in_person", label: "In Person" },
  { value: "letter", label: "Letter" },
  { value: "website", label: "Website" },
  { value: "social_media", label: "Social Media" },
];

export const FeedbackFormDialog = ({ open, onOpenChange, feedback }: FeedbackFormDialogProps) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditing = !!feedback;

  const [formData, setFormData] = useState({
    type: "enquiry",
    subject: "",
    description: "",
    channel: "",
    priority: "medium",
    status: "open",
    customer_id: "",
    site_id: "",
    resolution: "",
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers'],
    queryFn: getCustomers,
  });

  const { data: sitesData } = useQuery({
    queryKey: ['sites'],
    queryFn: getSites,
  });

  const customers = customersData?.customers || [];
  const sites = sitesData?.sites || [];

  useEffect(() => {
    if (feedback) {
      setFormData({
        type: feedback.type,
        subject: feedback.subject,
        description: feedback.description,
        channel: feedback.channel || "",
        priority: feedback.priority,
        status: feedback.status,
        customer_id: feedback.customer_id || "",
        site_id: feedback.site_id || "",
        resolution: feedback.resolution || "",
      });
    } else {
      setFormData({
        type: "enquiry",
        subject: "",
        description: "",
        channel: "",
        priority: "medium",
        status: "open",
        customer_id: "",
        site_id: "",
        resolution: "",
      });
    }
  }, [feedback, open]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<QMSFeedback>) => createFeedback(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["qms-kpis"] });
      toast.success("Feedback logged successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to log feedback");
      console.error(error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.subject.trim() || !formData.description.trim()) {
      toast.error("Please fill in required fields");
      return;
    }

    const submitData: Partial<QMSFeedback> = {
      ...formData,
      channel: formData.channel || null,
      customer_id: formData.customer_id || null,
      site_id: formData.site_id || null,
      resolution: formData.resolution || null,
      created_by: user?.id || "",
    };

    createMutation.mutate(submitData);
  };

  // Use all sites (customer filtering not available on Site type)
  const filteredSites = sites;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{isEditing ? "Edit Feedback" : "Log Feedback"}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>Record customer complaints, suggestions, or positive feedback</ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody>
        <form id="feedback-form" onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
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
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="Brief summary of the feedback"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detailed description of the feedback"
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select
                value={formData.channel || "none"}
                onValueChange={(value) => setFormData({ ...formData, channel: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="How was it received?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {CHANNELS.map((channel) => (
                    <SelectItem key={channel.value} value={channel.value}>
                      {channel.label}
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
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="investigating">Investigating</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={formData.customer_id || "none"}
                onValueChange={(value) => setFormData({ ...formData, customer_id: value === "none" ? "" : value, site_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No customer</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Site</Label>
              <Select
                value={formData.site_id || "none"}
                onValueChange={(value) => setFormData({ ...formData, site_id: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No site</SelectItem>
                  {filteredSites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isEditing && ['resolved', 'closed'].includes(formData.status) && (
            <div className="space-y-2">
              <Label htmlFor="resolution">Resolution</Label>
              <Textarea
                id="resolution"
                value={formData.resolution}
                onChange={(e) => setFormData({ ...formData, resolution: e.target.value })}
                placeholder="How was this feedback addressed?"
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
        <Button type="submit" form="feedback-form" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Saving..." : isEditing ? "Update Feedback" : "Log Feedback"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};
