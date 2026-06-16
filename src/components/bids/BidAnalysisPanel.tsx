import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarClock, Scale, ShieldCheck, AlertTriangle, Trophy, ListChecks,
} from "lucide-react";
import { format } from "date-fns";
import { BidAnalysis } from "@/services/bidService";

export function BidAnalysisPanel({ analysis, analysedAt }: { analysis: BidAnalysis | null; analysedAt: string | null }) {
  if (!analysis) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No analysis yet. Upload the tender pack and click <span className="font-medium">Analyse pack</span>.</p>
      </Card>
    );
  }

  const ev = analysis.evaluation;
  const fmtDate = (d: string | null) => {
    if (!d) return null;
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : format(dt, "d MMM yyyy");
  };

  return (
    <div className="space-y-4">
      {analysedAt && (
        <p className="text-xs text-muted-foreground">Analysed {format(new Date(analysedAt), "d MMM yyyy, HH:mm")}</p>
      )}

      {analysis.summary && (
        <Card className="p-4">
          <h3 className="font-semibold mb-1">Summary</h3>
          <p className="text-sm text-muted-foreground">{analysis.summary}</p>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Evaluation split */}
        {ev && (ev.price_weight != null || ev.quality_weight != null || ev.method) && (
          <Card className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><Scale className="w-4 h-4 text-primary" /> Evaluation</h3>
            {(ev.price_weight != null || ev.quality_weight != null) && (
              <div className="flex items-center gap-2 mb-2">
                {ev.quality_weight != null && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Quality {ev.quality_weight}%</Badge>}
                {ev.price_weight != null && <Badge variant="outline" className="bg-success/10 text-success border-success/20">Price {ev.price_weight}%</Badge>}
              </div>
            )}
            {ev.method && <p className="text-sm text-muted-foreground">{ev.method}</p>}
          </Card>
        )}

        {/* Key dates */}
        {analysis.key_dates?.length ? (
          <Card className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-primary" /> Key dates</h3>
            <ul className="space-y-1.5">
              {analysis.key_dates.map((d, i) => (
                <li key={i} className="text-sm flex justify-between gap-3">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-medium text-right">{fmtDate(d.date) || d.notes || "—"}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      {/* Mandatory requirements */}
      {analysis.mandatory_requirements?.length ? (
        <Card className="p-4">
          <h3 className="font-semibold mb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Mandatory / pass-fail</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            {analysis.mandatory_requirements.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Card>
      ) : null}

      {/* Compliance matrix */}
      {analysis.compliance_matrix?.length ? (
        <Card className="p-4">
          <h3 className="font-semibold mb-2 flex items-center gap-2"><ListChecks className="w-4 h-4 text-primary" /> Compliance matrix</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-1.5 pr-3 font-medium">Requirement</th><th className="py-1.5 pr-3 font-medium">Where</th><th className="py-1.5 font-medium">How we evidence it</th></tr>
              </thead>
              <tbody className="divide-y">
                {analysis.compliance_matrix.map((r, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-2 pr-3">{r.requirement}</td>
                    <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{r.where || "—"}</td>
                    <td className="py-2 text-muted-foreground">{r.met_by || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4">
        {analysis.win_themes?.length ? (
          <Card className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Win themes</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {analysis.win_themes.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </Card>
        ) : null}
        {analysis.risks?.length ? (
          <Card className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Risks</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {analysis.risks.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
