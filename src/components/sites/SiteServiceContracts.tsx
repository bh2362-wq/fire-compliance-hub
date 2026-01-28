import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { format } from "date-fns";
import {
  ServiceContract,
  getServiceContracts,
  deleteServiceContract,
  getServiceTypeLabel,
} from "@/services/serviceContractService";
import { ServiceContractDialog } from "./ServiceContractDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SiteServiceContractsProps {
  siteId: string;
}

export function SiteServiceContracts({ siteId }: SiteServiceContractsProps) {
  const [contracts, setContracts] = useState<ServiceContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContract, setEditContract] = useState<ServiceContract | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadContracts();
  }, [siteId]);

  const loadContracts = async () => {
    try {
      const data = await getServiceContracts(siteId);
      setContracts(data);
    } catch (error) {
      console.error("Failed to load contracts:", error);
      toast.error("Failed to load service contracts");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (contract: ServiceContract) => {
    setEditContract(contract);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditContract(null);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteServiceContract(deleteId);
      toast.success("Contract deleted");
      loadContracts();
    } catch (error) {
      console.error("Failed to delete contract:", error);
      toast.error("Failed to delete contract");
    } finally {
      setDeleteId(null);
    }
  };

  const isExpired = (endDate: string | null) => {
    if (!endDate) return false;
    return new Date(endDate) < new Date();
  };

  const isExpiringSoon = (endDate: string | null) => {
    if (!endDate) return false;
    const end = new Date(endDate);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return end > new Date() && end <= thirtyDaysFromNow;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Service Contracts
              </CardTitle>
              <CardDescription>
                Pricing and agreements for each service type
              </CardDescription>
            </div>
            <Button size="sm" onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Contract
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No service contracts configured. Add contracts to define pricing for visits.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-center">Visits/Year</TableHead>
                  <TableHead>Contract Period</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium">
                      {getServiceTypeLabel(contract.service_type)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contract.description || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contract.po_number || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      £{contract.unit_price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      {contract.included_visits ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {contract.contract_start || contract.contract_end ? (
                          <span className="text-sm">
                            {contract.contract_start
                              ? format(new Date(contract.contract_start), "dd MMM yy")
                              : "—"}{" "}
                            →{" "}
                            {contract.contract_end
                              ? format(new Date(contract.contract_end), "dd MMM yy")
                              : "Ongoing"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {isExpired(contract.contract_end) && (
                          <Badge variant="destructive">Expired</Badge>
                        )}
                        {isExpiringSoon(contract.contract_end) && (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                            Expiring Soon
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(contract)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(contract.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ServiceContractDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        siteId={siteId}
        contract={editContract}
        existingTypes={contracts.map((c) => c.service_type)}
        onSaved={loadContracts}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this service contract? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
