import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  GraduationCap, 
  Plus, 
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle
} from "lucide-react";
import { fetchTrainingRecords, fetchTrainingTypes, QMSTrainingRecord } from "@/services/qmsService";
import { format, differenceInDays } from "date-fns";
import { TrainingRecordDialog } from "@/components/qms/TrainingRecordDialog";

const Training = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: records, isLoading } = useQuery({
    queryKey: ['qms-training-records'],
    queryFn: fetchTrainingRecords,
  });

  const { data: trainingTypes } = useQuery({
    queryKey: ['qms-training-types'],
    queryFn: fetchTrainingTypes,
  });

  const getRecordStatus = (record: QMSTrainingRecord) => {
    if (!record.expiry_date) return 'valid';
    const daysUntilExpiry = differenceInDays(new Date(record.expiry_date), new Date());
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 30) return 'expiring_soon';
    return 'valid';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'valid': return <Badge className="bg-green-500 text-white">Valid</Badge>;
      case 'expiring_soon': return <Badge className="bg-yellow-500 text-white">Expiring Soon</Badge>;
      case 'expired': return <Badge className="bg-destructive text-destructive-foreground">Expired</Badge>;
      case 'renewed': return <Badge className="bg-blue-500 text-white">Renewed</Badge>;
      default: return null;
    }
  };

  const expiringRecords = records?.filter(r => {
    const status = getRecordStatus(r);
    return status === 'expiring_soon';
  }) || [];

  const expiredRecords = records?.filter(r => {
    const status = getRecordStatus(r);
    return status === 'expired';
  }) || [];

  const validRecords = records?.filter(r => {
    const status = getRecordStatus(r);
    return status === 'valid';
  }) || [];

  const filteredRecords = records?.filter(record => {
    const matchesSearch = record.training_type?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         record.certificate_number?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  }) || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Training & Competence</h2>
            <p className="text-muted-foreground">Manage staff training records and certifications</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Training Type
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Record Training
            </Button>
            <TrainingRecordDialog open={dialogOpen} onOpenChange={setDialogOpen} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{validRecords.length}</p>
                  <p className="text-sm text-muted-foreground">Valid</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{expiringRecords.length}</p>
                  <p className="text-sm text-muted-foreground">Expiring (30 days)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <XCircle className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-2xl font-bold text-destructive">{expiredRecords.length}</p>
                  <p className="text-sm text-muted-foreground">Expired</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <GraduationCap className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{trainingTypes?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Training Types</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Expiring Soon Alert */}
        {expiringRecords.length > 0 && (
          <Card className="border-yellow-500 bg-yellow-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-600">
                <AlertTriangle className="h-5 w-5" />
                Training Expiring Soon
              </CardTitle>
              <CardDescription>The following training records expire within 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {expiringRecords.slice(0, 5).map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-2 rounded-lg border">
                    <div>
                      <p className="font-medium">{record.training_type?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Expires: {record.expiry_date ? format(new Date(record.expiry_date), 'dd MMM yyyy') : 'N/A'}
                      </p>
                    </div>
                    <Button size="sm" variant="outline">Renew</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search training records..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="records">
          <TabsList>
            <TabsTrigger value="records">Training Records</TabsTrigger>
            <TabsTrigger value="types">Training Types</TabsTrigger>
            <TabsTrigger value="matrix">Competency Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="mt-6">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6 space-y-4">
                    {Array(5).fill(0).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <GraduationCap className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">No training records found</p>
                    <p className="text-muted-foreground">Record training to get started</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Training Type</TableHead>
                        <TableHead>Completion Date</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Certificate #</TableHead>
                        <TableHead>Trainer</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map((record) => {
                        const status = getRecordStatus(record);
                        return (
                          <TableRow key={record.id} className="cursor-pointer hover:bg-muted/50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {record.training_type?.name}
                                {record.training_type?.is_mandatory && (
                                  <Badge variant="outline" className="text-xs">Mandatory</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{format(new Date(record.completion_date), 'dd MMM yyyy')}</TableCell>
                            <TableCell>
                              {record.expiry_date ? (
                                <span className={status === 'expired' ? 'text-destructive' : status === 'expiring_soon' ? 'text-yellow-600' : ''}>
                                  {format(new Date(record.expiry_date), 'dd MMM yyyy')}
                                </span>
                              ) : 'No expiry'}
                            </TableCell>
                            <TableCell className="font-mono">{record.certificate_number || '-'}</TableCell>
                            <TableCell>{record.trainer || '-'}</TableCell>
                            <TableCell>{getStatusBadge(status)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="types" className="mt-6">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Training Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Validity (Months)</TableHead>
                      <TableHead>Mandatory</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainingTypes?.map((type) => (
                      <TableRow key={type.id}>
                        <TableCell className="font-medium">{type.name}</TableCell>
                        <TableCell className="text-muted-foreground">{type.description || '-'}</TableCell>
                        <TableCell>{type.validity_months || 'No expiry'}</TableCell>
                        <TableCell>
                          {type.is_mandatory ? (
                            <Badge className="bg-blue-500">Yes</Badge>
                          ) : (
                            <Badge variant="secondary">No</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="matrix" className="mt-6">
            <Card>
              <CardContent className="py-12 text-center">
                <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium">Competency Matrix</p>
                <p className="text-muted-foreground">Coming soon - View staff competencies at a glance</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Training;
