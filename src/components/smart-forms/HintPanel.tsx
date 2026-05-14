/**
 * HintPanel — Phase 2: Form-integrated hints
 *
 * Collapsible panel shown at the top of relevant form steps.
 * Surfaces the key standard requirement for that step without
 * the engineer having to leave the form.
 *
 * Usage:
 *   <HintPanel step="device-testing" discipline="bs5839" />
 *   <HintPanel step="airflow" discipline="asd" />
 *
 * Collapsed by default — one tap to open, one tap to close.
 * Remembers open state per step within the session.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, BookOpen, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Hint data ─────────────────────────────────────────────────────────────────

interface HintItem {
  type: "rule" | "warn" | "check" | "note";
  text: string;
}

interface HintBlock {
  title: string;
  ref: string;         // e.g. "BS 5839-1:2025 Cl. 45"
  items: HintItem[];
}

const HINTS: Record<string, HintBlock> = {

  // ── BS5839 ─────────────────────────────────────────────────────────────────
  "bs5839-checklist": {
    title: "Inspection Checklist",
    ref: "BAFE SP203-1 Cl. 9.8 · BS 5839-1:2025 Cl. 45",
    items: [
      { type: "rule",  text: "YES = satisfactory / action confirmed for most items. NO = problem — a comment is required." },
      { type: "warn",  text: "Inverted questions (1.2, 1.3, 1.4, 1.6, 1.10, 1.11, 14.3–14.7) are 'is there a problem?' — YES triggers a comment." },
      { type: "note",  text: "Section 8 Fault Monitoring: simulate each fault in turn. N/A only if the system physically lacks that circuit type." },
      { type: "note",  text: "Section 14: record actual numbers for 14.1 (detector count) and 14.2 (false alarms in 12 months) — not YES/NO." },
      { type: "check", text: "Section 16 & 17 must be YES before signing off — cert issued, system returned to normal, ARC notified, keys returned." },
    ],
  },

  "bs5839-device-testing": {
    title: "Device Testing",
    ref: "BS 5839-1:2025 Annex G.6",
    items: [
      { type: "rule",  text: "All devices must be tested within any 12-month period regardless of rotation method." },
      { type: "rule",  text: "25% rotation → 4 quarterly visits to cover all devices. 50% → 2 six-monthly visits. 100% → all this visit." },
      { type: "warn",  text: "If using 25% or 50%, document which specific devices were tested and which are deferred. Untested devices need a reason." },
      { type: "note",  text: "Risk-based method requires a written risk assessment on file justifying the approach." },
      { type: "check", text: "Devices tested cannot exceed total devices on system. If total is unknown, record approximate number and state basis." },
    ],
  },

  "bs5839-standby-power": {
    title: "Standby Power",
    ref: "BS 5839-1:2025 Cl. 26",
    items: [
      { type: "rule",  text: "Minimum standby: 24 hours quiescent followed by 30 minutes full alarm (Cl. 26.2)." },
      { type: "rule",  text: "Category M systems: 4 hours continuous alarm output (Cl. 26.4)." },
      { type: "warn",  text: "Battery maximum age is 4 years (Cl. 26.6). Flag as Cat 2 defect if exceeded — don't just note it." },
      { type: "check", text: "Record both battery voltage AND charger voltage — both are required by Cl. 26.3. A reading of 0V or blank fails compliance checker." },
      { type: "note",  text: "Charger operational must be confirmed — voltage rising after mains reconnection or charger current measured." },
    ],
  },

  "bs5839-false-alarms": {
    title: "False Alarm Record",
    ref: "BS 5839-1:2025 Cl. 45.7",
    items: [
      { type: "rule",  text: "Record the count even if zero — 'false_alarm_count: 0' is valid and required." },
      { type: "warn",  text: "Rate threshold: more than 1 false alarm per 25 detectors per year triggers mandatory investigation (14.3)." },
      { type: "warn",  text: "11+ false alarms since last visit (14.4), or 2+ from a single device (14.5/14.6) — investigation and advice must be provided (14.8)." },
      { type: "note",  text: "Use AI Assist on the Causes and Actions fields — it converts rough notes into professional BS-referenced language." },
    ],
  },

  "bs5839-defects": {
    title: "Defect Categories",
    ref: "BS 5839-1:2025 / BRE 240",
    items: [
      { type: "warn",  text: "Cat 1 (Critical) — immediate risk. Notify responsible person in writing before leaving site. Do NOT mark system Satisfactory." },
      { type: "rule",  text: "Cat 2 (Major) — system still operational but below standard. Written notification + recommend remedial quote." },
      { type: "note",  text: "Cat 3 (Advisory) — no code breach. Record and advise at next opportunity. Does not affect overall status." },
      { type: "check", text: "Every defect must have a severity, description, and recommended action. Blank fields will be flagged by the compliance checker." },
      { type: "note",  text: "Use 'Import from register' to pull in outstanding defects from previous visits — saves re-typing." },
    ],
  },

  "bs5839-status": {
    title: "System Status",
    ref: "BS 5839-1:2025 Cl. 45",
    items: [
      { type: "rule",  text: "Satisfactory — system fully operational, all checks passed, no Cat 1 or Cat 2 defects outstanding." },
      { type: "rule",  text: "Satisfactory with Observations — operational but Cat 2/3 defects noted. Client informed, remedial quote to follow." },
      { type: "warn",  text: "Unsatisfactory — system impaired. Cat 1 defect present. Client must be notified in writing immediately." },
      { type: "check", text: "Work Carried Out: describe everything done this visit. Use AI Assist to convert site notes to professional language." },
      { type: "note",  text: "Next Service Due: set this date — it feeds the Compliance Calendar on the dashboard so the office can schedule the next visit." },
    ],
  },

  // ── ASD ────────────────────────────────────────────────────────────────────
  "asd-preservice": {
    title: "Pre-Service Actions",
    ref: "FIA CoP ASD Systems §8.2",
    items: [
      { type: "rule",  text: "Record airflow readings BEFORE starting any service work. Post-service readings are compared to these, not to the commissioning baseline." },
      { type: "rule",  text: "Download event log AND configuration file from the detector before servicing. Provide copies to site manager." },
      { type: "warn",  text: "Servicing without downloading the config risks losing settings if the unit needs replacement or resets during cleaning." },
      { type: "check", text: "Notify ARC before beginning if system is monitored — failure to notify generates unwanted alarm response." },
    ],
  },

  "asd-airflow": {
    title: "Airflow ±20% Rule",
    ref: "FIA CoP ASD Systems §8.3",
    items: [
      { type: "rule",  text: "All post-service readings must be within ±20% of the commissioned baseline. Deviation = investigate before signing off." },
      { type: "rule",  text: "Formula: Deviation (%) = |Measured − Baseline| ÷ Baseline × 100. Pass: ≤20%. Fail: >20%." },
      { type: "note",  text: "Example: baseline 100 L/min → acceptable range 80–120 L/min. Reading of 75 L/min = 25% deviation = fail." },
      { type: "warn",  text: "Common causes of low flow: blocked sampling holes, blocked filter, pipe separation. High flow: enlarged hole or pipe gap." },
      { type: "check", text: "Record baseline AND measured flow for every pipe. Blank readings will be flagged by the compliance checker." },
    ],
  },

  "asd-checks": {
    title: "Post-Service Checks",
    ref: "BS EN 54-20 · FIA CoP §8.4",
    items: [
      { type: "rule",  text: "Fire 1 and Fire 2 signals must be verified at the CIE panel — not just at the detector display." },
      { type: "rule",  text: "Fault relay must be confirmed at CIE — simulated fault should generate a fault indication on the fire alarm panel." },
      { type: "check", text: "All 5 signal levels: Alert → Action → Fire 1 → Fire 2 → Fault. All must reach CIE. Missing one = compliance checker flag." },
      { type: "note",  text: "Battery backup: check voltage AND confirm charger is operational. Record in the Standby Power fields." },
    ],
  },

  // ── Emergency Lighting ─────────────────────────────────────────────────────
  "el-inspection": {
    title: "EPM6C Notation",
    ref: "BS 5266-1:2016 Annex M",
    items: [
      { type: "rule",  text: "✓ = Satisfactory. 7 = Deviation (written note required). N/A = clause does not apply." },
      { type: "warn",  text: "A '7' without a written note is invalid — describe the deviation and whether remedial action is needed." },
      { type: "rule",  text: "All clauses must be assessed. Blank = incomplete cert. N/A is acceptable where clause genuinely doesn't apply." },
      { type: "check", text: "Battery age: 4-year max. Flag as defect if exceeded — do not mark satisfactory with an over-age battery." },
    ],
  },

  "el-discharge": {
    title: "Duration / Discharge Test",
    ref: "BS 5266-1:2016 Cl. 7.3",
    items: [
      { type: "rule",  text: "Annual discharge test = full rated duration. 1-hour system: 60 minutes. 3-hour system: 180 minutes. No shortcut." },
      { type: "warn",  text: "Monthly tests must be brief (≈30 seconds max). Frequent full discharges degrade battery life." },
      { type: "note",  text: "After the annual discharge, mains must be restored for full recharge — typically 24 hours. Note this to the client." },
      { type: "check", text: "Record every failed luminaire by location. Partial pass is still a fail if any unit doesn't reach rated duration." },
    ],
  },

  // ── Dry Riser ──────────────────────────────────────────────────────────────
  "dr-pressure": {
    title: "Hydraulic Pressure Test",
    ref: "BS 9990:2015 Cl. 7.3.1.3",
    items: [
      { type: "rule",  text: "Test pressure: minimum 12 bar (1,034 kPa). Duration: 15 minutes continuous." },
      { type: "warn",  text: "Maximum allowable pressure drop: 0.5 bar in 15 minutes. Greater drop = leak present. Do not return to service until repaired." },
      { type: "check", text: "Open air release valve before pressurising. Close once water flows freely. Record exact start and end pressure." },
      { type: "rule",  text: "Fully drain system after test — all water must be removed. Confirm drain valve functional after draining." },
    ],
  },

  "dr-visual": {
    title: "Visual Inspection",
    ref: "BS 9990:2015 Cl. 7.2",
    items: [
      { type: "warn",  text: "Missing blanking caps = fail and urgent defect. Without caps, debris enters the pipe and FRS cannot connect." },
      { type: "rule",  text: "All landing valves must be in the CLOSED position. Open valves mean water would flood the floor on FRS pressurisation." },
      { type: "check", text: "Inlet access must be completely clear and unobstructed — FRS appliance must be able to connect without delay." },
      { type: "note",  text: "Signage: each landing valve box must be clearly identified with floor level. Missing signage = advisory defect." },
    ],
  },
};

// ── Icon mapping ──────────────────────────────────────────────────────────────
const ITEM_ICON = {
  rule:  { Icon: CheckCircle2, cls: "text-blue-500 flex-shrink-0 mt-0.5 w-3.5 h-3.5" },
  warn:  { Icon: AlertTriangle, cls: "text-amber-500 flex-shrink-0 mt-0.5 w-3.5 h-3.5" },
  check: { Icon: CheckCircle2, cls: "text-green-500 flex-shrink-0 mt-0.5 w-3.5 h-3.5" },
  note:  { Icon: BookOpen, cls: "text-muted-foreground flex-shrink-0 mt-0.5 w-3.5 h-3.5" },
};

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  step: string;       // key into HINTS — e.g. "bs5839-device-testing"
  defaultOpen?: boolean;
}

export function HintPanel({ step, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const hint = HINTS[step];
  if (!hint) return null;

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden mb-1 transition-colors",
      open ? "border-blue-200 dark:border-blue-800/50" : "border-border/60"
    )}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
          open
            ? "bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            : "bg-muted/20 hover:bg-muted/40"
        )}
      >
        <BookOpen className={cn("w-3.5 h-3.5 flex-shrink-0", open ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")} />
        <div className="flex-1 min-w-0">
          <span className={cn("text-xs font-semibold", open ? "text-blue-800 dark:text-blue-300" : "text-muted-foreground")}>
            {hint.title}
          </span>
          {!open && (
            <span className="text-[10px] text-muted-foreground ml-2">{hint.ref}</span>
          )}
        </div>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-2 bg-blue-50/30 dark:bg-blue-950/10 border-t border-blue-100 dark:border-blue-900/30 space-y-2">
          <p className="text-[10px] font-mono text-blue-600/70 dark:text-blue-400/60">{hint.ref}</p>
          <ul className="space-y-1.5">
            {hint.items.map((item, i) => {
              const { Icon, cls } = ITEM_ICON[item.type];
              return (
                <li key={i} className="flex items-start gap-2">
                  <Icon className={cls} />
                  <span className="text-xs text-foreground/80 leading-snug">{item.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
