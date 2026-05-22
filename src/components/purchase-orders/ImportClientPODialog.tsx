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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Loader2, FileText, CheckCircle, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { VISIT_TYPES } from "@/constants/visitTypes";
import { SERVICE_TYPES, SERVICE_FREQUENCIES, getServiceTypeLabel, getFrequencyLabel } from "@/services/serviceContractService";

interface ExtractedPOData {
  customer_name: string | null;
  site_address: string | null;
  site_name: string | null;
  po_number: string | null;
  scope_of_work: string | null;
  visit_type: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  special_instructions: string | null;
  asset_descriptions: { name: string; type: string; manufacturer?: string; model?: string }[];
  frequency: string | null;
  estimated_value: number | null;
}

interface ImportClientPODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function ImportClientPODialog({ open, onOpenChange, onSuccess }: ImportClientPODialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<"upload" | "review" | "creating">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedPOData | null>(null);
  const [creating, setCreating] = useState(false);

  // Editable fields
  const [customerName, setCustomerName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [visitType, setVisitType] = useState("remedial");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [frequency, setFrequency] = useState("");
  const [assets, setAssets] = useState<{ name: string; type: string; manufacturer?: string; model?: string }[]>([]);

  // Matched records
  const [matchedCustomerId, setMatchedCustomerId] = useState<string | null>(null);
  const [matchedSiteId, setMatchedSiteId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string; customer_id: string | null }[]>([]);

  useEffect(() => {
    if (open) {
      setStep("upload");
      setFile(null);
      setExtractedData(null);
      loadCustomersAndSites();
    }
  }, [open]);

  const loadCustomersAndSites = async () => {
    const [custResult, siteResult] = await Promise.all([
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("sites").select("id, name, customer_id").order("name"),
    ]);
    setCustomers(custResult.data || []);
    setSites(siteResult.data || []);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    await scanFile(selected);
  };

  const scanFile = async (fileToScan: File) => {
    setScanning(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append("file", fileToScan);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/scan-client-po`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Scan failed (${response.status})`);
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Extraction failed");

      const data = result.data as ExtractedPOData;
      setExtractedData(data);

      // Populate editable fields
      setCustomerName(data.customer_name || "");
      setSiteName(data.site_name || "");
      setSiteAddress(data.site_address || "");
      setPoNumber(data.po_number || "");
      setScopeOfWork(data.scope_of_work || "");
      setVisitType(data.visit_type || "remedial");
      setSpecialInstructions(data.special_instructions || "");
      setFrequency(data.frequency || "");
      setAssets(data.asset_descriptions || []);

      // Try to match customer
      if (data.customer_name) {
        const match = customers.find(
          (c) => c.name.toLowerCase().includes(data.customer_name!.toLowerCase()) ||
                 data.customer_name!.toLowerCase().includes(c.name.toLowerCase())
        );
        if (match) setMatchedCustomerId(match.id);
      }

      setStep("review");
      toast.success("PO scanned successfully");
    } catch (error: any) {
      console.error("PO scan error:", error);
      toast.error(error.message || "Failed to scan PO");
    } finally {
      setScanning(false);
    }
  };

  // When customer changes, filter sites
  useEffect(() => {
    if (matchedCustomerId) {
      const customerSites = sites.filter((s) => s.customer_id === matchedCustomerId);
      if (customerSites.length > 0 && !matchedSiteId) {
        // Try to match by name
        const siteMatch = customerSites.find(
          (s) => s.name.toLowerCase().includes(siteName.toLowerCase()) ||
                 siteName.toLowerCase().includes(s.name.toLowerCase())
        );
        if (siteMatch) setMatchedSiteId(siteMatch.id);
      }
    }
  }, [matchedCustomerId, sites, siteName]);

  const filteredSites = matchedCustomerId
    ? sites.filter((s) => s.customer_id === matchedCustomerId)
    : sites;

  const handleCreateJob = async () => {
    if (!user?.id) return;
    if (!matchedCustomerId) {
      toast.error("Please select or create a customer");
      return;
    }

    setCreating(true);
    try {
      let siteId = matchedSiteId;

      // Create site if not matched
      if (!siteId) {
        if (!siteName) {
          toast.error("Please enter a site name");
          setCreating(false);
          return;
        }
        const { data: newSite, error: siteError } = await supabase
          .from("sites")
          .insert({
            name: siteName,
            address: siteAddress || null,
            customer_id: matchedCustomerId,
          })
          .select("id")
          .single();

        if (siteError) throw siteError;
        siteId = newSite.id;
        toast.success(`Site "${siteName}" created`);
      }

      // Create visit with awaiting_scheduling status
      const { data: visit, error: visitError } = await supabase
        .from("service_visits")
        .insert({
          site_id: siteId,
          visit_type: visitType,
          visit_date: new Date().toISOString().split("T")[0],
          status: "awaiting_scheduling",
          notes: [scopeOfWork, specialInstructions].filter(Boolean).join("\n\n"),
          client_po_number: poNumber || null,
        })
        .select("id")
        .single();

      if (visitError) throw visitError;

      // Create assets on the site if they don't exist
      if (assets.length > 0 && siteId) {
        for (const asset of assets) {
          // Check if similar asset already exists
          const { data: existing } = await supabase
            .from("site_assets")
            .select("id")
            .eq("site_id", siteId)
            .ilike("item_name", `%${asset.name}%`)
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from("site_assets").insert({
              site_id: siteId,
              item_name: asset.name,
              asset_type: asset.type || "fire",
              manufacturer: asset.manufacturer || null,
              model: asset.model || null,
            });
          }
        }
        toast.success(`${assets.length} asset(s) checked/created on site`);
      }

      // Upload PO to SharePoint
      if (file) {
        try {
          const customer = customers.find((c) => c.id === matchedCustomerId);
          const site = matchedSiteId
            ? sites.find((s) => s.id === matchedSiteId)
            : { name: siteName };
          const folderPath = `Customers/${customer?.name || customerName}/${site?.name || siteName}/Purchase Orders`;

          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;

          if (token) {
            // Create folder first
            await supabase.functions.invoke("sharepoint-create-folder", {
              body: { folderPath, entityType: "folder_only", entityId: visit.id },
            });

            // Upload file
            const uploadFormData = new FormData();
            uploadFormData.append("file", file);
            uploadFormData.append("folderPath", folderPath);

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            await fetch(`${supabaseUrl}/functions/v1/upload-to-sharepoint`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: uploadFormData,
            });
          }
        } catch (spError) {
          console.error("SharePoint upload failed (non-blocking):", spError);
        }
      }

      toast.success(`Job created as "Awaiting Scheduling" with PO ${poNumber || "N/A"}`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Job creation error:", error);
      toast.error(error.message || "Failed to create job");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateCustomerInline = async () => {
    if (!customerName || !user?.id) return;
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({ name: customerName })
        .select("id, name")
        .single();
      if (error) throw error;
      setCustomers((prev) => [...prev, data]);
      setMatchedCustomerId(data.id);
      toast.success(`Customer "${customerName}" created`);
    } catch (error: any) {
      toast.error(error.message || "Failed to create customer");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Import Client Purchase Order
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
              {scanning ? (
                <div className="space-y-3">
                  <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin" />
                  <p className="text-muted-foreground">Scanning purchase order with AI...</p>
                  <p className="text-xs text-muted-foreground">Extracting customer, site, scope & asset details</p>
                </div>
              ) : (
                <label className="cursor-pointer space-y-3 block">
                  <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                  <p className="text-foreground font-medium">Upload client PO (PDF)</p>
                  <p className="text-sm text-muted-foreground">
                    AI will extract customer, site, scope of work and equipment details
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {step === "review" && extractedData && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-muted-foreground">AI extracted data from <strong>{file?.name}</strong> — review and fill any blanks</span>
            </div>

            {/* Customer */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={matchedCustomerId || ""} onValueChange={setMatchedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!matchedCustomerId && customerName && (
                  <Button variant="outline" size="sm" className="w-full" onClick={handleCreateCustomerInline}>
                    <Plus className="w-3 h-3 mr-1" />
                    Create "{customerName}"
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label>Site</Label>
                <Select value={matchedSiteId || ""} onValueChange={setMatchedSiteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select or create site..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!matchedSiteId && (
                  <Input placeholder="New site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
                )}
              </div>
            </div>

            {!matchedSiteId && (
              <div className="space-y-2">
                <Label>Site Address</Label>
                <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="Address from PO" />
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Client PO Number</Label>
                <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Job Type</Label>
                <Select value={visitType} onValueChange={setVisitType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">N/A</SelectItem>
                    {SERVICE_FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Scope of Work</Label>
              <Textarea
                value={scopeOfWork}
                onChange={(e) => setScopeOfWork(e.target.value)}
                rows={4}
                placeholder="Description of work to be carried out"
              />
            </div>

            <div className="space-y-2">
              <Label>Special Instructions</Label>
              <Textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                rows={2}
                placeholder="Access requirements, safety notes, etc."
              />
            </div>

            {/* Assets detected */}
            {assets.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Equipment Detected
                  <Badge variant="secondary">{assets.length}</Badge>
                </Label>
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  {assets.map((asset, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                      <span className="font-medium">{asset.name}</span>
                      {asset.manufacturer && <span className="text-muted-foreground">({asset.manufacturer} {asset.model || ""})</span>}
                      <Badge variant="outline" className="text-xs ml-auto">{getServiceTypeLabel(asset.type)}</Badge>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground mt-2">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    These will be created as site assets if they don't already exist
                  </p>
                </div>
              </div>
            )}

            {extractedData.estimated_value && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <span className="text-muted-foreground">Estimated PO Value:</span>{" "}
                <span className="font-semibold">£{extractedData.estimated_value.toFixed(2)}</span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep("upload")} className="flex-1">
                Re-scan
              </Button>
              <Button variant="hero" onClick={handleCreateJob} disabled={creating} className="flex-1">
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Job...
                  </>
                ) : (
                  "Create Job (Awaiting Scheduling)"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
