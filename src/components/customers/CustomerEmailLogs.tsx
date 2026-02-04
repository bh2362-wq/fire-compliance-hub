import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, CheckCircle2, XCircle, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { getEmailLogsByCustomer, EmailLogWithDetails } from "@/services/emailLogService";

interface CustomerEmailLogsProps {
  customerId: string;
}

export function CustomerEmailLogs({ customerId }: CustomerEmailLogsProps) {
  const [logs, setLogs] = useState<EmailLogWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, [customerId]);

  const loadLogs = async () => {
    setLoading(true);
    const { logs, error } = await getEmailLogsByCustomer(customerId);
    if (!error) {
      setLogs(logs);
    }
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "delivered":
        return (
          <Badge className="bg-success/10 text-success border-success/20">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Delivered
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case "sent":
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Sent
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Email History
          {logs.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {logs.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8">
            <Mail className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No emails sent yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(log.status)}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.sent_at), "dd MMM yyyy HH:mm")}
                    </span>
                  </div>
                  <p className="font-medium text-sm">{log.subject}</p>
                  <div className="flex flex-wrap gap-1">
                    {log.recipients.map((email, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {email}
                      </Badge>
                    ))}
                  </div>
                  {log.site_name && (
                    <p className="text-xs text-muted-foreground">
                      Site: {log.site_name}
                    </p>
                  )}
                  {log.error_message && (
                    <p className="text-xs text-destructive">{log.error_message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
