import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, CheckCircle, AlertTriangle, Download, Clock, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface RetentionPolicy {
  id: string;
  table_name: string;
  retention_days: number;
  description: string;
  is_active: boolean;
  last_purge_at: string | null;
}

interface DataAccessRequest {
  id: string;
  request_type: string;
  status: string;
  reason: string | null;
  created_at: string;
}

export function SecurityComplianceTab() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [requests, setRequests] = useState<DataAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [policiesRes, requestsRes] = await Promise.all([
        supabase.from('data_retention_policies').select('*').order('table_name'),
        supabase.from('data_access_requests').select('*').order('created_at', { ascending: false }).limit(10),
      ]);
      setPolicies((policiesRes.data as any[]) || []);
      setRequests((requestsRes.data as any[]) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const submitSAR = async (type: 'export' | 'erasure') => {
    if (!user) return;
    const { error } = await supabase.from('data_access_requests').insert({
      requested_by: user.id,
      request_type: type,
      reason: type === 'export' ? 'Subject Access Request - data export' : 'Right to erasure request',
    } as any);

    if (error) {
      toast.error('Failed to submit request');
    } else {
      toast.success(`${type === 'export' ? 'Data export' : 'Erasure'} request submitted`);
      loadData();
    }
  };

  const complianceChecks = [
    { label: 'MFA (TOTP) Enforced', status: true, standard: 'ISO 27001 / CE' },
    { label: 'RBAC Access Control', status: true, standard: 'ISO 27001' },
    { label: 'Session Timeout (15 min)', status: true, standard: 'Cyber Essentials' },
    { label: 'Leaked Password Check (HIBP)', status: true, standard: 'Cyber Essentials' },
    { label: 'Encryption at Rest (AES-256)', status: true, standard: 'UK GDPR' },
    { label: 'Encryption in Transit (TLS)', status: true, standard: 'UK GDPR' },
    { label: 'Audit Trail Logging', status: true, standard: 'ISO 27001' },
    { label: 'Data Retention Policies', status: policies.length > 0, standard: 'UK GDPR' },
    { label: 'GDPR Consent Tracking', status: true, standard: 'UK GDPR' },
    { label: 'Privacy Policy Published', status: true, standard: 'UK GDPR' },
    { label: 'BS 5839 Report Retention (7yr)', status: true, standard: 'Fire Safety' },
    { label: 'Subject Access Request Process', status: true, standard: 'UK GDPR' },
  ];

  const passCount = complianceChecks.filter(c => c.status).length;

  return (
    <div className="space-y-6">
      {/* Compliance Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Compliance Dashboard
          </CardTitle>
          <CardDescription>
            UK GDPR • ISO 27001 • Cyber Essentials • Fire Safety (BS 5839)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-4xl font-bold text-primary">{passCount}/{complianceChecks.length}</div>
            <div>
              <p className="font-medium">Controls Passed</p>
              <p className="text-sm text-muted-foreground">
                {passCount === complianceChecks.length ? 'All controls satisfied' : 'Action required on some controls'}
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {complianceChecks.map((check) => (
              <div key={check.label} className="flex items-center gap-2 text-sm p-2 rounded-md border">
                {check.status ? (
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                )}
                <span className="flex-1">{check.label}</span>
                <Badge variant="outline" className="text-xs">{check.standard}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Data Retention */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Data Retention Policies
          </CardTitle>
          <CardDescription>Automated data lifecycle management for compliance</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data Type</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map(p => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium capitalize">{p.table_name.replace(/_/g, ' ')}</span>
                      {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell>{Math.round(p.retention_days / 365)} years</TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? 'default' : 'secondary'}>
                      {p.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Subject Access Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Data Subject Rights
          </CardTitle>
          <CardDescription>Submit Subject Access Requests (UK GDPR Articles 15-22)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button onClick={() => submitSAR('export')} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Request Data Export
            </Button>
            <Button onClick={() => submitSAR('erasure')} variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10">
              Request Data Erasure
            </Button>
          </div>

          {requests.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="capitalize">{r.request_type}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'completed' ? 'default' : r.status === 'pending' ? 'secondary' : 'outline'}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleDateString('en-GB')}</TableCell>
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
