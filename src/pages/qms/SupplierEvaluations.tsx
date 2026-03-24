import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  Star, TrendingUp, TrendingDown, Truck, ShieldCheck, Package
} from "lucide-react";
import { fetchSupplierEvaluations, QMSSupplierEvaluation } from "@/services/qmsService";
import { format } from "date-fns";

const SupplierEvaluations = () => {
  const { data: evaluations, isLoading } = useQuery({
    queryKey: ['qms-supplier-evaluations'],
    queryFn: fetchSupplierEvaluations,
  });

  // Group by supplier, take latest
  const latestBySupplier = new Map<string, QMSSupplierEvaluation>();
  evaluations?.forEach(ev => {
    const existing = latestBySupplier.get(ev.supplier_id);
    if (!existing || ev.evaluation_date > existing.evaluation_date) {
      latestBySupplier.set(ev.supplier_id, ev);
    }
  });
  const latestEvals = Array.from(latestBySupplier.values()).sort((a, b) => b.overall_score - a.overall_score);

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'preferred': return 'bg-green-500 text-white';
      case 'approved': return 'bg-blue-500 text-white';
      case 'conditional': return 'bg-orange-500 text-white';
      case 'under_review': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600';
    if (score >= 6) return 'text-blue-600';
    if (score >= 4) return 'text-orange-500';
    return 'text-destructive';
  };

  const stats = {
    total: latestEvals.length,
    preferred: latestEvals.filter(e => e.rating === 'preferred').length,
    approved: latestEvals.filter(e => e.rating === 'approved').length,
    conditional: latestEvals.filter(e => e.rating === 'conditional').length,
    underReview: latestEvals.filter(e => e.rating === 'under_review').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Supplier Evaluations</h1>
          <p className="text-muted-foreground">ISO 9001 Clause 8.4 — Automatic supplier performance tracking</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Evaluated</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.preferred}</p>
              <p className="text-xs text-muted-foreground">Preferred</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.approved}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-orange-500">{stats.conditional}</p>
              <p className="text-xs text-muted-foreground">Conditional</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-destructive">{stats.underReview}</p>
              <p className="text-xs text-muted-foreground">Under Review</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Supplier Scorecards
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : latestEvals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No supplier evaluations yet</p>
                <p className="text-muted-foreground text-sm">Evaluations are auto-generated when purchase orders are received</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead className="hidden md:table-cell">Overall</TableHead>
                    <TableHead className="hidden md:table-cell">Delivery</TableHead>
                    <TableHead className="hidden lg:table-cell">Quality</TableHead>
                    <TableHead className="hidden lg:table-cell">Orders</TableHead>
                    <TableHead className="hidden lg:table-cell">On Time</TableHead>
                    <TableHead className="hidden md:table-cell">Spend</TableHead>
                    <TableHead className="hidden lg:table-cell">Source</TableHead>
                    <TableHead className="hidden md:table-cell">Last Eval</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestEvals.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="font-medium">{ev.supplier?.name || 'Unknown'}</TableCell>
                      <TableCell>
                        <Badge className={getRatingColor(ev.rating)}>
                          {ev.rating.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className={`font-bold text-lg ${getScoreColor(ev.overall_score)}`}>
                          {ev.overall_score}/10
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          <Progress value={ev.delivery_score * 10} className="w-16 h-2" />
                          <span className="text-xs">{ev.delivery_score}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Star className="h-3.5 w-3.5 text-muted-foreground" />
                          <Progress value={ev.quality_score * 10} className="w-16 h-2" />
                          <span className="text-xs">{ev.quality_score}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{ev.total_orders}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className={ev.late_deliveries > 0 ? 'text-destructive' : 'text-green-600'}>
                          {ev.on_time_deliveries}/{ev.on_time_deliveries + ev.late_deliveries}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">£{Number(ev.total_spend).toLocaleString()}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {ev.source === 'auto' ? (
                          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">AUTO</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Manual</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {format(new Date(ev.evaluation_date), 'dd MMM yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Historical evaluations */}
        {evaluations && evaluations.length > latestEvals.length && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Evaluation History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Overall</TableHead>
                    <TableHead>Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evaluations.map(ev => (
                    <TableRow key={ev.id}>
                      <TableCell>{ev.supplier?.name || 'Unknown'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(ev.evaluation_period_start), 'MMM yy')} – {format(new Date(ev.evaluation_period_end), 'MMM yy')}
                      </TableCell>
                      <TableCell>
                        <span className={`font-bold ${getScoreColor(ev.overall_score)}`}>{ev.overall_score}/10</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRatingColor(ev.rating)}>{ev.rating.replace('_', ' ')}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SupplierEvaluations;
