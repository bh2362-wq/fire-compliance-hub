import { useState, useEffect, useMemo } from "react";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, Users, Link2, Plus, Check, ChevronsUpDown, PoundSterling } from "lucide-react";
import { Customer, createCustomer, updateCustomer, createXeroContact } from "@/services/customerService";
import { fetchXeroContacts, getXeroConnection, XeroContact } from "@/services/xeroService";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const customerSchema = z.object({
  name: z.string().min(1, "Customer name is required"),
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  notes: z.string().optional(),
  email_recipients: z.string().optional(),
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
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
      email_recipients: (customer as any)?.email_recipients || "",
    },
  });

  // Filter contacts based on search query with predictive matching
  const filteredContacts = useMemo(() => {
    if (!searchQuery) return xeroContacts;
    const query = searchQuery.toLowerCase();
    return xeroContacts.filter((contact) =>
      contact.Name.toLowerCase().includes(query) ||
      contact.EmailAddress?.toLowerCase().includes(query)
    );
  }, [xeroContacts, searchQuery]);

  // Sort contacts: customers with outstanding balance first, then active customers, then others
  const sortedContacts = useMemo(() => {
    return [...filteredContacts].sort((a, b) => {
      // Outstanding balance first
      if (a.HasOutstandingBalance && !b.HasOutstandingBalance) return -1;
      if (!a.HasOutstandingBalance && b.HasOutstandingBalance) return 1;
      // Then by customer status
      if (a.IsCustomer && !b.IsCustomer) return -1;
      if (!a.IsCustomer && b.IsCustomer) return 1;
      // Then alphabetically
      return a.Name.localeCompare(b.Name);
    });
  }, [filteredContacts]);

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
        email_recipients: (customer as any)?.email_recipients || "",
      });
      setSelectedXeroContact("");
      setSearchQuery("");
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
      // Load customers only (those with invoice history)
      const contacts = await fetchXeroContacts({ customersOnly: true });
      setXeroContacts(contacts);
    } catch (error) {
      console.error("Failed to load Xero contacts:", error);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleXeroContactSelect = (contactId: string) => {
    setSelectedXeroContact(contactId);
    setComboboxOpen(false);
    setCreateInXero(false);
    const contact = xeroContacts.find(c => c.ContactID === contactId);
    if (contact) {
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

  const selectedContact = xeroContacts.find(c => c.ContactID === selectedXeroContact);

  const onSubmit = async (data: CustomerFormData) => {
    setSaving(true);

    let xeroContactId: string | null = null;

    if (selectedXeroContact) {
      xeroContactId = selectedXeroContact;
    } else if (!isEditing && hasXeroConnection && createInXero) {
      toast({
        title: "Creating in Xero...",
        description: "Syncing customer to your Xero account.",
      });

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
      email_recipients: data.email_recipients || null,
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(amount);
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

        {/* Xero Sync Section */}
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

            {/* Predictive search combobox for Xero contacts */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Import existing customer from Xero:</label>
              <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboboxOpen}
                    className="w-full justify-between"
                    disabled={loadingContacts}
                  >
                    {loadingContacts ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading customers...
                      </span>
                    ) : selectedContact ? (
                      <span className="flex items-center gap-2">
                        {selectedContact.Name}
                        {selectedContact.HasOutstandingBalance && (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">
                            <PoundSterling className="w-3 h-3 mr-1" />
                            {formatCurrency(selectedContact.OutstandingBalance || 0)}
                          </Badge>
                        )}
                      </span>
                    ) : (
                      "Search customers..."
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 z-50" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Type to search customers..." 
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList className="max-h-[300px] overflow-y-auto">
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup heading="Customers">
                        {sortedContacts.map((contact) => (
                          <CommandItem
                            key={contact.ContactID}
                            value={`${contact.Name} ${contact.EmailAddress || ""}`}
                            onSelect={() => handleXeroContactSelect(contact.ContactID)}
                            className="flex items-center justify-between cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Check
                                className={cn(
                                  "h-4 w-4",
                                  selectedXeroContact === contact.ContactID
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              <div>
                                <div className="font-medium">{contact.Name}</div>
                                {contact.EmailAddress && (
                                  <div className="text-xs text-muted-foreground">
                                    {contact.EmailAddress}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {contact.HasOutstandingBalance && (
                                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">
                                  <PoundSterling className="w-3 h-3 mr-0.5" />
                                  {formatCurrency(contact.OutstandingBalance || 0)}
                                </Badge>
                              )}
                              {contact.IsCustomer && !contact.HasOutstandingBalance && (
                                <Badge variant="outline" className="text-xs">
                                  Customer
                                </Badge>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Create new in Xero option */}
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
              Showing customers with invoice history. Outstanding balances are highlighted.
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
              name="email_recipients"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Report Recipients</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="email1@company.com, email2@company.com"
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Comma-separated email addresses for automatic report delivery
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

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
