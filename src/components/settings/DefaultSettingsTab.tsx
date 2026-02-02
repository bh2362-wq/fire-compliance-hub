import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Settings2, Save, Loader2, Banknote, Plus, Pencil, Trash2 } from "lucide-react";
import { CompanySettings, ServiceType, getServiceTypes, createServiceType, updateServiceType, deleteServiceType } from "@/services/companySettingsService";
import { toast } from "sonner";

const bankFormSchema = z.object({
  default_payment_terms: z.coerce.number().min(0).max(365),
  bank_name: z.string().optional(),
  bank_account_name: z.string().optional(),
  bank_sort_code: z.string().optional(),
  bank_account_number: z.string().optional(),
});

const serviceTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  default_price: z.coerce.number().min(0),
  is_active: z.boolean(),
  sort_order: z.coerce.number(),
});

type BankFormValues = z.infer<typeof bankFormSchema>;
type ServiceTypeFormValues = z.infer<typeof serviceTypeSchema>;

interface DefaultSettingsTabProps {
  settings: CompanySettings | null;
  onSave: (data: Partial<CompanySettings>) => Promise<void>;
  isSaving: boolean;
}

export function DefaultSettingsTab({ settings, onSave, isSaving }: DefaultSettingsTabProps) {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [editingService, setEditingService] = useState<ServiceType | null>(null);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [savingService, setSavingService] = useState(false);

  const bankForm = useForm<BankFormValues>({
    resolver: zodResolver(bankFormSchema),
    defaultValues: {
      default_payment_terms: settings?.default_payment_terms || 30,
      bank_name: settings?.bank_name || "",
      bank_account_name: settings?.bank_account_name || "",
      bank_sort_code: settings?.bank_sort_code || "",
      bank_account_number: settings?.bank_account_number || "",
    },
  });

  const serviceForm = useForm<ServiceTypeFormValues>({
    resolver: zodResolver(serviceTypeSchema),
    defaultValues: {
      name: "",
      description: "",
      default_price: 0,
      is_active: true,
      sort_order: 0,
    },
  });

  useEffect(() => {
    loadServiceTypes();
  }, []);

  const loadServiceTypes = async () => {
    try {
      const data = await getServiceTypes();
      setServiceTypes(data);
    } catch (error) {
      console.error("Failed to load service types:", error);
    } finally {
      setLoadingServices(false);
    }
  };

  const handleBankSubmit = async (data: BankFormValues) => {
    await onSave(data);
  };

  const handleServiceSubmit = async (data: ServiceTypeFormValues) => {
    setSavingService(true);
    try {
      if (editingService) {
        await updateServiceType(editingService.id, data);
        toast.success("Service type updated");
      } else {
        await createServiceType({
          name: data.name,
          description: data.description || null,
          default_price: data.default_price,
          is_active: data.is_active,
          sort_order: data.sort_order,
        });
        toast.success("Service type created");
      }
      await loadServiceTypes();
      setIsServiceDialogOpen(false);
      setEditingService(null);
      serviceForm.reset();
    } catch (error) {
      console.error("Failed to save service type:", error);
      toast.error("Failed to save service type");
    } finally {
      setSavingService(false);
    }
  };

  const handleEditService = (service: ServiceType) => {
    setEditingService(service);
    serviceForm.reset({
      name: service.name,
      description: service.description || "",
      default_price: service.default_price,
      is_active: service.is_active,
      sort_order: service.sort_order,
    });
    setIsServiceDialogOpen(true);
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm("Are you sure you want to delete this service type?")) return;
    
    try {
      await deleteServiceType(id);
      await loadServiceTypes();
      toast.success("Service type deleted");
    } catch (error) {
      console.error("Failed to delete service type:", error);
      toast.error("Failed to delete service type");
    }
  };

  const handleAddNew = () => {
    setEditingService(null);
    serviceForm.reset({
      name: "",
      description: "",
      default_price: 0,
      is_active: true,
      sort_order: serviceTypes.length + 1,
    });
    setIsServiceDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Payment & Bank Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Payment & Bank Details
          </CardTitle>
          <CardDescription>
            Configure default payment terms and bank details for invoices
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...bankForm}>
            <form onSubmit={bankForm.handleSubmit(handleBankSubmit)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={bankForm.control}
                  name="default_payment_terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Payment Terms (days)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>
                        Number of days before payment is due
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={bankForm.control}
                  name="bank_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Barclays Bank" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={bankForm.control}
                  name="bank_account_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Fire Services Ltd" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={bankForm.control}
                  name="bank_sort_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Code</FormLabel>
                      <FormControl>
                        <Input placeholder="00-00-00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={bankForm.control}
                  name="bank_account_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input placeholder="12345678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Payment Settings
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Service Types */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Default Service Types
              </CardTitle>
              <CardDescription>
                Configure the types of services your company offers
              </CardDescription>
            </div>
            <Dialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={handleAddNew}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Service Type
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingService ? "Edit Service Type" : "Add Service Type"}
                  </DialogTitle>
                </DialogHeader>
                <Form {...serviceForm}>
                  <form onSubmit={serviceForm.handleSubmit(handleServiceSubmit)} className="space-y-4">
                    <FormField
                      control={serviceForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Fire Alarm Service" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={serviceForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input placeholder="Annual fire alarm testing" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={serviceForm.control}
                        name="default_price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Price (£)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={serviceForm.control}
                        name="sort_order"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sort Order</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={serviceForm.control}
                      name="is_active"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <FormLabel>Active</FormLabel>
                            <FormDescription>
                              Show this service type in dropdowns
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsServiceDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={savingService}>
                        {savingService && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingService ? "Update" : "Create"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loadingServices ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Default Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceTypes.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {service.description || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      £{service.default_price.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        service.is_active 
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}>
                        {service.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditService(service)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteService(service.id)}
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
    </div>
  );
}
