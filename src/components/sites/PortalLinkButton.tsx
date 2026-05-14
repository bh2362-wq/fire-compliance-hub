/**
 * PortalLinkButton
 * Shown in the SiteDetail header.
 * Fetches (or triggers generation of) the portal_token for the site,
 * then copies the shareable URL to the clipboard.
 */

import { useState } from "react";
import { Globe, Copy, Check, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  siteId: string;
  siteName: string;
}

export function PortalLinkButton({ siteId, siteName }: Props) {
  const [open, setOpen]       = useState(false);
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);

  async function loadToken() {
    if (token) return; // already loaded
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sites")
        .select("portal_token")
        .eq("id", siteId)
        .single();

      if (error) throw error;

      let t = data?.portal_token as string | null;

      // If no token yet (pre-migration sites), generate one now
      if (!t) {
        const { data: updated, error: updateErr } = await supabase
          .from("sites")
          .update({ portal_token: null }) // triggers DEFAULT to fire
          .eq("id", siteId)
          .select("portal_token")
          .single();
        if (updateErr) throw updateErr;
        t = updated?.portal_token as string | null;
      }

      setToken(t);
    } catch (e: any) {
      toast.error("Failed to load portal link");
    } finally {
      setLoading(false);
    }
  }

  const portalUrl = token
    ? `${window.location.origin}/portal/${token}`
    : null;

  async function copy() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      toast.success("Portal link copied to clipboard");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  }

  function openPortal() {
    if (portalUrl) window.open(portalUrl, "_blank", "noopener");
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) loadToken(); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-8 text-xs">
          <Globe className="w-3.5 h-3.5" />
          Client portal
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Client compliance portal</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share this link with {siteName}. They can view their compliance status and certificate history without logging in.
            </p>
          </div>

          {loading && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading portal link…</span>
            </div>
          )}

          {!loading && portalUrl && (
            <>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={portalUrl}
                  className="text-xs h-8 font-mono"
                  onFocus={e => e.target.select()}
                />
                <Button
                  size="sm"
                  className={
                    copied
                      ? "h-8 px-3 bg-success hover:bg-success text-success-foreground"
                      : "h-8 px-3"
                  }
                  onClick={copy}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs h-8"
                onClick={openPortal}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Preview portal
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                This link works for anyone — no login required.
                Keep it confidential to this site's responsible person.
              </p>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
