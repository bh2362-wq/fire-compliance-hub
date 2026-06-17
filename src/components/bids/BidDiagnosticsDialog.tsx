import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, RefreshCw, CircleDashed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeError } from "@/lib/edgeError";

interface BidDiagnosticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CheckState = "idle" | "running" | "ok" | "fail";

interface Check {
  key: string;
  label: string;
  state: CheckState;
  detail?: string;
  hint?: string;
}

const INITIAL: Check[] = [
  { key: "db", label: "Database & access", state: "idle" },
  { key: "draft", label: "Drafting model — Sonnet 4.6", state: "idle" },
  { key: "analysis", label: "Analysis model — Opus 4.8", state: "idle" },
];

function StatusIcon({ state }: { state: CheckState }) {
  if (state === "running") return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  if (state === "ok") return <CheckCircle2 className="w-4 h-4 text-success" />;
  if (state === "fail") return <XCircle className="w-4 h-4 text-destructive" />;
  return <CircleDashed className="w-4 h-4 text-muted-foreground" />;
}

export function BidDiagnosticsDialog({ open, onOpenChange }: BidDiagnosticsDialogProps) {
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [running, setRunning] = useState(false);

  const set = (key: string, patch: Partial<Check>) =>
    setChecks((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const run = async () => {
    setRunning(true);
    setChecks(INITIAL.map((c) => ({ ...c, state: "running", detail: undefined, hint: undefined })));

    // 1. Database & RLS — confirms migrations applied and the user has an elevated role.
    try {
      const { error } = await (supabase as any).from("bids").select("id").limit(1);
      if (error) throw error;
      set("db", { state: "ok", detail: "bids table reachable" });
    } catch (e: any) {
      set("db", {
        state: "fail",
        detail: e?.message || "Could not read the bids table",
        hint: "Apply the bid migrations, or sign in with an owner/admin account (tables are gated by elevated role).",
      });
    }

    // 2. Drafting model
    try {
      const { data, error } = await supabase.functions.invoke("generate-bid-answer", { body: { ping: true } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      set("draft", { state: "ok", detail: `Reachable (${(data as any)?.model || "model ok"})` });
    } catch (e) {
      const detail = await extractEdgeError(e);
      set("draft", { state: "fail", detail, hint: hintForModelError(detail, "generate-bid-answer") });
    }

    // 3. Analysis model
    try {
      const { data, error } = await supabase.functions.invoke("analyse-tender-pack", { body: { ping: true } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      set("analysis", { state: "ok", detail: `Reachable (${(data as any)?.model || "model ok"})` });
    } catch (e) {
      const detail = await extractEdgeError(e);
      set("analysis", { state: "fail", detail, hint: hintForModelError(detail, "analyse-tender-pack") });
    }

    setRunning(false);
  };

  // Auto-run when opened.
  useEffect(() => {
    if (open) run();
    else setChecks(INITIAL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allOk = checks.every((c) => c.state === "ok");
  const anyFail = checks.some((c) => c.state === "fail");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bid Writer self-test</DialogTitle>
          <DialogDescription>
            Checks the database, the drafting model (Sonnet 4.6) and the analysis model (Opus 4.8) are deployed and reachable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {checks.map((c) => (
            <div key={c.key} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <StatusIcon state={c.state} />
                <span className="text-sm font-medium">{c.label}</span>
                {c.state === "ok" && <Badge variant="outline" className="ml-auto bg-success/10 text-success border-success/20 text-[10px]">Pass</Badge>}
                {c.state === "fail" && <Badge variant="outline" className="ml-auto bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Fail</Badge>}
              </div>
              {c.detail && <p className={`text-xs mt-1.5 ${c.state === "fail" ? "text-destructive" : "text-muted-foreground"}`}>{c.detail}</p>}
              {c.hint && <p className="text-xs mt-1 text-muted-foreground">↳ {c.hint}</p>}
            </div>
          ))}
        </div>

        {!running && allOk && (
          <p className="text-sm text-success flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> All systems go — you can run a bid end-to-end.</p>
        )}
        {!running && anyFail && (
          <p className="text-sm text-muted-foreground">Fix the failing checks above, then re-run. Model errors usually mean the function isn't redeployed yet, or that model isn't enabled on the API key's org.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {running ? "Running…" : "Re-run tests"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function hintForModelError(detail: string, fn: string): string {
  if (/ANTHROPIC_API_KEY|Invalid Anthropic/i.test(detail)) return "Set ANTHROPIC_API_KEY in Supabase → Edge Functions → secrets.";
  if (/not_found|model|404/i.test(detail)) return "That model may not be enabled on the API key's organisation. Confirm Opus/Sonnet access, or change the model id.";
  if (/Failed to send|fetch|non-2xx|404 page|Function not found/i.test(detail)) return `Deploy the ${fn} edge function.`;
  return `Check the ${fn} edge function logs in Supabase.`;
}
