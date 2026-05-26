import { useMemo } from "react";
import type {
  CauseEffectOutputRow,
  CauseEffectRuleRow,
} from "@/services/causeEffectMatrixService";
import type { ParsedOutput, ParsedRule } from "@/services/causeEffectParser";

// Shape-tolerant: accepts either the persisted DB shape or the freshly
// parsed shape (which lacks ids). The viewer only reads the fields
// common to both, so we narrow to a viewer-local view model here.

type ViewerOutput = Pick<
  CauseEffectOutputRow,
  "ordinal" | "code" | "panel_location" | "identification"
>;
type ViewerRule = Pick<
  CauseEffectRuleRow,
  | "ordinal"
  | "ref"
  | "trigger_device"
  | "trigger_type"
  | "trigger_location"
  | "notes"
  | "actions"
>;

interface Props {
  title?: string | null;
  legend?: string | null;
  outputs: (ViewerOutput | ParsedOutput)[];
  rules: (ViewerRule | ParsedRule)[];
}

const ACTION_STYLES: Record<string, string> = {
  E: "bg-red-100 text-red-800 border-red-200",
  C: "bg-blue-100 text-blue-800 border-blue-200",
  A: "bg-amber-100 text-amber-900 border-amber-200",
  D: "bg-slate-200 text-slate-700 border-slate-300",
};

function actionClass(code: string): string {
  const k = code.trim().toUpperCase();
  return (
    ACTION_STYLES[k] ??
    "bg-violet-100 text-violet-800 border-violet-200"
  );
}

export function CauseEffectMatrixViewer({
  title,
  legend,
  outputs,
  rules,
}: Props) {
  const sortedOutputs = useMemo(
    () => [...outputs].sort((a, b) => a.ordinal - b.ordinal),
    [outputs],
  );
  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.ordinal - b.ordinal),
    [rules],
  );

  return (
    <div className="space-y-3">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      {legend && (
        <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
          {legend}
        </p>
      )}

      <div className="overflow-auto border rounded-md max-h-[70vh]">
        <table className="text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-background">
            <tr>
              <th
                className="sticky left-0 z-30 bg-muted/60 border-r border-b px-2 py-2 text-left font-medium w-14"
                rowSpan={3}
              >
                Ref
              </th>
              <th
                className="sticky left-14 z-30 bg-muted/60 border-r border-b px-2 py-2 text-left font-medium min-w-[260px]"
                rowSpan={3}
              >
                Trigger device
              </th>
              <th
                className="border-r border-b px-2 py-2 text-left font-medium w-24"
                rowSpan={3}
              >
                Type
              </th>
              <th
                className="border-r border-b px-2 py-2 text-left font-medium min-w-[180px]"
                rowSpan={3}
              >
                Location
              </th>
              {sortedOutputs.map((o) => (
                <th
                  key={o.code}
                  className="border-b border-r px-1 py-1 text-center font-medium bg-muted/40 align-bottom min-w-[44px]"
                >
                  <div className="text-[10px] font-bold">{o.code}</div>
                </th>
              ))}
              <th
                className="border-b px-2 py-2 text-left font-medium min-w-[220px] bg-muted/40"
                rowSpan={3}
              >
                Notes / effect
              </th>
            </tr>
            <tr>
              {sortedOutputs.map((o) => (
                <th
                  key={`${o.code}-loc`}
                  className="border-b border-r px-1 py-1 text-[10px] text-muted-foreground align-bottom"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {o.panel_location ?? "—"}
                </th>
              ))}
            </tr>
            <tr>
              {sortedOutputs.map((o) => (
                <th
                  key={`${o.code}-id`}
                  className="border-b border-r px-1 py-1 text-[10px] text-left text-muted-foreground align-bottom max-h-40"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {o.identification ?? "—"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRules.map((rule) => (
              <tr key={rule.ordinal} className="even:bg-muted/20">
                <td className="sticky left-0 bg-background border-r border-b px-2 py-1 align-top whitespace-nowrap">
                  {rule.ref ?? "—"}
                </td>
                <td className="sticky left-14 bg-background border-r border-b px-2 py-1 align-top">
                  {rule.trigger_device ?? "—"}
                </td>
                <td className="border-r border-b px-2 py-1 align-top">
                  {rule.trigger_type ?? "—"}
                </td>
                <td className="border-r border-b px-2 py-1 align-top">
                  {rule.trigger_location ?? "—"}
                </td>
                {sortedOutputs.map((o) => {
                  const action = (rule.actions as Record<string, string>)[
                    o.code
                  ];
                  return (
                    <td
                      key={`${rule.ordinal}-${o.code}`}
                      className="border-r border-b px-1 py-1 text-center"
                    >
                      {action ? (
                        <span
                          className={`inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-bold rounded border ${actionClass(
                            action,
                          )}`}
                        >
                          {action}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
                <td className="border-b px-2 py-1 align-top text-muted-foreground">
                  {rule.notes ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
