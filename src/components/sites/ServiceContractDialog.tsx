import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  ServiceContract,
  ServiceContractInsert,
  upsertServiceContract,
  SERVICE_TYPES,
  SERVICE_FREQUENCIES,
} from "@/services/serviceContractService";

interface ServiceContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  contract?: ServiceContract | null;
  existingTypes?: string[];
  onSaved: (contract: ServiceContract, isNew: boolean) => void;
}

export function ServiceContractDialog({
  open,
  onOpenChange,
  siteId,
  contract,
  existingTypes = [],
  onSaved,
}: ServiceContractDialogProps) {
  const [loading, setLoading] = useState(false);
  const [serviceType, setServiceType] = useState(contract?.service_type || "");
  const [description, setDescription] = useState(contract?.description || "");
  const [unitPrice, setUnitPrice] = useState(contract?.unit_price?.toString() || "");
  const [includedVisits, setIncludedVisits] = useState(contract?.included_visits?.toString() || "");
  const [contractStart, setContractStart] = useState(contract?.contract_start || "");
  const [contractEnd, setContractEnd] = useState(contract?.contract_end || "");
  const [notes, setNotes] = useState(contract?.notes || "");
  const [poNumber, setPoNumber] = useState(contract?.po_number || "");
  const [frequency, setFrequency] = useState(contract?.frequency || "3m");

  useEffect(() => {
    if (open) {
      setServiceType(contract?.service_type || "");
      setDescription(contract?.description || "");
      setUnitPrice(contract?.unit_price?.toString() || "");
      setIncludedVisits(contract?.included_visits?.toString() || "");
      setContractStart(contract?.contract_start || "");
      setContractEnd(contract?.contract_end || "");
      setNotes(contract?.notes || "");
      setPoNumber(contract?.po_number || "");
      setFrequency(contract?.frequency || "3m");
    }
  }, [open, contract]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!serviceType) {
      toast.error("Please select a service type");
      return;
    }

    const price = parseFloat(unitPrice);
    if (isNaN(price) || price < 0) {
      toast.error("Please enter a valid price");
      return;
    }

    setLoading(true);
    try {
      const data: ServiceContractInsert = {
        site_id: siteId,
        service_type: serviceType,
        description: description || null,
        unit_price: price,
        included_visits: includedVisits ? parseInt(includedVisits, 10) : null,
        contract_start: contractStart || null,
        contract_end: contractEnd || null,
        notes: notes || null,
        po_number: poNumber || null,
        frequency: frequency || "3m",
      };

      const savedContract = await upsertServiceContract(data, contract?.id);
      toast.success(contract ? "Contract updated" : "Contract added");
      onOpenChange(false);
      onSaved(savedContract, !contract);
    } catch (error) {
      console.error("Failed to save contract:", error);
      toast.error("Failed to save contract");
    } finally {
      setLoading(false);
    }
  };

  const availableTypes = SERVICE_TYPES.filter(
    (t) => t.value === contract?.service_type || !existingTypes.includes(t.value)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contract ? "Edit Service Contract" : "Add Service Contract"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service-type">Service Type</Label>
            <Select
              value={serviceType}
              onValueChange={setServiceType}
            >
              <SelectTrigger id="service-type">
                <SelectValue placeholder="Select service type" />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="frequency">Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger id="frequency">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Standard quarterly maintenance"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit-price">Unit Price (£)</Label>
              <Input
                id="unit-price"
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="included-visits">Included Visits/Year</Label>
              <Input
                id="included-visits"
                type="number"
                min="0"
                value={includedVisits}
                onChange={(e) => setIncludedVisits(e.target.value)}
                placeholder="e.g., 4"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contract-start">Contract Start</Label>
              <Input
                id="contract-start"
                type="date"
                value={contractStart}
                onChange={(e) => setContractStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract-end">Contract End</Label>
              <Input
                id="contract-end"
                type="date"
                value={contractEnd}
                onChange={(e) => setContractEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="po-number">PO Number</Label>
              <Input
                id="po-number"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g., PO-12345"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional details..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {contract ? "Update" : "Add"} Contract
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
