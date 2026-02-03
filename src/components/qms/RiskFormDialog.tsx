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
import { createRisk, QMSRisk } from "@/services/qmsService";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface RiskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  risk?: QMSRisk | null;
}

const RISK_CATEGORIES = [
  { value: "operational", label: "Operational" },
  { value: "financial", label: "Financial" },
  { value: "compliance", label: "Compliance" },
  { value: "safety", label: "Safety" },
  { value: "environmental", label: "Environmental" },
  { value: "reputational", label: "Reputational" },
  { value: "other", label: "Other" },
];

export const RiskFormDialog = ({ open, onOpenChange, risk }: RiskFormDialogProps) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditing = !!risk;

  const [formData, setFormData] = useState({
    category: "operational",
    title: "",
    description: "",
    likelihood: 3,
    impact: 3,
    current_controls: "",
    additional_controls: "",
    status: "active",
    review_date: "",
  });

  useEffect(() => {
    if (risk) {
      setFormData({
        category: risk.category,
        title: risk.title,
        description: risk.description,
        likelihood: risk.likelihood,
        impact: risk.impact,
        current_controls: risk.current_controls || "",
        additional_controls: risk.additional_controls || "",
        status: risk.status,
        review_date: risk.review_date || "",
      });
    } else {
      setFormData({
        category: "operational",
        title: "",
        description: "",
        likelihood: 3,
        impact: 3,
        current_controls: "",
        additional_controls: "",
        status: "active",
        review_date: "",
      });
    }
  }, [risk, open]);

  const riskScore = formData.likelihood * formData.impact;

  const getRiskColor = (score: number) => {
    if (score >= 20) return "bg-destructive text-destructive-foreground";
    if (score >= 15) return "bg-orange-500 text-white";
    if (score >= 10) return "bg-yellow-500 text-white";
    if (score >= 5) return "bg-blue-500 text-white";
    return "bg-green-500 text-white";
  };

  const getRiskLevel = (score: number) => {
    if (score >= 20) return "Critical";
    if (score >= 15) return "High";
    if (score >= 10) return "Medium";
    if (score >= 5) return "Low";
    return "Very Low";
  };

  const createMutation = useMutation({
    mutationFn: (data: Partial<QMSRisk>) => createRisk(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-risks"] });
      queryClient.invalidateQueries({ queryKey: ["qms-kpis"] });
      toast.success("Risk created successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to create risk");
      console.error(error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.description.trim()) {
      toast.error("Please fill in required fields");
      return;
    }

    const submitData: Partial<QMSRisk> = {
      ...formData,
      review_date: formData.review_date || null,
      created_by: user?.id || "",
    };

    createMutation.mutate(submitData);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{isEditing ? "Edit Risk" : "Add New Risk"}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>Assess and document organizational risks</ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody>
        <form id="risk-form" onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
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
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="mitigated">Mitigated</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Risk Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Brief description of the risk"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Risk Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detailed description of the risk and its potential impact"
              rows={3}
              required
            />
          </div>

          {/* Risk Matrix */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <h4 className="font-medium mb-4">Risk Assessment (5x5 Matrix)</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Likelihood (1-5)</Label>
                <Select
                  value={String(formData.likelihood)}
                  onValueChange={(value) => setFormData({ ...formData, likelihood: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Rare</SelectItem>
                    <SelectItem value="2">2 - Unlikely</SelectItem>
                    <SelectItem value="3">3 - Possible</SelectItem>
                    <SelectItem value="4">4 - Likely</SelectItem>
                    <SelectItem value="5">5 - Almost Certain</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Impact (1-5)</Label>
                <Select
                  value={String(formData.impact)}
                  onValueChange={(value) => setFormData({ ...formData, impact: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Negligible</SelectItem>
                    <SelectItem value="2">2 - Minor</SelectItem>
                    <SelectItem value="3">3 - Moderate</SelectItem>
                    <SelectItem value="4">4 - Major</SelectItem>
                    <SelectItem value="5">5 - Catastrophic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Risk Score:</span>
              <span className={cn("px-3 py-1 rounded-md font-bold", getRiskColor(riskScore))}>
                {riskScore} - {getRiskLevel(riskScore)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="current_controls">Current Controls</Label>
            <Textarea
              id="current_controls"
              value={formData.current_controls}
              onChange={(e) => setFormData({ ...formData, current_controls: e.target.value })}
              placeholder="Existing controls in place to mitigate this risk"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="additional_controls">Additional Controls Needed</Label>
            <Textarea
              id="additional_controls"
              value={formData.additional_controls}
              onChange={(e) => setFormData({ ...formData, additional_controls: e.target.value })}
              placeholder="Additional controls to be implemented"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="review_date">Next Review Date</Label>
            <Input
              id="review_date"
              type="date"
              value={formData.review_date}
              onChange={(e) => setFormData({ ...formData, review_date: e.target.value })}
            />
          </div>
        </form>
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" form="risk-form" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Saving..." : isEditing ? "Update Risk" : "Add Risk"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};
