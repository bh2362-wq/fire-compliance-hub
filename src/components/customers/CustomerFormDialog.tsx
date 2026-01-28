import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Download, Users } from "lucide-react";
import { Customer, createCustomer, updateCustomer } from "@/services/customerService";
import { fetchXeroContacts, getXeroConnection, XeroContact } from "@/services/xeroService";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const customerSchema = z.object({
  name: z.string().min(1, "Customer name is required"),
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  notes: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSuccess: () => void;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSuccess,
}: CustomerFormDialogProps) {
  const [saving, setSaving] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [xeroContacts, setXeroContacts] = useState<XeroContact[]>([]);
  const [selectedXeroContact, setSelectedXeroContact] = useState<string>("");
  const [hasXeroConnection, setHasXeroConnection] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isEditing = !!customer;

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: customer?.name || "",
      contact_name: customer?.contact_name || "",
      contact_email: customer?.contact_email || "",
      contact_phone: customer?.contact_phone || "",
      address: customer?.address || "",
      city: customer?.city || "",
      postcode: customer?.postcode || "",
      notes: customer?.notes || "",
    },
  });

  // Reset form when dialog opens/closes or customer changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: customer?.name || "",
        contact_name: customer?.contact_name || "",
        contact_email: customer?.contact_email || "",
        contact_phone: customer?.contact_phone || "",
        address: customer?.address || "",
        city: customer?.city || "",
        postcode: customer?.postcode || "",
        notes: customer?.notes || "",
      });
      setSelectedXeroContact("");
      checkXeroAndLoadContacts();
    }
  }, [open, customer]);

  const checkXeroAndLoadContacts = async () => {
    if (!user) return;
    try {
      const conn = await getXeroConnection(user.id);
      setHasXeroConnection(!!conn);
      if (conn) {
        loadXeroContacts();
      }
    } catch (error) {
      setHasXeroConnection(false);
    }
  };

  const loadXeroContacts = async () => {
    setLoadingContacts(true);
    try {
      const contacts = await fetchXeroContacts();
      setXeroContacts(contacts);
    } catch (error) {
      console.error("Failed to load Xero contacts:", error);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleXeroContactSelect = (contactId: string) => {
    setSelectedXeroContact(contactId);
    const contact = xeroContacts.find(c => c.ContactID === contactId);
    if (contact) {
      // Parse address from Xero contact
      const address = contact.Addresses?.find(a => a.AddressType === "POBOX" || a.AddressType === "STREET");
      const phone = contact.Phones?.find(p => p.PhoneType === "DEFAULT" || p.PhoneType === "MOBILE");
      
      form.setValue("name", contact.Name || "");
      form.setValue("contact_name", contact.FirstName && contact.LastName 
        ? `${contact.FirstName} ${contact.LastName}` 
        : contact.FirstName || "");
      form.setValue("contact_email", contact.EmailAddress || "");
      form.setValue("contact_phone", phone 
        ? `${phone.PhoneCountryCode || ""}${phone.PhoneAreaCode || ""}${phone.PhoneNumber || ""}`.trim() 
        : "");
      form.setValue("address", address?.AddressLine1 || "");
      form.setValue("city", address?.City || "");
      form.setValue("postcode", address?.PostalCode || "");

      toast({
        title: "Contact imported",
        description: `${contact.Name} details have been filled in. You can edit them before saving.`,
      });
    }
  };

  const onSubmit = async (data: CustomerFormData) => {
    setSaving(true);

    const customerData = {
      name: data.name,
      contact_name: data.contact_name || null,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      address: data.address || null,
      city: data.city || null,
      postcode: data.postcode || null,
      notes: data.notes || null,
      status: "active",
    };

    const result = isEditing
      ? await updateCustomer(customer.id, customerData)
      : await createCustomer(customerData);

    if (result.error) {
      toast({
        title: "Error",
        description: result.error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: isEditing ? "Customer updated" : "Customer created",
        description: `${data.name} has been ${isEditing ? "updated" : "added"} successfully.`,
      });
      onSuccess();
      onOpenChange(false);
    }

    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Customer" : "Add Customer"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Update the customer details below." 
              : "Enter customer details or import from Xero."}
          </DialogDescription>
        </DialogHeader>

        {/* Xero Import Section - Only show when adding new customer and Xero is connected */}
        {!isEditing && hasXeroConnection && (
          <div className="border border-border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Import from Xero</span>
            </div>
            <Select 
              value={selectedXeroContact} 
              onValueChange={handleXeroContactSelect}
              disabled={loadingContacts}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingContacts ? "Loading contacts..." : "Select a Xero contact"} />
              </SelectTrigger>
              <SelectContent>
                {xeroContacts.map((contact) => (
                  <SelectItem key={contact.ContactID} value={contact.ContactID}>
                    {contact.Name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Select a contact to auto-fill the form. You can edit the details before saving.
            </p>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Company Ltd" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="0123 456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="contact_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="contact@company.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <AddressAutocomplete
                      value={field.value || ""}
                      onChange={field.onChange}
                      onAddressSelect={(details) => {
                        form.setValue("address", details.address);
                        form.setValue("city", details.city);
                        form.setValue("postcode", details.postcode);
                        // Auto-fill customer name if a business was selected and name is empty
                        if (details.businessName && !form.getValues("name")) {
                          form.setValue("name", details.businessName);
                        }
                      }}
                      placeholder="Start typing to search UK addresses..."
                      disabled={saving}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="London" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="postcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postcode</FormLabel>
                    <FormControl>
                      <Input placeholder="SW1A 1AA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes about this customer..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="hero" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? "Save Changes" : "Add Customer"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
