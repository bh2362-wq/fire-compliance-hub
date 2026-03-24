import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Shield, Edit } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCustomerRamsRequirements,
  createCustomerRamsRequirement,
  updateCustomerRamsRequirement,
  deleteCustomerRamsRequirement,
  CustomerRamsRequirement,
  REQUIREMENT_TYPES,
} from "@/services/ramsActivityService";

interface CustomerRamsRequirementsPanelProps {
  customerId: string;
  siteId?: string;
}

export function CustomerRamsRequirementsPanel({ customerId, siteId }: CustomerRamsRequirementsPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRamsRequirement | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requirementType, setRequirementType] = useState("site_rules");
  const [isMandatory, setIsMandatory] = useState(true);

  const { data: requirements = [] } = useQuery({
    queryKey: ["customer-rams-requirements", customerId, siteId],
    queryFn: () => getCustomerRamsRequirements(customerId, siteId),
  });

  const createMutation = useMutation({
    mutationFn: createCustomerRamsRequirement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-rams-requirements"] });
      toast.success("Requirement added");
      closeDialog();
    },
    onError: () => toast.error("Failed to add requirement"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CustomerRamsRequirement> }) =>
      updateCustomerRamsRequirement(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-rams-requirements"] });
      toast.success("Requirement updated");
      closeDialog();
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomerRamsRequirement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-rams-requirements"] });
      toast.success("Requirement deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setTitle("");
    setDescription("");
    setRequirementType("site_rules");
    setIsMandatory(true);
  };

  const openEdit = (req: CustomerRamsRequirement) => {
    setEditing(req);
    setTitle(req.title);
    setDescription(req.description || "");
    setRequirementType(req.requirement_type);
    setIsMandatory(req.is_mandatory);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!title.trim() || !user?.id) return;
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        data: { title: title.trim(), description: description.trim() || null, requirement_type: requirementType, is_mandatory: isMandatory },
      });
    } else {
      createMutation.mutate({
        customer_id: customerId,
        site_id: siteId || null,
        requirement_type: requirementType,
        title: title.trim(),
        description: description.trim() || null,
        is_mandatory: isMandatory,
        sort_order: requirements.length,
        created_by: user.id,
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            RAMS Requirements
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          These requirements auto-merge into every RAMS generated for this {siteId ? "site" : "customer"}.
        </p>
      </CardHeader>
      <CardContent>
        {requirements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No requirements set yet.</p>
        ) : (
          <div className="space-y-2">
            {requirements.map((req) => (
              <div key={req.id} className="flex items-start justify-between gap-2 p-2 rounded-md border border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{req.title}</span>
                    {req.is_mandatory && (
                      <Badge variant="destructive" className="text-xs px-1 py-0">Mandatory</Badge>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs mt-1">
                    {REQUIREMENT_TYPES.find(t => t.value === req.requirement_type)?.label || req.requirement_type}
                  </Badge>
                  {req.description && (
                    <p className="text-xs text-muted-foreground mt-1">{req.description}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(req)}>
                    <Edit className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(req.id)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Requirement" : "Add RAMS Requirement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={requirementType} onValueChange={setRequirementType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REQUIREMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., CSCS card required for all engineers" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional details..." />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={isMandatory} onCheckedChange={(v) => setIsMandatory(!!v)} />
              <Label className="text-sm">Mandatory (auto-included in all RAMS)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!title.trim()}>
              {editing ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
