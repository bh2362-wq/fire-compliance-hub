import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cloud, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function SharePointConnectionCard() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const checkConnection = async () => {
    try {
      const { data } = await supabase
        .from("microsoft_tokens_safe")
        .select("id, connected_at")
        .limit(1)
        .maybeSingle();
      setConnected(!!data);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  // Poll for connection when connecting
  useEffect(() => {
    if (!connecting) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("microsoft_tokens_safe")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (data) {
        setConnected(true);
        setConnecting(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [connecting]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("microsoft-auth");
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Open popup
      const popup = window.open(data.authUrl, "microsoft-auth", "width=600,height=700,popup=yes");
      if (!popup) {
        toast.error("Please allow popups for this site");
        setConnecting(false);
      }
    } catch (err: any) {
      console.error("Microsoft auth error:", err);
      toast.error(err.message || "Failed to start Microsoft auth");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await supabase.from("microsoft_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      setConnected(false);
      toast.success("Microsoft disconnected");
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="w-4 h-4" />
          Microsoft SharePoint / OneDrive
        </CardTitle>
        <Badge variant={connected ? "default" : "secondary"}>
          {connected ? (
            <><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</>
          ) : (
            <><AlertCircle className="w-3 h-3 mr-1" /> Not Connected</>
          )}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {connected
            ? "Upload reports directly to SharePoint/OneDrive from completed reports."
            : "Connect your Microsoft account to upload reports to SharePoint/OneDrive."}
        </p>
        {connected ? (
          <Button variant="outline" size="sm" onClick={handleDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={handleConnect} disabled={connecting}>
            {connecting ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Connecting...</>
            ) : (
              "Connect Microsoft"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
