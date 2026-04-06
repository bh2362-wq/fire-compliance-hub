import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  BafeCertificateType,
  getBafeCertificates,
  createBafeCertificate,
  generateBafeCertNumber,
  deleteBafeCertificate,
  getBafeSummary,
} from "@/services/bafeCertificateService";

const CERT_LABELS: Record<BafeCertificateType, string> = {
  design: "Design",
  installation: "Installation",
  commissioning: "Commissioning",
  maintenance: "Maintenance",
};

interface SiteBafeCertificatesProps {
  siteId: string;
}

export function SiteBafeCertificates({ siteId }: SiteBafeCertificatesProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<BafeCertificateType>("design");
  const [issuedDate, setIssuedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: certs, isLoading } = useQuery({
    queryKey: ["bafe-certificates", siteId],
    queryFn: () => getBafeCertificates(siteId),
  });

  const summary = getBafeSummary(certs || []);
  const allFour = summary.every((s) => s.hasCertificate);

  const createMutation = useMutation({
    mutationFn: async () => {
      const certNumber = await generateBafeCertNumber(selectedType);
      return createBafeCertificate({
        site_id: siteId,
        certificate_type: selectedType,
        certificate_number: certNumber,
        issued_date: issuedDate,
        issued_by: user?.id || "",
        expiry_date: expiryDate || null,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bafe-certificates", siteId] });
      queryClient.invalidateQueries({ queryKey: ["bafe-certificates-all"] });
      toast.success("BAFE certificate recorded");
      setAddOpen(false);
      setNotes("");
      setExpiryDate("");
    },
    onError: () => toast.error("Failed to create certificate"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBafeCertificate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bafe-certificates", siteId] });
      queryClient.invalidateQueries({ queryKey: ["bafe-certificates-all"] });
      toast.success("Certificate removed");
    },
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      {/* Status overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summary.map((s) => (
          <Card key={s.type} className={s.hasCertificate ? (s.expired ? "border-destructive/40" : s.expiringSoon ? "border-warning/40" : "border-success/40") : "border-border"}>
            <CardContent className="p-4 flex items-center gap-3">
              {s.hasCertificate ? (
                s.expired ? (
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                ) : s.expiringSoon ? (
                  <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                )
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{s.label}</p>
                {s.latestCert ? (
                  <p className="text-xs text-muted-foreground truncate">{s.latestCert.certificate_number}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not issued</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {allFour && (
        <div className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/20 rounded-lg p-3">
          <ShieldCheck className="h-4 w-4" />
          <span className="font-medium">BAFE SP203-1 Compliant — all 4 certificates issued</span>
        </div>
      )}

      {/* Certificate list */}
      {(certs || []).length > 0 && (
        <div className="border rounded-lg divide-y divide-border">
          {(certs || []).map((cert) => (
            <div key={cert.id} className="p-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{cert.certificate_number}</span>
                  <Badge variant="outline" className="text-xs">{CERT_LABELS[cert.certificate_type as BafeCertificateType]}</Badge>
                  <Badge variant={cert.status === "valid" ? "default" : "secondary"} className="text-xs">
                    {cert.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Issued: {format(new Date(cert.issued_date), "dd MMM yyyy")}
                  {cert.expiry_date && ` · Expires: ${format(new Date(cert.expiry_date), "dd MMM yyyy")}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMutation.mutate(cert.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Record Certificate
      </Button>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record BAFE Certificate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Certificate Type</Label>
              <Select value={selectedType} onValueChange={(v) => setSelectedType(v as BafeCertificateType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="design">Design</SelectItem>
                  <SelectItem value="installation">Installation</SelectItem>
                  <SelectItem value="commissioning">Commissioning</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Issued Date</Label>
              <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
            </div>
            <div>
              <Label>Expiry Date (optional)</Label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Record Certificate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
