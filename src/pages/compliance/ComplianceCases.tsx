import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ComplianceDisclaimer } from "@/components/compliance/ComplianceDisclaimer";
import {
  ComplianceJobType,
  createCase,
  fetchCases,
} from "@/services/compliance/complianceService";

const ComplianceCases = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    premises_name: string;
    job_reference: string;
    job_type: ComplianceJobType;
  }>({ premises_name: "", job_reference: "", job_type: "design" });

  const { data: cases, isLoading } = useQuery({
    queryKey: ["compliance-cases"],
    queryFn: fetchCases,
  });

  const handleCreate = async () => {
    if (!user) {
      toast.error("You must be signed in.");
      return;
    }
    try {
      const c = await createCase({
        premises_name: form.premises_name || null,
        job_reference: form.job_reference || null,
        job_type: form.job_type,
        created_by: user.id,
      });
      toast.success(`Case ${c.case_number} created`);
      qc.invalidateQueries({ queryKey: ["compliance-cases"] });
      setOpen(false);
      navigate(`/compliance/cases/${c.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Compliance cases</h2>
            <p className="text-muted-foreground">BS 5839-1 fire alarm compliance cases</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New case</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create compliance case</DialogTitle>
                <DialogDescription>
                  Internal BS 5839-1 case. Standard rule pack is currently DRAFT/EXAMPLE.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="premises">Premises name</Label>
                  <Input
                    id="premises"
                    value={form.premises_name}
                    onChange={(e) => setForm({ ...form, premises_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="ref">Job reference</Label>
                  <Input
                    id="ref"
                    value={form.job_reference}
                    onChange={(e) => setForm({ ...form, job_reference: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Job type</Label>
                  <Select
                    value={form.job_type}
                    onValueChange={(v) => setForm({ ...form, job_type: v as ComplianceJobType })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="design">Design</SelectItem>
                      <SelectItem value="installation">Installation</SelectItem>
                      <SelectItem value="commissioning">Commissioning</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="takeover">Takeover</SelectItem>
                      <SelectItem value="remedial">Remedial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate}>Create case</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <ComplianceDisclaimer />

        <Card>
          <CardHeader><CardTitle>All cases</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array(4).fill(0).map((_, i) => (<Skeleton key={i} className="h-14 w-full" />))}</div>
            ) : !cases || cases.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No cases yet.</p>
            ) : (
              <div className="space-y-2">
                {cases.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/compliance/cases/${c.id}`)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{c.case_number}</span>
                        <Badge variant="outline">{c.job_type}</Badge>
                      </div>
                      <p className="font-medium">{c.premises_name || c.job_reference || "Untitled"}</p>
                    </div>
                    <Badge>{c.case_status.replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ComplianceCases;
