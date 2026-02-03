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
import { fetchTrainingTypes, QMSTrainingRecord, QMSTrainingType } from "@/services/qmsService";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { addMonths, format } from "date-fns";

interface TrainingRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: QMSTrainingRecord | null;
}

export const TrainingRecordDialog = ({ open, onOpenChange, record }: TrainingRecordDialogProps) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditing = !!record;

  const [formData, setFormData] = useState({
    training_type_id: "",
    completion_date: format(new Date(), 'yyyy-MM-dd'),
    expiry_date: "",
    certificate_number: "",
    trainer: "",
    notes: "",
    status: "valid",
  });

  const { data: trainingTypes } = useQuery({
    queryKey: ['qms-training-types'],
    queryFn: fetchTrainingTypes,
  });

  useEffect(() => {
    if (record) {
      setFormData({
        training_type_id: record.training_type_id,
        completion_date: record.completion_date,
        expiry_date: record.expiry_date || "",
        certificate_number: record.certificate_number || "",
        trainer: record.trainer || "",
        notes: record.notes || "",
        status: record.status,
      });
    } else {
      setFormData({
        training_type_id: "",
        completion_date: format(new Date(), 'yyyy-MM-dd'),
        expiry_date: "",
        certificate_number: "",
        trainer: "",
        notes: "",
        status: "valid",
      });
    }
  }, [record, open]);

  // Auto-calculate expiry date based on training type
  const handleTrainingTypeChange = (typeId: string) => {
    const selectedType = trainingTypes?.find(t => t.id === typeId);
    let expiryDate = "";
    
    if (selectedType?.validity_months && formData.completion_date) {
      const completionDate = new Date(formData.completion_date);
      expiryDate = format(addMonths(completionDate, selectedType.validity_months), 'yyyy-MM-dd');
    }
    
    setFormData({ 
      ...formData, 
      training_type_id: typeId,
      expiry_date: expiryDate 
    });
  };

  const handleCompletionDateChange = (date: string) => {
    const selectedType = trainingTypes?.find(t => t.id === formData.training_type_id);
    let expiryDate = formData.expiry_date;
    
    if (selectedType?.validity_months && date) {
      const completionDate = new Date(date);
      expiryDate = format(addMonths(completionDate, selectedType.validity_months), 'yyyy-MM-dd');
    }
    
    setFormData({ 
      ...formData, 
      completion_date: date,
      expiry_date: expiryDate 
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: Partial<QMSTrainingRecord>) => {
      const { data: result, error } = await supabase
        .from('qms_training_records')
        .insert({
          training_type_id: data.training_type_id!,
          user_id: user?.id || '',
          completion_date: data.completion_date!,
          expiry_date: data.expiry_date || null,
          certificate_number: data.certificate_number || null,
          trainer: data.trainer || null,
          notes: data.notes || null,
          status: data.status || 'valid',
          created_by: user?.id || '',
        })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-training-records"] });
      queryClient.invalidateQueries({ queryKey: ["qms-kpis"] });
      toast.success("Training record created successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to create training record");
      console.error(error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.training_type_id || !formData.completion_date) {
      toast.error("Please fill in required fields");
      return;
    }

    createMutation.mutate(formData);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{isEditing ? "Edit Training Record" : "Record Training"}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>Log completed training and certifications</ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody>
        <form id="training-form" onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Training Type *</Label>
            <Select
              value={formData.training_type_id}
              onValueChange={handleTrainingTypeChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select training type" />
              </SelectTrigger>
              <SelectContent>
                {trainingTypes?.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                    {type.is_mandatory && " (Mandatory)"}
                    {type.validity_months && ` - ${type.validity_months} months validity`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="completion_date">Completion Date *</Label>
              <Input
                id="completion_date"
                type="date"
                value={formData.completion_date}
                onChange={(e) => handleCompletionDateChange(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiry_date">Expiry Date</Label>
              <Input
                id="expiry_date"
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Auto-calculated based on training type</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="certificate_number">Certificate Number</Label>
              <Input
                id="certificate_number"
                value={formData.certificate_number}
                onChange={(e) => setFormData({ ...formData, certificate_number: e.target.value })}
                placeholder="e.g., CERT-12345"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trainer">Trainer/Provider</Label>
              <Input
                id="trainer"
                value={formData.trainer}
                onChange={(e) => setFormData({ ...formData, trainer: e.target.value })}
                placeholder="Training provider name"
              />
            </div>
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
                  <SelectItem value="valid">Valid</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="renewed">Renewed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about the training"
              rows={2}
            />
          </div>
        </form>
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" form="training-form" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Saving..." : isEditing ? "Update Record" : "Record Training"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};
