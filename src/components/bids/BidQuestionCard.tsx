import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sparkles, Wand2, ChevronDown, Trash2, Loader2, Check, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bid, BidQuestion, QuestionStatus, QUESTION_STATUS_LABELS, RefineInstruction,
  countWords, generateAnswer, updateQuestion, deleteQuestion,
} from "@/services/bidService";

interface CompanyCtx { company_name?: string; accreditations?: string; about?: string }

interface BidQuestionCardProps {
  index: number;
  question: BidQuestion;
  bid: Bid;
  company: CompanyCtx;
  onChanged: () => void;
}

const statusClasses: Record<QuestionStatus, string> = {
  todo: "bg-muted text-muted-foreground border-muted",
  drafted: "bg-primary/10 text-primary border-primary/20",
  reviewed: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  final: "bg-success/10 text-success border-success/20",
};

const refineLabels: Record<RefineInstruction, string> = {
  improve: "Improve",
  expand: "Expand",
  shorten: "Shorten",
  fit_limit: "Fit to limit",
  custom: "Custom instruction…",
};

export function BidQuestionCard({ index, question, bid, company, onChanged }: BidQuestionCardProps) {
  const [answer, setAnswer] = useState(question.answer ?? "");
  const [busy, setBusy] = useState<null | "draft" | "refine">(null);
  const [saved, setSaved] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Editable question fields
  const [qText, setQText] = useState(question.question_text);
  const [qRef, setQRef] = useState(question.question_ref ?? "");
  const [qSection, setQSection] = useState(question.section ?? "");
  const [qGuidance, setQGuidance] = useState(question.guidance ?? "");
  const [qWordLimit, setQWordLimit] = useState<string>(question.word_limit?.toString() ?? "");

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const flashSaved = () => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  };

  const words = countWords(answer);
  const chars = answer.length;
  const overWordLimit = question.word_limit != null && words > question.word_limit;
  const overCharLimit = question.char_limit != null && chars > question.char_limit;

  const persist = async (updates: Partial<BidQuestion>) => {
    try {
      await updateQuestion(question.id, updates);
      flashSaved();
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  };

  const saveAnswer = async () => {
    if (answer === (question.answer ?? "")) return;
    const newStatus = question.status === "todo" && answer.trim() ? "drafted" : question.status;
    await persist({ answer, status: newStatus });
  };

  const runAI = async (mode: "draft" | "refine", instruction?: RefineInstruction, customInstruction?: string) => {
    if (mode === "refine" && !answer.trim()) { toast.error("Write or draft an answer first"); return; }
    setBusy(mode);
    try {
      const result = await generateAnswer({
        mode,
        question: { ...question, answer },
        bid,
        company,
        instruction,
        custom_instruction: customInstruction,
      });
      setAnswer(result);
      await persist({ answer: result, status: question.status === "todo" ? "drafted" : question.status });
      toast.success(mode === "draft" ? "Draft generated" : "Answer refined");
    } catch (e: any) {
      console.error("AI generate failed:", e);
      toast.error(e.message || "AI generation failed");
    } finally {
      setBusy(null);
    }
  };

  const handleRefine = (instruction: RefineInstruction) => {
    if (instruction === "custom") {
      const custom = window.prompt("How should the AI change this answer?");
      if (!custom?.trim()) return;
      runAI("refine", "custom", custom.trim());
    } else {
      runAI("refine", instruction);
    }
  };

  const saveQuestionEdits = async () => {
    await persist({
      question_text: qText.trim() || question.question_text,
      question_ref: qRef.trim() || null,
      section: qSection.trim() || null,
      guidance: qGuidance.trim() || null,
      word_limit: qWordLimit ? Number(qWordLimit) : null,
    });
    setEditOpen(false);
  };

  return (
    <Card className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-primary">
              {question.question_ref || `Q${index + 1}`}
            </span>
            {question.section && (
              <Badge variant="outline" className="text-[10px]">{question.section}</Badge>
            )}
            {question.weighting != null && (
              <Badge variant="outline" className="text-[10px]">{question.weighting}%</Badge>
            )}
          </div>
          <p className="text-sm font-medium leading-snug">{question.question_text}</p>
          {question.guidance && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Guidance: {question.guidance}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Select value={question.status} onValueChange={(v) => persist({ status: v as QuestionStatus })}>
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(QUESTION_STATUS_LABELS) as QuestionStatus[]).map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{QUESTION_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditOpen((o) => !o)} title="Edit question">
            <Settings2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
            title="Delete question"
            onClick={async () => {
              if (!window.confirm("Delete this question?")) return;
              try { await deleteQuestion(question.id); onChanged(); }
              catch (e: any) { toast.error(e.message || "Failed to delete"); }
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Edit question fields */}
      <Collapsible open={editOpen} onOpenChange={setEditOpen}>
        <CollapsibleContent className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Reference</Label>
              <Input className="h-8" value={qRef} onChange={(e) => setQRef(e.target.value)} placeholder="3.1" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Section</Label>
              <Input className="h-8" value={qSection} onChange={(e) => setQSection(e.target.value)} placeholder="Quality" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Word limit</Label>
              <Input className="h-8" type="number" value={qWordLimit} onChange={(e) => setQWordLimit(e.target.value)} placeholder="500" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Question text</Label>
            <Textarea value={qText} onChange={(e) => setQText(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Marking guidance (what good looks like)</Label>
            <Textarea value={qGuidance} onChange={(e) => setQGuidance(e.target.value)} rows={2}
              placeholder="Paste the buyer's scoring criteria so the AI writes to them." />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveQuestionEdits}>Save question</Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Answer */}
      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onBlur={saveAnswer}
        rows={8}
        placeholder="Write the answer, or use AI Draft to generate a first draft…"
        className="text-sm"
      />

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-xs">
          <span className={overWordLimit ? "text-destructive font-semibold" : "text-muted-foreground"}>
            {words} {question.word_limit != null ? `/ ${question.word_limit} ` : ""}words
          </span>
          {question.char_limit != null && (
            <span className={overCharLimit ? "text-destructive font-semibold" : "text-muted-foreground"}>
              {chars} / {question.char_limit} chars
            </span>
          )}
          {saved && <span className="flex items-center gap-1 text-success"><Check className="w-3 h-3" /> Saved</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => runAI("draft")} disabled={!!busy}>
            {busy === "draft" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            AI Draft
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={!!busy}>
                {busy === "refine" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
                Refine <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(refineLabels) as RefineInstruction[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => handleRefine(k)}>{refineLabels[k]}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
