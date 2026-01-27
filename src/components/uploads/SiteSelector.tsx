import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Site {
  id: string;
  name: string;
  total_devices: number | null;
}

interface SiteSelectorProps {
  value: string;
  onValueChange: (siteId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const SiteSelector = ({
  value,
  onValueChange,
  disabled = false,
  placeholder = "Select a site (optional)",
}: SiteSelectorProps) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSites = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, total_devices")
        .eq("status", "active")
        .order("name");

      if (!error && data) {
        setSites(data);
      }
      setLoading(false);
    };

    fetchSites();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 h-10 px-3 border border-border rounded-md bg-muted/30">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading sites...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground flex items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        Link to Site
      </label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No site (unlinked)</SelectItem>
          {sites.length === 0 ? (
            <SelectItem value="empty" disabled>
              No sites available
            </SelectItem>
          ) : (
            sites.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name} ({site.total_devices || 0} devices)
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Link uploads to a site for automatic reconciliation matching
      </p>
    </div>
  );
};

export default SiteSelector;
