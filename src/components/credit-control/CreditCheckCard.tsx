import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Building2,
  Shield,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  CreditCheck,
  CompanySearchResult,
  searchCompanies,
  runCreditCheck,
  getCachedCreditCheck,
  RISK_LEVEL_CONFIG,
} from "@/services/creditCheckService";
import { format, formatDistanceToNow } from "date-fns";

interface CreditCheckCardProps {
  customerId: string;
  customerName: string;
  companyNumber?: string | null;
}

export function CreditCheckCard({ customerId, customerName, companyNumber }: CreditCheckCardProps) {
  const [creditCheck, setCreditCheck] = useState<CreditCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(customerName);
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadCachedCheck();
  }, [customerId]);

  const loadCachedCheck = async () => {
    setLoading(true);
    const cached = await getCachedCreditCheck(customerId);
    setCreditCheck(cached);
    setLoading(false);
  };

  const handleRunCheck = async (compNum: string) => {
    setRunning(true);
    try {
      const result = await runCreditCheck(compNum, customerId);
      setCreditCheck(result);
      setSearchOpen(false);
      toast.success("Credit check completed");
    } catch (error: any) {
      toast.error(`Credit check failed: ${error.message}`);
    } finally {
      setRunning(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchCompanies(searchQuery);
      setSearchResults(results);
    } catch (error: any) {
      toast.error(`Search failed: ${error.message}`);
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Credit Check
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const riskConfig = RISK_LEVEL_CONFIG[creditCheck?.risk_level || "unknown"];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Companies House Credit Check
          </CardTitle>
          <div className="flex gap-2">
            {creditCheck && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRunCheck(creditCheck.company_number)}
                disabled={running}
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Refresh
              </Button>
            )}
            <Button
              variant={creditCheck ? "outline" : "default"}
              size="sm"
              onClick={() => {
                setSearchQuery(customerName);
                setSearchResults([]);
                setSearchOpen(true);
              }}
            >
              <Search className="h-4 w-4 mr-1" />
              {creditCheck ? "Change Company" : "Run Credit Check"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!creditCheck ? (
            <div className="text-center py-6">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No credit check performed yet. Search for the company to run a check.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Risk & Status Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={riskConfig.variant}>{riskConfig.label}</Badge>
                  <Badge
                    variant={creditCheck.company_status === "active" ? "default" : "destructive"}
                  >
                    {creditCheck.company_status || "Unknown"}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  Checked{" "}
                  {formatDistanceToNow(new Date(creditCheck.checked_at), { addSuffix: true })}
                </span>
              </div>

              {/* Company Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Company</span>
                  <p className="font-medium">{creditCheck.company_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Company No.</span>
                  <p className="font-medium">{creditCheck.company_number}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Type</span>
                  <p className="font-medium capitalize">
                    {creditCheck.company_type?.replace(/-/g, " ") || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Incorporated</span>
                  <p className="font-medium">
                    {creditCheck.date_of_creation
                      ? format(new Date(creditCheck.date_of_creation), "dd MMM yyyy")
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Warning Indicators */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <IndicatorItem
                  label="Accounts"
                  ok={!creditCheck.accounts_overdue}
                  okLabel="Up to date"
                  badLabel="Overdue"
                />
                <IndicatorItem
                  label="Confirmation"
                  ok={!creditCheck.confirmation_statement_overdue}
                  okLabel="Filed"
                  badLabel="Overdue"
                />
                <IndicatorItem
                  label="Charges"
                  ok={!creditCheck.has_charges}
                  okLabel="None"
                  badLabel="Has charges"
                />
                <IndicatorItem
                  label="Insolvency"
                  ok={!creditCheck.has_insolvency_history}
                  okLabel="None"
                  badLabel="History found"
                />
              </div>

              {/* Risk Factors */}
              {creditCheck.risk_factors && (creditCheck.risk_factors as string[]).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Risk Factors</p>
                  <div className="space-y-1">
                    {(creditCheck.risk_factors as string[]).map((factor, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                        <span>{factor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Officers */}
              {creditCheck.officers && (creditCheck.officers as any[]).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Officers
                  </p>
                  <div className="space-y-1">
                    {(creditCheck.officers as any[])
                      .filter((o: any) => !o.resigned_on)
                      .slice(0, 5)
                      .map((officer: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>{officer.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {officer.role?.replace(/-/g, " ")}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Recent Filings */}
              {creditCheck.filing_history && (creditCheck.filing_history as any[]).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Recent Filings
                  </p>
                  <div className="space-y-1">
                    {(creditCheck.filing_history as any[]).slice(0, 3).map((filing: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="truncate max-w-[250px]">{filing.description || filing.type}</span>
                        <span className="text-xs text-muted-foreground">
                          {filing.date ? format(new Date(filing.date), "dd MMM yyyy") : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Search Companies House</DialogTitle>
            <DialogDescription>
              Find and link a company to {customerName}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              placeholder="Search company name or number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searching}>
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {searchResults.length === 0 && !searching && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Search for a company to see results
              </p>
            )}
            {searching && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {searchResults.map((result) => (
              <div
                key={result.company_number}
                className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => handleRunCheck(result.company_number)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{result.title}</span>
                  <Badge
                    variant={result.company_status === "active" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {result.company_status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{result.company_number}</span>
                  {result.date_of_creation && (
                    <span>Inc. {result.date_of_creation}</span>
                  )}
                </div>
                {result.address_snippet && (
                  <p className="text-xs text-muted-foreground mt-1">{result.address_snippet}</p>
                )}
              </div>
            ))}
          </div>

          {running && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Running credit check...
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function IndicatorItem({
  label,
  ok,
  okLabel,
  badLabel,
}: {
  label: string;
  ok: boolean;
  okLabel: string;
  badLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {ok ? (
        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-destructive" />
      )}
      <div>
        <span className="text-muted-foreground">{label}:</span>{" "}
        <span className={ok ? "" : "text-destructive font-medium"}>{ok ? okLabel : badLabel}</span>
      </div>
    </div>
  );
}
