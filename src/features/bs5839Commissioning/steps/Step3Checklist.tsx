import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, MinusCircle, NotebookPen } from "lucide-react";
import type { CommissioningDraft } from "../useCommissioningDraft";
import { BS5839_COMMISSIONING_ITEMS, type Bs5839CheckResponse } from "@/types/bs5839";

// Step 3 — the 33-item §39 checklist. Each row offers Y / N / NA
// pick buttons + an optional notes input revealed when the engineer
// clicks the note icon. Bulk-tick buttons up top so a clean
// commissioning where every item passes can be filled in two clicks.

export function Step3Checklist({ draft }: { draft: CommissioningDraft }) {
  const { checks, patchCheck, bulkPatchChecks } = draft;
  const answered = checks.filter((c) => c.response !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold">§39 commissioning checklist</h4>
          <p className="text-xs text-muted-foreground">
            {answered}/33 items answered · pick Y / N / N&#x2F;A for each
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => bulkPatchChecks("Y")}
          >
            All Y
          </Button>
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => bulkPatchChecks("NA")}
          >
            All N/A
          </Button>
        </div>
      </div>

      <ul className="space-y-1.5">
        {BS5839_COMMISSIONING_ITEMS.map((item) => {
          const state = checks[item.number - 1];
          return (
            <ChecklistRow
              key={item.number}
              number={item.number}
              description={item.description}
              response={state.response}
              notes={state.notes}
              onChange={(response, notes) =>
                patchCheck(item.number, response, notes ?? state.notes)
              }
            />
          );
        })}
      </ul>
    </div>
  );
}

function ChecklistRow({
  number, description, response, notes, onChange,
}: {
  number: number;
  description: string;
  response: Bs5839CheckResponse | null;
  notes: string | null;
  onChange: (response: Bs5839CheckResponse, notes?: string | null) => void;
}) {
  const [showNotes, setShowNotes] = useState(!!notes);

  return (
    <li
      className={cn(
        "rounded-md border p-2.5 transition-colors",
        response === "Y"  && "border-success/40 bg-success/5",
        response === "N"  && "border-destructive/40 bg-destructive/5",
        response === "NA" && "border-muted bg-muted/30",
        response === null && "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-xs font-bold text-muted-foreground w-6 text-center mt-0.5">
          {number}
        </span>
        <p className="flex-1 text-xs leading-snug">{description}</p>
        <div className="flex gap-1 shrink-0">
          <ResponseButton
            label="Y" active={response === "Y"} kind="y"
            onClick={() => onChange("Y")}
          />
          <ResponseButton
            label="N" active={response === "N"} kind="n"
            onClick={() => onChange("N")}
          />
          <ResponseButton
            label="N/A" active={response === "NA"} kind="na"
            onClick={() => onChange("NA")}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setShowNotes((s) => !s)}
            title="Note"
          >
            <NotebookPen className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {showNotes && (
        <div className="mt-2 ml-8">
          <Label className="text-[10px] text-muted-foreground">Note</Label>
          <Input
            value={notes ?? ""}
            onChange={(e) =>
              onChange(response ?? "Y", e.target.value)
            }
            placeholder="Optional — context for the engineer reviewing later"
            className="h-7 text-xs"
          />
        </div>
      )}
    </li>
  );
}

function ResponseButton({
  label, active, kind, onClick,
}: {
  label: string;
  active: boolean;
  kind: "y" | "n" | "na";
  onClick: () => void;
}) {
  const Icon = kind === "y" ? CheckCircle2 : kind === "n" ? XCircle : MinusCircle;
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className={cn(
        "h-7 px-2 text-xs",
        active && kind === "y"  && "bg-success hover:bg-success/90",
        active && kind === "n"  && "bg-destructive hover:bg-destructive/90",
        active && kind === "na" && "bg-muted-foreground hover:bg-muted-foreground/90",
      )}
    >
      <Icon className="w-3 h-3 mr-0.5" />
      {label}
    </Button>
  );
}
