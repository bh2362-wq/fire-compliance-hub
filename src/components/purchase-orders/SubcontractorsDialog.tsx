import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Pencil, Trash2, HardHat, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchSubcontractors,
  createSubcontractor,
  updateSubcontractor,
  deleteSubcontractor,
  Subcontractor,
  SPECIALIZATION_OPTIONS,
} from "@/services/subcontractorService";

interface SubcontractorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SubcontractorsDialog({ open, onOpenChange }: SubcontractorsDialogProps) {
  const { user } = useAuth();
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | null>(null);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [insuranceExpiry, setInsuranceExpiry] = useState("");
  const [dayRate, setDayRate] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("active");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) loadSubs();
  }, [open]);

  const loadSubs = async () => {
    setLoading(true);
    try {
      const data = await fetchSubcontractors();
      setSubs(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load subcontractors");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCompanyName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setCity("");
    setPostcode("");
    setSpecializations([]);
    setInsuranceExpiry("");
    setDayRate("");
    setHourlyRate("");
    setNotes("");
    setStatus("active");
    setEditing(null);
  };

  const openEdit = (sub: Subcontractor) => {
    setEditing(sub);
    setCompanyName(sub.company_name);
    setContactName(sub.contact_name || "");
    setEmail(sub.email || "");
    setPhone(sub.phone || "");
    setAddress(sub.address || "");
    setCity(sub.city || "");
    setPostcode(sub.postcode || "");
    setSpecializations(sub.specializations || []);
    setInsuranceExpiry(sub.insurance_expiry || "");
    setDayRate(sub.day_rate?.toString() || "");
    setHourlyRate(sub.hourly_rate?.toString() || "");
    setNotes(sub.notes || "");
    setStatus(sub.status);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!companyName || !user?.id) return;
    setSaving(true);
    try {
      const payload: Partial<Subcontractor> = {
        company_name: companyName,
        contact_name: contactName || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        postcode: postcode || null,
        specializations,
        insurance_expiry: insuranceExpiry || null,
        day_rate: dayRate ? parseFloat(dayRate) : null,
        hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
        notes: notes || null,
        status,
      };

      if (editing) {
        await updateSubcontractor(editing.id, payload);
        toast.success("Subcontractor updated");
      } else {
        await createSubcontractor(payload, user.id);
        toast.success("Subcontractor added");
      }

      setShowForm(false);
      resetForm();
      loadSubs();
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSubcontractor(id);
      toast.success("Subcontractor removed");
      loadSubs();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete");
    }
  };

  const toggleSpecialization = (value: string) => {
    setSpecializations((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  if (showForm) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Subcontractor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending Approval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Postcode</Label>
                <Input value={postcode} onChange={(e) => setPostcode(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Specializations</Label>
              <div className="flex flex-wrap gap-2">
                {SPECIALIZATION_OPTIONS.map((opt) => (
                  <Badge
                    key={opt.value}
                    variant={specializations.includes(opt.value) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleSpecialization(opt.value)}
                  >
                    {opt.label}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Insurance Expiry</Label>
                <Input type="date" value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Day Rate (£)</Label>
                <Input type="number" value={dayRate} onChange={(e) => setDayRate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hourly Rate (£)</Label>
                <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancel
              </Button>
              <Button variant="hero" className="flex-1" onClick={handleSave} disabled={saving || !companyName}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editing ? "Update" : "Add"} Subcontractor
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="w-5 h-5" />
            Subcontractors
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-end mb-3">
          <Button variant="hero" size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" />
            Add Subcontractor
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Specializations</TableHead>
              <TableHead>Rates</TableHead>
              <TableHead>Insurance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : subs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No subcontractors added yet
                </TableCell>
              </TableRow>
            ) : (
              subs.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <div className="font-medium">{sub.company_name}</div>
                    {sub.email && <div className="text-xs text-muted-foreground">{sub.email}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{sub.contact_name || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(sub.specializations || []).slice(0, 2).map((s) => {
                        const label = SPECIALIZATION_OPTIONS.find((o) => o.value === s)?.label || s;
                        return <Badge key={s} variant="outline" className="text-xs">{label}</Badge>;
                      })}
                      {(sub.specializations || []).length > 2 && (
                        <Badge variant="outline" className="text-xs">+{sub.specializations.length - 2}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {sub.day_rate ? `£${sub.day_rate}/day` : sub.hourly_rate ? `£${sub.hourly_rate}/hr` : "-"}
                  </TableCell>
                  <TableCell>
                    {sub.insurance_expiry ? (
                      <Badge variant={isExpired(sub.insurance_expiry) ? "destructive" : "outline"} className="text-xs">
                        {isExpired(sub.insurance_expiry) ? "Expired" : sub.insurance_expiry}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={sub.status === "active" ? "default" : "secondary"} className="text-xs">
                      {sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(sub)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(sub.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
