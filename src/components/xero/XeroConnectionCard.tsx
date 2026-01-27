import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Link2, Unlink, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  initiateXeroAuth,
  getXeroConnection,
  deleteXeroConnection,
  XeroConnection,
} from "@/services/xeroService";

export function XeroConnectionCard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connection, setConnection] = useState<XeroConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (user) {
      loadConnection();
    }
  }, [user]);

  // Handle redirect params from Xero OAuth callback
  useEffect(() => {
    const xeroConnected = searchParams.get("xero_connected");
    const xeroError = searchParams.get("xero_error");
    const tenantName = searchParams.get("tenant");

    if (xeroConnected === "true") {
      toast.success(`Connected to ${tenantName || "Xero"}`);
      loadConnection();
      // Clean up URL params
      searchParams.delete("xero_connected");
      searchParams.delete("tenant");
      setSearchParams(searchParams, { replace: true });
    } else if (xeroError) {
      toast.error(`Xero connection failed: ${xeroError}`);
      // Clean up URL params
      searchParams.delete("xero_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
      // Navigate in the same window - callback will redirect back
      window.location.href = authUrl;
    } catch (error) {
      console.error("Failed to initiate Xero auth:", error);
      toast.error("Failed to connect to Xero");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    
    setDisconnecting(true);
    try {
      await deleteXeroConnection(connection.id);
      setConnection(null);
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
            <Button
              variant="outline"
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
