import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, Link2, Unlink, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  initiateXeroAuth,
  getXeroConnection,
  deleteXeroConnection,
  fetchXeroContacts,
  XeroConnection,
} from "@/services/xeroService";

export function XeroConnectionCard() {
  const { user } = useAuth();
  const [connection, setConnection] = useState<XeroConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadConnection();
    }
  }, [user]);

  const loadConnection = async () => {
    if (!user) return;
    
    try {
      const conn = await getXeroConnection(user.id);
      setConnection(conn);
    } catch (error) {
      console.error("Failed to load Xero connection:", error);
    } finally {
      setLoading(false);
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { authUrl } = await initiateXeroAuth();

      // Use a popup window. In the Lovable preview iframe, full-page redirects to external domains
      // may be blocked, but popups work.
      const popup = window.open(authUrl, "xero-auth", "width=600,height=700");
      if (!popup) {
        toast.error("Popup blocked. Please allow popups and try again.");
        setConnecting(false);
        return;
      }

      // Poll for the connection to appear (callback now saves server-side)
      const startedAt = Date.now();
      const pollIntervalMs = 1500;
      const timeoutMs = 90_000;

      const timer = window.setInterval(async () => {
        try {
          const conn = await getXeroConnection(user!.id);
          if (conn) {
            setConnection(conn);
            toast.success(`Connected to ${conn.tenant_name || "Xero"}`);
            window.clearInterval(timer);
            setConnecting(false);
            try {
              popup.close();
            } catch {
              // ignore
            }
            return;
          }

          const elapsed = Date.now() - startedAt;
          const isClosed = popup.closed;
          if (elapsed > timeoutMs || isClosed) {
            window.clearInterval(timer);
            setConnecting(false);
            if (isClosed) {
              toast.error("Xero connection not completed. Please try again.");
            } else {
              toast.error("Timed out waiting for Xero connection. Please try again.");
            }
          }
        } catch {
          // If polling fails transiently, keep trying until timeout
          const elapsed = Date.now() - startedAt;
          if (elapsed > timeoutMs) {
            window.clearInterval(timer);
            setConnecting(false);
            toast.error("Timed out waiting for Xero connection. Please try again.");
          }
        }
      }, pollIntervalMs);
    } catch (error) {
      console.error("Failed to initiate Xero auth:", error);
      toast.error("Failed to connect to Xero");
      setConnecting(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestError(null);
    try {
      await fetchXeroContacts();
      toast.success("Xero connection is working!");
    } catch (error) {
      console.error("Test connection failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      
      let guidance = "";
      if (message.includes("Failed to send") || message.includes("Failed to fetch")) {
        guidance = "Network error. Check your internet connection and try again. If popups are blocked, allow them for this site.";
      } else if (message.includes("Unauthorized") || message.includes("401")) {
        guidance = "Your session may have expired. Try disconnecting and reconnecting to Xero.";
      } else if (message.includes("No Xero connection")) {
        guidance = "No active Xero connection found. Please connect to Xero first.";
      } else {
        guidance = "Try disconnecting and reconnecting to Xero. If the issue persists, check the Xero developer console.";
      }
      
      setTestError(`${message}. ${guidance}`);
      toast.error("Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    
    setDisconnecting(true);
    try {
      await deleteXeroConnection(connection.id);
      setConnection(null);
      setTestError(null);
      toast.success("Disconnected from Xero");
    } catch (error) {
      console.error("Failed to disconnect:", error);
      toast.error("Failed to disconnect from Xero");
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <img 
            src="https://www.xero.com/etc.clientlibs/xero/clientlibs/clientlib-base/resources/svg/favicon.svg" 
            alt="Xero" 
            className="h-6 w-6"
          />
          Xero Integration
        </CardTitle>
        <CardDescription>
          Connect to Xero to create invoices from completed visits
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connection ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="font-medium">Connected</span>
              <Badge variant="secondary">{connection.tenant_name}</Badge>
            </div>
            
            {testError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{testError}</AlertDescription>
              </Alert>
            )}
            
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Test Connection
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="mr-2 h-4 w-4" />
                )}
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Connect to Xero
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
