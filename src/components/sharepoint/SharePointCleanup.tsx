import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Trash2, FolderSync, AlertTriangle, CheckCircle, FolderX, Folders } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CleanupPlan {
  duplicateCustomerFolders: any[];
  orphanCustomerFolders: any[];
  duplicateSiteFolders: any[];
  orphanSiteFolders: any[];
  emptyFolders: any[];
  customerMappings: any[];
}

export function SharePointCleanup() {
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [plan, setPlan] = useState<CleanupPlan | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    setPlan(null);
    setResults(null);
    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-cleanup", {
        body: { action: "scan" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setPlan(data.plan);
      toast.success("Scan complete");
    } catch (err: any) {
      toast.error(err.message || "Failed to scan SharePoint");
    } finally {
      setScanning(false);
    }
  };

  const handleExecute = async () => {
    setConfirmOpen(false);
    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-cleanup", {
        body: { action: "execute" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setResults(data.results || []);
      setPlan(null);
      toast.success("Cleanup complete");
    } catch (err: any) {
      toast.error(err.message || "Failed to execute cleanup");
    } finally {
      setExecuting(false);
    }
  };

  const totalIssues = plan
    ? plan.duplicateCustomerFolders.length +
      plan.orphanCustomerFolders.length +
      plan.duplicateSiteFolders.length +
      plan.orphanSiteFolders.length +
      plan.emptyFolders.length
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <FolderSync className="h-5 w-5 text-primary" />
          SharePoint Folder Cleanup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Scan your SharePoint Customers folder for duplicate, orphaned, and empty folders. 
          Merge duplicates into a single canonical folder and remove unused ones.
        </p>

        <div className="flex gap-2">
          <Button onClick={handleScan} disabled={scanning || executing} variant="outline" size="sm">
            {scanning ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Scanning...</>
            ) : (
              <><Search className="w-4 h-4 mr-2" /> Scan for Issues</>
            )}
          </Button>

          {plan && totalIssues > 0 && (
            <Button onClick={() => setConfirmOpen(true)} disabled={executing} variant="destructive" size="sm">
              {executing ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Cleaning up...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" /> Clean Up ({totalIssues} issues)</>
              )}
            </Button>
          )}
        </div>

        {plan && totalIssues === 0 && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">
              SharePoint folders are clean — no duplicates or orphans found.
            </span>
          </div>
        )}

        {plan && totalIssues > 0 && (
          <div className="space-y-3">
            {plan.duplicateCustomerFolders.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Folders className="w-4 h-4 text-warning" />
                  <span className="text-sm font-medium">Duplicate Customer Folders ({plan.duplicateCustomerFolders.length})</span>
                </div>
                {plan.duplicateCustomerFolders.map((dup, i) => (
                  <div key={i} className="ml-6 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{dup.canonicalName}</span>
                    : {dup.folders.map((f: any) => f.name).join(", ")}
                    <span className="text-muted-foreground"> → will merge into <Badge variant="outline" className="text-[10px] px-1">{dup.canonicalFolder}</Badge></span>
                  </div>
                ))}
              </div>
            )}

            {plan.duplicateSiteFolders.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Folders className="w-4 h-4 text-warning" />
                  <span className="text-sm font-medium">Duplicate Site Folders ({plan.duplicateSiteFolders.length})</span>
                </div>
                {plan.duplicateSiteFolders.map((dup, i) => (
                  <div key={i} className="ml-6 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{dup.customerName}/{dup.siteName}</span>
                    : {dup.folders.length} copies → will merge
                  </div>
                ))}
              </div>
            )}

            {plan.orphanCustomerFolders.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="text-sm font-medium">Orphan Customer Folders ({plan.orphanCustomerFolders.length})</span>
                </div>
                {plan.orphanCustomerFolders.map((orphan, i) => (
                  <div key={i} className="ml-6 text-xs text-muted-foreground">
                    {orphan.name} ({orphan.childCount} items)
                    {orphan.childCount > 0 && <Badge variant="outline" className="ml-1 text-[10px] px-1 text-warning">needs review</Badge>}
                  </div>
                ))}
              </div>
            )}

            {plan.orphanSiteFolders.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="text-sm font-medium">Orphan Site Folders ({plan.orphanSiteFolders.length})</span>
                </div>
                {plan.orphanSiteFolders.map((orphan, i) => (
                  <div key={i} className="ml-6 text-xs text-muted-foreground">
                    {orphan.customerName}/{orphan.name} ({orphan.childCount} items)
                  </div>
                ))}
              </div>
            )}

            {plan.emptyFolders.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FolderX className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Empty Folders ({plan.emptyFolders.length})</span>
                </div>
                {plan.emptyFolders.slice(0, 10).map((empty, i) => (
                  <div key={i} className="ml-6 text-xs text-muted-foreground">
                    {empty.path}
                  </div>
                ))}
                {plan.emptyFolders.length > 10 && (
                  <div className="ml-6 text-xs text-muted-foreground">
                    ...and {plan.emptyFolders.length - 10} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {results && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium">Cleanup Results ({results.length} actions)</span>
            </div>
            <ScrollArea className="h-48 rounded border border-border">
              <div className="p-2 space-y-0.5">
                {results.map((r, i) => (
                  <div key={i} className={`text-xs font-mono ${
                    r.startsWith("DELETED") ? "text-destructive" :
                    r.startsWith("MOVED") ? "text-emerald-600" :
                    r.startsWith("DB") ? "text-primary" :
                    r.startsWith("SKIP") ? "text-warning" :
                    "text-muted-foreground"
                  }`}>
                    {r}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm SharePoint Cleanup</AlertDialogTitle>
              <AlertDialogDescription>
                This will:
                <ul className="list-disc ml-4 mt-2 space-y-1">
                  {plan && plan.duplicateCustomerFolders.length > 0 && (
                    <li>Merge {plan.duplicateCustomerFolders.length} duplicate customer folder(s)</li>
                  )}
                  {plan && plan.duplicateSiteFolders.length > 0 && (
                    <li>Merge {plan.duplicateSiteFolders.length} duplicate site folder(s)</li>
                  )}
                  {plan && plan.emptyFolders.length > 0 && (
                    <li>Delete {plan.emptyFolders.length} empty folder(s)</li>
                  )}
                  {plan && plan.orphanCustomerFolders.filter(o => o.childCount === 0).length > 0 && (
                    <li>Delete {plan.orphanCustomerFolders.filter(o => o.childCount === 0).length} orphan empty folder(s)</li>
                  )}
                </ul>
                <p className="mt-2 font-medium">Non-empty orphan folders will be skipped for manual review.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleExecute} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Confirm Cleanup
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
