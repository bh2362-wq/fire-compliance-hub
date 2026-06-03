import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, ClipboardPaste, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createPriceList, addPriceItems } from "@/services/devicePricingService";
import { toast } from "sonner";

interface ImportDeviceReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (priceListId: string) => void;
}

interface ParsedDevice {
  model_number: string;
  description: string;
  device_type: string;
  location: string;
  quantity: number;
}

export function ImportDeviceReportDialog({ open, onOpenChange, onSuccess }: ImportDeviceReportDialogProps) {
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string; customer_id: string | null }[]>([]);
  const [filteredSites, setFilteredSites] = useState<typeof sites>([]);

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [pasteData, setPasteData] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [parsedDevices, setParsedDevices] = useState<ParsedDevice[]>([]);

  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      const [custRes, siteRes] = await Promise.all([
        supabase.from("customers").select("id, name").order("name"),
        supabase.from("sites").select("id, name, customer_id").order("name"),
      ]);
      setCustomers(custRes.data || []);
      setSites(siteRes.data || []);
    };
    fetchData();
  }, [open]);

  useEffect(() => {
    setFilteredSites(customerId ? sites.filter(s => s.customer_id === customerId) : sites);
  }, [customerId, sites]);

  const parseGentText = (text: string): ParsedDevice[] => {
    const lines = text.split("\n").filter(l => l.trim());
    const devices: ParsedDevice[] = [];
    const deviceMap = new Map<string, ParsedDevice>();

    for (const line of lines) {
      // Pattern: Address Lp Loop DeviceType ZONE Zone Location
      // Or simpler patterns like model numbers with quantities
      const gentMatch = line.match(/(\d+)\s+Lp\s+(\d+)\s+(\S+)\s+(?:ZONE\s+\d+\s+)?(.*)/i);
      if (gentMatch) {
        const [, address, loop, deviceType, location] = gentMatch;
        const key = deviceType.toUpperCase();
        const existing = deviceMap.get(key);
        if (existing) {
          existing.quantity++;
        } else {
          deviceMap.set(key, {
            model_number: deviceType,
            description: mapGentDeviceCode(deviceType),
            device_type: "detector",
            location: location?.trim() || "",
            quantity: 1,
          });
        }
        continue;
      }

      // Pattern: Qty x ModelNumber or ModelNumber x Qty
      const qtyMatch = line.match(/(\d+)\s*x\s+(.+)/i) || line.match(/(.+?)\s*x\s*(\d+)/i);
      if (qtyMatch) {
        const qty = parseInt(qtyMatch[1]) || 1;
        const model = qtyMatch[2]?.trim() || qtyMatch[1]?.trim();
        devices.push({
          model_number: model,
          description: model,
          device_type: "detector",
          location: "",
          quantity: isNaN(parseInt(qtyMatch[1])) ? parseInt(qtyMatch[2]) : qty,
        });
        continue;
      }

      // Fallback: just treat each line as a device
      if (line.trim().length > 2) {
        const trimmed = line.trim();
        const existing = deviceMap.get(trimmed.toUpperCase());
        if (existing) {
          existing.quantity++;
        } else {
          deviceMap.set(trimmed.toUpperCase(), {
            model_number: trimmed,
            description: trimmed,
            device_type: "detector",
            location: "",
            quantity: 1,
          });
        }
      }
    }

    return [...deviceMap.values(), ...devices];
  };

  const mapGentDeviceCode = (code: string): string => {
    const codeMap: Record<string, string> = {
      MCP: "Gent Manual Call Point",
      QOH: "Gent Optical Heat Multi-Sensor",
      OSD: "Gent Optical Smoke Detector",
      ISD: "Gent Ionisation Smoke Detector",
      THD: "Gent Fixed Temperature Heat Detector",
      RHD: "Gent Rate of Rise Heat Detector",
      SOB: "Gent Sounder Base",
      BEA: "Gent Beacon",
      SBE: "Gent Sounder Beacon",
      MOD: "Gent Input/Output Module",
      "S4-711": "Gent S4-711 S-Quad Optical Smoke Detector",
      "S4-710": "Gent S4-710 S-Quad Heat Detector",
      "S4-720": "Gent S4-720 S-Quad Multi-Sensor",
      "S4-700": "Gent S4-700 S-Quad Detector Base",
      "S4-34711": "Gent S4-34711 Vigilon Call Point",
    };
    return codeMap[code.toUpperCase()] || `Gent ${code} Device`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    if (f.name.endsWith(".csv") || f.name.endsWith(".txt")) {
      const text = await f.text();
      const devices = parseGentText(text);
      setParsedDevices(devices);
      if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
    } else if (f.name.endsWith(".pdf")) {
      // Use existing PDF parser edge function
      toast.info("Parsing PDF...");
      try {
        const formData = new FormData();
        formData.append("file", f);
        const { data, error } = await supabase.functions.invoke("parse-pdf", {
          body: formData,
        });
        if (error) throw error;
        const text = data?.text || data?.content || "";
        const devices = parseGentText(text);
        setParsedDevices(devices);
        if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
      } catch (err) {
        console.error("PDF parse error:", err);
        toast.error("Failed to parse PDF. Try pasting the data instead.");
      }
    } else {
      toast.error("Supported formats: CSV, TXT, PDF");
    }
  };

  const handlePaste = () => {
    if (!pasteData.trim()) return;
    const devices = parseGentText(pasteData);
    setParsedDevices(devices);
    if (!name) setName("Pasted Device Report");
  };

  const handleImport = async () => {
    if (parsedDevices.length === 0) { toast.error("No devices parsed yet"); return; }
    if (!name.trim()) { toast.error("Enter a name for this price list"); return; }

    setSaving(true);
    try {
      const { data: priceList, error: listError } = await createPriceList({
        name,
        customerId: customerId || undefined,
        siteId: siteId || undefined,
        sourceFileName: file?.name,
        sourceFileType: file?.type || "text/plain",
      });

      if (listError || !priceList) throw listError || new Error("Failed to create price list");

      const { error: itemsError } = await addPriceItems(priceList.id, parsedDevices);
      if (itemsError) throw itemsError;

      toast.success(`Imported ${parsedDevices.length} devices`);
      onSuccess(priceList.id);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setName(""); setCustomerId(""); setSiteId("");
    setPasteData(""); setFile(null); setParsedDevices([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Device Report</DialogTitle>
          <DialogDescription>Upload a Gent device health report or paste device data to create a pricing list.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name and Customer/Site */}
          <div className="space-y-2">
            <Label>Price List Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 123 High Street - Device Replacements" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setSiteId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Site</Label>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {filteredSites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Import tabs */}
          <Tabs defaultValue="upload">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload"><Upload className="mr-2 h-4 w-4" /> Upload File</TabsTrigger>
              <TabsTrigger value="paste"><ClipboardPaste className="mr-2 h-4 w-4" /> Paste Data</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-3">
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-3">Drop a Gent report (CSV, TXT, or PDF)</p>
                <Input type="file" accept=".csv,.txt,.pdf" onChange={handleFileUpload} className="max-w-xs mx-auto" />
              </div>
            </TabsContent>

            <TabsContent value="paste" className="space-y-3">
              <Textarea
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                placeholder="Paste device data here (one device per line)..."
                className="min-h-[150px] font-mono text-sm"
              />
              <Button variant="outline" size="sm" onClick={handlePaste}>Parse Data</Button>
            </TabsContent>
          </Tabs>

          {/* Preview */}
          {parsedDevices.length > 0 && (
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Parsed Devices ({parsedDevices.length})</h4>
                <Badge variant="secondary">{parsedDevices.reduce((s, d) => s + d.quantity, 0)} total units</Badge>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {parsedDevices.slice(0, 20).map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div>
                      <span className="font-mono text-xs mr-2">{d.model_number}</span>
                      <span className="text-muted-foreground">{d.description}</span>
                    </div>
                    <span className="text-muted-foreground">x{d.quantity}</span>
                  </div>
                ))}
                {parsedDevices.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-1">...and {parsedDevices.length - 20} more</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={saving || parsedDevices.length === 0}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : `Import ${parsedDevices.length} Devices`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
