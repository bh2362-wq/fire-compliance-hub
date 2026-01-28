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
import { Loader2, Users, Link2, Plus } from "lucide-react";
import { Customer, createCustomer, updateCustomer, createXeroContact } from "@/services/customerService";
import { fetchXeroContacts, getXeroConnection, XeroContact } from "@/services/xeroService";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";

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
  const [createInXero, setCreateInXero] = useState(true);
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
      setCreateInXero(true);
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
    setCreateInXero(false); // They're importing, so don't create new
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

    let xeroContactId: string | null = null;

    // If we're importing from Xero, use the selected contact ID
    if (selectedXeroContact) {
      xeroContactId = selectedXeroContact;
    } 
    // If creating a new customer and Xero is connected, create in Xero too
    else if (!isEditing && hasXeroConnection && createInXero) {
      toast({
        title: "Creating in Xero...",
        description: "Syncing customer to your Xero account.",
      });

      // Parse contact name into first/last
      const nameParts = (data.contact_name || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const { contactId, error: xeroError } = await createXeroContact({
        name: data.name,
        email: data.contact_email || undefined,
        phone: data.contact_phone || undefined,
        firstName,
        lastName,
        addressLine1: data.address || undefined,
        city: data.city || undefined,
        postalCode: data.postcode || undefined,
      });

      if (xeroError) {
        toast({
          title: "Xero sync failed",
          description: `Customer will be saved locally. Xero error: ${xeroError.message}`,
          variant: "destructive",
        });
      } else {
        xeroContactId = contactId;
        toast({
          title: "Xero contact created",
          description: "Customer has been synced to Xero.",
        });
      }
    }

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
      ...(xeroContactId && { xero_contact_id: xeroContactId }),
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
        description: `${data.name} has been ${isEditing ? "updated" : "added"} successfully.${xeroContactId ? " Linked to Xero." : ""}`,
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

        {/* Xero Sync Section - Only show when Xero is connected */}
        {!isEditing && hasXeroConnection && (
          <div className="border border-border rounded-lg p-4 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Xero Integration</span>
              </div>
              {selectedXeroContact && (
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                  <Link2 className="w-3 h-3 mr-1" />
                  Linked
                </Badge>
              )}
            </div>

            {/* Import existing contact */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Import existing Xero contact:</label>
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
            </div>

            {/* Or create new in Xero */}
            {!selectedXeroContact && (
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <input
                  type="checkbox"
                  id="createInXero"
                  checked={createInXero}
                  onChange={(e) => setCreateInXero(e.target.checked)}
                  className="rounded border-border"
                />
                <label htmlFor="createInXero" className="text-sm text-muted-foreground flex items-center gap-1">
                  <Plus className="w-3 h-3" />
                  Create as new contact in Xero
                </label>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Linking to Xero enables invoice tracking and financial visibility.
            </p>
          </div>
        )}

        {/* Show Xero link status for existing customers */}
        {isEditing && customer?.xero_contact_id && (
          <div className="flex items-center gap-2 p-3 border border-border rounded-lg bg-muted/30">
            <Link2 className="w-4 h-4 text-success" />
            <span className="text-sm text-muted-foreground">Linked to Xero contact</span>
            <Badge variant="outline" className="ml-auto bg-success/10 text-success border-success/20">
              Synced
            </Badge>
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
