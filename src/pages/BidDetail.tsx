import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Plus, Upload, Download, FileText, FileType, Mail, ChevronDown,
  Building2, Calendar, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Bid, BidQuestion, BidStatus, BID_STATUS_LABELS,
  getBid, listQuestions, createQuestion, updateBid, countWords,
} from "@/services/bidService";
import { getCompanySettings, CompanySettings } from "@/services/companySettingsService";
import { BidQuestionCard } from "@/components/bids/BidQuestionCard";
import { ImportQuestionsDialog } from "@/components/bids/ImportQuestionsDialog";
import { EmailBidDialog } from "@/components/bids/EmailBidDialog";
import { generateBidPDF, bidFileBaseName } from "@/lib/bidPdfGenerator";
import { generateBidDocx } from "@/lib/bidDocxGenerator";

const BidDetail = () => {
  const { bidId } = useParams<{ bidId: string }>();
  const navigate = useNavigate();

  const [bid, setBid] = useState<Bid | null>(null);
  const [questions, setQuestions] = useState<BidQuestion[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!bidId) return;
    try {
      const [b, qs] = await Promise.all([getBid(bidId), listQuestions(bidId)]);
      setBid(b);
      setQuestions(qs);
    } catch (e: any) {
      console.error("Failed to load bid:", e);
      toast.error("Failed to load bid");
    } finally {
      setLoading(false);
    }
  }, [bidId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getCompanySettings().then(setCompany).catch(() => {}); }, []);

  const refreshQuestions = useCallback(async () => {
    if (!bidId) return;
    try { setQuestions(await listQuestions(bidId)); } catch { /* noop */ }
  }, [bidId]);

  const companyCtx = useMemo(() => ({
    company_name: company?.company_name || undefined,
    about: company?.report_footer_text || undefined,
  }), [company]);

  const stats = useMemo(() => {
    const total = questions.length;
    const answered = questions.filter((q) => (q.answer || "").trim()).length;
    const finalised = questions.filter((q) => q.status === "final").length;
    return { total, answered, finalised, pct: total ? Math.round((answered / total) * 100) : 0 };
  }, [questions]);

  const handleAddQuestion = async () => {
    if (!bidId) return;
    try {
      await createQuestion(bidId, {
        question_text: "New question — click the gear icon to edit.",
        sort_order: questions.length,
      });
      refreshQuestions();
    } catch (e: any) {
      toast.error(e.message || "Failed to add question");
    }
  };

  const handleStatusChange = async (status: BidStatus) => {
    if (!bid) return;
    try {
      await updateBid(bid.id, { status });
      setBid({ ...bid, status });
      toast.success(`Marked as ${BID_STATUS_LABELS[status]}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  };

  const downloadPdf = async () => {
    if (!bid) return;
    setExporting(true);
    try {
      const doc = await generateBidPDF({ bid, questions, companySettings: company });
      doc.save(`${bidFileBaseName(bid)}.pdf`);
    } catch (e: any) {
      toast.error(e.message || "PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  const downloadDocx = async () => {
    if (!bid) return;
    setExporting(true);
    try {
      const blob = await generateBidDocx({ bid, questions, companySettings: company });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bidFileBaseName(bid)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Docx export failed:", e);
      toast.error(e.message || "Word export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <DashboardLayout><div className="space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-40 w-full" /></div></DashboardLayout>;
  }
  if (!bid) {
    return <DashboardLayout><div className="text-center py-12 text-muted-foreground">Bid not found.</div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate("/dashboard/bids")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Bids
          </Button>
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-primary">{bid.bid_reference}</span>
                {bid.portal_name && <Badge variant="outline" className="text-[10px]">{bid.portal_name}</Badge>}
              </div>
              <h1 className="text-2xl font-bold tracking-tight mt-1">{bid.title}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                {bid.buyer_name && <span className="flex items-center gap-1"><Building2 className="w-4 h-4" />{bid.buyer_name}</span>}
                {bid.submission_deadline && (
                  <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />Due {format(new Date(bid.submission_deadline), "d MMM yyyy, HH:mm")}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Select value={bid.status} onValueChange={(v) => handleStatusChange(v as BidStatus)}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(BID_STATUS_LABELS) as BidStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{BID_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={exporting}>
                    {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    Export <ChevronDown className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={downloadPdf}><FileText className="w-4 h-4 mr-2" /> Download PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadDocx}><FileType className="w-4 h-4 mr-2" /> Download Word (.docx)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEmailOpen(true)}><Mail className="w-4 h-4 mr-2" /> Email to client</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Progress + summary */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{stats.answered} of {stats.total} answered{stats.finalised ? ` · ${stats.finalised} final` : ""}</span>
            <span className="text-muted-foreground">{stats.pct}%</span>
          </div>
          <Progress value={stats.pct} className="h-2" />
          {bid.summary && <p className="text-sm text-muted-foreground pt-1">{bid.summary}</p>}
        </div>

        {/* Questions toolbar */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Questions</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-1.5" /> Import
            </Button>
            <Button size="sm" onClick={handleAddQuestion}>
              <Plus className="w-4 h-4 mr-1.5" /> Add question
            </Button>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl">
            <p className="text-muted-foreground">No questions yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Use <span className="font-medium">Import</span> to paste questions from the ITT, or add one manually.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, i) => (
              <BidQuestionCard
                key={q.id}
                index={i}
                question={q}
                bid={bid}
                company={companyCtx}
                onChanged={refreshQuestions}
              />
            ))}
          </div>
        )}
      </div>

      <ImportQuestionsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        bidId={bid.id}
        startOrder={questions.length}
        onImported={refreshQuestions}
      />
      <EmailBidDialog open={emailOpen} onOpenChange={setEmailOpen} bid={bid} questions={questions} />
    </DashboardLayout>
  );
};

export default BidDetail;
